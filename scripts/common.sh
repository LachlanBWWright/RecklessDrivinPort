#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ANGULAR_DIR="$REPO_ROOT/angular-site"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    printf 'Required command not found: %s\n' "$1" >&2
    exit 1
  fi
}

ensure_angular_dependencies() {
  require_command pnpm
  if [[ ! -d "$ANGULAR_DIR/node_modules" ]]; then
    printf 'Installing Angular dependencies...\n'
    (cd "$ANGULAR_DIR" && pnpm install --frozen-lockfile)
  fi
}
