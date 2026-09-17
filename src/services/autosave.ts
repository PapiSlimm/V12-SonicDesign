import { Layer, MotionPath } from '../core/types';
import { serializeLayers, deserializeLayers, SerializedLayer } from './fileService';

/**
 * IndexedDB-backed autosave. localStorage caps out around 5 MB, which a single 1920x1080 PNG
 * can exceed, so image layers were previously dropped from recovery. IndexedDB stores the full
 * project including bitmaps.
 */

const DB_NAME = 'v12-sonic-design-studio';
const STORE = 'autosave';
const KEY = 'latest';
export const AUTOSAVE_VERSION = 2;

export interface AutosavePayload {
  version: number;
  timestamp: number;
  projectName: string;
  duration: number;
  fps: number;
  layers: SerializedLayer[];
  motionPaths: MotionPath[];
  brushColor: string;
  colorSwatches: string[];
  globalColorVariables: { id: string; name: string; value: string }[];
  /** true when the tab was closed normally (recovery prompt is skipped) */
  cleanExit?: boolean;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB unavailable'));
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export async function writeAutosave(data: Omit<AutosavePayload, 'version' | 'timestamp' | 'layers'> & { layers: Layer[] }): Promise<void> {
  const payload: AutosavePayload = {
    ...data,
    version: AUTOSAVE_VERSION,
    timestamp: Date.now(),
    layers: serializeLayers(data.layers)
  };
  await withStore('readwrite', (store) => store.put(payload, KEY));
}

export async function readAutosave(): Promise<AutosavePayload | null> {
  try {
    const result = await withStore<AutosavePayload | undefined>('readonly', (store) => store.get(KEY));
    return result || null;
  } catch {
    return null;
  }
}

export async function clearAutosave(): Promise<void> {
  try { await withStore('readwrite', (store) => store.delete(KEY)); } catch { /* ignore */ }
}

export async function markCleanExit(): Promise<void> {
  try {
    const current = await readAutosave();
    if (current) await withStore('readwrite', (store) => store.put({ ...current, cleanExit: true }, KEY));
  } catch { /* ignore */ }
}

export async function restoreAutosaveLayers(payload: AutosavePayload): Promise<Layer[]> {
  return deserializeLayers(payload.layers);
}

const bitmapIds = new WeakMap<ImageBitmap, number>();
let nextBitmapId = 1;
function bitmapIdentity(bitmap: ImageBitmap | null): string {
  if (!bitmap) return '0';
  let id = bitmapIds.get(bitmap);
  if (!id) { id = nextBitmapId++; bitmapIds.set(bitmap, id); }
  return `b${id}`;
}

/** Cheap fingerprint of project state to skip redundant writes (bitmaps are compared by identity). */
export function projectFingerprint(layers: Layer[], extra: unknown): string {
  const sig = layers.map(l => {
    const { bitmap, ...rest } = l;
    return `${JSON.stringify(rest)}|${bitmapIdentity(bitmap)}`;
  }).join('\n');
  return `${sig}|${JSON.stringify(extra)}`;
}
