/**
 * End-to-end test against a real Postgres + ffmpeg. Set DATABASE_URL (a throwaway database).
 *   DATABASE_URL=postgres://postgres@127.0.0.1:5433/v12test npm test
 * Covers: schema, asset dedup, job dedup, SKIP LOCKED claim, every handler, LISTEN/NOTIFY wait, ingress /transcode contract.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import pg from 'pg';
import { MediaClient } from '../client/MediaClient.js';
import { MediaWorker } from '../worker/index.js';
import { LocalStorage } from '../worker/storage.js';
import { createIngress } from '../worker/ingress.js';
import { run } from '../worker/ffmpeg.js';
import { analysePcm, rowToAnalysis, analysisToRow } from '../analyze/core.js';

const url = process.env.DATABASE_URL;
if (!url) { console.log('DATABASE_URL not set — skipping e2e'); process.exit(0); }

const dir = await mkdtemp(path.join(os.tmpdir(), 'v12media-test-'));
const storage = new LocalStorage(path.join(dir, 'store'), 'http://127.0.0.1:10999');
const pool = new pg.Pool({ connectionString: url, max: 8 });
await pool.query('DROP SCHEMA IF EXISTS v12media CASCADE');

// Synthetic media: 4 s 120 BPM kick + tone (wav) and a 2 s 320x180 test video.
const wav = path.join(dir, 'beat.wav');
await run(['-f', 'lavfi', '-i', 'sine=frequency=55:beep_factor=8:duration=4', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=4',
  '-filter_complex', '[0:a]volume=1.0[a];[1:a]volume=0.15[b];[a][b]amix=inputs=2:duration=shortest,aresample=22050', '-ac', '1', wav]);
const mp4src = path.join(dir, 'src.mp4');
await run(['-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=30:duration=2', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', mp4src]);

const sd = new MediaClient({ pool, app: 'sonicdesign' });
await sd.ensureSchema();
await sd.ensureSchema(); // idempotent

test('analysis core round-trips through the DB row format', () => {
  const mono = new Float32Array(22050 * 2);
  for (let i = 0; i < mono.length; i++) mono[i] = Math.sin(i / 20) * ((i % 11025) < 800 ? 1 : 0.1);
  const a = analysePcm(mono, 22050, 60);
  const b = rowToAnalysis(analysisToRow(a));
  assert.equal(b.frameCount, a.frameCount);
  assert.deepEqual(Array.from(b.bands.slice(0, 8)), Array.from(a.bands.slice(0, 8)));
  assert.equal(b.bpm, a.bpm);
});

test('asset + job dedup', async () => {
  const a1 = await sd.registerAsset({ kind: 'audio', sourceUrl: `file://${wav}`, sha256: 'abc', meta: { name: 'beat' } });
  const a2 = await sd.registerAsset({ kind: 'audio', sourceUrl: `file://${wav}`, sha256: 'abc' });
  assert.equal(a1.id, a2.id, 'same sha256 → same asset');
  const j1 = await sd.enqueue(a1.id, 'analyze.audio', { fps: 60 });
  const j2 = await sd.enqueue(a1.id, 'analyze.audio', { fps: 60 });
  assert.equal(j1.id, j2.id, 'identical request → same job');
  const j3 = await sd.enqueue(a1.id, 'analyze.audio', { fps: 30 });
  assert.notEqual(j1.id, j3.id);
});

test('worker runs every handler and clients wait via NOTIFY', async () => {
  const worker = new MediaWorker({ pool, storage, concurrency: 2, log: () => {}, pollMs: 2000 });
  await worker.start();
  try {
    const audio = await sd.registerAsset({ kind: 'audio', sourceUrl: `file://${wav}`, sha256: 'wav1', meta: { name: 'beat' } });
    const video = await new MediaClient({ pool, app: 'gameworld' }).registerAsset({ kind: 'video', sourceUrl: `file://${mp4src}`, sha256: 'vid1' });
    const gw = new MediaClient({ pool, app: 'gameworld' });
    const jobs = [
      await sd.enqueue(audio.id, 'analyze.audio'),
      await sd.enqueue(audio.id, 'audio.master', { formats: ['opus', 'aac', 'mp3'], peaks: 256 }),
      await gw.enqueue(video.id, 'transcode.mp4', { crf: 28, preset: 'veryfast', audioAssetId: audio.id, name: 'clip' }),
      await gw.enqueue(video.id, 'stream.hls', { rungs: [{ height: 180, videoKbps: 400 }, { height: 120, videoKbps: 200 }], segmentSeconds: 2 }),
      await gw.enqueue(video.id, 'stream.dash', { rungs: [{ height: 180, videoKbps: 400 }], segmentSeconds: 2 }),
      await gw.enqueue(video.id, 'video.thumbnail', { width: 160 })
    ];
    const done = await Promise.all(jobs.map(j => sd.waitForJob(j.id, { timeoutMs: 180_000 })));
    for (const j of done) assert.equal(j.status, 'done', `${j.kind}: ${j.error}`);

    const an = await sd.analysis(audio.id);
    assert.ok(an && an.frameCount >= 230, 'analysis stored');
    assert.ok(an!.bpm >= 110 && an!.bpm <= 130, `bpm ${an!.bpm} ≈ 120`);

    const ar = await sd.renditions(audio.id);
    assert.deepEqual(ar.map(r => r.kind).sort(), ['aac', 'mp3', 'opus', 'peaks']);
    const peaks = JSON.parse(await readFile(path.join(storage.root, ar.find(r => r.kind === 'peaks')!.storage_key!), 'utf8'));
    assert.equal(peaks.max.length, 256);

    const vr = await gw.renditions(video.id);
    assert.deepEqual(vr.map(r => r.kind).sort(), ['dash', 'hls', 'mp4', 'thumbnail']);
    const hls = await readFile(path.join(storage.root, vr.find(r => r.kind === 'hls')!.storage_key!), 'utf8');
    assert.match(hls, /#EXT-X-STREAM-INF/);
    assert.equal((hls.match(/#EXT-X-STREAM-INF/g) || []).length, 2, 'two HLS rungs');
    const mpd = await readFile(path.join(storage.root, vr.find(r => r.kind === 'dash')!.storage_key!), 'utf8');
    assert.match(mpd, /<MPD/);
    assert.equal(await gw.playbackUrl(video.id), vr.find(r => r.kind === 'hls')!.url);
    const mp4 = vr.find(r => r.kind === 'mp4')!;
    assert.equal(mp4.width, 320); assert.equal(mp4.height, 180); assert.equal(mp4.codec, 'h264/aac');
    // asset metadata was filled by the worker
    assert.ok(Math.abs((await gw.asset(video.id))!.duration_s! - 2) < 0.2);
  } finally { await worker.stop(); }
});

test('failed job retries then fails; stale running job is re-queued', async () => {
  const bad = await sd.registerAsset({ kind: 'video', sourceUrl: `file://${dir}/nope.mp4`, sha256: 'bad' });
  const j = await sd.enqueue(bad.id, 'video.thumbnail', {}, { maxAttempts: 2 });
  const worker = new MediaWorker({ pool, storage, log: () => {}, pollMs: 500 });
  await worker.start();
  try {
    const d = await sd.waitForJob(j.id, { timeoutMs: 60_000 });
    assert.equal(d.status, 'failed'); assert.equal(d.attempts, 2);
  } finally { await worker.stop(); }
  await pool.query(`UPDATE v12media.jobs SET status='running', heartbeat_at=now()-interval '10 minutes', attempts=0 WHERE id=$1`, [j.id]);
  const w2 = new MediaWorker({ pool, storage, log: () => {}, staleAfterMs: 60_000 });
  await (w2 as unknown as { requeueStale: () => Promise<void> }).requeueStale();
  assert.equal((await sd.job(j.id))!.status, 'queued');
  await sd.cancel(j.id);
  assert.equal((await sd.job(j.id))!.status, 'cancelled');
});

test('ingress keeps the SonicDesign /transcode contract (upload → mp4 bytes)', async () => {
  const worker = new MediaWorker({ pool, storage, log: () => {}, pollMs: 1000 });
  await worker.start();
  const app = createIngress({ client: sd, storage, activeJobs: () => worker.active });
  const server = app.listen(10999);
  try {
    const health = await (await fetch('http://127.0.0.1:10999/health')).json() as { ok: boolean; storage: string };
    assert.equal(health.ok, true); assert.equal(health.storage, 'local');
    const webm = path.join(dir, 'cap.webm');
    await run(['-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=30:duration=1', '-c:v', 'libvpx-vp9', '-deadline', 'realtime', '-cpu-used', '8', webm]);
    const form = new FormData();
    form.append('video', new Blob([await readFile(webm)], { type: 'video/webm' }), 'cap.webm');
    form.append('audio', new Blob([await readFile(wav)], { type: 'audio/wav' }), 'beat.wav');
    form.append('fps', '30'); form.append('name', 'promo');
    const res = await fetch('http://127.0.0.1:10999/transcode', { method: 'POST', body: form });
    const bytes = new Uint8Array(await res.arrayBuffer());
    assert.equal(res.status, 200, Buffer.from(bytes).toString().slice(0, 300));
    assert.equal(res.headers.get('content-type'), 'video/mp4');
    assert.ok(bytes.length > 1000);
    assert.equal(Buffer.from(bytes.slice(4, 8)).toString(), 'ftyp');
    const assetId = res.headers.get('x-v12-asset')!;
    const detail = await (await fetch(`http://127.0.0.1:10999/assets/${assetId}`)).json() as { renditions: Array<{ kind: string; url: string }> };
    assert.equal(detail.renditions[0].kind, 'mp4');
    const served = await fetch(detail.renditions[0].url);
    assert.equal(served.status, 200, 'rendition served from /media');
    // async API: enqueue a thumbnail through HTTP and poll
    const jr = await (await fetch('http://127.0.0.1:10999/jobs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ assetId, kind: 'video.thumbnail' }) })).json() as { job: { id: string } };
    const fin = await sd.waitForJob(jr.job.id, { timeoutMs: 60_000 });
    assert.equal(fin.status, 'done');
  } catch (e) { console.error('INGRESS TEST ERROR', e); throw e; } finally { server.closeAllConnections(); server.close(); await worker.stop(); }
});

test.after(async () => { await sd.close(); await pool.end(); await writeFile(path.join(dir, 'done'), '1'); });
