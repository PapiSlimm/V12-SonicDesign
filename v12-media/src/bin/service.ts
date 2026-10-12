#!/usr/bin/env node
/**
 * V12 media service entry. One process, two roles:
 *   MEDIA_ROLE=all      worker + browser ingress (default; what Render runs)
 *   MEDIA_ROLE=worker   queue consumer only (scale these horizontally)
 *   MEDIA_ROLE=ingress  browser upload edge only
 * Required: DATABASE_URL (the shared V12 Postgres). Storage: MEDIA_S3_* or MEDIA_LOCAL_DIR.
 */
import pg from 'pg';
import { MediaClient } from '../client/MediaClient.js';
import { MediaWorker } from '../worker/index.js';
import { createIngress } from '../worker/ingress.js';
import { storageFromEnv } from '../worker/storage.js';

const env = process.env;
const role = (env.MEDIA_ROLE || 'all') as 'all' | 'worker' | 'ingress';
if (!env.DATABASE_URL) { console.error('DATABASE_URL is required (shared V12 Postgres)'); process.exit(1); }

const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 6,
  ssl: /localhost|127\.0\.0\.1|sslmode=disable/.test(env.DATABASE_URL) ? undefined : { rejectUnauthorized: false } });
const client = new MediaClient({ pool, app: env.MEDIA_DEFAULT_APP || 'sonicdesign' });
const storage = storageFromEnv(env);

async function main() {
  await client.ensureSchema();
  let worker: MediaWorker | null = null;
  if (role !== 'ingress') {
    worker = new MediaWorker({ pool, storage, concurrency: parseInt(env.MAX_JOBS || '2', 10), kinds: env.MEDIA_JOB_KINDS?.split(',').map(s => s.trim()).filter(Boolean) });
    await worker.start();
  }
  if (role !== 'worker') {
    const app = createIngress({ client, storage, allowedOrigin: env.ALLOWED_ORIGIN || '*', maxUploadMb: parseInt(env.MAX_UPLOAD_MB || '500', 10),
      token: env.MEDIA_INGRESS_TOKEN || undefined, defaultApp: env.MEDIA_DEFAULT_APP || 'sonicdesign', activeJobs: () => worker?.active ?? 0 });
    const port = parseInt(env.PORT || '10000', 10);
    app.listen(port, () => console.log(`v12-media ingress listening on :${port} role=${role} storage=${storage.mode}`));
  } else {
    // worker-only still needs a health port for Render
    const http = await import('node:http');
    http.createServer((_q, r) => { r.writeHead(200, { 'content-type': 'application/json' }); r.end(JSON.stringify({ ok: true, role, active: worker?.active ?? 0 })); }).listen(parseInt(env.PORT || '10000', 10));
  }
  const shutdown = async () => { console.log('shutting down…'); await worker?.stop(); await pool.end(); process.exit(0); };
  process.on('SIGTERM', () => void shutdown());
  process.on('SIGINT', () => void shutdown());
}

main().catch(e => { console.error(e); process.exit(1); });
