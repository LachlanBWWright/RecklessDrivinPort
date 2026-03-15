/**
 * KonvaEditorService
 *
 * Manages a Konva.Stage that overlays the object-canvas element.
 *
 * COORDINATE SYSTEM — "world groups" approach:
 *   All objects and waypoints are placed inside a Konva.Group (worldGroup / trackWorldGroup)
 *   at their FIXED world coordinates.  Pan and zoom are applied to the GROUP transform, NOT
 *   to individual nodes.  This means:
 *
 *     • Panning / zooming → O(1) – only 4 group properties change
 *     • Object list change → O(n) rebuild (destroys & recreates nodes)
 *
 *   The group transform is:
 *     scaleX  = zoom * (cssW / logicalW)
 *     scaleY  = zoom * (cssH / logicalH)
 *     x       = cssW/2  -  panX * zoom * (cssW / logicalW)
 *     y       = cssH/2  +  panY * zoom * (cssH / logicalH)   ← + because worldY-up → KonvaY-down
 *
 *   Objects are placed at (worldX, -worldY) inside the group so that world +Y points UP on screen.
 *
 *   stageToWorld(sx, sy) converts stage CSS-pixel coords to world coords.
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

/** Union of node types added directly to worldGroup/trackWorldGroup. */
type KonvaWorldNode = Konva.Group | Konva.Circle;

/** Fixed screen-pixel radius for track waypoints (counter-scaled to stay constant on zoom). */
const WAYPOINT_SCREEN_R = 7;
/** Fixed screen-pixel radius for fallback circles when no sprite is available. */
const CIRCLE_SCREEN_R   = 11;
/** Minimum screen-pixel radius for waypoints. */
const MIN_WP_SCREEN_R   = 5;
/** Minimum screen-pixel radius for fallback circles. */
const MIN_CIRC_SCREEN_R = 7;

