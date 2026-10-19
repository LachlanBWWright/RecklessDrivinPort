#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"
require_command adb
require_command python3
apk="${1:?Usage: smoke-test-android.sh APK [evidence-directory]}"
evidence="${2:-${RUNNER_TEMP:-/tmp}/reckless-drivin-android-smoke}"
mkdir -p "$evidence"
serial="$(adb get-serialno)"
if [[ "$serial" != emulator-* ]]; then
  printf 'Run this smoke test on a dedicated Android emulator.\n' >&2
  exit 1
fi
collect_logs() {
  adb logcat -d > "$evidence/logcat.txt" || true
}
trap collect_logs EXIT

adb install -r "$apk"
adb logcat -c
# Start from a portrait device to catch SDL overriding the manifest lock.
adb shell settings put system accelerometer_rotation 0
adb shell settings put system user_rotation 0
# Dismiss Android's one-time immersive-mode tutorial on the fresh CI emulator.
adb shell settings put secure immersive_mode_confirmations confirmed
adb shell input keyevent KEYCODE_WAKEUP
adb shell wm dismiss-keyguard
adb shell am force-stop com.recklessdrivin
adb shell am start -W -n com.recklessdrivin/.MainActivity

for attempt in {1..30}; do
  if adb shell pidof com.recklessdrivin >/dev/null; then
    break
  fi
  sleep 1
done
# Give native resource loading and the first rendered frames time to complete.
sleep 5
adb shell pidof com.recklessdrivin
adb shell dumpsys activity activities > "$evidence/activity.txt"
adb exec-out screencap -p > "$evidence/landscape.png"
python3 - "$evidence/landscape.png" <<'PY'
import struct
import sys
from pathlib import Path
png = Path(sys.argv[1]).read_bytes()
if png[:8] != b'\x89PNG\r\n\x1a\n':
    raise SystemExit('Emulator screenshot is not a PNG')
width, height = struct.unpack_from('>II', png, 16)
if width <= height:
    raise SystemExit(f'App did not enter landscape: {width}x{height}')
print(f'Android app launched and remains running in landscape: {width}x{height}')
PY
# Tap the original menu's Start button in the centered 4:3 game rectangle.
read -r start_x start_y < <(python3 - "$evidence/landscape.png" <<'PYTHON'
import struct
import sys
from pathlib import Path
width, height = struct.unpack_from('>II', Path(sys.argv[1]).read_bytes(), 16)
game_width = min(width, height * 4 // 3)
game_height = game_width * 3 // 4
print((width - game_width) // 2 + game_width * 76 // 100,
      (height - game_height) // 2 + game_height * 30 // 100)
PYTHON
)
adb shell input tap "$start_x" "$start_y"
sleep 3
adb shell pidof com.recklessdrivin
adb exec-out screencap -p > "$evidence/gameplay.png"
if cmp -s "$evidence/landscape.png" "$evidence/gameplay.png"; then
  printf 'Start tap did not change the menu frame.\n' >&2
  exit 1
fi
# A highlighted menu item also changes pixels. Require another changing
# frame so a swallowed Start tap cannot pass as gameplay.
sleep 2
adb exec-out screencap -p > "$evidence/gameplay-later.png"
if cmp -s "$evidence/gameplay.png" "$evidence/gameplay-later.png"; then
  printf 'Game is not advancing after the Start tap.\n' >&2
  exit 1
fi
adb logcat -b crash -d > "$evidence/crash.txt"
if grep -qE 'com\.recklessdrivin|libmain\.so|libSDL2\.so' "$evidence/crash.txt"; then
  cat "$evidence/crash.txt" >&2
  exit 1
fi
