#!/usr/bin/env bash
# =============================================================================
#  build-wasm-local.sh
#
#  Builds the Reckless Drivin' WASM port and Angular frontend, assembles a
#  deployable directory, and optionally serves it locally for testing.
#
#  Usage:
#    ./scripts/build-wasm-local.sh [OPTIONS]
#
#  Options:
#    --serve         Start a local HTTP server after building (default port 8080)
#    --port PORT     Use PORT for the local server (default: 8080)
#    --skip-wasm     Skip Emscripten WASM build (use existing build_wasm/ outputs)
#    --skip-angular  Skip Angular build (use existing dist/ outputs)
#    --no-cleanup    Don't remove previous gh-pages-local/ dir first
#    --help          Show this help
#
#  Requirements:
#    - Emscripten SDK (emsdk) – either activated in $PATH or discovered via
#      $EMSDK env var, ~/emsdk, or ./emsdk subdirectory of the repo root.
#    - Node.js 18+  (for the Angular build)
#    - cmake 3.13+
#    - A POSIX shell (bash, zsh, etc.)
#
#  The assembled output is written to:
#    <repo_root>/gh-pages-local/
#
#  This mirrors what the CI workflow places in gh-pages/ for GitHub Pages.
# =============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Colors
# ---------------------------------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

info()    { echo -e "${CYAN}[build]${NC} $*"; }
success() { echo -e "${GREEN}[ok]${NC}    $*"; }
warn()    { echo -e "${YELLOW}[warn]${NC}  $*"; }
error()   { echo -e "${RED}[error]${NC} $*" >&2; }
step()    { echo -e "\n${BOLD}=== $* ===${NC}"; }

# ---------------------------------------------------------------------------
# Parse arguments
# ---------------------------------------------------------------------------
SERVE=false
PORT=8080
SKIP_WASM=false
SKIP_ANGULAR=false
NO_CLEANUP=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --serve)       SERVE=true ;;
    --port)        PORT="${2:?--port requires an argument}"; shift ;;
    --skip-wasm)   SKIP_WASM=true ;;
    --skip-angular)SKIP_ANGULAR=true ;;
    --no-cleanup)  NO_CLEANUP=true ;;
    --help|-h)
      sed -n '/^#  Usage:/,/^# ====/p' "$0" | sed 's/^# \?//'
      exit 0
      ;;
    *)
      error "Unknown option: $1"
      echo "Run $0 --help for usage."
      exit 1
      ;;
  esac
  shift
done

# ---------------------------------------------------------------------------
# Locate the repository root (this script lives in <root>/scripts/)
# ---------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ANGULAR_DIR="$REPO_ROOT/port/angular-site"
OUTPUT_DIR="$REPO_ROOT/gh-pages-local"
BUILD_WASM_DIR="$REPO_ROOT/build_wasm"

info "Repository root : $REPO_ROOT"
info "Angular site    : $ANGULAR_DIR"
info "WASM build dir  : $BUILD_WASM_DIR"
info "Output dir      : $OUTPUT_DIR"

cd "$REPO_ROOT"

# ---------------------------------------------------------------------------
# Verify tools
# ---------------------------------------------------------------------------
step "Checking required tools"

check_tool() {
  if command -v "$1" &>/dev/null; then
    success "$1 found: $(command -v "$1")"
  else
    error "$1 not found in PATH"
    return 1
  fi
}

check_tool cmake
check_tool node
check_tool npm

