> **Superseded (Oct 2026):** the render worker has been generalised into the shared V12 media service at `v12-media/` (same `/transcode` and `/sequence` contract, plus HLS/DASH ladders, audio mastering, analysis and a DB-backed job queue shared by all V12 apps). `render.yaml` now deploys `v12-media`. This folder is kept for reference only.

# V12 render worker

FFmpeg transcoder behind two endpoints (`/transcode` WebM→MP4, `/sequence` PNG-zip→MP4). Deployed from `render.yaml` as a Docker web service; the studio calls it when `VITE_RENDER_WORKER_URL` is set.

Local: `docker build -t v12-render-worker . && docker run -p 10000:10000 v12-render-worker` then `curl -F video=@clip.webm -F fps=30 http://localhost:10000/transcode -o out.mp4`.
