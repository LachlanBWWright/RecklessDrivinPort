# Level Editor — All Required Changes Checklist

**Start Timestamp: 2026-03-15T10:15:20Z**

## Session 2 (2026-03-17T07:53:09Z) — New requirements

### Tooling & Code Quality
- [x] **ESLint** — Already installed (`eslint`, `@typescript-eslint/eslint-plugin`, `@typescript-eslint/parser`)
- [x] **eslint-plugin-neverthrow** — Already installed, configured in `eslint.config.mjs`
- [x] **NeverThrow** — Already installed. `parseSndHeader` and `tryPlaySndResource` use pure functions with no throw; further Result-type conversion in service layer pending
- [x] **f32 type support** — Added `'f32'` to `ResField.type` union; `readResField`/`writeResField`/`fieldByteSize` updated
- [x] **Fix Pack 135 (kPackRoad) schema** — Was incorrect (generic `flags`/`roadWidth` labels). Now correctly maps all `tRoadInfo` fields including `friction`, `airResistance`, `marks`, `bgTex`, etc. with proper types including `f32` for float fields
- [x] **Expand RESOURCE_SCHEMAS** — Added `MENU`, `vers`, `PICT` (header), `snd ` schemas
- [x] **Add Pack 130 (kPackOgrp) schema** — Basic schema for object group entries
- [x] **Add Pack 134 (kPackSnds) schema** — Basic snd resource header schema

### Audio Editing
- [x] **Audio resource type detection** — `AUDIO_RESOURCE_TYPES` set; `selectedResIsAudio` computed signal
- [x] **snd resource metadata display** — `parseSndHeader()` decodes format/sampleRate/length/encode; shown in resource browser
- [x] **Audio playback** — `tryPlaySndResource()` decodes uncompressed 8-bit PCM Mac snd resources via Web Audio API; `playSndResource()` method in app class
- [x] **Audio UI in Resources tab** — Player with Play button and metadata badges shown for `snd ` resources
- [ ] **Compressed snd decoding** — MACE/IMA4 compressed sounds are not yet supported (shows warning)
- [ ] **Audio export as WAV** — Future: export decoded snd as WAV file

### Road & Background Tiles Viewer
- [x] **Tiles tab** — New "Tiles" tab in editor section shows all decoded Pack 136 (kPackTx16) texture tiles
- [x] **Tile grid viewer** — Same grid/detail layout as sprite viewer; tiles shown at pixel-accurate scale
- [x] **`tileTileEntries` signal** — Populated alongside road textures in `decodeRoadTexturesInBackground()`
- [x] **`getTileDataUrl()` / `getTileDimensions()`** — Helper methods for tile viewer template
- [ ] **8-bit tile viewer** — Pack 133 (kPackTxtR 8-bit) textures not yet shown (would need palette decoding)
- [ ] **Tile editing** — Replace-via-upload path links to Resources tab Pack 136 entry

### Main Menu & HUD
- [x] **PICT schema** — Added `PICT` resource header schema so bounds/size fields are shown in Resources tab
- [ ] **PICT image decoder** — QuickDraw PICT format is complex; images can be downloaded/replaced via Resources tab
- [ ] **Dedicated Main Menu tab** — Future: tab that lists and previews PICT resources used in menus
- [ ] **HUD sprite identification** — Future: label specific sprite IDs in Pack 137 that correspond to HUD elements

### Road Marking Tiles
- [x] **Mark segment drag** — Mark endpoints are already draggable in Konva (from previous session)
- [x] **marks field in Pack 135 schema** — Correctly named `marks` (offset 14) in the updated tRoadInfo schema
- [ ] **Marking tile preview** — Show the marking texture (Pack 133 `marks` index from tRoadInfo) on canvas

### Everything in resources.dat editable
- [x] **All resource types** — Resources tab lists every entry; any type can be downloaded + replaced
- [x] **STR# editing** — String list editor
- [x] **TEXT/STR editing** — Textarea editor
- [x] **Binary struct editing** — Field table for known schemas; auto-u16 fallback for unknown
- [x] **Pack entry editing** — Pack entry field editor with known schemas for Pack 128/134/135/140-149
- [x] **ICN# preview** — Icon canvas preview
- [x] **snd playback** — Audio player for `snd ` resources
- [x] **Sprite editing** — Pixel editor for 16-bit Pack 137 frames
- [ ] **PICT visual editor** — QuickDraw decode would be needed for visual editing

---

## Session 1 (2026-03-15T10:15:20Z) — Previous requirements

### Bug Fixes
- [x] **"Objects53 / 53" spacing** — Add gap between "Objects" title and the badge in object-list header
- [x] **Cursor crosshair** — Change default cursor from `crosshair` (plus sign) to `default` on the Konva container and canvas
- [x] **'>' right-aligned in object list** — Chevron should be pushed to the right with margin-left: auto
- [x] **More spaces in object list item** — Added `gap: 10px` and wrapped info fields in a flex group

### Performance
- [x] **_MatRow causing lag** — Replace `<table mat-table>` in marks panel with a plain `<table>` (eliminates Material table overhead which was dominating frame time in profiler)
- [x] **Object groups table** — Same fix in Properties tab

### Draggability — ALL items with coordinates must be draggable
- [x] **Objects** — Already draggable via Konva (KonvaEditorService.setObjects)
- [x] **Track Up / Down waypoints** — Already draggable via Konva (setTrackWaypoints)
- [x] **Mark segment endpoints** — Added `setMarks()` to KonvaEditorService; creates draggable Konva circles for each p1/p2 endpoint; wired up `onMarkEndpointDragEnd` + `onMarkClick` callbacks in app.ts; skips canvas endpoint-dot drawing when Konva is active
- [x] **Player start X marker** — Already draggable via Konva stage mouse events (onStageMouseDown detects start marker hit radius, onStageMouseMove updates editXStartPos)

### Component Architecture
- [x] **Break up into fine-grained components** — Extracted `MarksEditorComponent` from EditorCanvasComponent; extracted `PropertiesTabComponent` from app.html; results in smaller, more maintainable components with single responsibilities

## Previously Fixed (from earlier sessions)
- [x] Konva batchDraw → synchronous flush() (eliminate trail)
- [x] Pan via Konva stage events (canvas was blocked by Konva overlay)
- [x] Node scaling: world-unit radii, proportional to road
- [x] Hot-reload resources.dat via Module.callMain()
- [x] Zoom toward cursor
- [x] Grid visibility toggle
- [x] Cursor feedback (grab/grabbing during pan)
- [x] Undo/redo (Ctrl+Z/Y)
- [x] Double-click adds object at world position

## Konva Architecture — Why Previous Code Was Wrong

See `konva-architecture.md` for full explanation. Summary:
1. `batchDraw()` defers Konva to the NEXT frame — fixed with `flush()` (synchronous draw)
2. Konva container blocks mouse events from canvas — fixed with `onStageMouseDown/Move/Up`
3. Counter-scaling kept nodes at fixed screen pixels — nodes appeared BIGGER on zoom-out; fixed with world-unit radii
