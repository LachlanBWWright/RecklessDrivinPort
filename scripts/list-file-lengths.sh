#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${1:-.}"

find "$ROOT_DIR" \
  -type f \
  \( -name '*.ts' -o -name '*.tsx' -o -name '*.js' -o -name '*.mjs' -o -name '*.c' -o -name '*.h' -o -name '*.html' -o -name '*.scss' \) \
  ! -path '*/node_modules/*' \
  ! -path '*/dist/*' \
  ! -path '*/build/*' \
  ! -path '*/build_wasm/*' \
  ! -path '*/.angular/*' \
  ! -path '*/coverage/*' \
  -print0 \
  | xargs -0 wc -l \
  | sort -nr
