/**
 * Object storage for masters + renditions. One bucket for the whole V12 estate.
 *
 *   MEDIA_S3_ENDPOINT   https://<account>.r2.cloudflarestorage.com  (R2)  |  https://storage.googleapis.com (GCS interop) | MinIO
 *   MEDIA_S3_BUCKET     v12-media
 *   MEDIA_S3_KEY / MEDIA_S3_SECRET / MEDIA_S3_REGION (default auto)
 *   MEDIA_PUBLIC_BASE_URL  https://media.v12multimedia.com   (public/CDN origin that serves the bucket)
 *
 * Without S3 env vars it falls back to a local directory (MEDIA_LOCAL_DIR, default ./media-data) served
 * by the ingress at /media/* — fine for one box, not for a fleet.
 */
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readdir, stat, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';

export interface Storage {
  readonly mode: 's3' | 'local';
  /** Upload a local file; returns { key, url }. */
  putFile(localPath: string, key: string, contentType?: string): Promise<{ key: string; url: string; bytes: number }>;
  /** Upload every file in a directory (HLS/DASH packages). Returns the url of `entry` inside it. */
  putDir(localDir: string, keyPrefix: string, entry: string): Promise<{ key: string; url: string; bytes: number }>;
  /** Download an object/URL to a local path. Accepts s3://, https://, http://, file:// and bare local paths. */
  fetchTo(sourceUrl: string, localPath: string): Promise<void>;
  publicUrl(key: string): string;
  /** Worker-fetchable URL for an object stored under `key` (s3://… or local://…). */
  sourceUrl(key: string): string;
}

const MIME: Record<string, string> = {
  '.mp4': 'video/mp4', '.m3u8': 'application/vnd.apple.mpegurl', '.ts': 'video/mp2t', '.m4s': 'video/iso.segment', '.mpd': 'application/dash+xml',
  '.webm': 'video/webm', '.opus': 'audio/ogg', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.mp3': 'audio/mpeg', '.wav': 'audio/wav',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.json': 'application/json', '.zip': 'application/zip'
};
export const mimeFor = (file: string) => MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream';

/** Object keys are server-generated, but every piece that came from a request is validated here anyway. */
const KEY_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
export function safeKey(key: string): string {
  if (typeof key !== 'string' || !key || key.length > 512) throw new Error('invalid storage key');
  const parts = key.split('/');
  for (const p of parts) {
    if (!KEY_SEGMENT.test(p) || p === '.' || p === '..') throw new Error(`invalid storage key segment: ${JSON.stringify(p)}`);
  }
  return parts.join('/');
}
/** Resolve `key` under `root`, refusing anything that escapes it. */
export function safeJoin(root: string, key: string): string {
  const base = path.resolve(root);
  const full = path.resolve(base, safeKey(key));
  if (full !== base && !full.startsWith(base + path.sep)) throw new Error('storage key escapes root');
  return full;
}
/** App identifiers come from requests: lower-case slug only. */
export function safeApp(app: unknown): string {
  const s = String(app ?? '').toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{1,39}$/.test(s)) throw new Error('invalid app id');
  return s;
}

const FETCH_TIMEOUT_MS = parseInt(process.env.MEDIA_FETCH_TIMEOUT_MS || String(10 * 60 * 1000), 10);
const MAX_FETCH_BYTES = parseInt(process.env.MEDIA_MAX_FETCH_MB || '2048', 10) * 1024 * 1024;

/** Remote http(s) sources are only fetched from allow-listed hosts (MEDIA_FETCH_ALLOWLIST, comma-separated, plus the public base URL host). */
export function hostAllowed(url: string, env = process.env): boolean {
  let host: string;
  try { const u = new URL(url); if (u.protocol !== 'https:' && u.protocol !== 'http:') return false; host = u.hostname.toLowerCase(); } catch { return false; }
  if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.|\[?::1)/.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host)) return false;
  const allow = new Set((env.MEDIA_FETCH_ALLOWLIST || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean));
  for (const k of ['MEDIA_PUBLIC_BASE_URL', 'MEDIA_S3_ENDPOINT', 'RENDER_EXTERNAL_URL']) { try { if (env[k]) allow.add(new URL(env[k]!).hostname.toLowerCase()); } catch { /* ignore */ } }
  return [...allow].some(a => host === a || (a.startsWith('*.') && host.endsWith(a.slice(1))));
}

async function downloadHttp(url: string, localPath: string) {
  if (!hostAllowed(url)) throw new Error(`source host not allow-listed: ${url}`);
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), redirect: 'error' });
  if (!res.ok || !res.body) throw new Error(`fetch ${url} → ${res.status}`);
  const len = Number(res.headers.get('content-length') || 0);
  if (len > MAX_FETCH_BYTES) throw new Error(`source too large (${len} bytes)`);
  await mkdir(path.dirname(localPath), { recursive: true });
  let seen = 0;
  const guard = new (await import('node:stream')).Transform({ transform(chunk, _e, cb) { seen += chunk.length; cb(seen > MAX_FETCH_BYTES ? new Error('source too large') : null, chunk); } });
  await pipeline(Readable.fromWeb(res.body as never), guard, createWriteStream(localPath));
}

