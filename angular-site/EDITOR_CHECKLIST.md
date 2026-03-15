# Level Editor — All Required Changes Checklist

**Start Timestamp: 2026-03-15T10:15:20Z**

## Must Fix (from problem statement)

### Bug Fixes
- [x] **"Objects53 / 53" spacing** — Add gap between "Objects" title and the badge in object-list header
- [x] **Cursor crosshair** — Change default cursor from `crosshair` (plus sign) to `default` on the Konva container and canvas
- [x] **'>' right-aligned in object list** — Chevron should be pushed to the right with margin-left: auto
- [x] **More spaces in object list item** — Add gap between #idx, type, and position fields

### Performance
- [x] **_MatRow causing lag** — Replace `<table mat-table>` in marks panel with a plain `<table>` (eliminates Material table overhead which was dominating frame time in profiler)
- [x] **Object groups table** — Same fix in Properties tab

### Draggability — ALL items with coordinates must be draggable
- [x] **Objects** — Already draggable via Konva (KonvaEditorService.setObjects)
- [x] **Track Up / Down waypoints** — Already draggable via Konva (setTrackWaypoints)
- [x] **Mark segment endpoints** — Add `setMarks()` to KonvaEditorService; create draggable Konva circles for each p1/p2 endpoint; wire up `onMarkEndpointDragEnd` callback in app.ts; skip canvas endpoint-dot drawing when Konva is active
- [x] **Player start X marker** — Already draggable via Konva stage mouse events (onStageMouseDown detects start marker hit radius, onStageMouseMove updates editXStartPos); visually upgrade to a proper Konva node

### Component Architecture
- [x] **Break up into fine-grained components** — Extract `MarksEditorComponent` from EditorCanvasComponent; extract `PropertiesTabComponent` from app.html; results in smaller, more maintainable components with single responsibilities

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
