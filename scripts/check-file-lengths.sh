#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${1:-.}"
MAX_LINES="${2:-500}"

RESULTS="$(/usr/bin/env bash "$(dirname "$0")/list-file-lengths.sh" "$ROOT_DIR")"
OVERSIZED="$(printf '%s\n' "$RESULTS" | awk -v max="$MAX_LINES" 'NR > 1 && $1 + 0 > max { print }')"

if [[ -n "$OVERSIZED" ]]; then
  printf 'Files above %s lines:\n%s\n' "$MAX_LINES" "$OVERSIZED"
  exit 1
fi

printf 'No files above %s lines in %s\n' "$MAX_LINES" "$ROOT_DIR"
