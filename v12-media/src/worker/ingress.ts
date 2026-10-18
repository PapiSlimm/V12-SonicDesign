/**
 * Browser ingress — the ONLY HTTP surface, and only for browser clients that have no database
 * (SonicDesign's static site, GameWorld's player). Server-side apps never use this; they use MediaClient.
 *
 *   POST /assets           multipart file=<master> [kind] [name]          → { asset }
 *   POST /jobs             json { assetId, kind, params }                  → { job }
 *   GET  /jobs/:id                                                          → { job }
 *   GET  /assets/:id       → { asset, renditions, analysis? }
 *   POST /transcode        multipart video=<webm|zip> [audio] [fps] [crf] [preset] [name] → MP4 bytes (SonicDesign contract)
 *   POST /sequence         multipart frames=<zip> [audio] [fps] …                          → MP4 bytes (SonicDesign contract)
 *   POST /ai/v1beta/models/<model>:generateContent   Gemini proxy — the API key stays on the server (GEMINI_API_KEY)
 *   GET  /media/*          local-storage files (only when MEDIA_S3_* is not configured)
 *   GET  /health
 *
 * Authentication (every route except /health and /media):
 *   - `Authorization: Bearer <grant>` — HMAC grant minted by an app's server with MEDIA_INGRESS_SECRET
 *     (`mintGrant()`); carries app + ownerId + expiry. All reads/writes are scoped to that app/owner.
 *   - `Authorization: Bearer <MEDIA_INGRESS_TOKEN>` — static token for apps with no backend yet
 *     (SonicDesign). It is shipped in the bundle, so it is an abuse brake, not a secret: scoped to
 *     MEDIA_DEFAULT_APP, owner = hashed client IP, and rate/size limited.
 *   - Neither configured → ingress refuses everything (fail closed).
 *
 * Abuse limits: per-IP sliding windows (MEDIA_RATE_UPLOADS_PER_HOUR, MEDIA_RATE_JOBS_PER_HOUR,
 * MEDIA_RATE_READS_PER_MIN), per-owner daily upload bytes (MEDIA_QUOTA_OWNER_MB_PER_DAY), per-app
 * daily upload bytes (MEDIA_QUOTA_APP_MB_PER_DAY), multipart part limits, and queued jobs are
 * cancelled when the waiting client disconnects.
 */
