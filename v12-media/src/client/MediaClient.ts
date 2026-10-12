/**
 * MediaClient — how every V12 app talks to the media service: through the shared Postgres only.
 *
 *   const media = new MediaClient({ connectionString: process.env.DATABASE_URL, app: 'sonicwave' });
 *   await media.ensureSchema();
 *   const asset = await media.registerAsset({ kind: 'audio', sourceUrl: 's3://v12-media/masters/x.wav', sha256 });
 *   const job   = await media.enqueue(asset.id, 'audio.master', { targetLufs: -14 });
 *   const done  = await media.waitForJob(job.id);           // LISTEN/NOTIFY, no polling storm
 *   const files = await media.renditions(asset.id);          // [{kind:'opus', url}, {kind:'aac', url}, …]
 *
 * No HTTP between services: enqueue = INSERT, status = SELECT, wake-ups = pg_notify.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import type { Asset, AssetKind, Job, JobKind, JobParams, JobStatus, MediaApp, Rendition } from '../types.js';
import { AudioAnalysis, rowToAnalysis } from '../analyze/core.js';

export interface MediaClientOptions {
  /** Postgres URL (the shared V12 database). Either this or `pool`. */
  connectionString?: string;
  pool?: pg.Pool;
  /** Which app is talking (stored on assets/jobs, used for ownership + dedup). */
  app: MediaApp;
  ssl?: boolean | pg.PoolConfig['ssl'];
}

export interface RegisterAssetInput {
  kind: AssetKind;
  sourceUrl: string;
  ownerId?: string | null;
  bytes?: number;
  mime?: string;
  /** Dedup key per app. Re-registering the same sha256 returns the existing asset. */
  sha256?: string;
  meta?: Record<string, unknown>;
}

export interface EnqueueOptions {
  priority?: number;
  maxAttempts?: number;
  /** false → always create a new job even if an identical one exists. Default true. */
  dedup?: boolean;
}

export const JOB_CHANNEL = 'v12media_jobs';

export function stableHash(v: unknown): string {
  const seen = (x: unknown): unknown => (x && typeof x === 'object' && !Array.isArray(x))
    ? Object.fromEntries(Object.keys(x as object).sort().map(k => [k, seen((x as Record<string, unknown>)[k])]))
    : Array.isArray(x) ? x.map(seen) : x;
  return createHash('sha1').update(JSON.stringify(seen(v) ?? null)).digest('hex').slice(0, 16);
}

export function sha256Of(data: Uint8Array | string): string {
  return createHash('sha256').update(data).digest('hex');
}

export class MediaClient {
  readonly pool: pg.Pool;
  readonly app: MediaApp;
  private ownsPool: boolean;
  private get waiters() { return notifierFor(this.pool).waiters; }

  constructor(opts: MediaClientOptions) {
    if (!opts.pool && !opts.connectionString) throw new Error('MediaClient: connectionString or pool required');
    this.pool = opts.pool ?? new pg.Pool({ connectionString: opts.connectionString, ssl: opts.ssl ?? sslFor(opts.connectionString!), max: 4 });
    this.ownsPool = !opts.pool;
    this.app = opts.app;
  }

