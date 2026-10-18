/**
 * Media worker — claims jobs from v12media.jobs (FOR UPDATE SKIP LOCKED), runs the handler, writes
 * renditions/analysis back, and heartbeats so a crashed worker's jobs get re-queued. Any number of
 * workers can run against the same database; they never talk to each other or to the apps over HTTP.
 *
 * Fencing: every claim bumps `jobs.lease`. Every later write by that worker (heartbeat, progress,
 * result, failure) is conditioned on `claimed_by = me AND lease = myLease`, so a worker whose job
 * was re-queued (lost heartbeat) can never overwrite the newer attempt's result.
 */
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import pg from 'pg';
import type { Asset, Job } from '../types.js';
import { probe } from './ffmpeg.js';
import { HANDLERS, HandlerContext } from './handlers.js';
import { Storage, safeApp } from './storage.js';
import { JOB_CHANNEL } from '../client/MediaClient.js';

export interface WorkerOptions {
  pool: pg.Pool;
  storage: Storage;
  concurrency?: number;          // default 2
  kinds?: string[];              // restrict to some job kinds (e.g. a GPU box only does stream.*)
  heartbeatMs?: number;          // default 15 s
  staleAfterMs?: number;         // default 120 s without heartbeat → re-queue
  pollMs?: number;               // fallback poll when NOTIFY is missed, default 10 s
  workerId?: string;
  log?: (msg: string) => void;
}

export class LeaseLostError extends Error { constructor(id: string) { super(`lease lost for job ${id}`); this.name = 'LeaseLostError'; } }

export class MediaWorker {
  private running = 0;
  private stopped = true;
  private listener: pg.PoolClient | null = null;
  private wake: (() => void) | null = null;
  private staleTimer: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private loopPromise: Promise<void> | null = null;
  readonly id: string;
  private readonly log: (m: string) => void;
  private concurrency: number;

  constructor(private opts: WorkerOptions) {
    this.id = opts.workerId ?? `${os.hostname()}:${process.pid}`;
    this.log = opts.log ?? ((m) => console.log(`[media-worker ${new Date().toISOString()}] ${m}`));
    this.concurrency = Math.max(1, opts.concurrency ?? 2);
  }

  get active() { return this.running; }

