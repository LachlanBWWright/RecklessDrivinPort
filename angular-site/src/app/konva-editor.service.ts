/**
 * KonvaEditorService — correct Konva architecture
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * COORDINATE SYSTEM
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * World coordinates: X right, Y UP (positive Y is towards the top of the track).
 * Konva/Canvas coordinates: X right, Y DOWN.
 *
 * Mapping (applied to worldGroup and trackWorldGroup):
 *   scaleX = zoom * (cssW / logicalW)
 *   scaleY = zoom * (cssH / logicalH)   ← same magnitude as scaleX when canvas is square
 *   x      = cssW/2  −  panX * zoom * (cssW / logicalW)
 *   y      = cssH/2  +  panY * zoom * (cssH / logicalH)   ← + because Konva Y is down
 *
 * Object nodes are placed at (worldX, −worldY) so that world +Y maps to Konva −Y (up).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY WORLD-UNIT SIZES (not fixed screen-pixel sizes)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Previous versions counter-scaled waypoint circles to maintain a fixed screen-pixel
 * radius.  This caused the dots to appear LARGER than the road when zooming out because
 * the road shrank but the dots stayed at ~7 CSS pixels.
 *
 * Correct approach: give circles a radius in WORLD UNITS.  The group transform then
 * scales them exactly like the road, so they always look proportional.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY flush() INSTEAD OF batchDraw()
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Konva.Layer.batchDraw() schedules the actual pixel draw for the NEXT animation
 * frame.  If the host 2-D road canvas is drawn in frame N and batchDraw() is called,
 * Konva renders in frame N+1.  The two canvases are therefore out of sync by one
 * frame, which produces the visible "objects trail behind background" effect.
 *
 * Konva.Layer.draw() is synchronous – it draws immediately in the current call stack.
 * Because this service's public methods are called from inside a requestAnimationFrame
 * callback (scheduleCanvasRedraw → redrawObjectCanvas), calling draw() keeps both
 * canvases in the same compositor frame and eliminates the trail.
 *
 * setTransform / setObjects / setTrackWaypoints now do NOT draw at all; the caller
 * must call flush() once at the end of its render function.
 */
import { Injectable, OnDestroy } from '@angular/core';
import Konva from 'konva';
import type { ObjectPos } from './level-editor.service';
import { profiler } from './konva-editor.profiler';
import {
  EMPTY_SET,
  setsEqual,
} from './konva-editor.types';
import type {
  KonvaDragEndEvent,
  KonvaWaypointDragEndEvent,
  KonvaMarkDragEndEvent,
  KonvaFinishLineDragEvent,
  KonvaWorldNode,
} from './konva-editor.types';
import {
  createOffscreenBitmap as _createOffscreenBitmap,
  applyBackgroundTransform as _applyBackgroundTransform,
} from './konva-editor.background';
import { buildObjects } from './konva-editor.objects';
import { buildTrackWaypoints } from './konva-editor.track';
import { buildMarks } from './konva-editor.marks';
import { buildBarriers } from './konva-editor.barriers';



@Injectable({ providedIn: 'root' })
export class KonvaEditorService implements OnDestroy {

  // ── Konva tree ────────────────────────────────────────────────────────────
  private stage: Konva.Stage | null = null;
  private objectsLayer: Konva.Layer | null = null;
  private trackLayer: Konva.Layer | null = null;
  private marksLayer: Konva.Layer | null = null;
  /** Group inside objectsLayer – transform = pan/zoom; children are at world coords. */
  private worldGroup: Konva.Group | null = null;
  /** Group inside trackLayer – same transform as worldGroup. */
  private trackWorldGroup: Konva.Group | null = null;
  /** Group inside marksLayer – same transform as worldGroup. */
  private marksWorldGroup: Konva.Group | null = null;
  private barrierLayer: Konva.Layer | null = null;
  private barrierWorldGroup: Konva.Group | null = null;
  private _barrierDrawPreviewLine: Konva.Line | null = null;
  private finishLayer: Konva.Layer | null = null;
  private finishWorldGroup: Konva.Group | null = null;
  private _finishLineNode: Konva.Line | null = null;
  // Background offscreen-bitmap layer (prototype)
  private bgLayer: Konva.Layer | null = null;
  private bgImageNode: Konva.Image | null = null;
  private bgBitmap: ImageBitmap | null = null;