export class LocalStorage implements Storage {
  readonly mode = 'local' as const;
  constructor(readonly root: string, readonly baseUrl: string) {}
  publicUrl(key: string) { return `${this.baseUrl.replace(/\/$/, '')}/media/${key}`; }
  sourceUrl(key: string) { return `local://${key}`; }
  async putFile(localPath: string, key: string) {
    const dest = safeJoin(this.root, key);
    await mkdir(path.dirname(dest), { recursive: true });
    await copyFile(localPath, dest);
    return { key, url: this.publicUrl(key), bytes: (await stat(dest)).size };
  }
  async putDir(localDir: string, keyPrefix: string, entry: string) {
    let bytes = 0;
    for (const f of await readdir(localDir)) { const r = await this.putFile(path.join(localDir, f), `${keyPrefix}/${f}`); bytes += r.bytes; }
    return { key: `${keyPrefix}/${entry}`, url: this.publicUrl(`${keyPrefix}/${entry}`), bytes };
  }
  async fetchTo(sourceUrl: string, localPath: string) {
    if (/^https?:/.test(sourceUrl)) return downloadHttp(sourceUrl, localPath);
    let src: string;
    if (sourceUrl.startsWith('local://')) src = safeJoin(this.root, sourceUrl.slice(8));
    else if (sourceUrl.startsWith('file://')) src = decodeURI(sourceUrl.slice(7)); // only ever written by server-side apps / tests, never by the ingress
    else throw new Error(`unsupported source url: ${sourceUrl}`);
    await mkdir(path.dirname(localPath), { recursive: true });
    await copyFile(src, localPath);
  }
}

export class S3Storage implements Storage {
  readonly mode = 's3' as const;
  private client: import('@aws-sdk/client-s3').S3Client | null = null;
  constructor(private cfg: { endpoint: string; bucket: string; key: string; secret: string; region: string; baseUrl: string }) {}
  private async s3() {
    if (!this.client) {
      const { S3Client } = await import('@aws-sdk/client-s3');
      this.client = new S3Client({ endpoint: this.cfg.endpoint, region: this.cfg.region, forcePathStyle: true,
        credentials: { accessKeyId: this.cfg.key, secretAccessKey: this.cfg.secret } });
    }
    return this.client;
  }
  publicUrl(key: string) { return `${this.cfg.baseUrl.replace(/\/$/, '')}/${key}`; }
  sourceUrl(key: string) { return `s3://${this.cfg.bucket}/${key}`; }
  async putFile(localPath: string, key: string, contentType = mimeFor(localPath)) {
    key = safeKey(key);
    const { Upload } = await import('@aws-sdk/lib-storage');
    const bytes = (await stat(localPath)).size;
    await new Upload({ client: await this.s3(), params: { Bucket: this.cfg.bucket, Key: key, Body: createReadStream(localPath), ContentType: contentType,
      CacheControl: /\.(m3u8|mpd)$/.test(key) ? 'public, max-age=60' : 'public, max-age=31536000, immutable' } }).done();
    return { key, url: this.publicUrl(key), bytes };
  }
  async putDir(localDir: string, keyPrefix: string, entry: string) {
    let bytes = 0;
    const files = await readdir(localDir);
    // segments first, manifests last so a player never sees a manifest pointing at missing segments
    files.sort((a, b) => Number(/\.(m3u8|mpd)$/.test(a)) - Number(/\.(m3u8|mpd)$/.test(b)));
    for (const f of files) { const r = await this.putFile(path.join(localDir, f), `${keyPrefix}/${f}`); bytes += r.bytes; }
    return { key: `${keyPrefix}/${entry}`, url: this.publicUrl(`${keyPrefix}/${entry}`), bytes };
  }
  async fetchTo(sourceUrl: string, localPath: string) {
    if (/^https?:/.test(sourceUrl)) return downloadHttp(sourceUrl, localPath);
    if (sourceUrl.startsWith('file://')) { await mkdir(path.dirname(localPath), { recursive: true }); return copyFile(decodeURI(sourceUrl.slice(7)), localPath); }
    const m = /^s3:\/\/([^/]+)\/(.+)$/.exec(sourceUrl);
    if (!m) throw new Error(`unsupported source url: ${sourceUrl}`);
    const { GetObjectCommand } = await import('@aws-sdk/client-s3');
    const res = await (await this.s3()).send(new GetObjectCommand({ Bucket: m[1], Key: safeKey(m[2]) }), { abortSignal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    await mkdir(path.dirname(localPath), { recursive: true });
    await pipeline(res.Body as Readable, createWriteStream(localPath));
  }
}

export function storageFromEnv(env = process.env): Storage {
  const baseUrl = env.MEDIA_PUBLIC_BASE_URL || env.RENDER_EXTERNAL_URL || `http://127.0.0.1:${env.PORT || 10000}`;
  if (env.MEDIA_S3_BUCKET && env.MEDIA_S3_KEY && env.MEDIA_S3_SECRET) {
    return new S3Storage({ endpoint: env.MEDIA_S3_ENDPOINT || 'https://s3.amazonaws.com', bucket: env.MEDIA_S3_BUCKET, key: env.MEDIA_S3_KEY,
      secret: env.MEDIA_S3_SECRET, region: env.MEDIA_S3_REGION || 'auto', baseUrl: env.MEDIA_PUBLIC_BASE_URL || `${env.MEDIA_S3_ENDPOINT}/${env.MEDIA_S3_BUCKET}` });
  }
  return new LocalStorage(path.resolve(env.MEDIA_LOCAL_DIR || './media-data'), baseUrl);
}
