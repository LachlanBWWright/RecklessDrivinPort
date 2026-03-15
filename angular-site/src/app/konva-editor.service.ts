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

export interface KonvaDragEndEvent {
  index: number;
  worldX: number;
  worldY: number;
}

export interface KonvaWaypointDragEndEvent {
  track: 'up' | 'down';
  segIdx: number;
  worldX: number;
  worldY: number;
}

/** Union of node types added directly to worldGroup / trackWorldGroup. */
type KonvaWorldNode = Konva.Group | Konva.Circle;

/**
 * Waypoint radius in WORLD UNITS.  These scale with the zoom exactly like the road
 * so waypoints never appear disproportionately large or small.
 */
const WAYPOINT_WORLD_R       = 10;
/** Fallback circle radius in world units (shown when no sprite image is available). */
const FALLBACK_CIRCLE_WORLD_R = 14;

/** Reusable empty-set sentinel to avoid allocating a new Set on every setsEqual call. */
const EMPTY_SET = new Set<number>();

function setsEqual<T>(a: Set<T>, b: Set<T>): boolean {
  if (a.size !== b.size) return false;
  for (const item of a) { if (!b.has(item)) return false; }
  return true;
}

@Injectable({ providedIn: 'root' })
export class KonvaEditorService implements OnDestroy {

  // ── Konva tree ────────────────────────────────────────────────────────────
  private stage: Konva.Stage | null = null;
  private objectsLayer: Konva.Layer | null = null;
  private trackLayer: Konva.Layer | null = null;
  /** Group inside objectsLayer – transform = pan/zoom; children are at world coords. */
  private worldGroup: Konva.Group | null = null;
  /** Group inside trackLayer – same transform as worldGroup. */
  private trackWorldGroup: Konva.Group | null = null;

  // ── External callbacks ────────────────────────────────────────────────────
  onObjectDragEnd?: (e: KonvaDragEndEvent) => void;
  onObjectClick?: (index: number) => void;
  onWaypointDragEnd?: (e: KonvaWaypointDragEndEvent) => void;
  onWaypointRightClick?: (track: 'up' | 'down', segIdx: number, worldX: number, worldY: number) => void;
  onStageDblClick?: (worldX: number, worldY: number) => void;
  onStageRightClick?: (worldX: number, worldY: number) => void;

  /**
   * Fired when the user presses the mouse button on the stage (not on a node).
   * cssX/cssY are in Konva CSS-pixel coordinates (origin = top-left of stage).
   * button = MouseEvent.button value.
   */
  onStageMouseDown?: (cssX: number, cssY: number, button: number) => void;
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

  // ─────────────────────────────────────────────────────────────────────────
  // INIT / RESIZE / DESTROY
  // ─────────────────────────────────────────────────────────────────────────

