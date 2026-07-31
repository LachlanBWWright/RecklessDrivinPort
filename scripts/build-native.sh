#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

require_command cmake
cmake -S "$REPO_ROOT" -B "$REPO_ROOT/build" \
  -DCMAKE_BUILD_TYPE="${BUILD_TYPE:-Release}" \
  -DPORT_SDL2=ON
cmake --build "$REPO_ROOT/build" --parallel "$@"
