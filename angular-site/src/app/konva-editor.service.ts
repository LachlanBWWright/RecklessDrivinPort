/** Konva scene graph for the editor overlays and their synchronized transforms. */
import { Injectable, OnDestroy } from '@angular/core';
import Konva from 'konva';
import type { ObjectPos } from './level-editor.service';
import { profiler } from './konva-editor.profiler';
import { EMPTY_SET, setsEqual } from './konva-editor.types';
import type {
  KonvaDragEndEvent,
  KonvaWaypointDragEndEvent,
  KonvaMarkDragEndEvent,
  KonvaFinishLineDragEvent,
  KonvaObjectRotateStartEvent,
  KonvaObjectRotateEvent,
  KonvaWorldNode,
} from './konva-editor.types';
import {
  applyBackgroundTransform as _applyBackgroundTransform,
  updateOffscreenBackground,
} from './konva-editor.background';
import { buildObjects } from './konva-editor.objects';
import { buildTrackWaypoints } from './konva-editor.track';
import { buildMarks } from './konva-editor.marks';
import { buildBarriers } from './konva-editor.barriers';
import { installStageEvents } from './konva-editor.stage-events';
import { updateFinishLine } from './konva-editor.finish-line';
import { updateBarrierPreview } from './konva-editor.barrier-preview';
import { stageToWorld, worldToStage } from './konva-editor.coordinates';
import { resizeStage } from './konva-editor.resize';
import { applyPanMode } from './konva-editor-pan-mode';
import { flushLayers } from './konva-editor-flush';

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
  onObjectRotateMove?: (e: KonvaObjectRotateEvent) => void;
  onObjectRotateStart?: (e: KonvaObjectRotateStartEvent) => void;
  onObjectRotateEnd?: (e: KonvaObjectRotateEvent) => void;
  onWaypointDragEnd?: (e: KonvaWaypointDragEndEvent) => void;
  onWaypointRightClick?: (
    track: 'up' | 'down',
    segIdx: number,
    worldX: number,
    worldY: number,
  ) => void;
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
  private _zoom = 1;
  private _panX = 0;
  private _panY = 0;
  private _logicalW = 640;
  private _logicalH = 480;
  private _cssW = 640;
  private _cssH = 480;

  // ── Dirty-layer tracking ───────────────────────────────────────────────────
  // Only layers that were modified since the last flush() are redrawn.
  // This avoids the cost of redrawing, e.g., the objects layer while the user
  // is only dragging a mark endpoint.
  private _dirtyLayers = new Set<Konva.Layer>();
  /** Last applied group-transform values; used to skip redundant setAttrs calls. */
  private _lastGx = NaN;
  private _lastGy = NaN;
  private _lastSx = NaN;
  private _lastSy = NaN;

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
  private _lastTrackUp: readonly { x: number; y: number }[] | null = null;
  private _lastTrackDown: readonly { x: number; y: number }[] | null = null;

  // ── Marks-layer cache ─────────────────────────────────────────────────────
  private _lastMarks: readonly { x1: number; y1: number; x2: number; y2: number }[] | null = null;
  private _lastSelectedMarkIndex: number | null = null;

  // ─────────────────────────────────────────────────────────────────────────
  // INIT / RESIZE / DESTROY
  // ─────────────────────────────────────────────────────────────────────────

  init(containerId: string, logicalW: number, logicalH: number, cssW: number, cssH: number): void {
    const t = profiler.start('konva.init');
    this.destroy();

    this._logicalW = logicalW;
    this._logicalH = logicalH;
    this._cssW = cssW > 0 ? cssW : logicalW;
    this._cssH = cssH > 0 ? cssH : logicalH;

    this.stage = new Konva.Stage({
      container: containerId,
      width: this._cssW,
      height: this._cssH,
    });

    this.objectsLayer = new Konva.Layer();
    this.trackLayer = new Konva.Layer();
    this.marksLayer = new Konva.Layer();
    this.finishLayer = new Konva.Layer();
    this.worldGroup = new Konva.Group();
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
    this.stage.add(
      this.bgLayer,
      this.objectsLayer,
      this.trackLayer,
      this.marksLayer,
      this.finishLayer,
    );

    this.barrierLayer = new Konva.Layer();
    this.barrierWorldGroup = new Konva.Group();
    this.barrierLayer.add(this.barrierWorldGroup);
    this.stage.add(this.barrierLayer);

    installStageEvents(this.stage, (x, y) => this.stageToWorld(x, y), this);
    t.end();
  }

  resize(cssW: number, cssH: number): void {
    const state = {
      logicalW: this._logicalW,
      logicalH: this._logicalH,
      cssW: this._cssW,
      cssH: this._cssH,
    };
    resizeStage(this.stage, this.bgImageNode, state, cssW, cssH, () => {
      this._logicalW = state.logicalW;
      this._logicalH = state.logicalH;
      this._cssW = state.cssW;
      this._cssH = state.cssH;
      this._applyGroupTransform();
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TRANSFORM UPDATE  (O(1) per pan/zoom event)
  // ─────────────────────────────────────────────────────────────────────────

  setTransform(zoom: number, panX: number, panY: number): void {
    this._zoom = zoom;
    this._panX = panX;
    this._panY = panY;
    this._applyGroupTransform();
  }

  private _applyGroupTransform(): void {
    const sx = this._zoom * (this._cssW / this._logicalW);
    const sy = this._zoom * (this._cssH / this._logicalH);
    const gx = this._cssW / 2 - this._panX * sx;
    const gy = this._cssH / 2 + this._panY * sy;
    if (gx !== this._lastGx || gy !== this._lastGy || sx !== this._lastSx || sy !== this._lastSy) {
      this._lastGx = gx;
      this._lastGy = gy;
      this._lastSx = sx;
      this._lastSy = sy;
      this.updateWorldGroups(gx, gy, sx, sy);
      // keep background image transform in sync as well
      _applyBackgroundTransform(
        this.bgImageNode,
        this._zoom,
        this._panX,
        this._panY,
        this._cssW,
        this._cssH,
        this._logicalW,
        this._logicalH,
      );
      // All layers need redraw when the transform changes
      this._markAllLayersDirty();
    }
  }

  private updateWorldGroups(x: number, y: number, scaleX: number, scaleY: number): void {
    const attrs = { x, y, scaleX, scaleY };
    this.worldGroup?.setAttrs(attrs);
    this.trackWorldGroup?.setAttrs(attrs);
    this.marksWorldGroup?.setAttrs(attrs);
    this.barrierWorldGroup?.setAttrs(attrs);
    this.finishWorldGroup?.setAttrs(attrs);
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
    applyPanMode(
      isPan,
      this._konvaObjNodes,
      this.trackWorldGroup,
      this.marksWorldGroup,
      this._finishLineNode,
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // OBJECTS
  // ─────────────────────────────────────────────────────────────────────────

  setObjects(
    objects: ObjectPos[],
    selectedIndex: number | null,
    visibleTypes: Set<number>,
    paletteColors: string[],
    getImageForType: (typeRes: number) => CanvasImageSource | null,
    zoom: number,
    panX: number,
    panY: number,
  ): void {
    const t = profiler.start('konva.setObjects');
    if (!this.worldGroup || !this.objectsLayer) {
      t.end();
      return;
    }
    this._zoom = zoom;
    this._panX = panX;
    this._panY = panY;

    // Treat any empty array as equivalent to a "no objects" state regardless
    // of reference identity, so toggling showObjects() doesn't trigger a full
    // rebuild every frame.
    const prevEmpty = this._lastObjects !== null && this._lastObjects.length === 0;
    const currEmpty = objects.length === 0;
    const objsUnchanged = objects === this._lastObjects || (prevEmpty && currEmpty);
    const selUnchanged = selectedIndex === this._lastSelectedIndex;
    const visUnchanged = setsEqual(visibleTypes, this._lastVisibleTypes ?? EMPTY_SET);

    // Fast path: only pan/zoom changed – just update the group transform.
    if (objsUnchanged && selUnchanged && visUnchanged) {
      this._applyGroupTransform();
      t.end();
      return;
    }

    // Full rebuild — delegate to objects module
    this._lastObjects = objects;
    this._lastSelectedIndex = selectedIndex;
    this._lastVisibleTypes = new Set(visibleTypes);
    const result = buildObjects(
      this.worldGroup,
      this.objectsLayer,
      objects,
      selectedIndex,
      visibleTypes,
      paletteColors,
      getImageForType,
      this._panMode,
      this._cssW,
      this._cssH,
      this._logicalW,
      this._logicalH,
      zoom,
      (idx, wx, wy) => this.onObjectDragEnd?.({ index: idx, worldX: wx, worldY: wy }),
      (idx) => this.onObjectClick?.(idx),
      (idx) => this.onObjectRotateStart?.({ index: idx }),
      (idx, worldDir) => this.onObjectRotateMove?.({ index: idx, worldDir }),
      (idx, worldDir) => this.onObjectRotateEnd?.({ index: idx, worldDir }),
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
    trackUp: { x: number; y: number }[],
    trackDown: { x: number; y: number }[],
    zoom: number,
    panX: number,
    panY: number,
  ): void {
    const t = profiler.start('konva.setTrackWaypoints');
    if (!this.trackWorldGroup || !this.trackLayer) {
      t.end();
      return;
    }
    this._zoom = zoom;
    this._panX = panX;
    this._panY = panY;

    // Fast path: only transform changed, OR both new and previous were empty.
    const arraysUnchanged = trackUp === this._lastTrackUp && trackDown === this._lastTrackDown;
    const bothEmpty = trackUp.length === 0 && trackDown.length === 0;
    const previousUpIsEmpty = (this._lastTrackUp?.length ?? 0) === 0;
    const previousDownIsEmpty = (this._lastTrackDown?.length ?? 0) === 0;
    const prevBothEmpty = previousUpIsEmpty && previousDownIsEmpty;
    if (arraysUnchanged || (bothEmpty && prevBothEmpty)) {
      this._applyGroupTransform();
      t.end();
      return;
    }

    this._lastTrackUp = trackUp;
    this._lastTrackDown = trackDown;

    buildTrackWaypoints(
      this.trackWorldGroup,
      this.trackLayer,
      trackUp,
      trackDown,
      this._panMode,
      this._cssW,
      this._cssH,
      this._logicalW,
      this._logicalH,
      zoom,
      (track, segIdx, wx, wy) =>
        this.onWaypointDragEnd?.({ track, segIdx, worldX: wx, worldY: wy }),
      (track, segIdx, wx, wy) => this.onWaypointRightClick?.(track, segIdx, wx, wy),
      (track, segIdx) => this.onWaypointDoubleClick?.(track, segIdx),
    );

    this._applyGroupTransform();
    this._markLayerDirty(this.trackLayer);
    t.end();
  }

  clearTrackWaypoints(): void {
    this._lastTrackUp = null;
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
  moveTrackWaypointDirect(
    track: 'up' | 'down',
    segIdx: number,
    worldX: number,
    worldY: number,
  ): void {
    if (!this.trackWorldGroup || !this.trackLayer) return;
    const node = this.trackWorldGroup.findOne(`#wp-${track}-${segIdx}`) as Konva.Circle | undefined;
    if (node) {
      node.x(worldX);
      node.y(-worldY);
      // Invalidate the cache reference so the next setTrackWaypoints call fully rebuilds.
      if (track === 'up') this._lastTrackUp = null;
      else this._lastTrackDown = null;
      this._markLayerDirty(this.trackLayer);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // MARK SEGMENTS (checkpoint lines)
  // ─────────────────────────────────────────────────────────────────────────

  setMarks(
    marks: readonly { x1: number; y1: number; x2: number; y2: number }[],
    selectedMarkIndex: number | null,
    zoom: number,
    panX: number,
    panY: number,
  ): void {
    const t = profiler.start('konva.setMarks');
    if (!this.marksWorldGroup || !this.marksLayer) {
      t.end();
      return;
    }
    this._zoom = zoom;
    this._panX = panX;
    this._panY = panY;

    const marksUnchanged =
      marks === this._lastMarks || (marks.length === 0 && (this._lastMarks?.length ?? 0) === 0);
    const selUnchanged = selectedMarkIndex === this._lastSelectedMarkIndex;

    if (marksUnchanged && selUnchanged) {
      this._applyGroupTransform();
      t.end();
      return;
    }

    this._lastMarks = marks;
    this._lastSelectedMarkIndex = selectedMarkIndex;

    buildMarks(
      this.marksWorldGroup,
      this.marksLayer,
      marks,
      selectedMarkIndex,
      this._panMode,
      this._cssW,
      this._cssH,
      this._logicalW,
      this._logicalH,
      zoom,
      (markIdx, endpoint, wx, wy) =>
        this.onMarkEndpointDragEnd?.({ markIdx, endpoint, worldX: wx, worldY: wy }),
      (markIdx) => this.onMarkClick?.(markIdx),
    );

    this._applyGroupTransform();
    this._markLayerDirty(this.marksLayer);
    t.end();
  }

  setFinishLine(levelEnd: number, zoom: number, panX: number, panY: number): void {
    void panX;
    void panY;
    if (!this.finishWorldGroup || !this.finishLayer) return;
    this._finishLineNode = updateFinishLine(
      this.finishWorldGroup,
      this.finishLayer,
      this._finishLineNode,
      levelEnd,
      zoom,
      this._cssH,
      this._logicalW,
      this._logicalH,
      this._panMode,
      {
        onStart: (worldY) => this.onFinishLineDragStart?.({ worldY }),
        onMove: (worldY) => this.onFinishLineDragMove?.({ worldY }),
        onEnd: (worldY) => this.onFinishLineDragEnd?.({ worldY }),
      },
    );
    this._markLayerDirty(this.finishLayer);
  }

  clearFinishLine(): void {
    this._finishLineNode?.destroy();
    this._finishLineNode = null;
    this.finishWorldGroup?.destroyChildren();
    this._markLayerDirty(this.finishLayer);
  }

  clearMarks(): void {
    this._lastMarks = null;
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
      this.barrierWorldGroup,
      this.barrierLayer,
      roadSegs,
      this._cssW,
      this._cssH,
      this._logicalW,
      this._logicalH,
      zoom,
      panY,
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
    this._barrierDrawPreviewLine = updateBarrierPreview(
      this.barrierWorldGroup,
      this.barrierLayer,
      this._barrierDrawPreviewLine,
      worldPoints,
      sx,
    );
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

  flush(): void {
    flushLayers(this._dirtyLayers);
  }

  readonly setProfilingEnabled = (enabled: boolean): void => profiler.setEnabled(enabled);
  readonly isProfilingEnabled = (): boolean => profiler.enabled;

  // ─────────────────────────────────────────────────────────────────────────
  // Offscreen background bitmap prototype
  // ─────────────────────────────────────────────────────────────────────────

  // background helpers moved to konva-editor.background.ts

  async setOffscreenBackground(
    drawFn: (ctx: CanvasRenderingContext2D, logicalW: number, logicalH: number) => void,
    desiredDpr?: number,
  ): Promise<void> {
    const t = profiler.start('konva.setOffscreenBackground');
    this.bgBitmap =
      (await updateOffscreenBackground(
        this.stage,
        this.bgImageNode,
        this.bgLayer,
        this._logicalW,
        this._logicalH,
        this._zoom,
        this._panX,
        this._panY,
        this._cssW,
        this._cssH,
        drawFn,
        desiredDpr,
      )) ?? null;
    t.end();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // COORDINATE TRANSFORMS
  // ─────────────────────────────────────────────────────────────────────────

  /** World → Konva stage CSS-pixel. */
  worldToStage(wx: number, wy: number): [number, number] {
    return worldToStage(
      wx,
      wy,
      this._zoom,
      this._panX,
      this._panY,
      this._cssW,
      this._cssH,
      this._logicalW,
      this._logicalH,
    );
  }

  /** Konva stage CSS-pixel → world. */
  stageToWorld(stageX: number, stageY: number): [number, number] {
    return stageToWorld(
      stageX,
      stageY,
      this._zoom,
      this._panX,
      this._panY,
      this._cssW,
      this._cssH,
      this._logicalW,
      this._logicalH,
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // LIFECYCLE
  // ─────────────────────────────────────────────────────────────────────────

  destroy(): void {
    this.stage?.destroy();
    this.stage = null;
    this.objectsLayer = null;
    this.trackLayer = null;
    this.marksLayer = null;
    this.worldGroup = null;
    this.trackWorldGroup = null;
    this.marksWorldGroup = null;
    this._lastObjects = null;
    this._lastSelectedIndex = null;
    this._lastVisibleTypes = null;
    this._konvaObjNodes = [];
    this._lastTrackUp = null;
    this._lastTrackDown = null;
    this._lastMarks = null;
    this._lastSelectedMarkIndex = null;
    this.barrierLayer = null;
    this.barrierWorldGroup = null;
    this.finishLayer = null;
    this.finishWorldGroup = null;
    this._finishLineNode = null;
    this._dirtyLayers.clear();
    this._lastGx = NaN;
    this._lastGy = NaN;
    this._lastSx = NaN;
    this._lastSy = NaN;
  }

  ngOnDestroy(): void {
    this.destroy();
  }
}