  // ── External callbacks ────────────────────────────────────────────────────
  onObjectDragEnd?: (e: KonvaDragEndEvent) => void;
  onObjectClick?: (index: number) => void;
  onWaypointDragEnd?: (e: KonvaWaypointDragEndEvent) => void;
  onWaypointRightClick?: (track: 'up' | 'down', segIdx: number, worldX: number, worldY: number) => void;
  onWaypointDoubleClick?: (track: 'up' | 'down', segIdx: number) => void;
  onMarkEndpointDragEnd?: (e: KonvaMarkDragEndEvent) => void;
  onMarkClick?: (markIdx: number) => void;
  onFinishLineDragStart?: (e: KonvaFinishLineDragEvent) => void;
  onFinishLineDragMove?: (e: KonvaFinishLineDragEvent) => void;
  onFinishLineDragEnd?: (e: KonvaFinishLineDragEvent) => void;
  onStageDblClick?: (worldX: number, worldY: number) => void;
  onStageRightClick?: (worldX: number, worldY: number) => void;

  /**
   * Fired when the user presses the mouse button on the stage.
   * cssX/cssY are in Konva CSS-pixel coordinates (origin = top-left of stage).
   * button = MouseEvent.button value. targetIsStage is true only when the empty
   * stage was clicked rather than a draggable/editor node.
   */
  onStageMouseDown?: (cssX: number, cssY: number, button: number, targetIsStage: boolean) => void;
  /**
   * Fired on every mouse move over the stage (regardless of target).
   * Used by the host to update pan position during Space+drag.
   */
  onStageMouseMove?: (cssX: number, cssY: number) => void;
  /** Fired when the mouse button is released anywhere on the stage. */
  onStageMouseUp?: (button: number) => void;

  // ── Transform state ───────────────────────────────────────────────────────
  private _zoom     = 1;
  private _panX     = 0;
  private _panY     = 0;
  private _logicalW = 640;
  private _logicalH = 480;
  private _cssW     = 640;
  private _cssH     = 480;

  // ── Dirty-layer tracking ───────────────────────────────────────────────────
  // Only layers that were modified since the last flush() are redrawn.
  // This avoids the cost of redrawing, e.g., the objects layer while the user
  // is only dragging a mark endpoint.
  private _dirtyLayers = new Set<Konva.Layer>();
  /** Last applied group-transform values; used to skip redundant setAttrs calls. */
  private _lastGx = NaN; private _lastGy = NaN; private _lastSx = NaN; private _lastSy = NaN;

  private _markLayerDirty(layer: Konva.Layer | null): void {
    if (layer) this._dirtyLayers.add(layer);
  }
  private _markAllLayersDirty(): void {
    this._markLayerDirty(this.objectsLayer);
    this._markLayerDirty(this.trackLayer);
    this._markLayerDirty(this.marksLayer);
    this._markLayerDirty(this.barrierLayer);
    this._markLayerDirty(this.finishLayer);
  }

  // ── Interaction state ─────────────────────────────────────────────────────
  /** When true, node dragging is disabled (pan mode active). */
  private _panMode = false;

  // ── Object-layer cache ────────────────────────────────────────────────────
  private _lastObjects: readonly ObjectPos[] | null = null;
  private _lastSelectedIndex: number | null = null;
  private _lastVisibleTypes: Set<number> | null = null;
  /** Nodes in worldGroup, in insertion order. */
  private _konvaObjNodes: KonvaWorldNode[] = [];

  // ── Track-layer cache ─────────────────────────────────────────────────────
  private _lastTrackUp:   readonly { x: number; y: number }[] | null = null;
  private _lastTrackDown: readonly { x: number; y: number }[] | null = null;

  // ── Marks-layer cache ─────────────────────────────────────────────────────
  private _lastMarks:             readonly { x1: number; y1: number; x2: number; y2: number }[] | null = null;
  private _lastSelectedMarkIndex: number | null = null;