  /** Create/upgrade the `v12media` schema. Idempotent; call once at boot. */
  async ensureSchema(): Promise<void> {
    const sql = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'sql', '001_v12media.sql'), 'utf8');
    await this.pool.query(sql);
  }

  /* ---------------- assets ---------------- */

  async registerAsset(input: RegisterAssetInput): Promise<Asset> {
    if (input.sha256) {
      const existing = await this.pool.query<Asset>('SELECT * FROM v12media.assets WHERE app=$1 AND sha256=$2', [this.app, input.sha256]);
      if (existing.rows[0]) return existing.rows[0];
    }
    const r = await this.pool.query<Asset>(
      `INSERT INTO v12media.assets (app, owner_id, kind, source_url, source_bytes, mime, sha256, meta)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (app, sha256) WHERE sha256 IS NOT NULL DO UPDATE SET meta = v12media.assets.meta
       RETURNING *`,
      [this.app, input.ownerId ?? null, input.kind, input.sourceUrl, input.bytes ?? null, input.mime ?? null, input.sha256 ?? null, JSON.stringify(input.meta ?? {})]
    );
    return r.rows[0];
  }

  async asset(id: string): Promise<Asset | null> {
    const r = await this.pool.query<Asset>('SELECT * FROM v12media.assets WHERE id=$1', [id]);
    return r.rows[0] ?? null;
  }

  async assetsOf(ownerId: string, kind?: AssetKind): Promise<Asset[]> {
    const r = await this.pool.query<Asset>(
      `SELECT * FROM v12media.assets WHERE app=$1 AND owner_id=$2 AND ($3::text IS NULL OR kind=$3) ORDER BY created_at DESC`,
      [this.app, ownerId, kind ?? null]);
    return r.rows;
  }

  /* ---------------- jobs ---------------- */

  /** Enqueue work for an asset. Identical (asset, kind, params) requests share one job unless dedup:false. */
  async enqueue<P extends JobParams>(assetId: string, kind: JobKind, params: P = {} as P, opts: EnqueueOptions = {}): Promise<Job<P>> {
    const dedupKey = opts.dedup === false ? null : `${assetId}:${kind}:${stableHash(params)}`;
    if (dedupKey) {
      const existing = await this.pool.query<Job<P>>(
        `SELECT * FROM v12media.jobs WHERE dedup_key=$1 AND status IN ('queued','running','done') LIMIT 1`, [dedupKey]);
      if (existing.rows[0]) return existing.rows[0];
    }
    const r = await this.pool.query<Job<P>>(
      `INSERT INTO v12media.jobs (app, asset_id, kind, params, priority, max_attempts, dedup_key)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (dedup_key) WHERE dedup_key IS NOT NULL AND status IN ('queued','running','done') DO NOTHING
       RETURNING *`,
      [this.app, assetId, kind, JSON.stringify(params), opts.priority ?? 100, opts.maxAttempts ?? 3, dedupKey]);
    if (r.rows[0]) return r.rows[0];
    // lost a race with an identical insert → return the winner
    const again = await this.pool.query<Job<P>>(`SELECT * FROM v12media.jobs WHERE dedup_key=$1 AND status IN ('queued','running','done') LIMIT 1`, [dedupKey]);
    return again.rows[0];
  }

  /** Enqueue the standard bundle for a kind of asset in one call. */
  async enqueueBundle(asset: Asset): Promise<Job[]> {
    const kinds: JobKind[] = asset.kind === 'audio'
      ? ['audio.master', 'analyze.audio']
      : asset.kind === 'video' || asset.kind === 'frames'
        ? ['transcode.mp4', 'stream.hls', 'video.thumbnail']
        : [];
    const jobs: Job[] = [];
    for (const k of kinds) jobs.push(await this.enqueue(asset.id, k));
    return jobs;
  }

  async job(id: string): Promise<Job | null> {
    const r = await this.pool.query<Job>('SELECT * FROM v12media.jobs WHERE id=$1', [id]);
    return r.rows[0] ?? null;
  }

  async jobsFor(assetId: string): Promise<Job[]> {
    const r = await this.pool.query<Job>('SELECT * FROM v12media.jobs WHERE asset_id=$1 ORDER BY created_at', [assetId]);
    return r.rows;
  }

  async cancel(id: string): Promise<boolean> {
    const r = await this.pool.query(`UPDATE v12media.jobs SET status='cancelled', finished_at=now() WHERE id=$1 AND status='queued'`, [id]);
    return (r.rowCount ?? 0) > 0;
  }

  /** Resolve when the job reaches done/failed/cancelled. Uses LISTEN/NOTIFY with a safety poll. */
  async waitForJob(id: string, opts: { timeoutMs?: number; onProgress?: (j: Job) => void } = {}): Promise<Job> {
    const timeoutMs = opts.timeoutMs ?? 30 * 60 * 1000;
    const terminal = (s: JobStatus) => s === 'done' || s === 'failed' || s === 'cancelled';
    const first = await this.job(id);
    if (!first) throw new Error(`job ${id} not found`);
    if (terminal(first.status)) return first;
    await this.startListening();
    return new Promise<Job>((resolve, reject) => {
      let settled = false;
      const finish = (fn: () => void) => { if (settled) return; settled = true; clearInterval(poll); clearTimeout(timer); this.waiters.get(id)?.delete(onEvent); fn(); };
      const check = async () => { const j = await this.job(id); if (j && terminal(j.status)) finish(() => resolve(j)); else if (j && opts.onProgress) opts.onProgress(j); };
      const onEvent = (j: Job) => { if (terminal(j.status)) void check(); else if (opts.onProgress) void check(); };
      this.waiters.set(id, (this.waiters.get(id) ?? new Set()).add(onEvent));
      const poll = setInterval(() => void check(), 5000);
      const timer = setTimeout(() => finish(() => reject(new Error(`job ${id} timed out after ${timeoutMs} ms`))), timeoutMs);
      void check();
    });
  }

  /** Subscribe to every job event for this app (status/progress). Returns unsubscribe. */
  async onJobEvent(handler: (e: { id: string; status: JobStatus; app: string; kind: JobKind }) => void): Promise<() => void> {
    await this.startListening();
    const set = this.waiters.get('*') ?? new Set();
    const fn = (j: Job) => handler({ id: j.id, status: j.status, app: j.app, kind: j.kind });
    set.add(fn);
    this.waiters.set('*', set);
    return () => set.delete(fn);
  }

  private startListening(): Promise<void> {
    return notifierFor(this.pool).start();
  }

  /* ---------------- outputs ---------------- */

  async renditions(assetId: string, kind?: Rendition['kind']): Promise<Rendition[]> {
    const r = await this.pool.query<Rendition>(
      `SELECT * FROM v12media.renditions WHERE asset_id=$1 AND ($2::text IS NULL OR kind=$2) ORDER BY height DESC NULLS LAST, created_at`,
      [assetId, kind ?? null]);
    return r.rows;
  }

  /** Best playable URL for an asset: HLS master if present, else MP4, else opus/aac/mp3, else the source. */
  async playbackUrl(assetId: string): Promise<string | null> {
    const rs = await this.renditions(assetId);
    for (const k of ['hls', 'mp4', 'opus', 'aac', 'mp3'] as const) { const r = rs.find(x => x.kind === k); if (r) return r.url; }
    return (await this.asset(assetId))?.source_url ?? null;
  }

  async analysis(assetId: string): Promise<AudioAnalysis | null> {
    const r = await this.pool.query('SELECT * FROM v12media.analysis WHERE asset_id=$1', [assetId]);
    return r.rows[0] ? rowToAnalysis(r.rows[0]) : null;
  }

  /** Release the LISTEN connection (and the pool if this client created it). */
  async close(): Promise<void> {
    await notifierFor(this.pool).release();
    if (this.ownsPool) await this.pool.end();
  }
}

