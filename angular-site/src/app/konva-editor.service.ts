/**
 * KonvaEditorService
 *
 * Manages a Konva.Stage that overlays the object-canvas element.
 *
 * COORDINATE SYSTEM:
 *   The HTML canvas element may be CSS-scaled (width:100%) so its CSS display size
 *   differs from its logical pixel dimensions (canvas.width/height). The Konva
 *   container must match the CSS display size, and coordinate transforms must apply
 *   the ratio (cssWidth / logicalWidth) to properly align Konva nodes with canvas drawings.
 *
 *   worldToStage(wx, wy)  → Konva stage CSS-pixel position
 *   stageToWorld(sx, sy)  → world position
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

/** Union of the layer-child types accepted by Konva.Layer.add() */
type KonvaLayerChild = Konva.Group | Konva.Circle;

/** Minimum rendered size (CSS px) for object icons at any zoom level. */
const MIN_OBJECT_SIZE    = 14;
/** Minimum rendered radius (CSS px) for fallback circles when no sprite is available. */
const MIN_CIRCLE_RADIUS  = 7;
/** Base multiplier for fallback circle radius. */
const BASE_CIRCLE_RADIUS = 11;
/** Minimum rendered radius (CSS px) for track waypoint circles. */
const MIN_WAYPOINT_RADIUS  = 5;
/** Base multiplier for waypoint circle radius. */
const BASE_WAYPOINT_RADIUS = 7;

@Injectable({ providedIn: 'root' })
export class KonvaEditorService implements OnDestroy {
  private stage: Konva.Stage | null = null;
  private objectsLayer: Konva.Layer | null = null;
  private trackLayer: Konva.Layer | null = null;

  // Callbacks set by app.ts
  onObjectDragEnd?: (e: KonvaDragEndEvent) => void;
  onObjectClick?: (index: number) => void;
  onWaypointDragEnd?: (e: KonvaWaypointDragEndEvent) => void;
  onWaypointRightClick?: (track: 'up' | 'down', segIdx: number, worldX: number, worldY: number) => void;
  onStageDblClick?: (worldX: number, worldY: number) => void;
  onStageRightClick?: (worldX: number, worldY: number) => void;

  private _zoom = 1;
  private _panX = 0;
  private _panY = 0;

  /** Logical canvas pixel dimensions (canvas.width / canvas.height). */
  private _logicalW = 900;
  private _logicalH = 700;

  /** CSS display pixel dimensions (from getBoundingClientRect on the canvas). */
  private _cssW = 900;
  private _cssH = 700;

  /**
   * Initialise or re-initialise the Konva stage.
   * @param containerId  ID of the Konva container div (already in DOM)
   * @param logicalW     canvas.width  (logical pixels)
   * @param logicalH     canvas.height (logical pixels)
   * @param cssW         getBoundingClientRect().width  of the canvas element
   * @param cssH         getBoundingClientRect().height of the canvas element
   */
  init(containerId: string, logicalW: number, logicalH: number, cssW: number, cssH: number): void {
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
    this.trackLayer   = new Konva.Layer();
    this.stage.add(this.objectsLayer, this.trackLayer);

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

  setTransform(zoom: number, panX: number, panY: number): void {
    this._zoom = zoom;
    this._panX = panX;
    this._panY = panY;
  }

  /** Update after a CSS resize event so the stage stays in sync with the canvas. */
  resize(cssW: number, cssH: number): void {
    if (!this.stage) return;
    if (cssW > 0) this._cssW = cssW;
    if (cssH > 0) this._cssH = cssH;
    this.stage.width(this._cssW);
    this.stage.height(this._cssH);
  }

  // ──────────────────────────────────────────────
  // OBJECTS
  // ──────────────────────────────────────────────

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
    if (!this.objectsLayer) return;
    this._zoom = zoom;
    this._panX = panX;
    this._panY = panY;

    this.objectsLayer.destroyChildren();

    const PALETTE_LEN = paletteColors.length;
    const scaleX = this._cssW / this._logicalW;
    const scaleY = this._cssH / this._logicalH;

    objects.forEach((obj, i) => {
      const typeIdx = ((obj.typeRes % PALETTE_LEN) + PALETTE_LEN) % PALETTE_LEN;
      const visible = visibleTypes.has(typeIdx);
      if (!visible && i !== selectedIndex) return;

      const [sx, sy] = this.worldToStage(obj.x, obj.y);
      const isSel = i === selectedIndex;
      const img = getImageForType(obj.typeRes);

      // Scale: sprite dimensions (in logical canvas pixels at zoom=1) × zoom × CSS scale.
      // This matches the main canvas which draws at preview.width * canvasZoom logical px.
      let node: KonvaLayerChild;

      if (img instanceof HTMLCanvasElement || img instanceof HTMLImageElement) {
        // Use the actual sprite pixel dimensions rather than a fixed BASE_OBJECT_SIZE.
        const spriteW = img.width;
        const spriteH = img.height;
        const W = Math.max(MIN_OBJECT_SIZE, spriteW * zoom * scaleX);
        const H = Math.max(MIN_OBJECT_SIZE, spriteH * zoom * scaleY);
        const group = new Konva.Group({
          x: sx,
          y: sy,
          rotation: (-obj.dir * 180) / Math.PI,
          draggable: true,
          id: `obj-${i}`,
        });
        group.add(new Konva.Image({
          image: img,
          width: W,
          height: H,
          offsetX: W / 2,
          offsetY: H / 2,
          opacity: visible ? 1 : 0.3,
        }));
        if (isSel) {
          group.add(new Konva.Circle({
            radius: Math.max(W, H) / 2 + 5,
            stroke: '#ffffff',
            strokeWidth: 2,
            fill: 'transparent',
          }));
        }
        node = group;
      } else {
        const color = paletteColors[typeIdx] ?? '#888888';
        node = new Konva.Circle({
          x: sx,
          y: sy,
          radius: Math.max(MIN_CIRCLE_RADIUS, BASE_CIRCLE_RADIUS * zoom * scaleX),
          fill: isSel ? '#ffe082' : color,
          stroke: isSel ? '#fff' : 'rgba(0,0,0,0.3)',
          strokeWidth: isSel ? 2 : 1,
          opacity: visible ? 1 : 0.3,
          draggable: true,
          id: `obj-${i}`,
        });
      }

      const eventNode = node as Konva.Node;
      eventNode.on('dragend', () => {
        const pos = node.getAbsolutePosition();
        const [wx, wy] = this.stageToWorld(pos.x, pos.y);
        this.onObjectDragEnd?.({ index: i, worldX: Math.round(wx), worldY: Math.round(wy) });
      });
      eventNode.on('click', (e: Konva.KonvaEventObject<MouseEvent>) => {
        e.cancelBubble = true;
        this.onObjectClick?.(i);
      });

      this.objectsLayer?.add(node);
    });

    this.objectsLayer.batchDraw();
  }

