/**
 * Browser ingress — the ONLY HTTP surface, and only for browser clients that have no database
 * (SonicDesign's static site, GameWorld's player). Server-side apps never use this; they use MediaClient.
 *
 *   POST /assets           multipart file=<master> [kind] [ownerId] [name]   → { asset }
 *   POST /jobs             json { assetId, kind, params }                   → { job }
 *   GET  /jobs/:id                                                           → { job }
 *   GET  /assets/:id       → { asset, renditions, analysis? }
 *   POST /transcode        multipart video=<webm|zip> [audio] [fps] [crf] [preset] [name] → MP4 bytes (SonicDesign contract, unchanged)
 *   POST /sequence         multipart frames=<zip> [audio] [fps] …                           → MP4 bytes (SonicDesign contract, unchanged)
 *   GET  /media/*          local-storage files (only when MEDIA_S3_* is not configured)
 *   GET  /health
 *
 * Optional bearer auth: set MEDIA_INGRESS_TOKEN and browsers send Authorization: Bearer <token>.
 */
import express, { type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import os from 'node:os';
import path from 'node:path';
import { createReadStream } from 'node:fs';
import { rm, stat, mkdtemp } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import type { Asset, AssetKind, JobKind } from '../types.js';
import { MediaClient } from '../client/MediaClient.js';
import { LocalStorage, Storage } from './storage.js';
import { ffmpegVersion } from './ffmpeg.js';

export interface IngressOptions {
  client: MediaClient;
  storage: Storage;
  allowedOrigin?: string;
  maxUploadMb?: number;
  token?: string;
  /** app name recorded for browser uploads when the request does not say (default 'sonicdesign') */
  defaultApp?: string;
  activeJobs?: () => number;
}

const JOB_KINDS = new Set<JobKind>(['transcode.mp4', 'stream.hls', 'stream.dash', 'audio.master', 'analyze.audio', 'video.thumbnail']);

async function sha256File(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const h = createHash('sha256');
    createReadStream(file).on('data', d => h.update(d)).on('end', () => resolve(h.digest('hex'))).on('error', reject);
  });
}

function kindFor(mime: string | undefined, name: string): AssetKind {
  if (/\.zip$/i.test(name) || mime === 'application/zip') return 'frames';
  if (mime?.startsWith('audio/')) return 'audio';
  if (mime?.startsWith('image/')) return 'image';
  return 'video';
}

