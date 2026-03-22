# Konva Editor — Architecture Notes & Bug History

## The Problems That Were Present

### 1. One-frame lag causing "objects trail behind background"

**Root cause:** `Konva.Layer.batchDraw()` does **not** draw immediately.  It
schedules the actual canvas paint for the **next** `requestAnimationFrame` tick.

The render pipeline was:

```
rAF tick N fires
  → redrawObjectCanvas()        (draws road to 2D canvas)
  → konva.setTransform()
      → layer.batchDraw()       ← schedules Konva draw for tick N+1
rAF tick N+1 fires
  → Konva draws objects
```

Result: the road canvas shows the new pan position in frame N, but Konva
objects are still at the old position.  When you drag, objects visibly **lag
one frame behind** the background.

**Fix:** Added a `flush()` method to `KonvaEditorService` that calls
`layer.draw()` (synchronous) on every layer.  `redrawObjectCanvas()` now calls
`konva.flush()` as the **last thing it does**, inside the same `rAF` callback.
Both canvases are updated before the browser composites the frame.

---

### 2. Panning completely broken (Space+drag was dead code)

**Root cause:** The Konva container div is positioned `absolute` over the
`#object-canvas` with `pointer-events: all`.  It therefore intercepts
**every** mouse event before it reaches the canvas element.

The Angular event bindings on the canvas element:

```html
(mousedown)="canvasMouseDown.emit($event)"
(mousemove)="canvasMouseMove.emit($event)"
```

**never fired** during normal use because the Konva container sat on top and
swallowed all pointer events.  Panning code in `onCanvasMouseDown/Move` was
unreachable dead code.

**Fix:** Wired `stage.on('mousedown/mousemove/mouseup')` inside
`KonvaEditorService` to expose `onStageMouseDown/Move/Up` callbacks.  The
host (`AppComponent`) implements panning through these Konva-native events
instead of through the canvas HTML element.

Additionally, the Konva container is now given `tabIndex = 0` so it can
receive focus.  Key events (`keydown`/`keyup`) from the Konva container are
forwarded to the canvas element so existing Angular key handlers (`Ctrl+Z`,
`Space`, `Delete`, etc.) continue to work.

---

### 3. Waypoints / nubs appeared larger as you zoomed out

**Root cause:** The old code counter-scaled waypoint circles to maintain a
**fixed screen-pixel radius** (7 px) regardless of zoom.  When zoomed out:

- The road appeared smaller (correct — fewer world units fit in the viewport).
- Waypoints remained at 7 CSS pixels (by design of counter-scaling).
- Relative to the shrunken road, 7 px dots looked disproportionately large.

This is the expected consequence of counter-scaling, but it violated the user's
expectation that dots should look proportional to the road.

**Fix:** Removed counter-scaling entirely.  Waypoints now have a radius
expressed in **world units** (`WAYPOINT_WORLD_R = 10`).  The group transform
(pan/zoom) scales them exactly like the road geometry, so they stay
proportionally the same size at all zoom levels.  Fallback circles use
`FALLBACK_CIRCLE_WORLD_R = 14` world units for the same reason.

---

### 4. Two-canvas compositing

The architecture uses two stacked canvases:

| Layer | Element | What it draws |
|-------|---------|---------------|
| Bottom | `#object-canvas` (2D context) | Road, grid, overlays |
| Top    | Konva stage canvas            | Object sprites, waypoints |

Even with `flush()` making Konva draw synchronously, the browser composites
two **separate** canvas elements.  In practice, because both draws happen
within the **same** `requestAnimationFrame` callback (before the compositor
runs), the browser paints them atomically in the same frame.

If future performance requirements demand a single canvas, the road bitmap
could be placed in a Konva background layer (`Konva.Image`) so that Konva
handles all compositing internally.  For now the dual-canvas approach with
synchronous `flush()` is correct and performant.

---

## Correct Architecture Summary

```
requestAnimationFrame fires
├── redrawObjectCanvas()
│   ├── Draw road to 2D canvas (uses offscreen cache for performance)
│   ├── konva.setTransform(zoom, panX, panY)   ← updates group attrs (O(1))
│   ├── konva.setObjects(...)                  ← rebuilds only if changed
│   ├── konva.setTrackWaypoints(...)            ← rebuilds only if changed
│   └── konva.flush()                          ← layer.draw() — synchronous!
└── Browser compositor paints both canvases in the same frame ✓
```

### World-group transform formula

```
scaleX = zoom * (cssW / logicalW)
scaleY = zoom * (cssH / logicalH)
groupX = cssW/2  −  panX * scaleX
groupY = cssH/2  +  panY * scaleY   (+ because Konva Y is down, world Y is up)
```

Objects are placed at `(worldX, −worldY)` inside the group so that world `+Y`
maps to Konva `−Y` (upward on screen).

### Pan mode (Space + drag)

When `Space` is held, `konva.setPanMode(true)` is called.  This iterates over
all draggable nodes and sets `draggable = false` so that Space+click-drag
pans the view instead of accidentally moving objects.  On `Space` release,
`setPanMode(false)` restores draggability.  This is an O(n) traversal but is
only triggered on Space key press/release, not on every frame.

---

## Custom resources.dat hot-reload

`_mountCustomResourcesFs()` writes the uploaded file to the Emscripten MEMFS
at `/resources/resources.dat`.  A "Restart Game" button then calls
`Module.callMain([])` (Emscripten's re-entrant main entry point) to restart
the game without a full page reload.  If `callMain` is not available in the
build, the page reloads automatically as a fallback.