  // ─────────────────────────────────────────────────────────────────────────
  // INIT / RESIZE / DESTROY
  // ─────────────────────────────────────────────────────────────────────────

  init(
    containerId: string,
    logicalW: number, logicalH: number,
    cssW: number,     cssH: number,
  ): void {
    const t = profiler.start('konva.init');
    this.destroy();

    this._logicalW = logicalW;
    this._logicalH = logicalH;
    this._cssW = cssW > 0 ? cssW : logicalW;
    this._cssH = cssH > 0 ? cssH : logicalH;

    this.stage = new Konva.Stage({
      container: containerId,
      width:  this._cssW,
      height: this._cssH,
    });

    this.objectsLayer    = new Konva.Layer();
    this.trackLayer      = new Konva.Layer();
    this.marksLayer      = new Konva.Layer();
    this.finishLayer     = new Konva.Layer();
    this.worldGroup      = new Konva.Group();
    this.trackWorldGroup = new Konva.Group();
    this.marksWorldGroup = new Konva.Group();
    this.finishWorldGroup = new Konva.Group();

    // Background layer (offscreen-bitmap prototype) — add first so it sits behind others
    this.bgLayer = new Konva.Layer({ listening: false });
    this.bgImageNode = new Konva.Image({
      image: undefined,
      width: this._logicalW,
      height: this._logicalH,
      offsetX: this._logicalW / 2,
      offsetY: this._logicalH / 2,
      listening: false,
      hitGraphEnabled: false,
    });
    this.bgLayer.add(this.bgImageNode);

    this.objectsLayer.add(this.worldGroup);
    this.trackLayer.add(this.trackWorldGroup);
    this.marksLayer.add(this.marksWorldGroup);
    this.finishLayer.add(this.finishWorldGroup);
    this.stage.add(this.bgLayer, this.objectsLayer, this.trackLayer, this.marksLayer, this.finishLayer);

    this.barrierLayer = new Konva.Layer();
    this.barrierWorldGroup = new Konva.Group();
    this.barrierLayer.add(this.barrierWorldGroup);
    this.stage.add(this.barrierLayer);

    // ── Stage-level events ────────────────────────────────────────────────

    this.stage.on('dblclick', (e) => {
      // Only fire when clicking on empty stage (not on an object node)
      if (e.target !== this.stage) return;
      const pos = this.stage?.getPointerPosition();
      if (!pos) return;
      const [wx, wy] = this.stageToWorld(pos.x, pos.y);
      this.onStageDblClick?.(wx, wy);
    });

    this.stage.on('contextmenu', (e) => {
      e.evt.preventDefault();
      if (e.target !== this.stage) return;
      const pos = this.stage?.getPointerPosition();
      if (!pos) return;
      const [wx, wy] = this.stageToWorld(pos.x, pos.y);
      this.onStageRightClick?.(wx, wy);
    });

    // Mouse events forwarded to host for panning logic.
    // We always report position regardless of target so that pan continues
    // smoothly if the cursor moves over a node mid-drag.
    this.stage.on('mousedown', (e) => {
      const pos = this.stage?.getPointerPosition();
      if (!pos) return;
      this.onStageMouseDown?.(pos.x, pos.y, e.evt.button, e.target === this.stage);
    });

    this.stage.on('mousemove', () => {
      const pos = this.stage?.getPointerPosition();
      if (!pos) return;
      this.onStageMouseMove?.(pos.x, pos.y);
    });

    this.stage.on('mouseup', (e) => {
      this.onStageMouseUp?.(e.evt.button);
    });
    t.end();
  }