export function createIngress(opts: IngressOptions): express.Express {
  const { client, storage } = opts;
  const app = express();
  const upload = multer({ dest: os.tmpdir(), limits: { fileSize: (opts.maxUploadMb ?? 500) * 1024 * 1024 } });
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', opts.allowedOrigin ?? '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });
  const auth = (req: Request, res: Response, next: NextFunction) => {
    if (!opts.token) return next();
    if (req.headers.authorization === `Bearer ${opts.token}`) return next();
    res.status(401).json({ error: 'unauthorized' });
  };

  app.get('/health', async (_req, res) => {
    const ffmpeg = await ffmpegVersion();
    let db = 'ok';
    try { await client.pool.query('SELECT 1'); } catch (e) { db = 'fail: ' + (e as Error).message; }
    res.status(ffmpeg && db === 'ok' ? 200 : 503).json({ ok: !!ffmpeg && db === 'ok', ffmpeg: ffmpeg ?? 'missing', db, storage: storage.mode, active: opts.activeJobs?.() ?? null });
  });

  if (storage instanceof LocalStorage) {
    app.use('/media', express.static(storage.root, { maxAge: '1y', immutable: true, setHeaders: (res, p) => { if (/\.(m3u8|mpd)$/.test(p)) res.setHeader('Cache-Control', 'public, max-age=60'); } }));
  }

  /** Store an uploaded file as a master asset (dedup by sha256 per app). */
  async function ingest(file: Express.Multer.File, app: string, kind: AssetKind, ownerId: string | null, name?: string): Promise<Asset> {
    const sha = await sha256File(file.path);
    const ext = path.extname(file.originalname || '') || (kind === 'frames' ? '.zip' : '');
    const key = `${app}/masters/${sha.slice(0, 2)}/${sha}${ext}`;
    const existing = await client.pool.query<Asset>('SELECT * FROM v12media.assets WHERE app=$1 AND sha256=$2', [app, sha]);
    if (existing.rows[0]) return existing.rows[0];
    await storage.putFile(file.path, key, file.mimetype);
    const c = new MediaClient({ pool: client.pool, app });
    return c.registerAsset({ kind, sourceUrl: storage.sourceUrl(key), ownerId, bytes: file.size, mime: file.mimetype, sha256: sha, meta: { name: name || file.originalname } });
  }

  app.post('/assets', auth, upload.single('file'), async (req, res) => {
    const f = req.file;
    if (!f) return res.status(400).json({ error: 'file required' });
    try {
      const appName = String(req.body.app || opts.defaultApp || 'sonicdesign').slice(0, 40);
      const asset = await ingest(f, appName, (req.body.kind as AssetKind) || kindFor(f.mimetype, f.originalname), req.body.ownerId || null, req.body.name);
      res.json({ asset });
    } catch (e) { res.status(500).json({ error: (e as Error).message }); }
    finally { await rm(f.path, { force: true }); }
  });

  app.post('/jobs', auth, async (req, res) => {
    const { assetId, kind, params } = req.body ?? {};
    if (!assetId || !JOB_KINDS.has(kind)) return res.status(400).json({ error: 'assetId and a valid kind required' });
    try {
      const asset = await client.asset(assetId);
      if (!asset) return res.status(404).json({ error: 'asset not found' });
      const c = new MediaClient({ pool: client.pool, app: asset.app });
      res.json({ job: await c.enqueue(assetId, kind, params ?? {}) });
    } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });

  app.get('/jobs/:id', auth, async (req, res) => {
    const job = await client.job(req.params.id).catch(() => null);
    if (!job) return res.status(404).json({ error: 'not found' });
    res.json({ job });
  });

  app.get('/assets/:id', auth, async (req, res) => {
    const asset = await client.asset(req.params.id).catch(() => null);
    if (!asset) return res.status(404).json({ error: 'not found' });
    const [renditions, analysis] = await Promise.all([client.renditions(asset.id), client.analysis(asset.id)]);
    res.json({ asset, renditions, analysis: analysis ? { fps: analysis.fps, frameCount: analysis.frameCount, duration: analysis.duration, bpm: analysis.bpm, beats: analysis.beats,
      bands: Array.from(analysis.bands), rms: Array.from(analysis.rms), onset: Array.from(analysis.onset), spectrum: Array.from(analysis.spectrum) } : null });
  });

  /** SonicDesign's synchronous contract: upload → MP4 bytes back. Internally it is asset + job + wait. */
  async function syncTranscode(req: Request, res: Response, fileField: 'video' | 'frames') {
    const files = req.files as Record<string, Express.Multer.File[]> | undefined;
    const main = files?.[fileField]?.[0];
    const audio = files?.audio?.[0];
    if (!main) return res.status(400).json({ error: `${fileField} file required` });
    const appName = String(req.body.app || opts.defaultApp || 'sonicdesign').slice(0, 40);
    let tmp: string | null = null;
    try {
      const asset = await ingest(main, appName, fileField === 'frames' ? 'frames' : kindFor(main.mimetype, main.originalname), req.body.ownerId || null, req.body.name);
      let audioAssetId: string | undefined;
      if (audio) audioAssetId = (await ingest(audio, appName, 'audio', req.body.ownerId || null)).id;
      const c = new MediaClient({ pool: client.pool, app: appName });
      const job = await c.enqueue(asset.id, 'transcode.mp4', {
        fps: Number(req.body.fps) || undefined, crf: Number(req.body.crf) || undefined, preset: req.body.preset, name: req.body.name, audioAssetId
      }, { priority: 50 });
      const done = await c.waitForJob(job.id, { timeoutMs: 20 * 60 * 1000 });
      if (done.status !== 'done') return res.status(500).json({ error: done.error || `job ${done.status}` });
      const mp4 = (await client.renditions(asset.id, 'mp4')).find(r => r.job_id === job.id) ?? (await client.renditions(asset.id, 'mp4'))[0];
      if (!mp4) return res.status(500).json({ error: 'no mp4 rendition produced' });
      // stream the file back: local → direct read; S3 → fetch through storage
      tmp = await mkdtemp(path.join(os.tmpdir(), 'v12dl-'));
      const local = path.join(tmp, 'out.mp4');
      await storage.fetchTo(mp4.storage_key ? storage.sourceUrl(mp4.storage_key) : mp4.url, local);
      const st = await stat(local);
      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('Content-Length', st.size);
      res.setHeader('Content-Disposition', `attachment; filename="${(req.body.name || 'export').replace(/[^\w.-]+/g, '_')}.mp4"`);
      res.setHeader('X-V12-Asset', asset.id);
      res.setHeader('X-V12-Job', job.id);
      res.setHeader('X-V12-Url', mp4.url);
      await new Promise<void>((resolve, reject) => createReadStream(local).on('error', reject).on('close', () => resolve()).pipe(res));
    } catch (e) {
      if (!res.headersSent) res.status(500).json({ error: (e as Error).message });
    } finally {
      await Promise.all([main, audio].filter(Boolean).map(f => rm(f!.path, { force: true })));
      if (tmp) await rm(tmp, { recursive: true, force: true });
    }
  }

  app.post('/transcode', auth, upload.fields([{ name: 'video', maxCount: 1 }, { name: 'audio', maxCount: 1 }]), (req, res) => void syncTranscode(req, res, 'video'));
  app.post('/sequence', auth, upload.fields([{ name: 'frames', maxCount: 1 }, { name: 'audio', maxCount: 1 }]), (req, res) => void syncTranscode(req, res, 'frames'));

  app.use((err: Error & { code?: string }, _req: Request, res: Response, _next: NextFunction) => {
    if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'upload too large' });
    res.status(500).json({ error: err.message });
  });
  return app;
}
