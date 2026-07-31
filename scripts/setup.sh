#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

require_command node
require_command pnpm
(cd "$ANGULAR_DIR" && pnpm install --frozen-lockfile)

printf 'Dependencies installed. Run ./scripts/dev.sh to start the editor.\n'
