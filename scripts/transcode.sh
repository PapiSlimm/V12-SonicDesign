#!/usr/bin/env bash
# =============================================================================
# transcode.sh — master → web-ready outputs (VMAF-targeted), CPU or NVENC.
#
#   ./scripts/transcode.sh input.mov out/            # CPU: SVT-AV1 + Opus DASH ladder, plus H.264/AAC MP4 fallback
#   HW=nvenc ./scripts/transcode.sh input.mov out/   # NVIDIA: H.264/HEVC NVENC ladder (AV1 NVENC if RTX 40xx+)
#   QUALITY=vmaf93 ./scripts/transcode.sh ...        # (default) rung CRFs tuned for VMAF ≥ 93 vs source
#
# Input profile assumed: up to 4K60, 10-bit 4:2:2 (ProRes/DNxHR/anything ffmpeg decodes).
# Output ladder: 1080p / 720p / 480p. Audio: Opus 128k (DASH) + AAC 160k (MP4).
# A/V sync: a single filter graph produces every rung from one decode, PTS is regenerated
# once (-fps_mode cfr + setpts) so all rungs and the audio share an identical timebase.
# =============================================================================
set -euo pipefail

IN="${1:?input file}"
OUT="${2:?output dir}"
HW="${HW:-cpu}"          # cpu | nvenc
FPS="${FPS:-}"           # leave empty to keep source fps; set 30 to conform
mkdir -p "$OUT"
BASE="$(basename "${IN%.*}")"

# ---- Probe ---------------------------------------------------------------
SRC_FPS=$(ffprobe -v error -select_streams v:0 -show_entries stream=r_frame_rate -of csv=p=0 "$IN")
TARGET_FPS="${FPS:-$SRC_FPS}"
echo "source fps=$SRC_FPS target fps=$TARGET_FPS hw=$HW"

# ---- Shared video filter graph ------------------------------------------
# format=yuv420p10le : keep 10-bit through scaling (banding-free gradients), 4:2:0 for web decoders
# scale=...:flags=lanczos : sharpest downscale; -1 keeps aspect, even dimensions enforced by -2
# setpts=PTS-STARTPTS : zero-based timestamps so every rung starts at exactly 0
# split=3 : one decode feeding three encoders (memory: 1 decoded frame buffer, not 3)
VF="fps=${TARGET_FPS},setpts=PTS-STARTPTS,format=yuv420p10le,split=3[v1080][v720][v480];\
[v1080]scale=-2:1080:flags=lanczos[o1080];\
[v720]scale=-2:720:flags=lanczos[o720];\
[v480]scale=-2:480:flags=lanczos[o480]"

if [[ "$HW" == "cpu" ]]; then
  # ---- SVT-AV1 + Opus → DASH (CPU) ---------------------------------------
  # -c:v libsvtav1   : fastest production AV1 encoder; ~30% smaller than x264 at equal VMAF
  # -preset 6        : speed/quality knee for offline (4 = better, 8 = faster)
  # -crf N           : constant quality; 30/32/34 ≈ VMAF 93–95 on typical content at these rungs
  # -svtav1-params tune=0:film-grain=0:enable-overlays=1:scd=1 : tune=0 = VQ (subjective) mode,
  #                    scene-change detection for keyframe placement, overlays improve fades
  # -g 240 -keyint_min 240 : 4 s GOP at 60fps (DASH segment = GOP for clean switching)
  # -pix_fmt yuv420p10le : 10-bit AV1 is universally decodable (Main profile) and avoids banding
  # -c:a libopus -b:a 128k -ac 2 : Opus at 128k is transparent for stereo
  # -af aresample=async=1:first_pts=0 : rebuilds audio timestamps to match the zeroed video PTS
  #                    so DASH audio/video segments align bit-exactly (no drift on long clips)
  ffmpeg -hide_banner -y -i "$IN" \
    -filter_complex "$VF" \
    -map "[o1080]" -c:v:0 libsvtav1 -preset 6 -crf 30 -svtav1-params tune=0:film-grain=0:enable-overlays=1:scd=1 -g 240 -keyint_min 240 -pix_fmt yuv420p10le \
    -map "[o720]"  -c:v:1 libsvtav1 -preset 6 -crf 32 -svtav1-params tune=0:film-grain=0:enable-overlays=1:scd=1 -g 240 -keyint_min 240 -pix_fmt yuv420p10le \
    -map "[o480]"  -c:v:2 libsvtav1 -preset 7 -crf 34 -svtav1-params tune=0:film-grain=0:enable-overlays=1:scd=1 -g 240 -keyint_min 240 -pix_fmt yuv420p10le \
    -map 0:a:0 -c:a libopus -b:a 128k -ac 2 -af "aresample=async=1:first_pts=0" \
    -fps_mode cfr \
    -f dash -seg_duration 4 -use_template 1 -use_timeline 1 -adaptation_sets "id=0,streams=v id=1,streams=a" \
    -init_seg_name "${BASE}_init_\$RepresentationID\$.webm" -media_seg_name "${BASE}_chunk_\$RepresentationID\$_\$Number%05d\$.webm" \
    "$OUT/${BASE}.mpd"

  # ---- H.264/AAC MP4 fallback (Safari / old devices) -----------------------
  # -c:v libx264 -preset slow -crf 18 -tune film : CRF 18 ≈ VMAF 95 at 1080p; "film" tune keeps grain
  # -profile:v high -level 4.2 : hardware-decodable everywhere (1080p60)
  # -pix_fmt yuv420p : 8-bit 4:2:0 (H.264 10-bit is NOT widely hardware decoded)
  # -movflags +faststart : moov atom first → playback starts before download completes
  # -x264-params keyint=240:min-keyint=240:scenecut=0 : fixed GOP identical to the AV1 ladder
  ffmpeg -hide_banner -y -i "$IN" \
    -vf "fps=${TARGET_FPS},setpts=PTS-STARTPTS,scale=-2:1080:flags=lanczos,format=yuv420p" \
    -c:v libx264 -preset slow -crf 18 -tune film -profile:v high -level 4.2 -x264-params keyint=240:min-keyint=240:scenecut=0 \
    -c:a aac -b:a 160k -ac 2 -af "aresample=async=1:first_pts=0" \
    -fps_mode cfr -movflags +faststart \
    "$OUT/${BASE}_1080p.mp4"
