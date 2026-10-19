# Feature checklist and remaining work

Reviewed against the current source on 2026-10-19. This replaces the old
session-by-session checklist; completed features below are no longer TODOs.

## Remaining work

- [ ] Decode MACE-compressed `snd` audio. Apple IMA4 decoding is already implemented.
- [ ] Preview and edit Pack 133 8-bit road/marking textures. The current Tiles editor
  handles RGB555 textures from Pack 136.
- [ ] Render road-marking textures on the level canvas; mark segment editing and
  generation are already available.
- [ ] Identify and label individual HUD sprite frames in Pack 137. Screens/HUD
  resource labels already exist, but do not map each sprite frame.
- [ ] Extend PICT decoding beyond the supported bitmap/packed-row formats.
- [ ] Enable the Lua runtime for native/Android builds. Currently CMake links Lua
  for WebAssembly; the Android APK does not execute Lua scripts.
- [ ] Finish Result-based error handling in legacy code paths; NeverThrow is
  configured, but some media/codec operations still use compatibility wrappers.

## Implemented

### Level and resource editing

- [x] Load, inspect, edit, and export resource packs; edit known schemas and raw
  bytes, including resource types without a dedicated visual editor.
- [x] Correct Pack 135 road-field schema with float fields; object-group and sound
  metadata schemas; text and string-list editing.
- [x] Drag objects, track waypoints, marking endpoints, and the player start marker.
- [x] Pan, zoom toward the cursor, undo/redo, and add objects by double-clicking.
- [x] Generate road markings and barriers, and edit marking coordinates.
- [x] Split editor UI into focused components with ESLint and NeverThrow rules.

### Audio, images, and textures

- [x] Inspect and play PCM and Apple IMA4 audio; export WAV and replace/add sounds
  from WAV uploads. See [snd-codec.ts](src/app/snd-codec.ts) and
  [app-media-audio.ts](src/app/app-media-audio.ts).
- [x] Preview 16-bit road/background tiles, edit their pixels, import PNGs, and
  export PNGs. See [resource-browser-tiles.ts](src/app/resource-browser-tiles.ts).
- [x] Preview and edit 8-bit and 16-bit sprite frames.
- [x] Preview supported PICT/PPic resources and edit/replace images in the dedicated
  Screens & HUD section. See [app-media.ts](src/app/app-media.ts) and
  [image-pict-codec.ts](src/app/image-pict-codec.ts).
- [x] Preview monochrome and color icons, and label known menu/HUD screen resources.

### Browser Lua workspace

- [x] Edit scripts and object/level bindings, recover local drafts, and import/export
  projects; validate before applying changes.
- [x] Provide completion, hover, local definition navigation, diagnostics, and a
  runtime console. See the [Lua workspace guide](../documentation/lua-editor.md)
  for supported language assistance and parser limitations.

### Game and Android builds

- [x] Center the largest 4:3 frame that fits the screen.
- [x] Force fullscreen landscape on Android; use larger translucent dashboard
  controls with separate hit areas and a pause button.
- [x] Preserve independent multitouch input and release held controls on focus loss.
- [x] Keep menu taps queued across redraws so Start opens gameplay reliably.
- [x] Build ARM64 and x86-64 APKs in CI; verify embedded resources, native alignment,
  and signatures; launch gameplay in an Android emulator.
- [x] Provide a version-tagged signed APK release workflow, with persistent signing
  keys configured through GitHub secrets. See the
  [release guide](../documentation/android-release.md).

Current Android menu and gameplay captures are shown in the
[project README](../README.md). Historical Konva design notes remain in
[konva-architecture.md](konva-architecture.md).
