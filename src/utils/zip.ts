/**
 * Minimal dependency-free ZIP writer (STORE method, no compression).
 * PNG/JPG frames are already compressed, so storing them uncompressed loses nothing.
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date: Date): { time: number; date: number } {
  const time = ((date.getHours() & 0x1f) << 11) | ((date.getMinutes() & 0x3f) << 5) | ((date.getSeconds() >> 1) & 0x1f);
  const d = (((date.getFullYear() - 1980) & 0x7f) << 9) | (((date.getMonth() + 1) & 0x0f) << 5) | (date.getDate() & 0x1f);
  return { time, date: d };
}

export interface ZipEntry {
  name: string;
  data: Uint8Array;
}

export function createZip(entries: ZipEntry[]): Blob {
  const encoder = new TextEncoder();
  const now = dosDateTime(new Date());
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const crc = crc32(entry.data);
    const size = entry.data.length;

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // UTF-8 names
    local.setUint16(8, 0, true); // STORE
    local.setUint16(10, now.time, true);
    local.setUint16(12, now.date, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, size, true);
    local.setUint32(22, size, true);
    local.setUint16(26, nameBytes.length, true);
    local.setUint16(28, 0, true);

    const central = new DataView(new ArrayBuffer(46));
    central.setUint32(0, 0x02014b50, true);
    central.setUint16(4, 20, true);
    central.setUint16(6, 20, true);
    central.setUint16(8, 0x0800, true);
    central.setUint16(10, 0, true);
    central.setUint16(12, now.time, true);
    central.setUint16(14, now.date, true);
    central.setUint32(16, crc, true);
    central.setUint32(20, size, true);
    central.setUint32(24, size, true);
    central.setUint16(28, nameBytes.length, true);
    central.setUint16(30, 0, true);
    central.setUint16(32, 0, true);
    central.setUint16(34, 0, true);
    central.setUint16(36, 0, true);
    central.setUint32(38, 0, true);
    central.setUint32(42, offset, true);

    localParts.push(new Uint8Array(local.buffer), nameBytes, entry.data);
    centralParts.push(new Uint8Array(central.buffer), nameBytes);
    offset += 30 + nameBytes.length + size;
  }

  const centralSize = centralParts.reduce((s, p) => s + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(4, 0, true);
  end.setUint16(6, 0, true);
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);
  end.setUint16(20, 0, true);

  return new Blob([...localParts, ...centralParts, new Uint8Array(end.buffer)], { type: 'application/zip' });
}

/* ------------------------------------------------------------------------------------------------
 * Streaming writer: frames are appended as they are rendered and never held twice. With a sink
 * (File System Access API) nothing accumulates in memory at all; without one, each frame is kept as
 * a Blob (browsers page large Blobs to disk) rather than an ArrayBuffer on the JS heap.
 * ZIP32 limits are enforced up front: < 65,535 entries and < 4 GiB total.
 * ---------------------------------------------------------------------------------------------- */

export const ZIP_MAX_ENTRIES = 65_000;
export const ZIP_MAX_BYTES = 4 * 1024 * 1024 * 1024 - 1024 * 1024; // 4 GiB minus headroom

export interface ZipSink {
  write(chunk: Uint8Array | Blob): Promise<void> | void;
  close(): Promise<void> | void;
}

export class ZipWriter {
  private encoder = new TextEncoder();
  private now = dosDateTime(new Date());
  private centralParts: Uint8Array[] = [];
  private parts: (Uint8Array | Blob)[] = [];
  private offset = 0;
  private count = 0;
  private closed = false;
  constructor(private sink: ZipSink | null = null) {}

  get bytesWritten() { return this.offset; }
  get entries() { return this.count; }

  private emit(chunk: Uint8Array | Blob): Promise<void> | void {
    if (this.sink) return this.sink.write(chunk);
    this.parts.push(chunk);
  }

