#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

"$SCRIPT_DIR/setup.sh"
"$SCRIPT_DIR/lint.sh"
"$SCRIPT_DIR/test.sh"
CI=true "$SCRIPT_DIR/test-e2e.sh"
"$SCRIPT_DIR/build-prod.sh" --clean

printf 'All local CI checks passed.\n'
