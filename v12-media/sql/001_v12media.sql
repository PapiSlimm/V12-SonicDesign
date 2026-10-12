-- @v12/media — shared media service schema. Idempotent; safe to re-run on every boot.
-- Lives in its own Postgres schema (`v12media`) inside the shared V12 database so every app
-- (SonicDesign, SonicWave, SonicStream, SonicVisual, GameWorld) talks to the media service through
-- the database only — no inter-service HTTP.

CREATE SCHEMA IF NOT EXISTS v12media;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- A master file registered by an app. Dedup key: (app, sha256).
CREATE TABLE IF NOT EXISTS v12media.assets (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app          text NOT NULL,                       -- 'sonicdesign' | 'sonicwave' | 'sonicstream' | 'sonicvisual' | 'gameworld' | ...
  owner_id     text,                                -- the app's own user id (opaque to the service)
  kind         text NOT NULL CHECK (kind IN ('audio','video','image','frames')),
  source_url   text NOT NULL,                       -- s3://bucket/key | https://... | file:///path (worker-fetchable)
  source_bytes bigint,
  mime         text,
  sha256       text,
  duration_s   real,
  width        int,
  height       int,
  sample_rate  int,
  channels     int,
  meta         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS assets_app_sha ON v12media.assets (app, sha256) WHERE sha256 IS NOT NULL;
CREATE INDEX IF NOT EXISTS assets_owner ON v12media.assets (app, owner_id);

-- Work queue. Apps INSERT; workers claim with FOR UPDATE SKIP LOCKED; everyone reads status.
CREATE TABLE IF NOT EXISTS v12media.jobs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app          text NOT NULL,
  asset_id     uuid REFERENCES v12media.assets(id) ON DELETE CASCADE,
  kind         text NOT NULL,                       -- transcode.mp4 | stream.hls | stream.dash | audio.master | analyze.audio | video.thumbnail
  params       jsonb NOT NULL DEFAULT '{}'::jsonb,
  priority     int NOT NULL DEFAULT 100,            -- lower = sooner
  status       text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','done','failed','cancelled')),
  attempts     int NOT NULL DEFAULT 0,
  max_attempts int NOT NULL DEFAULT 3,
  dedup_key    text,                                -- asset:kind:hash(params); identical requests share one job
  claimed_by   text,
  claimed_at   timestamptz,
  heartbeat_at timestamptz,
  started_at   timestamptz,
  finished_at  timestamptz,
  progress     real NOT NULL DEFAULT 0,
  error        text,
  result       jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS jobs_dedup ON v12media.jobs (dedup_key) WHERE dedup_key IS NOT NULL AND status IN ('queued','running','done');
CREATE INDEX IF NOT EXISTS jobs_claim ON v12media.jobs (priority, created_at) WHERE status = 'queued';
CREATE INDEX IF NOT EXISTS jobs_running ON v12media.jobs (heartbeat_at) WHERE status = 'running';
CREATE INDEX IF NOT EXISTS jobs_asset ON v12media.jobs (asset_id);

-- Encoded outputs (one row per file / manifest).
CREATE TABLE IF NOT EXISTS v12media.renditions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id     uuid NOT NULL REFERENCES v12media.assets(id) ON DELETE CASCADE,
  job_id       uuid REFERENCES v12media.jobs(id) ON DELETE SET NULL,
  kind         text NOT NULL,                       -- mp4 | hls | dash | opus | aac | mp3 | peaks | thumbnail
  url          text NOT NULL,                       -- public URL (CDN / R2 / GCS / ingress /media/…)
  storage_key  text,                                -- object key or local path (for cleanup)
  mime         text,
  bytes        bigint,
  width        int,
  height       int,
  bitrate_kbps int,
  codec        text,
  meta         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS renditions_asset ON v12media.renditions (asset_id, kind);

-- Offline audio analysis (same numbers the browser visualizer computes — one algorithm, one table).
CREATE TABLE IF NOT EXISTS v12media.analysis (
  asset_id     uuid PRIMARY KEY REFERENCES v12media.assets(id) ON DELETE CASCADE,
  version      int NOT NULL,                        -- analysis algorithm version
  fps          int NOT NULL,
  frame_count  int NOT NULL,
  duration_s   real NOT NULL,
  bpm          real NOT NULL DEFAULT 0,
  beats        real[] NOT NULL DEFAULT '{}',
  bands        bytea NOT NULL,                      -- Float32 LE, frame_count*4
  rms          bytea NOT NULL,                      -- Float32 LE, frame_count
  onset        bytea NOT NULL,                      -- Float32 LE, frame_count
  spectrum     bytea NOT NULL,                      -- Float32 LE, frame_count*64
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Wake sleeping workers / waiting clients without polling.
CREATE OR REPLACE FUNCTION v12media.notify_job() RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify('v12media_jobs', json_build_object('id', NEW.id, 'status', NEW.status, 'app', NEW.app, 'kind', NEW.kind)::text);
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS jobs_notify ON v12media.jobs;
CREATE TRIGGER jobs_notify AFTER INSERT OR UPDATE OF status, progress ON v12media.jobs
  FOR EACH ROW EXECUTE FUNCTION v12media.notify_job();