import express, { type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import os from 'node:os';
import path from 'node:path';
import { createReadStream } from 'node:fs';
import { rm, stat, mkdtemp } from 'node:fs/promises';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { Asset, AssetKind, JobKind, JobParams } from '../types.js';
import { MediaClient, IngressGrant, isUuid, verifyGrant } from '../client/MediaClient.js';
import { LocalStorage, Storage, safeApp } from './storage.js';
import { ffmpegVersion } from './ffmpeg.js';

export interface IngressOptions {
  client: MediaClient;
  storage: Storage;
  allowedOrigin?: string;          // comma-separated origins or '*'
  maxUploadMb?: number;
  /** static bearer token (apps with no backend) */
  token?: string;
  /** HMAC secret for grants minted by app servers */
  grantSecret?: string;
  /** app recorded for static-token uploads (default 'sonicdesign') */
  defaultApp?: string;
  activeJobs?: () => number;
  limits?: Partial<Limits>;
  trustProxy?: boolean;
  /** Gemini proxy: server-side key + model allow-list. Browsers call `${MEDIA_URL}/ai` via @google/genai `httpOptions.baseUrl`. */
  geminiApiKey?: string;
  geminiModels?: string[];
}

export interface Limits {
  uploadsPerHour: number; jobsPerHour: number; readsPerMin: number;
  ownerMbPerDay: number; appMbPerDay: number; aiPerHour: number;
}

const JOB_KINDS = new Set<JobKind>(['transcode.mp4', 'stream.hls', 'stream.dash', 'audio.master', 'analyze.audio', 'video.thumbnail']);
const ALLOWED_PARAMS = new Set(['fps', 'crf', 'preset', 'audioAssetId', 'name', 'rungs', 'segmentSeconds', 'targetLufs', 'truePeakDb', 'formats', 'peaks', 'atSeconds', 'width']);

interface Principal { app: string; ownerId: string; mode: 'grant' | 'token'; grant?: IngressGrant }

/** Minimal sliding-window limiter (per ingress process; fine for one edge box). */
class Window {
  private hits = new Map<string, number[]>();
  constructor(private max: number, private ms: number) {}
  take(key: string): boolean {
    const now = Date.now();
    const arr = (this.hits.get(key) ?? []).filter(t => now - t < this.ms);
    if (arr.length >= this.max) { this.hits.set(key, arr); return false; }
    arr.push(now); this.hits.set(key, arr);
    if (this.hits.size > 50_000) this.hits.clear(); // memory guard
    return true;
  }
}

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

const safeName = (v: unknown) => String(v ?? '').replace(/[^\w .-]+/g, '_').slice(0, 80) || undefined;
const safeExt = (name: string) => { const e = path.extname(name || '').toLowerCase(); return /^\.[a-z0-9]{1,5}$/.test(e) ? e : ''; };

export function createIngress(opts: IngressOptions): express.Express {
  const { client, storage } = opts;
  const limits: Limits = { uploadsPerHour: 30, jobsPerHour: 120, readsPerMin: 240, ownerMbPerDay: 2048, appMbPerDay: 20480, aiPerHour: 120,
    ...Object.fromEntries(Object.entries(opts.limits ?? {}).filter(([, v]) => v != null && Number.isFinite(v))) };
  const upWin = new Window(limits.uploadsPerHour, 3600_000), jobWin = new Window(limits.jobsPerHour, 3600_000), readWin = new Window(limits.readsPerMin, 60_000), aiWin = new Window(limits.aiPerHour, 3600_000);
  const app = express();
  app.disable('x-powered-by');
  if (opts.trustProxy) app.set('trust proxy', 1);
  const upload = multer({ dest: os.tmpdir(), limits: { fileSize: (opts.maxUploadMb ?? 500) * 1024 * 1024, files: 2, fields: 12, fieldSize: 4096, parts: 16 } });
  app.use(express.json({ limit: '64kb' }));

  const origins = (opts.allowedOrigin ?? '*').split(',').map(s => s.trim()).filter(Boolean);
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origins.includes('*')) res.setHeader('Access-Control-Allow-Origin', '*');
    else if (origin && origins.includes(origin)) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin'); }
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Expose-Headers', 'X-V12-Asset, X-V12-Job, X-V12-Url');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  const ipOf = (req: Request) => req.ip || req.socket.remoteAddress || '0.0.0.0';
  const ipOwner = (req: Request) => 'ip:' + createHash('sha256').update(ipOf(req)).digest('hex').slice(0, 24);

  /** Fail closed: no credential config → nothing is accepted. */
  const auth = (req: Request, res: Response, next: NextFunction) => {
    const header = req.headers.authorization || '';
    const bearer = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!bearer) return res.status(401).json({ error: 'authorization required' });
    if (opts.grantSecret) {
      const g = verifyGrant(opts.grantSecret, bearer);
      if (g) {
        try { (req as Request & { principal: Principal }).principal = { app: safeApp(g.app), ownerId: String(g.ownerId).slice(0, 128), mode: 'grant', grant: g }; }
        catch { return res.status(401).json({ error: 'invalid grant' }); }
        return next();
      }
    }
    if (opts.token) {
      const a = Buffer.from(bearer), b = Buffer.from(opts.token);
      if (a.length === b.length && timingSafeEqual(a, b)) {
        (req as Request & { principal: Principal }).principal = { app: safeApp(opts.defaultApp || 'sonicdesign'), ownerId: ipOwner(req), mode: 'token' };
        return next();
      }
    }
    return res.status(401).json({ error: 'unauthorized' });
  };
  const principalOf = (req: Request) => (req as Request & { principal: Principal }).principal;
  const clientFor = (p: Principal) => new MediaClient({ pool: client.pool, app: p.app });
  const limited = (win: Window, what: string) => (req: Request, res: Response, next: NextFunction) =>
    win.take(ipOf(req)) ? next() : res.status(429).json({ error: `too many ${what} — slow down` });

  app.get('/health', async (_req, res) => {
    const ffmpeg = await ffmpegVersion();
    let db = 'ok';
    try { await client.pool.query('SELECT 1'); } catch (e) { db = 'fail: ' + (e as Error).message; }
    res.status(ffmpeg && db === 'ok' ? 200 : 503).json({ ok: !!ffmpeg && db === 'ok', ffmpeg: ffmpeg ?? 'missing', db, storage: storage.mode, auth: !!(opts.token || opts.grantSecret), active: opts.activeJobs?.() ?? null });
  });

  if (storage instanceof LocalStorage) {
    app.use('/media', express.static(storage.root, { maxAge: '1y', immutable: true, dotfiles: 'deny', setHeaders: (res, p) => { if (/\.(m3u8|mpd)$/.test(p)) res.setHeader('Cache-Control', 'public, max-age=60'); } }));
  }

  /** Daily upload quota per owner and per app, measured from the assets table (shared by all ingress instances). */
  async function checkQuota(p: Principal, incomingBytes: number): Promise<string | null> {
    const q = await client.pool.query<{ owner: string; app: string }>(
      `SELECT COALESCE(SUM(source_bytes) FILTER (WHERE owner_id=$2),0)::text AS owner, COALESCE(SUM(source_bytes),0)::text AS app
       FROM v12media.assets WHERE app=$1 AND created_at > now() - interval '1 day'`, [p.app, p.ownerId]);
    const ownerCap = (p.grant?.quotaMb ?? limits.ownerMbPerDay) * 1024 * 1024;
    if (Number(q.rows[0].owner) + incomingBytes > ownerCap) return 'daily upload quota exceeded for this user';
    if (Number(q.rows[0].app) + incomingBytes > limits.appMbPerDay * 1024 * 1024) return 'daily upload quota exceeded for this app';
    return null;
  }

  /** Store an uploaded file as a master asset (dedup by sha256 per app). Keys are server-generated. */
  async function ingest(file: Express.Multer.File, p: Principal, kind: AssetKind, name?: string): Promise<Asset> {
    const sha = await sha256File(file.path);
    const key = `${p.app}/masters/${sha.slice(0, 2)}/${sha}${safeExt(file.originalname) || (kind === 'frames' ? '.zip' : '')}`;
    const c = clientFor(p);
    const existing = await client.pool.query<Asset>('SELECT * FROM v12media.assets WHERE app=$1 AND sha256=$2', [p.app, sha]);
    if (existing.rows[0]) return existing.rows[0]; // dedup hit: no quota charge, no re-upload
    const over = await checkQuota(p, file.size);
    if (over) throw Object.assign(new Error(over), { status: 429 });
    await storage.putFile(file.path, key, file.mimetype);
    return c.registerAsset({ kind, sourceUrl: storage.sourceUrl(key), ownerId: p.ownerId, bytes: file.size, mime: file.mimetype, sha256: sha, meta: { name: name || safeName(file.originalname) } });
  }

  const cleanup = (...files: Array<Express.Multer.File | undefined>) => Promise.all(files.filter(Boolean).map(f => rm(f!.path, { force: true })));

  app.post('/assets', auth, limited(upWin, 'uploads'), upload.single('file'), async (req, res) => {
    const f = req.file;
    if (!f) return res.status(400).json({ error: 'file required' });
    const p = principalOf(req);
    try {
      const kind = (['audio', 'video', 'image', 'frames'] as const).find(k => k === req.body.kind) ?? kindFor(f.mimetype, f.originalname);
      res.json({ asset: await ingest(f, p, kind, safeName(req.body.name)) });
    } catch (e) { res.status((e as { status?: number }).status ?? 500).json({ error: (e as Error).message }); }
    finally { await cleanup(f); }
  });

  app.post('/jobs', auth, limited(jobWin, 'jobs'), async (req, res) => {
    const { assetId, kind, params } = (req.body ?? {}) as { assetId?: unknown; kind?: JobKind; params?: Record<string, unknown> };
    if (!isUuid(assetId) || !kind || !JOB_KINDS.has(kind)) return res.status(400).json({ error: 'assetId and a valid kind required' });
    const p = principalOf(req);
    const clean = Object.fromEntries(Object.entries(params ?? {}).filter(([k]) => ALLOWED_PARAMS.has(k)));
    if (typeof clean.audioAssetId === 'string' && !(await clientFor(p).asset(clean.audioAssetId, p.ownerId))) return res.status(404).json({ error: 'audioAssetId not found' });
    try {
      const job = await clientFor(p).enqueue(assetId, kind, clean as JobParams, { ownerId: p.ownerId });
      res.json({ job });
    } catch (e) { res.status(/not found/.test((e as Error).message) ? 404 : 500).json({ error: (e as Error).message }); }
  });

  app.get('/jobs/:id', auth, limited(readWin, 'requests'), async (req, res) => {
    const p = principalOf(req);
    const job = await clientFor(p).job(req.params.id, p.ownerId).catch(() => null);
    if (!job) return res.status(404).json({ error: 'not found' });
    res.json({ job });
  });

  app.get('/assets/:id', auth, limited(readWin, 'requests'), async (req, res) => {
    const p = principalOf(req);
    const c = clientFor(p);
    const asset = await c.asset(req.params.id, p.ownerId).catch(() => null);
    if (!asset) return res.status(404).json({ error: 'not found' });
    const [renditions, analysis] = await Promise.all([c.renditions(asset.id), c.analysis(asset.id)]);
    res.json({ asset, renditions, analysis: analysis ? { fps: analysis.fps, frameCount: analysis.frameCount, duration: analysis.duration, bpm: analysis.bpm, beats: analysis.beats,
      bands: Array.from(analysis.bands), rms: Array.from(analysis.rms), onset: Array.from(analysis.onset), spectrum: Array.from(analysis.spectrum) } : null });
  });

  /** SonicDesign's synchronous contract: upload → MP4 bytes back. Internally it is asset + job + wait. */
  async function syncTranscode(req: Request, res: Response, fileField: 'video' | 'frames') {
    const files = req.files as Record<string, Express.Multer.File[]> | undefined;
    const main = files?.[fileField]?.[0];
    const audio = files?.audio?.[0];
    if (!main) { await cleanup(audio); return res.status(400).json({ error: `${fileField} file required` }); }
    const p = principalOf(req);
    let tmp: string | null = null;
    let jobId: string | null = null;
    const c = clientFor(p);
    // If the browser goes away while we are still queued, drop the job instead of burning CPU for nobody.
    let gone = false;
    res.on('close', () => { gone = true; if (jobId) void c.cancel(jobId); });
    try {
      const asset = await ingest(main, p, fileField === 'frames' ? 'frames' : kindFor(main.mimetype, main.originalname), safeName(req.body.name));
      const audioAssetId = audio ? (await ingest(audio, p, 'audio')).id : undefined;
      const job = await c.enqueue(asset.id, 'transcode.mp4', {
        fps: Number(req.body.fps) || undefined, crf: Number(req.body.crf) || undefined, preset: String(req.body.preset || ''), name: safeName(req.body.name), audioAssetId
      }, { priority: 50, ownerId: p.ownerId });
      jobId = job.id;
      const done = await c.waitForJob(job.id, { timeoutMs: 20 * 60 * 1000 });
      if (gone) return;
      if (done.status !== 'done') return res.status(500).json({ error: done.error || `job ${done.status}` });
      const mp4 = (await c.renditions(asset.id, 'mp4')).find(r => r.job_id === job.id) ?? (await c.renditions(asset.id, 'mp4'))[0];
      if (!mp4) return res.status(500).json({ error: 'no mp4 rendition produced' });
      tmp = await mkdtemp(path.join(os.tmpdir(), 'v12dl-'));
      const local = path.join(tmp, 'out.mp4');
      await storage.fetchTo(mp4.storage_key ? storage.sourceUrl(mp4.storage_key) : mp4.url, local);
      const st = await stat(local);
      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('Content-Length', st.size);
      res.setHeader('Content-Disposition', `attachment; filename="${(safeName(req.body.name) || 'export').replace(/[^\w.-]+/g, '_')}.mp4"`);
      res.setHeader('X-V12-Asset', asset.id);
      res.setHeader('X-V12-Job', job.id);
      res.setHeader('X-V12-Url', mp4.url);
      await new Promise<void>((resolve, reject) => createReadStream(local).on('error', reject).on('close', () => resolve()).pipe(res));
    } catch (e) {
      if (!res.headersSent) res.status((e as { status?: number }).status ?? 500).json({ error: (e as Error).message });
    } finally {
      await cleanup(main, audio);
      if (tmp) await rm(tmp, { recursive: true, force: true });
    }
  }

  /* ---------------- Gemini proxy (#8: no AI key in the browser bundle) ---------------- */
  const GEMINI_HOST = 'https://generativelanguage.googleapis.com';
  const geminiModels = new Set(opts.geminiModels?.length ? opts.geminiModels : ['gemini-2.5-flash', 'gemini-2.5-flash-image', 'gemini-2.5-pro']);
  app.post('/ai/:version/models/:modelAction', auth, limited(aiWin, 'AI requests'), express.raw({ type: () => true, limit: '24mb' }), async (req, res) => {
    if (!opts.geminiApiKey) return res.status(503).json({ error: 'AI proxy not configured (GEMINI_API_KEY)' });
    const [model, action] = String(req.params.modelAction).split(':');
    if (!/^v1(beta)?$/.test(req.params.version) || !geminiModels.has(model) || !/^(generateContent|streamGenerateContent)$/.test(action || '')) {
      return res.status(400).json({ error: 'model or action not allowed' });
    }
    const target = `${GEMINI_HOST}/${req.params.version}/models/${model}:${action}${action === 'streamGenerateContent' ? '?alt=sse' : ''}`;
    try {
      const upstream = await fetch(target, {
        method: 'POST', signal: AbortSignal.timeout(120_000),
        headers: { 'content-type': req.headers['content-type'] || 'application/json', 'x-goog-api-key': opts.geminiApiKey },
        body: new Uint8Array(req.body as Buffer)
      });
      res.status(upstream.status);
      for (const h of ['content-type', 'cache-control']) { const v = upstream.headers.get(h); if (v) res.setHeader(h, v); }
      if (!upstream.body) return res.end();
      const reader = upstream.body.getReader();
      for (;;) { const { done, value } = await reader.read(); if (done) break; res.write(Buffer.from(value)); }
      res.end();
    } catch (e) {
      if (!res.headersSent) res.status(502).json({ error: 'AI upstream failed: ' + (e as Error).message });
      else res.end();
    }
  });

  const pair = (a: string) => upload.fields([{ name: a, maxCount: 1 }, { name: 'audio', maxCount: 1 }]);
  app.post('/transcode', auth, limited(upWin, 'uploads'), pair('video'), (req, res) => void syncTranscode(req, res, 'video'));
  app.post('/sequence', auth, limited(upWin, 'uploads'), pair('frames'), (req, res) => void syncTranscode(req, res, 'frames'));

  app.use((err: Error & { code?: string; status?: number }, _req: Request, res: Response, _next: NextFunction) => {
    if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'upload too large' });
    if (err.code?.startsWith('LIMIT_')) return res.status(400).json({ error: 'upload rejected: ' + err.message });
    res.status(err.status ?? 500).json({ error: err.message });
  });
  return app;
}
