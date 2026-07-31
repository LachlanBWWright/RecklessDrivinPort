#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ ! -f "$SCRIPT_DIR/../gh-pages-local/index.html" ]]; then
  printf 'No production build found; building it first.\n'
  "$SCRIPT_DIR/build-wasm-local.sh"
fi

exec "$SCRIPT_DIR/build-wasm-local.sh" --skip-wasm --skip-angular --no-cleanup --serve "$@"