  async start(): Promise<void> {
    if (!this.stopped) return;
    this.stopped = false;
    await this.listen();
    this.log(`started id=${this.id} concurrency=${this.concurrency} storage=${this.opts.storage.mode}`);
    this.staleTimer = setInterval(() => void this.requeueStale().catch(e => this.log(`requeueStale: ${(e as Error).message}`)), this.opts.staleAfterMs ?? 120_000);
    this.staleTimer.unref();
    this.loopPromise = this.loop();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.staleTimer) clearInterval(this.staleTimer);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.staleTimer = this.reconnectTimer = null;
    this.wake?.();
    await this.loopPromise?.catch(() => {});
    while (this.running > 0) await new Promise(r => setTimeout(r, 200));
    const l = this.listener; this.listener = null;
    if (l) { try { await l.query(`UNLISTEN ${JOB_CHANNEL}`); } catch { /* gone */ } l.release(); }
  }

  private async listen() {
    if (this.stopped) return;
    try {
      const c = await this.opts.pool.connect();
      this.listener = c;
      c.on('notification', () => this.wake?.());
      c.on('error', () => {
        if (this.listener === c) this.listener = null;
        if (!this.stopped) this.reconnectTimer = setTimeout(() => void this.listen(), 2000);
      });
      await c.query(`LISTEN ${JOB_CHANNEL}`);
    } catch (e) {
      this.log(`LISTEN failed, polling only: ${(e as Error).message}`);
      if (!this.stopped) this.reconnectTimer = setTimeout(() => void this.listen(), 10_000);
    }
  }

  /** Main loop: never exits on an error — a DB hiccup just waits for the next poll/NOTIFY. */
  private async loop() {
    while (!this.stopped) {
      let claimedAny = false;
      try {
        while (this.running < this.concurrency && !this.stopped) {
          const job = await this.claim();
          if (!job) break;
          claimedAny = true;
          this.running++;
          void this.execute(job).catch(e => this.log(`execute crashed: ${(e as Error).message}`)).finally(() => { this.running--; this.wake?.(); });
        }
      } catch (e) {
        this.log(`claim failed: ${(e as Error).message}`);
      }
      if (claimedAny) continue;
      await new Promise<void>(r => { this.wake = r; setTimeout(r, this.opts.pollMs ?? 10_000); });
      this.wake = null;
    }
  }

  private async claim(): Promise<Job | null> {
    const kinds = this.opts.kinds;
    const r = await this.opts.pool.query<Job>(
      `UPDATE v12media.jobs SET status='running', claimed_by=$1, claimed_at=now(), heartbeat_at=now(), started_at=COALESCE(started_at, now()),
              attempts=attempts+1, lease=lease+1
       WHERE id = (SELECT id FROM v12media.jobs WHERE status='queued' AND ($2::text[] IS NULL OR kind = ANY($2))
                   ORDER BY priority, created_at FOR UPDATE SKIP LOCKED LIMIT 1)
       RETURNING *`, [this.id, kinds ?? null]);
    return r.rows[0] ?? null;
  }

  /** Jobs whose worker stopped heartbeating go back to the queue with a new lease (or fail when out of attempts). */
  async requeueStale(): Promise<number> {
    const r = await this.opts.pool.query(
      `UPDATE v12media.jobs SET status = CASE WHEN attempts >= max_attempts THEN 'failed' ELSE 'queued' END,
              error = CASE WHEN attempts >= max_attempts THEN COALESCE(error,'') || ' worker lost (no heartbeat)' ELSE error END,
              finished_at = CASE WHEN attempts >= max_attempts THEN now() ELSE NULL END, claimed_by=NULL, lease=lease+1
       WHERE status='running' AND heartbeat_at < now() - ($1 || ' milliseconds')::interval`, [String(this.opts.staleAfterMs ?? 120_000)]);
    if (r.rowCount) this.log(`re-queued ${r.rowCount} stale job(s)`);
    return r.rowCount ?? 0;
  }

  /** Fenced write: only succeeds while this worker still holds the lease. */
  private async fenced(job: Job, sql: string, params: unknown[], client: pg.Pool | pg.PoolClient = this.opts.pool): Promise<boolean> {
    const r = await client.query(`${sql} AND claimed_by=$${params.length + 1} AND lease=$${params.length + 2} AND status='running'`, [...params, this.id, job.lease]);
    return (r.rowCount ?? 0) > 0;
  }

  private async execute(job: Job) {
    const { pool, storage } = this.opts;
    let leaseLost = false;
    const hb = setInterval(() => {
      void this.fenced(job, 'UPDATE v12media.jobs SET heartbeat_at=now() WHERE id=$1', [job.id])
        .then(ok => { if (!ok) leaseLost = true; }).catch(() => {});
    }, this.opts.heartbeatMs ?? 15_000);
    const dir = await mkdtemp(path.join(os.tmpdir(), 'v12media-'));
    let lastProgress = 0;
    const t0 = Date.now();
    const assertLease = () => { if (leaseLost) throw new LeaseLostError(job.id); };
    try {
      const handler = HANDLERS[job.kind];
      if (!handler) throw new Error(`unknown job kind ${job.kind}`);
      if (!job.asset_id) throw new Error('job has no asset');
      const asset = (await pool.query<Asset>('SELECT * FROM v12media.assets WHERE id=$1', [job.asset_id])).rows[0];
      if (!asset) throw new Error(`asset ${job.asset_id} missing`);
      safeApp(asset.app); // keys are derived from it
      const source = path.join(dir, 'source' + (path.extname(asset.source_url.split('?')[0]) || ''));
      await storage.fetchTo(asset.source_url, source);
      const info = asset.kind === 'frames' ? { durationS: 0, width: null, height: null, fps: null, hasVideo: true, hasAudio: false, sampleRate: null, channels: null, videoCodec: null, audioCodec: null, bitrateKbps: null } : await probe(source);
      if (asset.kind !== 'frames' && asset.duration_s == null) {
        await pool.query('UPDATE v12media.assets SET duration_s=$2, width=$3, height=$4, sample_rate=$5, channels=$6 WHERE id=$1 AND duration_s IS NULL',
          [asset.id, info.durationS, info.width, info.height, info.sampleRate, info.channels]);
      }
      const fetched = new Map<string, string>();
      const ctx: HandlerContext = {
        job, asset, dir, source, info, storage,
        fetchAsset: async (id) => {
          if (fetched.has(id)) return fetched.get(id)!;
          // dependencies must belong to the same app — no cross-tenant muxing
          const a = (await pool.query<Asset>('SELECT * FROM v12media.assets WHERE id=$1 AND app=$2', [id, asset.app])).rows[0];
          if (!a) throw new Error(`asset ${id} missing`);
          const f = path.join(dir, `dep-${id}${path.extname(a.source_url.split('?')[0]) || ''}`);
          await storage.fetchTo(a.source_url, f); fetched.set(id, f); return f;
        },
        fetchUrl: async (url) => { const f = path.join(dir, `dep-${fetched.size}${path.extname(url.split('?')[0]) || ''}`); await storage.fetchTo(url, f); return f; },
        progress: (fr) => {
          assertLease();
          if (fr - lastProgress < 0.02) return;
          lastProgress = fr;
          void this.fenced(job, 'UPDATE v12media.jobs SET progress=$2 WHERE id=$1', [job.id, Math.round(fr * 1000) / 1000]).then(ok => { if (!ok) leaseLost = true; }).catch(() => {});
        },
        log: (m) => this.log(`[${job.kind} ${job.id.slice(0, 8)}] ${m}`)
      };
      this.log(`start ${job.kind} ${job.id.slice(0, 8)} app=${job.app} attempt=${job.attempts} lease=${job.lease}`);
      const out = await handler(ctx);
      assertLease();
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        // Take the row lock first and verify the lease inside the transaction: a stale worker rolls back here.
        const owned = await client.query(`SELECT 1 FROM v12media.jobs WHERE id=$1 AND claimed_by=$2 AND lease=$3 AND status='running' FOR UPDATE`, [job.id, this.id, job.lease]);
        if (!owned.rowCount) throw new LeaseLostError(job.id);
        const ids: string[] = [];
        for (const r of out.renditions) {
          const ins = await client.query<{ id: string }>(
            `INSERT INTO v12media.renditions (asset_id, job_id, kind, url, storage_key, mime, bytes, width, height, bitrate_kbps, codec, meta)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
            [asset.id, job.id, r.kind, r.url, r.storage_key, r.mime, r.bytes, r.width ?? null, r.height ?? null, r.bitrate_kbps ?? null, r.codec ?? null, JSON.stringify(r.meta ?? {})]);
          ids.push(ins.rows[0].id);
        }
        if (out.analysis) {
          const a = out.analysis;
          await client.query(
            `INSERT INTO v12media.analysis (asset_id, version, fps, frame_count, duration_s, bpm, beats, bands, rms, onset, spectrum)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
             ON CONFLICT (asset_id) DO UPDATE SET version=EXCLUDED.version, fps=EXCLUDED.fps, frame_count=EXCLUDED.frame_count, duration_s=EXCLUDED.duration_s,
               bpm=EXCLUDED.bpm, beats=EXCLUDED.beats, bands=EXCLUDED.bands, rms=EXCLUDED.rms, onset=EXCLUDED.onset, spectrum=EXCLUDED.spectrum, created_at=now()`,
            [asset.id, a.version, a.fps, a.frame_count, a.duration_s, a.bpm, a.beats, Buffer.from(a.bands), Buffer.from(a.rms), Buffer.from(a.onset), Buffer.from(a.spectrum)]);
        }
        const done = await this.fenced(job, `UPDATE v12media.jobs SET status='done', progress=1, finished_at=now(), error=NULL, result=$2 WHERE id=$1`,
          [job.id, JSON.stringify({ renditionIds: ids, ...(out.result ?? {}), ms: Date.now() - t0 })], client);
        if (!done) throw new LeaseLostError(job.id);
        await client.query('COMMIT');
      } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
      this.log(`done ${job.kind} ${job.id.slice(0, 8)} in ${Date.now() - t0} ms (${out.renditions.length} rendition(s))`);
    } catch (err) {
      if (err instanceof LeaseLostError || leaseLost) {
        // Another attempt owns this job now; our outputs are orphaned files only, never rows.
        this.log(`lease lost ${job.kind} ${job.id.slice(0, 8)} — discarding this attempt's result`);
      } else {
        const msg = String((err as Error).message || err).slice(0, 2000);
        const retry = job.attempts < job.max_attempts && !/unknown job kind|missing|no asset|contains no|invalid|not allow-listed|escapes root/.test(msg);
        await this.fenced(job, `UPDATE v12media.jobs SET status=$2, error=$3, finished_at=CASE WHEN $2='failed' THEN now() ELSE NULL END, claimed_by=NULL, lease=lease+1 WHERE id=$1`,
          [job.id, retry ? 'queued' : 'failed', msg]).catch(() => {});
        this.log(`${retry ? 'retry' : 'FAILED'} ${job.kind} ${job.id.slice(0, 8)}: ${msg}`);
      }
    } finally {
      clearInterval(hb);
      await rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  }
}
