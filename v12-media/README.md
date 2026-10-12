# @v12/media — the one media service for the V12 estate

Encode + stream + visualize, built once, used by **SonicDesign, SonicWave, SonicStream, SonicVisual, GameWorld**.
Apps talk to it through the **shared Postgres** (`v12media` schema): enqueue = `INSERT`, status = `SELECT`,
wake-ups = `pg_notify`. There is no HTTP between services. The only HTTP is a thin browser-upload edge for
static front-ends that have no database connection (SonicDesign's export dialog).

```
 SonicWave ─┐                                   ┌─ worker A ─ ffmpeg ─┐
 SonicStream┤  MediaClient (pg)  ──▶ v12media.* ◀┤                     ├─▶ R2 / GCS / local  ──▶ CDN URL in renditions
 GameWorld ─┘   INSERT / SELECT / LISTEN         └─ worker B ─ ffmpeg ─┘
 SonicDesign (static) ── multipart ──▶ ingress ──▶ same tables ──▶ same workers
```

## What it does

| Job kind | Input asset | Output renditions |
|---|---|---|
| `transcode.mp4` | video / PNG-sequence zip (+ optional audio asset) | `mp4` H.264 High/AAC, yuv420p, faststart — plays everywhere |
| `stream.hls` | video | `hls` master.m3u8 + 1080/720/480/360 rungs, 4 s aligned segments |
| `stream.dash` | video | `dash` manifest.mpd, SVT-AV1/Opus when the build has it, else H.264/AAC |
| `audio.master` | audio | `opus` 128k, `aac` 192k, `mp3` V2 — two-pass R128 loudnorm to −14 LUFS / −1 dBTP — plus `peaks` JSON for waveforms |
| `analyze.audio` | audio | row in `v12media.analysis`: 4 band energies, 64-bin spectrum, onsets, beats, BPM at 60 fps |
| `video.thumbnail` | video | `thumbnail` JPEG poster |

Dedup: assets by `(app, sha256)`, jobs by `(asset, kind, params)`. Ask twice, pay once.
Reliability: `FOR UPDATE SKIP LOCKED` claims, 15 s heartbeats, lost workers re-queued, bounded retries, per-job tmp dir, hard kill on timeout.

The **browser modules** are the same package: `@v12/media/analyze` (the exact analysis math the worker runs — pure TS, no DOM) and `@v12/media/visualize` (WebGL2 audio-reactive renderer, 5 styles, Canvas-2D fallback). SonicDesign imports both; SonicWave/SonicVisual/GameWorld can drop them in unchanged.

## Deploy (Render, from this repo)

`render.yaml` deploys the service as `v12-media` (Docker, `plan: starter`, 10 GB disk). Set on the service:

- `DATABASE_URL` — the shared V12 Postgres internal connection string. The schema is created on boot (idempotent).
- Optional `MEDIA_S3_ENDPOINT / MEDIA_S3_BUCKET / MEDIA_S3_KEY / MEDIA_S3_SECRET / MEDIA_PUBLIC_BASE_URL` — R2 (`https://<account>.r2.cloudflarestorage.com`) or GCS interop. Until set, outputs live on the Render disk and are served at `/media/*`.
- Optional `MEDIA_INGRESS_TOKEN` — bearer token browsers must send. `ALLOWED_ORIGIN` — CORS origin list (default `*`).
- `MEDIA_ROLE=all|worker|ingress`, `MAX_JOBS` (concurrent ffmpeg per box), `MEDIA_JOB_KINDS` (restrict a box to e.g. `stream.hls,stream.dash`).

Scale out: add more `MEDIA_ROLE=worker` services on the same `DATABASE_URL`. They coordinate through the table.

## Use from an app (server side)

```bash
npm install ../path/to/v12-media        # or: npm pack in v12-media/ and install the tarball
```

```ts
import { MediaClient } from '@v12/media/client';

const media = new MediaClient({ connectionString: process.env.DATABASE_URL!, app: 'sonicwave' });
await media.ensureSchema();                                   // once at boot

// 1. register the master (already uploaded to the bucket by the app)
const asset = await media.registerAsset({ kind: 'audio', sourceUrl: 's3://v12-media/sonicwave/masters/x.wav', sha256, ownerId: userId, meta: { name: 'Track 1' } });

// 2. enqueue — identical requests return the same job
const [master, analysis] = await media.enqueueBundle(asset);  // audio → audio.master + analyze.audio
// or: await media.enqueue(asset.id, 'stream.hls', { rungs: [{ height: 720, videoKbps: 2800 }] })

// 3. wait (LISTEN/NOTIFY) or just read status later
await media.waitForJob(master.id, { onProgress: j => console.log(j.progress) });
const url = await media.playbackUrl(asset.id);                // hls → mp4 → opus/aac/mp3 → source
const a = await media.analysis(asset.id);                     // same AudioAnalysis the visualizer consumes
```

Per app:

- **SonicWave** (DAW): `audio.master` for bounces, `analyze.audio` for beat grids/tempo detection, `peaks` for track waveforms.
- **SonicStream**: `audio.master` + `stream.hls` for every published track/video; `playbackUrl()` in the player; `video.thumbnail` for cards.
- **SonicVisual**: `@v12/media/visualize` for audio-reactive art; `transcode.mp4` to export it.
- **GameWorld**: `stream.hls`/`stream.dash` for cinematics and trailers, `video.thumbnail` for marketplace cards, `analyze.audio` for rhythm mechanics.
- **SonicDesign** (static): browser ingress `POST /transcode` (unchanged contract) → `transcode.mp4`; visualizer + analysis in-browser from the same package.

## Use from a browser (no DB)

```
POST /assets  (multipart file, kind, ownerId, name)  → { asset }
POST /jobs    { assetId, kind, params }               → { job }
GET  /jobs/:id                                        → { job }         (poll; or let the app's server LISTEN)
GET  /assets/:id                                      → { asset, renditions, analysis }
POST /transcode | /sequence  (SonicDesign contract)   → MP4 bytes, headers X-V12-Asset / X-V12-Job / X-V12-Url
```

## Local run + tests

```bash
cd v12-media && npm install && npm run build
DATABASE_URL=postgres://postgres@127.0.0.1:5432/v12 npm start            # worker + ingress on :10000, local storage ./media-data
DATABASE_URL=postgres://postgres@127.0.0.1:5432/v12test npm test         # real Postgres + ffmpeg end-to-end (5 tests)
docker build -t v12-media . && docker run -e DATABASE_URL=… -p 10000:10000 v12-media
```

## Schema (sql/001_v12media.sql)

`assets` (masters, dedup by app+sha256) → `jobs` (queue; `dedup_key`, `priority`, heartbeat) → `renditions` (every output file/manifest with public URL) and `analysis` (typed-array audio analysis). Trigger `jobs_notify` publishes `v12media_jobs` on insert / status / progress.

## Promote to its own repo (recommended once a second app consumes it)

From the SonicDesign repo root: `git subtree split --prefix v12-media -b v12-media-main` then push that branch to a new `PapiSlimm/V12-Media` repo; apps then `npm install github:PapiSlimm/V12-Media`.
