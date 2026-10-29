#!/usr/bin/env python3
"""Launch packaged desktop levels headlessly and verify rendered framebuffers.

Requires SDL's dummy video/audio backends. The executable must have its packaged
resources beside it (or in its macOS app bundle). No checkout resources are used.
"""

import argparse
import concurrent.futures
import os
from pathlib import Path
import struct
import subprocess
import tempfile
import time


def smoke_level(executable, level, output, timeout):
    level_output = output / f"level-{level:02d}"
    level_output.mkdir(parents=True, exist_ok=True)
    for capture in level_output.glob("native_*.bmp"):
        capture.unlink()
    environment = dict(os.environ, SDL_VIDEODRIVER="dummy", SDL_AUDIODRIVER="dummy",
                       RECKLESS_SCREENSHOT_DIR=str(level_output))
    log = level_output / "game.log"
    with log.open("wb") as logfile:
        process = subprocess.Popen([str(executable), "--level", str(level)],
                                   cwd=level_output, env=environment,
                                   stdout=logfile, stderr=subprocess.STDOUT)
        try:
            deadline = time.monotonic() + timeout
            screenshot = level_output / "native_004.bmp"
            while not screenshot.exists():
                if process.poll() is not None:
                    raise RuntimeError(f"Level {level}: exited {process.returncode}; see {log}")
                if time.monotonic() >= deadline:
                    raise RuntimeError(f"Level {level}: no gameplay framebuffer after {timeout}s; see {log}")
                time.sleep(0.05)
            # SDL writes five complete captures, after 200 warmup frames. Read
            # the first while the game remains alive to detect startup crashes.
            if process.poll() is not None:
                raise RuntimeError(f"Level {level}: exited before verification; see {log}")
            data = (level_output / "native_000.bmp").read_bytes()
            if len(data) < 54 or data[:2] != b"BM":
                raise RuntimeError(f"Level {level}: invalid BMP framebuffer")
            offset = struct.unpack_from("<I", data, 10)[0]
            width, height = struct.unpack_from("<ii", data, 18)
            bits = struct.unpack_from("<H", data, 28)[0]
            if width < 320 or abs(height) < 200 or bits not in (24, 32):
                raise RuntimeError(f"Level {level}: unexpected framebuffer {width}x{height}/{bits}")
            pixel_size = bits // 8
            colors = {data[index:index + pixel_size] for index in range(offset, len(data), pixel_size)}
            if len(colors) < 32:
                raise RuntimeError(f"Level {level}: blank or nearly blank framebuffer ({len(colors)} colors)")
        finally:
            if process.poll() is None:
                process.terminate()
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait()
    diagnostics = log.read_text(errors="replace")
    for failure in ("could not open resources.dat", "SDL_Init failed", "PANIC:", "Assertion"):
        if failure in diagnostics:
            raise RuntimeError(f"Level {level}: {failure}; see {log}")
    for line in diagnostics.splitlines():
        if "Pomme_GetResource: not found:" in line:
            # Original packs have no optional Lua binding maps.
            if "type='ScMp'" not in line and "type='ScLv'" not in line:
                raise RuntimeError(f"Level {level}: {line}; see {log}")
    return f"Level {level}: rendered {width}x{abs(height)}, {len(colors)} colors"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("executable", type=Path)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--timeout", type=float, default=30)
    parser.add_argument("--jobs", type=int, default=2)
    args = parser.parse_args()
    executable = args.executable.resolve(strict=True)
    output = args.output.resolve() if args.output else Path(tempfile.mkdtemp(prefix="rd-desktop-smoke-"))
    output.mkdir(parents=True, exist_ok=True)
    print(f"Captures and logs: {output}", flush=True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.jobs) as executor:
        futures = [executor.submit(smoke_level, executable, level, output, args.timeout)
                   for level in range(1, 11)]
        for future in futures:
            print(future.result(), flush=True)


if __name__ == "__main__":
    main()
