#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"
require_command python3

apk="${1:?Usage: verify-android.sh APK [require-signature=true]}"
require_signature="${2:-true}"
android_sdk="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
if [[ -z "$android_sdk" ]]; then
  printf 'Set ANDROID_HOME to the Android SDK directory.\n' >&2
  exit 1
fi
build_tools="$android_sdk/build-tools/35.0.0"
python3 - "$apk" "$REPO_ROOT/port/resources/resources.dat" <<'PY'
import hashlib
import struct
import sys
import zipfile
from pathlib import Path

apk, resources = sys.argv[1:]
with zipfile.ZipFile(apk) as archive:
    packed = archive.read('assets/resources.dat')
    if hashlib.sha256(packed).digest() != hashlib.sha256(Path(resources).read_bytes()).digest():
        raise SystemExit('APK resources.dat does not match the repository')
    for abi in ('arm64-v8a', 'x86_64'):
        for library in ('libSDL2.so', 'libmain.so'):
            if f'lib/{abi}/{library}' not in archive.namelist():
                raise SystemExit(f'Missing {abi}/{library}')
    for name in archive.namelist():
        if not name.startswith('lib/') or not name.endswith('.so'):
            continue
        elf = archive.read(name)
        if elf[:6] != b'\x7fELF\x02\x01':
            raise SystemExit(f'Expected 64-bit little-endian ELF: {name}')
        table = struct.unpack_from('<Q', elf, 32)[0]
        entry_size, count = struct.unpack_from('<HH', elf, 54)
        loads = 0
        for index in range(count):
            offset = table + index * entry_size
            if struct.unpack_from('<I', elf, offset)[0] == 1:  # PT_LOAD
                loads += 1
                alignment = struct.unpack_from('<Q', elf, offset + 48)[0]
                if alignment < 16384:
                    raise SystemExit(f'{name} is not 16 KB aligned: {alignment}')
        if not loads:
            raise SystemExit(f'No loadable ELF segments: {name}')
print('Current resource pack, both ABIs, and 16 KB ELF alignment verified')
PY
"$build_tools/zipalign" -c -P 16 4 "$apk"
if [[ "$require_signature" == true ]]; then
  "$build_tools/apksigner" verify --verbose "$apk"
fi
printf 'Verified APK: %s\n' "$apk"
