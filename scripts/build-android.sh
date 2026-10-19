#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

require_command java
require_command curl
require_command sha256sum

# Download Java and native sources together; never mix SDL releases.
SDL2_VERSION=2.32.10
SDL2_SHA256=5f5993c530f084535c65a6879e9b26ad441169b3e25d789d83287040a9ca5165
android_cache="${XDG_CACHE_HOME:-$HOME/.cache}/reckless-drivin/android"
if [[ -z "${SDL2_SOURCE_DIR:-}" ]]; then
  mkdir -p "$android_cache"
  SDL2_SOURCE_DIR="$android_cache/SDL2-$SDL2_VERSION"
  if [[ ! -f "$SDL2_SOURCE_DIR/include/SDL.h" ]]; then
    archive="$android_cache/SDL2-$SDL2_VERSION.tar.gz"
    curl --fail --location --retry 3 \
      "https://www.libsdl.org/release/SDL2-$SDL2_VERSION.tar.gz" -o "$archive"
    printf '%s  %s\n' "$SDL2_SHA256" "$archive" | sha256sum --check
    tar -xzf "$archive" -C "$android_cache"
  fi
fi
if [[ ! -f "$SDL2_SOURCE_DIR/include/SDL.h" ||
      ! -f "$SDL2_SOURCE_DIR/android-project/app/src/main/java/org/libsdl/app/SDLActivity.java" ]]; then
  printf 'SDL2_SOURCE_DIR must contain the SDL2 native and Android Java sources.\n' >&2
  exit 1
fi
SDL2_SOURCE_DIR="$(cd "$SDL2_SOURCE_DIR" && pwd)"
cd "$REPO_ROOT/port/android"
if [[ $# -eq 0 ]]; then
  set -- :app:assembleDebug :app:assembleRelease
fi
exec ./gradlew "$@" "-PSDL2_SOURCE_DIR=$SDL2_SOURCE_DIR" --no-daemon --stacktrace