/** One LISTEN connection per pool, shared by every MediaClient on it (ingress creates many). */
class Notifier {
  readonly waiters = new Map<string, Set<(j: Job) => void>>();
  private client: pg.PoolClient | null = null;
  private starting: Promise<void> | null = null;
  constructor(private pool: pg.Pool) {}
  start(): Promise<void> {
    if (this.starting) return this.starting;
    this.starting = (async () => {
      const c = await this.pool.connect();
      this.client = c;
      c.on('notification', msg => {
        if (msg.channel !== JOB_CHANNEL || !msg.payload) return;
        try {
          const e = JSON.parse(msg.payload) as Job;
          this.waiters.get(e.id)?.forEach(fn => fn(e));
          this.waiters.get('*')?.forEach(fn => fn(e));
        } catch { /* ignore malformed */ }
      });
      c.on('error', () => { this.client = null; this.starting = null; });
      await c.query(`LISTEN ${JOB_CHANNEL}`);
    })().catch(e => { this.starting = null; throw e; });
    return this.starting;
  }
  async release(): Promise<void> {
    const c = this.client; this.client = null; this.starting = null;
    if (c) { try { await c.query(`UNLISTEN ${JOB_CHANNEL}`); } catch { /* connection may be gone */ } c.release(); }
  }
}
const notifiers = new WeakMap<pg.Pool, Notifier>();
function notifierFor(pool: pg.Pool): Notifier {
  let n = notifiers.get(pool);
  if (!n) { n = new Notifier(pool); notifiers.set(pool, n); }
  return n;
}

function sslFor(url: string): pg.PoolConfig['ssl'] {
  // Render/Cloud SQL external hosts need TLS; local + private hosts don't.
  if (/localhost|127\.0\.0\.1|@10\.|@172\.|@192\.168\.|sslmode=disable/.test(url)) return undefined;
  return { rejectUnauthorized: false };
}