  resize(cssW: number, cssH: number): void {
    if (!this.stage) return;
    if (cssW > 0) {
      this._cssW = cssW;
      // Keep logicalW in sync so scale factor (cssW/logicalW) stays 1:1
      // when the canvas pixel buffer is sized to match its CSS display size.
      this._logicalW = cssW;
    }
    if (cssH > 0) {
      this._cssH = cssH;
      this._logicalH = cssH;
    }
    // Update background image node to match new logical dimensions
    if (this.bgImageNode) {
      this.bgImageNode.width(this._logicalW);
      this.bgImageNode.height(this._logicalH);
      this.bgImageNode.offsetX(this._logicalW / 2);
      this.bgImageNode.offsetY(this._logicalH / 2);
    }
    this.stage.width(this._cssW);
    this.stage.height(this._cssH);
    this._applyGroupTransform();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TRANSFORM UPDATE  (O(1) per pan/zoom event)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Update the pan/zoom transform stored in this service.
   * Does NOT draw; call flush() once after all updates are done.
   */
  setTransform(zoom: number, panX: number, panY: number): void {
    this._zoom = zoom;
    this._panX = panX;
    this._panY = panY;
    this._applyGroupTransform();
    // Selection ring stroke widths need updating so they stay visually thin
    this._updateSelectionRingWidths();
  }

  /**
   * Apply the current pan/zoom as the group transform.
   * Skips setAttrs calls when the transform hasn't changed (avoids marking layers
   * as dirty unnecessarily) and marks ALL layers dirty only when transform actually
   * differs from the previously applied values.
   *
   *   stage_x = x + worldX * scaleX  =  cssW/2  +  (worldX − panX) * zoom * (cssW/logicalW)
   *   stage_y = y − worldY * scaleY  =  cssH/2  −  (worldY − panY) * zoom * (cssH/logicalH)
   *                                                  (minus because world +Y = Konva −Y)
   */
  private _applyGroupTransform(): void {
    const sx = this._zoom * (this._cssW / this._logicalW);
    const sy = this._zoom * (this._cssH / this._logicalH);
    const gx = this._cssW / 2 - this._panX * sx;
    const gy = this._cssH / 2 + this._panY * sy;
    if (gx !== this._lastGx || gy !== this._lastGy || sx !== this._lastSx || sy !== this._lastSy) {
      this._lastGx = gx; this._lastGy = gy; this._lastSx = sx; this._lastSy = sy;
      this.worldGroup?.setAttrs({ x: gx, y: gy, scaleX: sx, scaleY: sy });
      this.trackWorldGroup?.setAttrs({ x: gx, y: gy, scaleX: sx, scaleY: sy });
      this.marksWorldGroup?.setAttrs({ x: gx, y: gy, scaleX: sx, scaleY: sy });
      this.barrierWorldGroup?.setAttrs({ x: gx, y: gy, scaleX: sx, scaleY: sy });
      this.finishWorldGroup?.setAttrs({ x: gx, y: gy, scaleX: sx, scaleY: sy });
      // keep background image transform in sync as well
      _applyBackgroundTransform(this.bgImageNode, this._zoom, this._panX, this._panY, this._cssW, this._cssH, this._logicalW, this._logicalH);
      // All layers need redraw when the transform changes
      this._markAllLayersDirty();
    }
  }

  /**
   * Keep selection-ring stroke widths at ~2 CSS pixels regardless of zoom.
   * (We want the ring to be a thin outline, not scale up hugely when zoomed in.)
   */
  private _updateSelectionRingWidths(): void {
    const sx = this._zoom * (this._cssW / this._logicalW);
    if (sx === 0) return;
    const w = 2 / sx; // 2 CSS pixels expressed in world units
    for (const node of this._konvaObjNodes) {
      if (node instanceof Konva.Group) {
        for (const child of node.children) {
          if (child instanceof Konva.Circle && child.stroke() === '#ffffff') {
            child.strokeWidth(w);
          }
        }
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PAN MODE (disable node dragging while Space is held)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Enable or disable "pan mode".
   * In pan mode all Konva nodes are made non-draggable so that Space+drag pans
   * the view instead of accidentally moving objects.
   */
  setPanMode(isPan: boolean): void {
    if (this._panMode === isPan) return;
    this._panMode = isPan;
    for (const node of this._konvaObjNodes) {
      node.draggable(!isPan);
    }
    if (this.trackWorldGroup) {
      for (const node of this.trackWorldGroup.children) {
        (node as Konva.Node).draggable(!isPan);
      }
    }
    if (this.marksWorldGroup) {
      for (const node of this.marksWorldGroup.children) {
        (node as Konva.Node).draggable(!isPan);
      }
    }
    if (this._finishLineNode) {
      this._finishLineNode.draggable(!isPan);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // OBJECTS
  // ─────────────────────────────────────────────────────────────────────────

  setObjects(
    objects:         ObjectPos[],
    selectedIndex:   number | null,
    visibleTypes:    Set<number>,
    paletteColors:   string[],
    getImageForType: (typeRes: number) => CanvasImageSource | null,
    zoom: number, panX: number, panY: number,
  ): void {
    const t = profiler.start('konva.setObjects');
    if (!this.worldGroup || !this.objectsLayer) { t.end(); return; }
    this._zoom = zoom; this._panX = panX; this._panY = panY;

    // Treat any empty array as equivalent to a "no objects" state regardless
    // of reference identity, so toggling showObjects() doesn't trigger a full
    // rebuild every frame.
    const prevEmpty = this._lastObjects !== null && this._lastObjects.length === 0;
    const currEmpty = objects.length === 0;
    const objsUnchanged = objects === this._lastObjects || (prevEmpty && currEmpty);
    const selUnchanged  = selectedIndex === this._lastSelectedIndex;
    const visUnchanged  = setsEqual(visibleTypes, this._lastVisibleTypes ?? EMPTY_SET);

    // Fast path: only pan/zoom changed – just update the group transform.
    if (objsUnchanged && selUnchanged && visUnchanged) {
      this._applyGroupTransform();
      this._updateSelectionRingWidths();
      t.end();
      return;
    }

    // Full rebuild — delegate to objects module
    this._lastObjects       = objects;
    this._lastSelectedIndex = selectedIndex;
    this._lastVisibleTypes  = new Set(visibleTypes);
    const result = buildObjects(
      this.worldGroup, this.objectsLayer, objects, selectedIndex, visibleTypes, paletteColors, getImageForType,
      this._panMode, this._cssW, this._cssH, this._logicalW, this._logicalH, zoom,
      (idx, wx, wy) => this.onObjectDragEnd?.({ index: idx, worldX: wx, worldY: wy }),
      (idx) => this.onObjectClick?.(idx),
    );
    this._konvaObjNodes = result.nodes;
    this._applyGroupTransform();
    this._markLayerDirty(this.objectsLayer);
    t.end();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TRACK WAYPOINTS
  // ─────────────────────────────────────────────────────────────────────────

  setTrackWaypoints(
    trackUp:   { x: number; y: number }[],
    trackDown: { x: number; y: number }[],
    zoom: number, panX: number, panY: number,
  ): void {
    const t = profiler.start('konva.setTrackWaypoints');
    if (!this.trackWorldGroup || !this.trackLayer) { t.end(); return; }
    this._zoom = zoom; this._panX = panX; this._panY = panY;

    // Fast path: only transform changed, OR both new and previous were empty.
    const arraysUnchanged = (trackUp === this._lastTrackUp && trackDown === this._lastTrackDown);
    const bothEmpty = trackUp.length === 0 && trackDown.length === 0;
    const prevBothEmpty = (this._lastTrackUp?.length ?? 0) === 0 &&
                          (this._lastTrackDown?.length ?? 0) === 0;
    if (arraysUnchanged || (bothEmpty && prevBothEmpty)) {
      this._applyGroupTransform();
      t.end();
      return;
    }

    this._lastTrackUp   = trackUp;
    this._lastTrackDown = trackDown;

    buildTrackWaypoints(
      this.trackWorldGroup, this.trackLayer, trackUp, trackDown, this._panMode,
      this._cssW, this._cssH, this._logicalW, this._logicalH, zoom,
      (track, segIdx, wx, wy) => this.onWaypointDragEnd?.({ track, segIdx, worldX: wx, worldY: wy }),
      (track, segIdx, wx, wy) => this.onWaypointRightClick?.(track, segIdx, wx, wy),
      (track, segIdx) => this.onWaypointDoubleClick?.(track, segIdx),
    );

    this._applyGroupTransform();
    this._markLayerDirty(this.trackLayer);
    t.end();
  }

  clearTrackWaypoints(): void {
    this._lastTrackUp   = null;
    this._lastTrackDown = null;
    this.trackWorldGroup?.destroyChildren();
    this._markLayerDirty(this.trackLayer);
    // Don't draw here — flush() in redrawObjectCanvas() will draw synchronously.
  }

  /**
   * Move a single track waypoint node in Konva without rebuilding the whole layer.
   * Call this during live-drag to keep 60 fps; `setTrackWaypoints` will do a full
   * sync on drag-end when the signal is updated.
   */
  moveTrackWaypointDirect(track: 'up' | 'down', segIdx: number, worldX: number, worldY: number): void {
    if (!this.trackWorldGroup || !this.trackLayer) return;
    const node = this.trackWorldGroup.findOne(`#wp-${track}-${segIdx}`) as Konva.Circle | undefined;
    if (node) {
      node.x(worldX);
      node.y(-worldY);
      // Invalidate the cache reference so the next setTrackWaypoints call fully rebuilds.
      if (track === 'up') this._lastTrackUp = null;
      else                 this._lastTrackDown = null;
      this._markLayerDirty(this.trackLayer);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // MARK SEGMENTS (checkpoint lines)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Create (or update) draggable Konva circles for each mark-segment endpoint.
   *
   * Each mark has two endpoints (p1: x1/y1, p2: x2/y2).  Both are rendered as
   * draggable circles in world-unit coordinates.  The line connecting them is
   * still drawn on the 2-D canvas by drawMarksOnCanvas(); we only handle the
   * interactive endpoint handles here.
   *
   * Fast path: if marks array reference AND selectedMarkIndex are unchanged,
   * only the group transform is updated.
   */
  setMarks(
    marks:             readonly { x1: number; y1: number; x2: number; y2: number }[],
    selectedMarkIndex: number | null,
    zoom: number, panX: number, panY: number,
  ): void {
    const t = profiler.start('konva.setMarks');
    if (!this.marksWorldGroup || !this.marksLayer) { t.end(); return; }
    this._zoom = zoom; this._panX = panX; this._panY = panY;

    const marksUnchanged = marks === this._lastMarks
      || (marks.length === 0 && (this._lastMarks?.length ?? 0) === 0);
    const selUnchanged   = selectedMarkIndex === this._lastSelectedMarkIndex;

    if (marksUnchanged && selUnchanged) {
      this._applyGroupTransform();
      t.end();
      return;
    }

    this._lastMarks             = marks;
    this._lastSelectedMarkIndex = selectedMarkIndex;

    buildMarks(
      this.marksWorldGroup, this.marksLayer, marks, selectedMarkIndex, this._panMode,
      this._cssW, this._cssH, this._logicalW, this._logicalH, zoom,
      (markIdx, endpoint, wx, wy) => this.onMarkEndpointDragEnd?.({ markIdx, endpoint, worldX: wx, worldY: wy }),
      (markIdx) => this.onMarkClick?.(markIdx),
    );

    this._applyGroupTransform();
    this._markLayerDirty(this.marksLayer);
    t.end();
  }

  setFinishLine(
    levelEnd: number,
    zoom: number,
    panX: number,
    panY: number,
  ): void {
    void panX;
    void panY;
    if (!this.finishWorldGroup || !this.finishLayer) return;
    const sy = zoom * (this._cssH / this._logicalH);
    const fixedX = -this._logicalW * 2;
    const fixedW = this._logicalW * 4;
    const strokeWidth = Math.max(2, 2.5 / Math.max(0.0001, sy));
    const dash = [10 / Math.max(0.0001, sy), 6 / Math.max(0.0001, sy)];

    if (!this._finishLineNode) {
      const node = new Konva.Line({
        points: [fixedX, 0, fixedW, 0],
        x: 0,
        y: -levelEnd,
        stroke: '#f9a825',
        strokeWidth,
        dash,
        lineCap: 'round',
        lineJoin: 'round',
        listening: true,
        draggable: !this._panMode,
        id: 'finish-line',
        hitStrokeWidth: 28,
      });
      node.dragBoundFunc((pos) => ({ x: 0, y: pos.y }));
      const emit = () => ({ worldY: Math.round(-node.y()) });
      node.on('dragstart', () => {
        document.body.style.cursor = 'grabbing';
        this.onFinishLineDragStart?.(emit());
      });
      node.on('dragmove', () => {
        this.onFinishLineDragMove?.(emit());
      });
      node.on('dragend', () => {
        document.body.style.cursor = '';
        this.onFinishLineDragEnd?.(emit());
      });
      node.on('mouseenter', () => { document.body.style.cursor = 'ns-resize'; });
      node.on('mouseleave', () => { if (!node.isDragging()) document.body.style.cursor = ''; });
      this.finishWorldGroup.add(node);
      this._finishLineNode = node;
    }

    this._finishLineNode.points([fixedX, 0, fixedW, 0]);
    this._finishLineNode.y(-levelEnd);
    this._finishLineNode.strokeWidth(strokeWidth);
    this._finishLineNode.dash(dash);
    this._finishLineNode.draggable(!this._panMode);
    this._markLayerDirty(this.finishLayer);
  }

  clearFinishLine(): void {
    this._finishLineNode?.destroy();
    this._finishLineNode = null;
    this.finishWorldGroup?.destroyChildren();
    this._markLayerDirty(this.finishLayer);
  }

  clearMarks(): void {
    this._lastMarks             = null;
    this._lastSelectedMarkIndex = null;
    this.marksWorldGroup?.destroyChildren();
    this._markLayerDirty(this.marksLayer);
  }

  setBarriers(
    roadSegs: readonly { v0: number; v1: number; v2: number; v3: number }[],
    zoom: number,
    panY: number,
  ): void {
    if (!this.barrierWorldGroup || !this.barrierLayer) return;
    buildBarriers(
      this.barrierWorldGroup, this.barrierLayer, roadSegs,
      this._cssW, this._cssH, this._logicalW, this._logicalH, zoom, panY,
    );
    this._applyGroupTransform();
    this._markLayerDirty(this.barrierLayer);
  }

  clearBarriers(): void {
    this.barrierWorldGroup?.destroyChildren();
    this._barrierDrawPreviewLine = null;
    this._markLayerDirty(this.barrierLayer);
  }

  /**
   * Show or update the barrier draw preview line.
   * Points are interleaved [x0, y0, x1, y1, ...] in world coordinates
   * (world Y increases upward; the group transform handles the flip).
   */
  setBarrierDrawPreview(worldPoints: number[]): void {
    if (!this.barrierWorldGroup || !this.barrierLayer) return;
    const sx = this._zoom * (this._cssW / this._logicalW);
    if (!this._barrierDrawPreviewLine) {
      this._barrierDrawPreviewLine = new Konva.Line({
        stroke: 'rgba(0, 200, 255, 0.9)',
        strokeWidth: 3 / sx,
        listening: false,
        dash: [8 / sx, 4 / sx],
      });
      this.barrierWorldGroup.add(this._barrierDrawPreviewLine);
    }
    this._barrierDrawPreviewLine.strokeWidth(3 / sx);
    this._barrierDrawPreviewLine.dash([8 / sx, 4 / sx]);
    this._barrierDrawPreviewLine.points(worldPoints);
    this._barrierDrawPreviewLine.moveToTop();
    this._markLayerDirty(this.barrierLayer);
  }

  clearBarrierDrawPreview(): void {
    if (this._barrierDrawPreviewLine) {
      this._barrierDrawPreviewLine.destroy();
      this._barrierDrawPreviewLine = null;
      this._markLayerDirty(this.barrierLayer);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // FLUSH — call this ONCE at the end of the host's render function
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Synchronously draw all Konva layers that have been modified since the last flush().
   *
   * Dirty-layer tracking: each set*() method marks only the layer(s) it modifies.
   * _applyGroupTransform() marks ALL layers dirty whenever the pan/zoom transform
   * actually changes.  This avoids the cost of re-rendering unchanged layers every
   * frame (e.g. the objects layer while the user is only dragging a mark endpoint).
   *
   * Call this exactly once at the end of redrawObjectCanvas() (inside the
   * requestAnimationFrame callback) AFTER all set*() calls.  This keeps the
   * Konva canvas and the road 2-D canvas in the same compositor frame,
   * eliminating the one-frame "objects trail behind background" effect.
   */
  flush(): void {
    const t = profiler.start('konva.flush');
    if (this._dirtyLayers.size > 0) {
      for (const layer of this._dirtyLayers) layer.draw();
      this._dirtyLayers.clear();
    }
    t.end();
  }

  // Expose a code-level toggle for profiling (no UI).
  setProfilingEnabled(enabled: boolean): void { profiler.setEnabled(enabled); }
  isProfilingEnabled(): boolean { return profiler.enabled; }

  // ─────────────────────────────────────────────────────────────────────────
  // Offscreen background bitmap prototype
  // ─────────────────────────────────────────────────────────────────────────

  // background helpers moved to konva-editor.background.ts

  async setOffscreenBackground(
    drawFn: (ctx: CanvasRenderingContext2D, logicalW: number, logicalH: number) => void,
    desiredDpr?: number,
  ): Promise<void> {
    const t = profiler.start('konva.setOffscreenBackground');
    if (!this.stage || !this.bgImageNode || !this.bgLayer) { t.end(); return; }
    const dpr = desiredDpr ?? Math.max(1, Math.floor(window.devicePixelRatio || 1));
    this.bgBitmap = await _createOffscreenBitmap(drawFn, this._logicalW, this._logicalH, dpr);
    this.bgImageNode.image(this.bgBitmap);
    this.bgImageNode.width(this._logicalW);
    this.bgImageNode.height(this._logicalH);
    _applyBackgroundTransform(this.bgImageNode, this._zoom, this._panX, this._panY, this._cssW, this._cssH, this._logicalW, this._logicalH);
    this.bgLayer.draw();
    t.end();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // COORDINATE TRANSFORMS
  // ─────────────────────────────────────────────────────────────────────────

  /** World → Konva stage CSS-pixel. */
  worldToStage(wx: number, wy: number): [number, number] {
    const sx = this._cssW / this._logicalW;
    const sy = this._cssH / this._logicalH;
    return [
      this._cssW / 2 + (wx - this._panX) * this._zoom * sx,
      this._cssH / 2 - (wy - this._panY) * this._zoom * sy,
    ];
  }

  /** Konva stage CSS-pixel → world. */
  stageToWorld(stageX: number, stageY: number): [number, number] {
    const sx = this._cssW / this._logicalW;
    const sy = this._cssH / this._logicalH;
    const wx =   (stageX - this._cssW / 2) / (this._zoom * sx) + this._panX;
    const wy = -((stageY - this._cssH / 2) / (this._zoom * sy)) + this._panY;
    return [wx, wy];
  }

  // ─────────────────────────────────────────────────────────────────────────
  // LIFECYCLE
  // ─────────────────────────────────────────────────────────────────────────

  destroy(): void {
    this.stage?.destroy();
    this.stage                  = null;
    this.objectsLayer           = null;
    this.trackLayer             = null;
    this.marksLayer             = null;
    this.worldGroup             = null;
    this.trackWorldGroup        = null;
    this.marksWorldGroup        = null;
    this._lastObjects           = null;
    this._lastSelectedIndex     = null;
    this._lastVisibleTypes      = null;
    this._konvaObjNodes         = [];
    this._lastTrackUp           = null;
    this._lastTrackDown         = null;
    this._lastMarks             = null;
    this._lastSelectedMarkIndex = null;
    this.barrierLayer           = null;
    this.barrierWorldGroup      = null;
    this.finishLayer            = null;
    this.finishWorldGroup       = null;
    this._finishLineNode        = null;
    this._dirtyLayers.clear();
    this._lastGx = NaN; this._lastGy = NaN; this._lastSx = NaN; this._lastSy = NaN;
  }

  ngOnDestroy(): void { this.destroy(); }
}