  init(
    containerId: string,
    logicalW: number, logicalH: number,
    cssW: number,     cssH: number,
  ): void {
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
    this.worldGroup      = new Konva.Group();
    this.trackWorldGroup = new Konva.Group();

    this.objectsLayer.add(this.worldGroup);
    this.trackLayer.add(this.trackWorldGroup);
    this.stage.add(this.objectsLayer, this.trackLayer);

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
      this.onStageMouseDown?.(pos.x, pos.y, e.evt.button);
    });

    this.stage.on('mousemove', () => {
      const pos = this.stage?.getPointerPosition();
      if (!pos) return;
      this.onStageMouseMove?.(pos.x, pos.y);
    });

    this.stage.on('mouseup', (e) => {
      this.onStageMouseUp?.(e.evt.button);
    });
  }

  resize(cssW: number, cssH: number): void {
    if (!this.stage) return;
    if (cssW > 0) this._cssW = cssW;
    if (cssH > 0) this._cssH = cssH;
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
    this.worldGroup?.setAttrs({ x: gx, y: gy, scaleX: sx, scaleY: sy });
    this.trackWorldGroup?.setAttrs({ x: gx, y: gy, scaleX: sx, scaleY: sy });
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
    if (!this.worldGroup || !this.objectsLayer) return;
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
      return;
    }

    // Full rebuild
    this._lastObjects       = objects;
    this._lastSelectedIndex = selectedIndex;
    this._lastVisibleTypes  = new Set(visibleTypes);
    this.worldGroup.destroyChildren();
    this._konvaObjNodes = [];

    const PALETTE_LEN = paletteColors.length;
    const sx = zoom * (this._cssW / this._logicalW); // used for thin strokes

    objects.forEach((obj, i) => {
      const typeIdx = ((obj.typeRes % PALETTE_LEN) + PALETTE_LEN) % PALETTE_LEN;
      const visible = visibleTypes.has(typeIdx);
      if (!visible && i !== selectedIndex) return;

      const isSel = i === selectedIndex;
      const img   = getImageForType(obj.typeRes);

      let node: KonvaWorldNode;

      if (img instanceof HTMLCanvasElement || img instanceof HTMLImageElement) {
        const W = img.width;
        const H = img.height;
        // Objects placed at (worldX, −worldY) so world +Y = Konva −Y (up on screen)
        const group = new Konva.Group({
          x:         obj.x,
          y:         -obj.y,
          rotation:  (-obj.dir * 180) / Math.PI,
          draggable: !this._panMode,
          id:        `obj-${i}`,
        });
        group.add(new Konva.Image({
          image:   img,
          width:   W,
          height:  H,
          offsetX: W / 2,
          offsetY: H / 2,
          opacity: visible ? 1 : 0.3,
        }));
        if (isSel) {
          // Selection ring: radius in sprite-local pixels (not world units).
          // strokeWidth is in world units so it stays thin regardless of zoom.
          group.add(new Konva.Circle({
            radius:      Math.max(W, H) / 2 + 6,
            stroke:      '#ffffff',
            strokeWidth: 2 / sx,   // ~2 CSS pixels
            fill:        'transparent',
          }));
        }
        node = group;
      } else {
        // Fallback circle – radius in world units so it scales with the road
        const color = paletteColors[typeIdx] ?? '#888888';
        node = new Konva.Circle({
          x:           obj.x,
          y:           -obj.y,
          radius:      FALLBACK_CIRCLE_WORLD_R,
          fill:        isSel ? '#ffe082' : color,
          stroke:      isSel ? '#fff' : 'rgba(0,0,0,0.3)',
          strokeWidth: isSel ? 2 / sx : 1 / sx,
          opacity:     visible ? 1 : 0.3,
          draggable:   !this._panMode,
          id:          `obj-${i}`,
        });
      }

      const eventNode = node as Konva.Node;

      // dragend: node position is in group-local coords = world coords (Y negated)
      eventNode.on('dragend', () => {
        const wx = node.x();
        const wy = -node.y();
        this.onObjectDragEnd?.({ index: i, worldX: Math.round(wx), worldY: Math.round(wy) });
      });

      eventNode.on('click', (e: Konva.KonvaEventObject<MouseEvent>) => {
        e.cancelBubble = true;
        this.onObjectClick?.(i);
      });

      this.worldGroup?.add(node);
      this._konvaObjNodes.push(node);
    });

    this._applyGroupTransform();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TRACK WAYPOINTS
  // ─────────────────────────────────────────────────────────────────────────

  setTrackWaypoints(
    trackUp:   { x: number; y: number }[],
    trackDown: { x: number; y: number }[],
    zoom: number, panX: number, panY: number,
  ): void {
    if (!this.trackWorldGroup || !this.trackLayer) return;
    this._zoom = zoom; this._panX = panX; this._panY = panY;

    // Fast path: only transform changed, OR both new and previous were empty.
    const arraysUnchanged = (trackUp === this._lastTrackUp && trackDown === this._lastTrackDown);
    const bothEmpty = trackUp.length === 0 && trackDown.length === 0;
    const prevBothEmpty = (this._lastTrackUp?.length ?? -1) === 0 &&
                          (this._lastTrackDown?.length ?? -1) === 0;
    if (arraysUnchanged || (bothEmpty && prevBothEmpty)) {
      this._applyGroupTransform();
      return;
    }

    this._lastTrackUp   = trackUp;
    this._lastTrackDown = trackDown;
    this.trackWorldGroup.destroyChildren();

    const sx = zoom * (this._cssW / this._logicalW);

    const addWaypoints = (
      pts:   { x: number; y: number }[],
      track: 'up' | 'down',
      color: string,
    ): void => {
      pts.forEach((pt, i) => {
        const circle = new Konva.Circle({
          x:           pt.x,
          y:           -pt.y,   // world Y negated
          // WORLD-UNIT radius: scales proportionally with the road as you zoom
          radius:      WAYPOINT_WORLD_R,
          fill:        color,
          stroke:      'rgba(0,0,0,0.5)',
          strokeWidth: 1.5 / sx,  // thin stroke in CSS pixels
          draggable:   !this._panMode,
          id:          `wp-${track}-${i}`,
        });

        circle.on('dragend', () => {
          this.onWaypointDragEnd?.({
            track,
            segIdx: i,
            worldX: Math.round(circle.x()),
            worldY: Math.round(-circle.y()),
          });
        });

        circle.on('contextmenu', (e) => {
          e.evt.preventDefault();
          e.cancelBubble = true;
          this.onWaypointRightClick?.(track, i, circle.x(), -circle.y());
        });

        // Hover feedback: slightly enlarge and change stroke.
        // draw() (not flush) is used here because hover effects are independent
        // of the road canvas; they don't need frame-synchronisation with redrawObjectCanvas.
        circle.on('mouseenter', () => {
          circle.radius(WAYPOINT_WORLD_R * 1.4);
          circle.stroke('#fff');
          this.trackLayer?.draw();
          document.body.style.cursor = 'grab';
        });
        circle.on('mouseleave', () => {
          circle.radius(WAYPOINT_WORLD_R);
          circle.stroke('rgba(0,0,0,0.5)');
          this.trackLayer?.draw();
          document.body.style.cursor = '';
        });
        circle.on('dragstart', () => { document.body.style.cursor = 'grabbing'; });
        circle.on('dragend',   () => { document.body.style.cursor = ''; });

        this.trackWorldGroup?.add(circle);
      });
    };

    addWaypoints(trackUp,   'up',   '#42a5f5');
    addWaypoints(trackDown, 'down', '#ef5350');

    this._applyGroupTransform();
  }

  clearTrackWaypoints(): void {
    this._lastTrackUp   = null;
    this._lastTrackDown = null;
    this.trackWorldGroup?.destroyChildren();
    // Don't batchDraw here — flush() in redrawObjectCanvas() will draw synchronously.
  }

  // ─────────────────────────────────────────────────────────────────────────
  // FLUSH — call this ONCE at the end of the host's render function
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Synchronously draw all Konva layers.
   *
   * Call this exactly once at the end of redrawObjectCanvas() (inside the
   * requestAnimationFrame callback) AFTER all set*() calls.  This keeps the
   * Konva canvas and the road 2-D canvas in the same compositor frame,
   * eliminating the one-frame "objects trail behind background" effect.
   */
  flush(): void {
    this.objectsLayer?.draw();
    this.trackLayer?.draw();
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
    this.stage              = null;
    this.objectsLayer       = null;
    this.trackLayer         = null;
    this.worldGroup         = null;
    this.trackWorldGroup    = null;
    this._lastObjects       = null;
    this._lastSelectedIndex = null;
    this._lastVisibleTypes  = null;
    this._konvaObjNodes     = [];
    this._lastTrackUp       = null;
    this._lastTrackDown     = null;
  }

  ngOnDestroy(): void { this.destroy(); }
}
