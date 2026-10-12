/** Shared types for the V12 media service. Used by apps (client), the worker, and the browser modules. */

export type MediaApp = 'sonicdesign' | 'sonicwave' | 'sonicstream' | 'sonicvisual' | 'gameworld' | (string & {});

export type AssetKind = 'audio' | 'video' | 'image' | 'frames';

export type JobKind =
  | 'transcode.mp4'     // any video (or PNG-sequence zip) → H.264/AAC MP4, universal playback
  | 'stream.hls'        // adaptive HLS ladder (H.264/AAC, 4 s segments, master.m3u8)
  | 'stream.dash'       // adaptive DASH ladder (SVT-AV1/Opus when available, else H.264/AAC)
  | 'audio.master'      // R128 loudness-normalised Opus + AAC + MP3 masters + waveform peaks
  | 'analyze.audio'     // offline band/spectrum/beat analysis → v12media.analysis
  | 'video.thumbnail';  // poster JPEG at a timestamp

export type JobStatus = 'queued' | 'running' | 'done' | 'failed' | 'cancelled';

export interface Asset {
  id: string;
  app: MediaApp;
  owner_id: string | null;
  kind: AssetKind;
  source_url: string;
  source_bytes: number | null;
  mime: string | null;
  sha256: string | null;
  duration_s: number | null;
  width: number | null;
  height: number | null;
  sample_rate: number | null;
  channels: number | null;
  meta: Record<string, unknown>;
  created_at: string;
}

export interface Job<P = JobParams> {
  id: string;
  app: MediaApp;
  asset_id: string | null;
  kind: JobKind;
  params: P;
  priority: number;
  status: JobStatus;
  attempts: number;
  max_attempts: number;
  dedup_key: string | null;
  claimed_by: string | null;
  claimed_at: string | null;
  heartbeat_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  progress: number;
  error: string | null;
  result: JobResult | null;
  created_at: string;
}

export interface Rendition {
  id: string;
  asset_id: string;
  job_id: string | null;
  kind: RenditionKind;
  url: string;
  storage_key: string | null;
  mime: string | null;
  bytes: number | null;
  width: number | null;
  height: number | null;
  bitrate_kbps: number | null;
  codec: string | null;
  meta: Record<string, unknown>;
  created_at: string;
}

export type RenditionKind = 'mp4' | 'hls' | 'dash' | 'opus' | 'aac' | 'mp3' | 'peaks' | 'thumbnail';

/* ---------------- job params (what apps enqueue) ---------------- */

export interface TranscodeMp4Params {
  fps?: number;            // 1..120, default: source fps or 30
  crf?: number;            // 10..35, default 18
  preset?: 'ultrafast' | 'veryfast' | 'fast' | 'medium' | 'slow';
  /** Mux this audio asset (or URL) under the video. */
  audioAssetId?: string;
  audioUrl?: string;
  /** Output file stem. */
  name?: string;
}

export interface LadderRung { height: number; videoKbps: number; audioKbps?: number }

export interface StreamParams {
  /** Default: 1080p/5000k, 720p/2800k, 480p/1200k (rungs taller than the source are dropped). */
  rungs?: LadderRung[];
  segmentSeconds?: number; // default 4
  fps?: number;            // default: source fps
}

export interface AudioMasterParams {
  targetLufs?: number;     // default -14 (streaming standard)
  truePeakDb?: number;     // default -1
  formats?: Array<'opus' | 'aac' | 'mp3'>; // default all three
  peaks?: number;          // waveform peak points, default 1024, 0 disables
}

export interface AnalyzeAudioParams {
  fps?: number;            // analysis frame rate, default 60
}

export interface ThumbnailParams {
  atSeconds?: number;      // default 10% into the clip
  width?: number;          // default 640
}

export type JobParams = TranscodeMp4Params | StreamParams | AudioMasterParams | AnalyzeAudioParams | ThumbnailParams;

export interface JobResult {
  renditionIds?: string[];
  analysis?: { fps: number; frameCount: number; bpm: number; beats: number };
  [k: string]: unknown;
}