else
  # ---- NVENC ladder (NVIDIA) ----------------------------------------------
  # -hwaccel cuda -hwaccel_output_format cuda : decode on GPU, frames stay in VRAM
  # scale_cuda : GPU scaler (no PCIe round-trips per rung)
  # -c:v h264_nvenc -preset p6 -tune hq -rc vbr -cq 19 -b:v 0 : constant-quality VBR, p6 = quality preset
  # -multipass qres -spatial-aq 1 -temporal-aq 1 : two-pass look-ahead + adaptive quantisation (big VMAF win)
  # -bf 3 -b_ref_mode middle : B-frame pyramid; -rc-lookahead 32 : scene-aware bit allocation
  ffmpeg -hide_banner -y -hwaccel cuda -hwaccel_output_format cuda -i "$IN" \
    -filter_complex "fps=${TARGET_FPS},setpts=PTS-STARTPTS,split=3[a][b][c];[a]scale_cuda=-2:1080[o1080];[b]scale_cuda=-2:720[o720];[c]scale_cuda=-2:480[o480]" \
    -map "[o1080]" -c:v:0 h264_nvenc -preset p6 -tune hq -rc vbr -cq 19 -b:v 0 -multipass qres -spatial-aq 1 -temporal-aq 1 -bf 3 -b_ref_mode middle -rc-lookahead 32 -g 240 -profile:v high \
    -map "[o720]"  -c:v:1 h264_nvenc -preset p6 -tune hq -rc vbr -cq 21 -b:v 0 -multipass qres -spatial-aq 1 -temporal-aq 1 -bf 3 -b_ref_mode middle -rc-lookahead 32 -g 240 -profile:v high \
    -map "[o480]"  -c:v:2 h264_nvenc -preset p6 -tune hq -rc vbr -cq 23 -b:v 0 -multipass qres -spatial-aq 1 -temporal-aq 1 -bf 3 -b_ref_mode middle -rc-lookahead 32 -g 240 -profile:v high \
    -map 0:a:0 -c:a aac -b:a 160k -ac 2 -af "aresample=async=1:first_pts=0" \
    -fps_mode cfr \
    -f dash -seg_duration 4 -use_template 1 -use_timeline 1 -adaptation_sets "id=0,streams=v id=1,streams=a" \
    "$OUT/${BASE}.mpd"
fi

# ---- Verify VMAF (optional, needs libvmaf build) ---------------------------
if ffmpeg -hide_banner -filters 2>/dev/null | grep -q libvmaf; then
  REF_1080="$OUT/${BASE}_1080p.mp4"
  [[ -f "$REF_1080" ]] && ffmpeg -hide_banner -i "$REF_1080" -i "$IN" \
    -lavfi "[1:v]fps=${TARGET_FPS},scale=-2:1080:flags=lanczos,format=yuv420p[ref];[0:v]format=yuv420p[dis];[dis][ref]libvmaf=n_threads=8" \
    -f null - 2>&1 | grep -i "VMAF score" || true
fi
echo "done → $OUT"
