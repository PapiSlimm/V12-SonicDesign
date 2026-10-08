#!/usr/bin/env bash
# Process every video in a directory, 2 jobs in parallel (CPU-bound; raise -P for NVENC).
#   ./scripts/batch-transcode.sh ./masters ./out
set -euo pipefail
find "${1:?src dir}" -maxdepth 1 -type f \( -iname '*.mov' -o -iname '*.mp4' -o -iname '*.mxf' -o -iname '*.webm' \) -print0 \
  | xargs -0 -P "${JOBS:-2}" -I{} bash -c 'scripts/transcode.sh "$1" "$2/$(basename "${1%.*}")"' _ {} "${2:?out dir}"
