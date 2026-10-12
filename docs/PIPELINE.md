# V12SonicDesign Studio — Multimedia Pipeline (OSS, production)

Objective: browser-authored motion graphics with audio-reactive layers, exported as deterministic frames and transcoded server-side into universally playable video.
Targets: realtime 60 fps preview on mid-tier mobile; batch export at any fps/resolution; outputs H.264/AAC MP4 (universal) + SVT-AV1/Opus DASH (bandwidth) + lossless PNG sequences (NLE hand-off). Resource budget: client = one browser tab; server = one 0.5-CPU Docker container per 2 concurrent jobs.

## 1. Component architecture

| Requirement | OSS component | Why this one (memory / throughput) |
|---|---|---|
| Layer compositing, effects, text, vectors | Canvas 2D + CSS compositing (`src/core/rendering/RenderEngine.ts`) | Single pass, GPU-accelerated by the browser, zero dependencies. DOM mirrors the canvas renderer so preview = export. |
| Audio-reactive visuals | WebGL2 fragment shader (`AudioReactiveRenderer.ts`), no Three.js | Full-screen triangle, 1 draw call, 64×1 R8 spectrum texture updated with `texSubImage2D` — ~0.2 ms/frame on Mali/Adreno. Three.js would add 600 KB and a scene graph for one quad. |
| Audio analysis | Web Audio `decodeAudioData` + own radix-2 FFT (`AudioAnalysis.ts`) | Offline analysis once per track → `Float32Array` per frame (60 fps × 4 bands + 64-bin spectrum ≈ 270 bytes/frame, 1 MB for a 4-min song). Deterministic across scrubbing and export; `AnalyserNode` is realtime-only and non-reproducible. |
| Pixel processing (chroma key, curves) | `ImageData` LUT pass (`layerProcessor.ts`) | Runs once per bitmap change, not per frame; cached per layer. |
| Frame capture | `canvas.toBlob` (PNG/JPG) and `MediaRecorder` (WebM VP9) | Both are native — no WASM encoder shipped to the client. |
| Packaging | In-house STORE-only ZIP writer (`utils/zip.ts`) | PNGs are already compressed; avoids a 100 KB zip library and a second compression pass. |
| Transcode / mux / stream | FFmpeg (libx264, libsvtav1, libopus, aac, lame) inside the shared **V12 media service** (`v12-media/`) | The only OSS tool that does demux→filter→encode→HLS/DASH packaging in one process with one decode. GStreamer would need a pipeline per output; LibVLC is a playback library, not an encoder. |
| Job bus | Postgres table `v12media.jobs` (`FOR UPDATE SKIP LOCKED` + `LISTEN/NOTIFY`) in the shared V12 database | Every V12 app already has this database; a queue in it means no Redis/BullMQ per app and no inter-service HTTP. Dedup by asset sha256 and by (asset, kind, params). |
| Hosting | Render static site + Render Docker web service `v12-media` (`render.yaml`) | No inter-service HTTP; the static site uses the service's browser ingress (`POST /transcode`) because a static site has no DB connection. Server-side apps use `MediaClient` on the DB directly. |

## 2. Data flow / IPC

```
Audio file (blob:) ─decodeAudioData─▶ AudioAnalysis (typed arrays, in-memory, memoised per URL)
                                            │ bandAt(t) / spectrumAt(t)  (O(1), no alloc)
Timeline time t ───────────────────────────▶ AudioReactiveRenderer.render()  (uniforms + 64-byte texSubImage2D)
                                            │ drawImage(glCanvas)
Layer tree ──computeLayersAtTime(t)──▶ renderComposite(ctx)  ──▶ 1920×1080 canvas ──▶ toBlob / MediaRecorder
                                                                                      │
                                              browser ── multipart POST (video.webm [+audio]) ──▶ v12-media ingress
                                                                                                   │ asset row (sha256 dedup) + job row (INSERT) → pg_notify
                                              SonicWave / SonicStream / GameWorld ── MediaClient ──▶ v12media.jobs ◀── worker claims (SKIP LOCKED), spawns ffmpeg, uploads to R2/GCS
                                                                                                   │ renditions row (public URL) + job done → pg_notify
                                              browser ◀── streamed MP4 (Content-Length known) ◀── ingress waits on NOTIFY, streams the rendition
```