  /** Add one STORE entry. `data` may be a Blob (kept off-heap) with its CRC computed from `bytes`. */
  async add(name: string, bytes: Uint8Array, keep: Blob | Uint8Array = bytes): Promise<void> {
    if (this.closed) throw new Error('zip already finished');
    if (this.count >= ZIP_MAX_ENTRIES) throw new Error(`ZIP entry limit (${ZIP_MAX_ENTRIES}) reached — export a shorter range or use MP4`);
    const nameBytes = this.encoder.encode(name);
    const size = bytes.length;
    if (this.offset + 30 + nameBytes.length + size + 46 * (this.count + 1) > ZIP_MAX_BYTES) throw new Error('ZIP would exceed 4 GiB — export a shorter range, lower resolution, or use MP4');
    const crc = crc32(bytes);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(6, 0x0800, true); local.setUint16(8, 0, true);
    local.setUint16(10, this.now.time, true); local.setUint16(12, this.now.date, true);
    local.setUint32(14, crc, true); local.setUint32(18, size, true); local.setUint32(22, size, true);
    local.setUint16(26, nameBytes.length, true); local.setUint16(28, 0, true);
    const central = new DataView(new ArrayBuffer(46));
    central.setUint32(0, 0x02014b50, true); central.setUint16(4, 20, true); central.setUint16(6, 20, true); central.setUint16(8, 0x0800, true); central.setUint16(10, 0, true);
    central.setUint16(12, this.now.time, true); central.setUint16(14, this.now.date, true);
    central.setUint32(16, crc, true); central.setUint32(20, size, true); central.setUint32(24, size, true);
    central.setUint16(28, nameBytes.length, true); central.setUint16(30, 0, true); central.setUint16(32, 0, true); central.setUint16(34, 0, true); central.setUint16(36, 0, true);
    central.setUint32(38, 0, true); central.setUint32(42, this.offset, true);
    await this.emit(new Uint8Array(local.buffer));
    await this.emit(nameBytes);
    await this.emit(keep);
    this.centralParts.push(new Uint8Array(central.buffer), nameBytes);
    this.offset += 30 + nameBytes.length + size;
    this.count++;
  }

  /** Write the central directory. Returns the Blob when no sink was given, else null (data is on disk). */
  async finish(): Promise<Blob | null> {
    if (this.closed) throw new Error('zip already finished');
    this.closed = true;
    const centralSize = this.centralParts.reduce((s, p) => s + p.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(4, 0, true); end.setUint16(6, 0, true);
    end.setUint16(8, this.count, true); end.setUint16(10, this.count, true);
    end.setUint32(12, centralSize, true); end.setUint32(16, this.offset, true); end.setUint16(20, 0, true);
    for (const p of this.centralParts) await this.emit(p);
    await this.emit(new Uint8Array(end.buffer));
    if (this.sink) { await this.sink.close(); return null; }
    const blob = new Blob(this.parts, { type: 'application/zip' });
    this.parts = [];
    return blob;
  }

  async abort(): Promise<void> {
    this.closed = true; this.parts = []; this.centralParts = [];
    if (this.sink && 'abort' in this.sink) await (this.sink as { abort(): Promise<void> }).abort();
    else if (this.sink) await this.sink.close();
  }
}

/** File System Access sink (Chrome/Edge): streams straight to the chosen file. Must be called from a user gesture. */
export async function pickZipSink(suggestedName: string): Promise<ZipSink | null> {
  const w = window as unknown as { showSaveFilePicker?: (o: unknown) => Promise<{ createWritable(): Promise<{ write(d: unknown): Promise<void>; close(): Promise<void>; abort(): Promise<void> }> }> };
  if (!w.showSaveFilePicker || (navigator as { webdriver?: boolean }).webdriver) return null; // no native dialogs under automation
  try {
    const handle = await w.showSaveFilePicker({ suggestedName, types: [{ description: 'ZIP archive', accept: { 'application/zip': ['.zip'] } }] });
    const writable = await handle.createWritable();
    return { write: (c) => writable.write(c), close: () => writable.close(), abort: () => writable.abort() } as ZipSink & { abort(): Promise<void> };
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw new Error('cancelled');
    return null; // picker unavailable (iframe, permission) → fall back to in-memory
  }
}

export function canvasToBlob(canvas: HTMLCanvasElement, type: 'image/png' | 'image/jpeg', quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Canvas export failed')), type, quality));
}

export function canvasToBytes(canvas: HTMLCanvasElement, type: 'image/png' | 'image/jpeg', quality?: number): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(async (blob) => {
      if (!blob) return reject(new Error('Canvas export failed'));
      resolve(new Uint8Array(await blob.arrayBuffer()));
    }, type, quality);
  });
}
