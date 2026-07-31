#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

ensure_angular_dependencies
(cd "$ANGULAR_DIR" && pnpm test --watch=false "$@")