Inside the browser everything is in-process: typed arrays and canvases are shared by reference (no copies, no postMessage). The only cross-process hop for the static app is HTTP multipart to the ingress; server-side apps have none (table + NOTIFY). ffmpeg reads files from a per-job tmp dir (no stdin pipes — pipes break seeking for mp4 `faststart` and complicate timeouts). Worker → ffmpeg is a child process with stderr tailed for diagnostics; concurrency is a counter (`MAX_JOBS`), overflow returns 429 so the client can back off instead of the container swapping.

## 3. Failure & edge-case handling

| Case | Strategy |
|---|---|
| Dropped frames in preview | Timeline clock is wall-clock based (`useAnimationEngine`): a slow frame advances time by real elapsed time, so motion never slows down, it skips. Long frames (tab switch) are clamped to 250 ms to avoid a jump. |
| Dropped frames in export | None possible: export is frame-stepped (`t = start + n/fps`), never clock-driven. PNG/ZIP path is bit-exact; WebM path waits one frame interval per frame and calls `track.requestFrame()`. |
| A/V sync drift | Audio is never streamed during export — it is muxed by ffmpeg with `aresample=async=1:first_pts=0` and `-fps_mode cfr`, so audio PTS is rebuilt against a constant-rate video timebase; `-shortest` trims tails. Reactive visuals are sampled from the same offline analysis clock, so they cannot drift from the audio either. |
| Scrubbing backwards / jumps | Renderer smoothing state resets when `t` goes backwards or jumps > 0.5 s, so a frame depends only on `t` (deterministic). Export calls `resetSmoothing()` per frame. |
| Dynamic bitrate | Server ladder (`scripts/transcode.sh`) emits a 3-rung DASH manifest with 4 s segments aligned to a fixed GOP (`-g 240 -keyint_min 240`, `scenecut=0`), so players switch rungs at every segment without decode glitches. CRF per rung is tuned for VMAF ≥ 93; verify with the libvmaf block in the script. |
| WebGL2 unavailable | `render2DFallback` draws bars with Canvas 2D; export still succeeds. |
| Microphone input | Preview-only (`useMicrophone`); exports fall back to the selected audio layer because mic data is not reproducible. |
| Worker overload / crash | Jobs queue in the table (priority order) instead of being refused; ffmpeg hard-killed after its timeout; a worker that stops heartbeating for 2 min has its jobs re-queued (bounded by `max_attempts`); tmp dir removed in `finally`; Docker `HEALTHCHECK` + Render health path restart the container. Client shows the error and keeps the WebM it already captured. |
| Memory | Decoded audio is dropped after analysis (only the ~1 MB analysis is retained); history snapshots share `ImageBitmap`s; the GL spectrum texture is 64 bytes. |

## 4. Operational core (copy-paste)

Client → MP4 with audio (what the Export dialog does):

```bash
curl -F video=@capture.webm -F audio=@track.mp3 -F fps=30 -F crf=18 -F name=promo \
     https://v12-media.onrender.com/transcode -o promo.mp4
```

Any V12 server app → HLS ladder + poster, through the database only (see `v12-media/README.md`):

```ts
const media = new MediaClient({ connectionString: DATABASE_URL, app: 'sonicstream' });
const asset = await media.registerAsset({ kind: 'video', sourceUrl: 's3://v12-media/sonicstream/masters/clip.mov', sha256 });
await Promise.all((await media.enqueueBundle(asset)).map(j => media.waitForJob(j.id)));
player.src = await media.playbackUrl(asset.id);   // master.m3u8
```

Master → DASH ladder + MP4 fallback, CPU (SVT-AV1/Opus + x264/AAC):

```bash
./scripts/transcode.sh masters/promo_4k.mov out/promo        # see flag-by-flag comments in the script
HW=nvenc ./scripts/transcode.sh masters/promo_4k.mov out/promo
JOBS=4 ./scripts/batch-transcode.sh masters out              # whole directory, 4 parallel jobs
```

Run the media service locally:

```bash
cd v12-media && npm install && npm run build && DATABASE_URL=postgres://… npm start     # or: docker build -t v12-media . && docker run -e DATABASE_URL=… -p 10000:10000 v12-media
```