# ---------------------------------------------------------------------------
# Locate and activate Emscripten
# ---------------------------------------------------------------------------
find_and_activate_emsdk() {
  # Already activated?
  if command -v emcc &>/dev/null; then
    success "Emscripten already active: $(emcc --version 2>&1 | head -1)"
    return 0
  fi

  # Search common locations
  local candidate_dirs=(
    "${EMSDK:-}"
    "$HOME/emsdk"
    "$REPO_ROOT/emsdk"
    "/opt/emsdk"
    "/usr/local/emsdk"
  )

  for dir in "${candidate_dirs[@]}"; do
    if [[ -n "$dir" && -f "$dir/emsdk_env.sh" ]]; then
      info "Activating Emscripten from $dir"
      # shellcheck source=/dev/null
      source "$dir/emsdk_env.sh"
      if command -v emcc &>/dev/null; then
        success "Emscripten activated: $(emcc --version 2>&1 | head -1)"
        return 0
      fi
    fi
  done

  if $SKIP_WASM; then
    warn "Emscripten not found – WASM build will be skipped (--skip-wasm active)"
    return 0
  fi

  error "Emscripten (emsdk) not found.  Install it from https://emscripten.org/docs/getting_started/downloads.html"
  error "Then either:"
  error "  • source ~/emsdk/emsdk_env.sh   (to activate in your shell)"
  error "  • set EMSDK=<path_to_emsdk>     (to let this script find it)"
  error "  • run with --skip-wasm           (to skip the WASM build)"
  exit 1
}

if ! $SKIP_WASM; then
  find_and_activate_emsdk
fi

# ---------------------------------------------------------------------------
# Clean output directory
# ---------------------------------------------------------------------------
if ! $NO_CLEANUP; then
  step "Cleaning output directory"
  rm -rf "$OUTPUT_DIR"
fi
mkdir -p "$OUTPUT_DIR"

# ---------------------------------------------------------------------------
# Build Angular site
# ---------------------------------------------------------------------------
if ! $SKIP_ANGULAR; then
  step "Building Angular site"
  cd "$ANGULAR_DIR"

  if [[ ! -d node_modules ]]; then
    info "Installing npm dependencies…"
    npm ci
  fi

  info "Running ng build…"
  # Use base-href / for local serving (no /RecklessDrivinPort/ subpath)
  npx ng build --configuration=production --base-href=/

  ANGULAR_OUT="$ANGULAR_DIR/dist/reckless-drivin/browser"
  if [[ ! -d "$ANGULAR_OUT" ]]; then
    error "Angular build output not found at $ANGULAR_OUT"
    exit 1
  fi
  success "Angular build complete"
  cd "$REPO_ROOT"
else
  warn "--skip-angular: reusing existing Angular dist"
  ANGULAR_OUT="$ANGULAR_DIR/dist/reckless-drivin/browser"
  if [[ ! -d "$ANGULAR_OUT" ]]; then
    error "Angular output dir not found (did you run a build first?): $ANGULAR_OUT"
    exit 1
  fi
fi

# ---------------------------------------------------------------------------
# Build WASM
# ---------------------------------------------------------------------------
if ! $SKIP_WASM; then
  step "Building WASM with Emscripten"
  cd "$REPO_ROOT"

  info "Configuring CMake for WASM…"
  emcmake cmake -B "$BUILD_WASM_DIR" -DCMAKE_BUILD_TYPE=Release -DPORT_SDL2=ON

  info "Building…"
  cmake --build "$BUILD_WASM_DIR" --parallel

  # Verify expected outputs
  for f in reckless_drivin.js reckless_drivin.wasm; do
    if [[ -f "$BUILD_WASM_DIR/$f" ]]; then
      success "Generated: $f ($(du -sh "$BUILD_WASM_DIR/$f" | cut -f1))"
    else
      error "Expected WASM output not found: $BUILD_WASM_DIR/$f"
      exit 1
    fi
  done

  # .data file may or may not be generated depending on --embed-file flags
  if [[ -f "$BUILD_WASM_DIR/reckless_drivin.data" ]]; then
    success "Generated: reckless_drivin.data ($(du -sh "$BUILD_WASM_DIR/reckless_drivin.data" | cut -f1))"
  fi
else
  warn "--skip-wasm: reusing existing WASM outputs in $BUILD_WASM_DIR"
  if [[ ! -f "$BUILD_WASM_DIR/reckless_drivin.js" ]]; then
    error "WASM output not found at $BUILD_WASM_DIR/reckless_drivin.js"
    exit 1
  fi