  // ──────────────────────────────────────────────
  // TRACK WAYPOINTS
  // ──────────────────────────────────────────────

  setTrackWaypoints(
    trackUp: { x: number; y: number }[],
    trackDown: { x: number; y: number }[],
    zoom: number,
    panX: number,
    panY: number,
  ): void {
    if (!this.trackLayer) return;
    this._zoom = zoom;
    this._panX = panX;
    this._panY = panY;

    this.trackLayer.destroyChildren();

    const scaleX = this._cssW / this._logicalW;
    const R = Math.max(MIN_WAYPOINT_RADIUS, BASE_WAYPOINT_RADIUS * zoom * scaleX);

    const addWaypoints = (pts: { x: number; y: number }[], track: 'up' | 'down', color: string): void => {
      pts.forEach((pt, i) => {
        const [sx, sy] = this.worldToStage(pt.x, pt.y);
        const circle = new Konva.Circle({
          x: sx, y: sy,
          radius: R,
          fill: color,
          stroke: 'rgba(0,0,0,0.5)',
          strokeWidth: 1,
          draggable: true,
          id: `wp-${track}-${i}`,
        });

        circle.on('dragend', () => {
          const pos = circle.getAbsolutePosition();
          const [wx, wy] = this.stageToWorld(pos.x, pos.y);
          this.onWaypointDragEnd?.({ track, segIdx: i, worldX: Math.round(wx), worldY: Math.round(wy) });
        });
        circle.on('contextmenu', (e) => {
          e.evt.preventDefault();
          e.cancelBubble = true;
          const pos = circle.getAbsolutePosition();
          const [wx, wy] = this.stageToWorld(pos.x, pos.y);
          this.onWaypointRightClick?.(track, i, wx, wy);
        });
        circle.on('mouseenter', () => {
          circle.radius(R + 3);
          circle.stroke('#fff');
          circle.strokeWidth(2);
          this.trackLayer?.batchDraw();
          document.body.style.cursor = 'grab';
        });
        circle.on('mouseleave', () => {
          circle.radius(R);
          circle.stroke('rgba(0,0,0,0.5)');
          circle.strokeWidth(1);
          this.trackLayer?.batchDraw();
          document.body.style.cursor = '';
        });
        circle.on('dragstart', () => { document.body.style.cursor = 'grabbing'; });
        circle.on('dragend',   () => { document.body.style.cursor = ''; });

        this.trackLayer?.add(circle);
      });
    };

    addWaypoints(trackUp,   'up',   '#42a5f5');
    addWaypoints(trackDown, 'down', '#ef5350');
    this.trackLayer.batchDraw();
  }

  clearTrackWaypoints(): void {
    this.trackLayer?.destroyChildren();
    this.trackLayer?.batchDraw();
  }

  // ──────────────────────────────────────────────
  // COORDINATE TRANSFORMS
  // ──────────────────────────────────────────────

  /**
   * World → Konva stage CSS-pixel coordinates.
   *
   * Mirrors worldToCanvas() in app.ts (which produces logical canvas pixels),
   * then scales by (cssW / logicalW) so the Konva stage position matches what the
   * canvas draws at its CSS display size.
   */
  worldToStage(wx: number, wy: number): [number, number] {
    const scaleX = this._cssW / this._logicalW;
    const scaleY = this._cssH / this._logicalH;
    // Logical canvas pixels (same formula as app.ts worldToCanvas)
    const lx = this._logicalW / 2 + (wx - this._panX) * this._zoom;
    const ly = this._logicalH / 2 - (wy - this._panY) * this._zoom;
    return [lx * scaleX, ly * scaleY];
  }

  /** Konva stage CSS-pixel coordinates → world coordinates. */
  stageToWorld(sx: number, sy: number): [number, number] {
    const scaleX = this._cssW / this._logicalW;
    const scaleY = this._cssH / this._logicalH;
    // CSS stage pixels → logical canvas pixels
    const lx = sx / scaleX;
    const ly = sy / scaleY;
    // Logical canvas pixels → world
    const wx = (lx - this._logicalW / 2) / this._zoom + this._panX;
    const wy = -(ly - this._logicalH / 2) / this._zoom + this._panY;
    return [wx, wy];
  }

  // ──────────────────────────────────────────────
  // LIFECYCLE
  // ──────────────────────────────────────────────

  destroy(): void {
    this.stage?.destroy();
    this.stage = null;
    this.objectsLayer = null;
    this.trackLayer = null;
  }

  ngOnDestroy(): void {
    this.destroy();
  }
}