/** Reusable empty set sentinel to avoid allocating a new Set on every setsEqual call. */
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

  // ── Callbacks ─────────────────────────────────────────────────────────────
  onObjectDragEnd?: (e: KonvaDragEndEvent) => void;
  onObjectClick?: (index: number) => void;
  onWaypointDragEnd?: (e: KonvaWaypointDragEndEvent) => void;
  onWaypointRightClick?: (track: 'up' | 'down', segIdx: number, worldX: number, worldY: number) => void;
  onStageDblClick?: (worldX: number, worldY: number) => void;
  onStageRightClick?: (worldX: number, worldY: number) => void;

  // ── Transform state ───────────────────────────────────────────────────────
  private _zoom  = 1;
  private _panX  = 0;
  private _panY  = 0;
  private _logicalW = 640;
  private _logicalH = 480;
  private _cssW     = 640;
  private _cssH     = 480;

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
      width: this._cssW,
      height: this._cssH,
    });

    this.objectsLayer   = new Konva.Layer();
    this.trackLayer     = new Konva.Layer();
    this.worldGroup     = new Konva.Group();
    this.trackWorldGroup = new Konva.Group();

    this.objectsLayer.add(this.worldGroup);
    this.trackLayer.add(this.trackWorldGroup);
    this.stage.add(this.objectsLayer, this.trackLayer);

    // Stage-level events (clicks on empty space)
    this.stage.on('dblclick', (e) => {
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
  }

  resize(cssW: number, cssH: number): void {
    if (!this.stage) return;
    if (cssW > 0) this._cssW = cssW;
    if (cssH > 0) this._cssH = cssH;
    this.stage.width(this._cssW);
    this.stage.height(this._cssH);
    // Reapply transform so group stays aligned with the canvas
    this._applyGroupTransform();
    this.objectsLayer?.batchDraw();
    this.trackLayer?.batchDraw();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TRANSFORM UPDATE  (O(1) per pan/zoom event)
  // ─────────────────────────────────────────────────────────────────────────

  setTransform(zoom: number, panX: number, panY: number): void {
    this._zoom = zoom;
    this._panX = panX;
    this._panY = panY;
    this._applyGroupTransform();
    this._updateCounterScaledNodes();
    this.objectsLayer?.batchDraw();
    this.trackLayer?.batchDraw();
  }

  /**
   * Apply the current pan/zoom to both world groups.
   *
   * Group transform maps world coords (with Y negated) to stage CSS pixels:
   *   stage_x = x + worldX  * scaleX  =  cssW/2 + (worldX - panX) * zoom * (cssW/logicalW)
   *   stage_y = y + (-worldY)* scaleY  =  cssH/2 - (worldY - panY) * zoom * (cssH/logicalH)
   */
  private _applyGroupTransform(): void {
    const scaleX = this._cssW / this._logicalW;
    const scaleY = this._cssH / this._logicalH;
    const gx = this._cssW  / 2 - this._panX * this._zoom * scaleX;
    const gy = this._cssH  / 2 + this._panY * this._zoom * scaleY;
    const sx = this._zoom * scaleX;
    const sy = this._zoom * scaleY;

    this.worldGroup?.setAttrs({ x: gx, y: gy, scaleX: sx, scaleY: sy });
    this.trackWorldGroup?.setAttrs({ x: gx, y: gy, scaleX: sx, scaleY: sy });
  }

  /**
   * Update the radii of all nodes that have a fixed screen-pixel size.
   * Called on every setTransform so that waypoints / fallback circles appear constant.
   */
  private _updateCounterScaledNodes(): void {
    const groupScaleX = this._zoom * (this._cssW / this._logicalW);
    if (groupScaleX === 0) return;

    // Fallback circles in object world group
    for (const node of this._konvaObjNodes) {
      if (node instanceof Konva.Circle) {
        node.radius(Math.max(MIN_CIRC_SCREEN_R, CIRCLE_SCREEN_R) / groupScaleX);
      }
      // Selection ring inside groups - leave it scaled with the sprite
    }

    // Waypoints in track world group
    if (this.trackWorldGroup) {
      const R = Math.max(MIN_WP_SCREEN_R, WAYPOINT_SCREEN_R) / groupScaleX;
      for (const node of this.trackWorldGroup.children as Konva.Circle[]) {
        node.radius(R);
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // OBJECTS
  // ─────────────────────────────────────────────────────────────────────────

  setObjects(
    objects:       ObjectPos[],
    selectedIndex: number | null,
    visibleTypes:  Set<number>,
    paletteColors: string[],
    getImageForType: (typeRes: number) => CanvasImageSource | null,
    zoom: number, panX: number, panY: number,
  ): void {
    if (!this.worldGroup || !this.objectsLayer) return;
    this._zoom = zoom; this._panX = panX; this._panY = panY;

    const objsUnchanged = objects         === this._lastObjects;
    const selUnchanged  = selectedIndex   === this._lastSelectedIndex;
    const visUnchanged  = setsEqual(visibleTypes, this._lastVisibleTypes ?? EMPTY_SET);

    // Fast path: only pan/zoom changed – just update the group transform.
    // We take this path whenever objects/selection/visibility are unchanged,
    // even when there are no nodes (nothing to reposition either way).
    if (objsUnchanged && selUnchanged && visUnchanged) {
      this._applyGroupTransform();
      this._updateCounterScaledNodes();
      this.objectsLayer.batchDraw();
      return;
    }

    // Full rebuild
    this._lastObjects       = objects;
    this._lastSelectedIndex = selectedIndex;
    this._lastVisibleTypes  = new Set(visibleTypes);
    this.worldGroup.destroyChildren();
    this._konvaObjNodes = [];

    const PALETTE_LEN = paletteColors.length;
    const groupScaleX = zoom * (this._cssW / this._logicalW);

    objects.forEach((obj, i) => {
      const typeIdx = ((obj.typeRes % PALETTE_LEN) + PALETTE_LEN) % PALETTE_LEN;
      const visible = visibleTypes.has(typeIdx);
      if (!visible && i !== selectedIndex) return;

      const isSel  = i === selectedIndex;
      const img    = getImageForType(obj.typeRes);

      let node: KonvaWorldNode;

      if (img instanceof HTMLCanvasElement || img instanceof HTMLImageElement) {
        // Objects placed at (worldX, -worldY) so that world +Y → Konva -Y (up on screen)
        // Image at intrinsic pixel size; group scale handles the zoom factor.
        const W = img.width;
        const H = img.height;
        const group = new Konva.Group({
          x:          obj.x,
          y:          -obj.y,
          rotation:   (-obj.dir * 180) / Math.PI,
          draggable:  true,
          id:         `obj-${i}`,
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
          // Ring proportional to sprite (scales with zoom, visually consistent)
          group.add(new Konva.Circle({
            radius:      Math.max(W, H) / 2 + 6,
            stroke:      '#ffffff',
            strokeWidth: 2 / groupScaleX,
            fill:        'transparent',
          }));
        }
        node = group;
      } else {
        // Fallback circle: fixed screen-pixel radius (counter-scaled on zoom change)
        const color = paletteColors[typeIdx] ?? '#888888';
        const R = Math.max(MIN_CIRC_SCREEN_R, CIRCLE_SCREEN_R) / groupScaleX;
        node = new Konva.Circle({
          x:           obj.x,
          y:           -obj.y,
          radius:      R,
          fill:        isSel ? '#ffe082' : color,
          stroke:      isSel ? '#fff' : 'rgba(0,0,0,0.3)',
          strokeWidth: isSel ? 2 / groupScaleX : 1 / groupScaleX,
          opacity:     visible ? 1 : 0.3,
          draggable:   true,
          id:          `obj-${i}`,
        });
      }

      const eventNode = node as Konva.Node;

      // dragend: node.x/y are in group-local coords = world coords (Y negated)
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
    this.objectsLayer.batchDraw();
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

    // Fast path: reference equality means only transform changed
    // (same Signal semantics as object cache above)
    if (trackUp === this._lastTrackUp && trackDown === this._lastTrackDown &&
        this.trackWorldGroup.children.length > 0) {
      this._applyGroupTransform();
      this._updateCounterScaledNodes();
      this.trackLayer.batchDraw();
      return;
    }

    this._lastTrackUp   = trackUp;
    this._lastTrackDown = trackDown;
    this.trackWorldGroup.destroyChildren();

    const groupScaleX = zoom * (this._cssW / this._logicalW);
    const R = Math.max(MIN_WP_SCREEN_R, WAYPOINT_SCREEN_R) / groupScaleX;

    const addWaypoints = (pts: { x: number; y: number }[], track: 'up' | 'down', color: string): void => {
      pts.forEach((pt, i) => {
        const circle = new Konva.Circle({
          x:           pt.x,
          y:           -pt.y,   // world Y flipped
          radius:      R,
          fill:        color,
          stroke:      'rgba(0,0,0,0.5)',
          strokeWidth: 1 / groupScaleX,
          draggable:   true,
          id:          `wp-${track}-${i}`,
        });

        circle.on('dragend', () => {
          const wx = circle.x();
          const wy = -circle.y();
          this.onWaypointDragEnd?.({ track, segIdx: i, worldX: Math.round(wx), worldY: Math.round(wy) });
        });

        circle.on('contextmenu', (e) => {
          e.evt.preventDefault();
          e.cancelBubble = true;
          const wx = circle.x();
          const wy = -circle.y();
          this.onWaypointRightClick?.(track, i, wx, wy);
        });

        // Hover highlight: increase radius by a fixed screen amount
        circle.on('mouseenter', () => {
          const gs = this._zoom * (this._cssW / this._logicalW);
          circle.radius(Math.max(MIN_WP_SCREEN_R, WAYPOINT_SCREEN_R + 3) / gs);
          circle.stroke('#fff');
          circle.strokeWidth(2 / gs);
          this.trackLayer?.batchDraw();
          document.body.style.cursor = 'grab';
        });
        circle.on('mouseleave', () => {
          const gs = this._zoom * (this._cssW / this._logicalW);
          circle.radius(Math.max(MIN_WP_SCREEN_R, WAYPOINT_SCREEN_R) / gs);
          circle.stroke('rgba(0,0,0,0.5)');
          circle.strokeWidth(1 / gs);
          this.trackLayer?.batchDraw();
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
    this.trackLayer.batchDraw();
  }

  clearTrackWaypoints(): void {
    this._lastTrackUp   = null;
    this._lastTrackDown = null;
    this.trackWorldGroup?.destroyChildren();
    this.trackLayer?.batchDraw();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // COORDINATE TRANSFORMS
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * World → Konva stage CSS-pixel coordinates.
   * (Used for stage-level click events, not for placing nodes which use world coords directly.)
   */
  worldToStage(wx: number, wy: number): [number, number] {
    const scaleX = this._cssW / this._logicalW;
    const scaleY = this._cssH / this._logicalH;
    return [
      this._cssW / 2 + (wx - this._panX) * this._zoom * scaleX,
      this._cssH / 2 - (wy - this._panY) * this._zoom * scaleY,
    ];
  }

  /** Konva stage CSS-pixel coordinates → world coordinates. */
  stageToWorld(sx: number, sy: number): [number, number] {
    const scaleX = this._cssW / this._logicalW;
    const scaleY = this._cssH / this._logicalH;
    const wx =   (sx - this._cssW / 2) / (this._zoom * scaleX) + this._panX;
    const wy = -((sy - this._cssH / 2) / (this._zoom * scaleY)) + this._panY;
    return [wx, wy];
  }

  // ─────────────────────────────────────────────────────────────────────────
  // LIFECYCLE
  // ─────────────────────────────────────────────────────────────────────────

  destroy(): void {
    this.stage?.destroy();
    this.stage             = null;
    this.objectsLayer      = null;
    this.trackLayer        = null;
    this.worldGroup        = null;
    this.trackWorldGroup   = null;
    this._lastObjects      = null;
    this._lastSelectedIndex = null;
    this._lastVisibleTypes = null;
    this._konvaObjNodes    = [];
    this._lastTrackUp      = null;
    this._lastTrackDown    = null;
  }

  ngOnDestroy(): void {
    this.destroy();
  }
}