fi

# ---------------------------------------------------------------------------
# Assemble output directory
# ---------------------------------------------------------------------------
step "Assembling deployable output → $OUTPUT_DIR"

# Copy Angular static files first
info "Copying Angular build…"
cp -r "$ANGULAR_OUT"/. "$OUTPUT_DIR/"

# Copy WASM game files
for f in reckless_drivin.js reckless_drivin.wasm; do
  if [[ -f "$BUILD_WASM_DIR/$f" ]]; then
    cp "$BUILD_WASM_DIR/$f" "$OUTPUT_DIR/"
    info "Copied $f"
  fi
done
# .data is optional
if [[ -f "$BUILD_WASM_DIR/reckless_drivin.data" ]]; then
  cp "$BUILD_WASM_DIR/reckless_drivin.data" "$OUTPUT_DIR/"
  info "Copied reckless_drivin.data"
fi

# Copy resources.dat if present (the editor needs this)
RESOURCES_DAT="$REPO_ROOT/port/resources/resources.dat"
if [[ -f "$RESOURCES_DAT" ]]; then
  cp "$RESOURCES_DAT" "$OUTPUT_DIR/resources.dat"
  success "Copied resources.dat ($(du -sh "$RESOURCES_DAT" | cut -f1))"
else
  # Try build output
  RESOURCES_DAT_BUILD="$BUILD_WASM_DIR/resources.dat"
  if [[ -f "$RESOURCES_DAT_BUILD" ]]; then
    cp "$RESOURCES_DAT_BUILD" "$OUTPUT_DIR/resources.dat"
    success "Copied resources.dat from build output ($(du -sh "$RESOURCES_DAT_BUILD" | cut -f1))"
  else
    warn "resources.dat not found – the level editor will need manual upload"
    warn "Expected locations:"
    warn "  $RESOURCES_DAT"
    warn "  $RESOURCES_DAT_BUILD"
  fi
fi

success "Output assembled:"
ls -lh "$OUTPUT_DIR/" | head -20

# ---------------------------------------------------------------------------
# Optional: serve locally
# ---------------------------------------------------------------------------
if $SERVE; then
  step "Starting local HTTP server"
  info "Serving $OUTPUT_DIR at http://localhost:$PORT"
  info "Press Ctrl+C to stop."
  echo ""

  # Try a variety of available servers
  if command -v python3 &>/dev/null; then
    # Use a custom handler to set the correct application/wasm MIME type,
    # which Python's built-in http.server does not set by default.
    python3 -c "
import http.server, os, sys
port = $PORT
directory = '$OUTPUT_DIR'

class WasmHandler(http.server.SimpleHTTPRequestHandler):
    def guess_type(self, path):
        if path.endswith('.wasm'): return 'application/wasm'
        return super().guess_type(path)
    def log_message(self, fmt, *args):
        if args[1] not in ('200', '304'): super().log_message(fmt, *args)

os.chdir(directory)
print(f'Serving at http://localhost:{port}  (Ctrl+C to stop)')
with http.server.HTTPServer(('', port), WasmHandler) as h:
    h.serve_forever()
"
  elif command -v npx &>/dev/null; then
    cd "$OUTPUT_DIR"
    npx --yes serve -l "$PORT" --no-clipboard
  else
    error "No suitable HTTP server found.  Install python3 or node."
    exit 1
  fi
fi

echo ""
success "Build complete!"
echo -e "  Output : ${BOLD}$OUTPUT_DIR${NC}"
if ! $SERVE; then
  echo -e "  To serve locally:"
  echo -e "    ${CYAN}python3 -m http.server 8080 --directory $OUTPUT_DIR${NC}"
  echo -e "  or:"
  echo -e "    ${CYAN}$0 --skip-wasm --skip-angular --serve${NC}"
fi
echo ""
