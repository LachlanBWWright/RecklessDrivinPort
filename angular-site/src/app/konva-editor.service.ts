/**
 * KonvaEditorService
 *
 * Manages a Konva.Stage that overlays the object-canvas element.
 * Konva handles:
 *   - Object sprite nodes (draggable)  → emits objectMoved events
 *   - Track waypoint circles (draggable) → emits waypointMoved events
 *
 * The background road/grid is still rendered by app.ts on the plain 2-D canvas
 * underneath; Konva sits on top with a transparent background.
 *
 * Coordinate system bridging:
 *   worldToStage(wx, wy)  → Konva stage pixel position
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

@Injectable({ providedIn: 'root' })
export class KonvaEditorService implements OnDestroy {
  private stage: Konva.Stage | null = null;
  private roadLayer: Konva.Layer | null = null;
  private objectsLayer: Konva.Layer | null = null;
  private trackLayer: Konva.Layer | null = null;

  /** Callbacks set by the consumer (app.ts) */
  onObjectDragEnd?: (e: KonvaDragEndEvent) => void;
  onObjectClick?: (index: number) => void;
  onObjectDblClick?: (worldX: number, worldY: number) => void;
  onWaypointDragEnd?: (e: KonvaWaypointDragEndEvent) => void;
  onWaypointRightClick?: (track: 'up' | 'down', segIdx: number, worldX: number, worldY: number) => void;
  onStageDblClick?: (worldX: number, worldY: number) => void;
  onStageRightClick?: (worldX: number, worldY: number) => void;

  // Current transform params
  private _zoom = 1;
  private _panX = 0;
  private _panY = 0;
  private _W = 900;
  private _H = 700;

  private _imgCache = new Map<number, HTMLImageElement>();

  /**
   * Initialise (or re-initialise) the Konva stage on top of the canvas element.
   * Call after the canvas DOM element is ready.
   */
  init(containerId: string, width: number, height: number): void {
    this.destroy();

    this.stage = new Konva.Stage({
      container: containerId,
      width,
      height,
    });

    // Transparent background – road drawn on plain canvas behind
    this.roadLayer  = new Konva.Layer({ listening: false });
    this.objectsLayer = new Konva.Layer();
    this.trackLayer   = new Konva.Layer();

    this.stage.add(this.roadLayer);
    this.stage.add(this.objectsLayer);
    this.stage.add(this.trackLayer);

    this._W = width;
    this._H = height;

    // Double-click on stage background adds object
    this.stage.on('dblclick', (e) => {
      if (e.target !== this.stage) return;
      const pos = this.stage!.getPointerPosition();
      if (!pos) return;
      const [wx, wy] = this.stageToWorld(pos.x, pos.y);
      this.onStageDblClick?.(wx, wy);
    });

    // Right-click on stage background
    this.stage.on('contextmenu', (e) => {
      e.evt.preventDefault();
      if (e.target !== this.stage) return;
      const pos = this.stage!.getPointerPosition();
      if (!pos) return;
      const [wx, wy] = this.stageToWorld(pos.x, pos.y);
      this.onStageRightClick?.(wx, wy);
    });
  }

  /** Update zoom/pan and re-transform all layers. */
  setTransform(zoom: number, panX: number, panY: number): void {
    this._zoom = zoom;
    this._panX = panX;
    this._panY = panY;
    // Update all draggable nodes' positions (object layer + track layer)
    // The transform is applied via explicit x/y on each node; we do not use
    // stage.scale/offset to keep the background canvas in sync.
  }

  /** Resize the Konva stage to match the canvas element. */
  resize(width: number, height: number): void {
    if (!this.stage) return;
    this._W = width;
    this._H = height;
    this.stage.width(width);
    this.stage.height(height);
  }

  // ──────────────────────────────────────────────
  // OBJECTS
  // ──────────────────────────────────────────────

  /** Replace all object nodes on the objects layer. */
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

    objects.forEach((obj, i) => {
      const typeIdx = ((obj.typeRes % PALETTE_LEN) + PALETTE_LEN) % PALETTE_LEN;
      const visible = visibleTypes.has(typeIdx);
      if (!visible && i !== selectedIndex) return;

      const [sx, sy] = this.worldToStage(obj.x, obj.y);
      const img = getImageForType(obj.typeRes);

      // size based on zoom (minimum 16px)
      const SIZE = Math.max(16, 36 * zoom);
      const isSel = i === selectedIndex;

      let node: Konva.Node;

      if (img) {
        const group = new Konva.Group({
          x: sx,
          y: sy,
          offsetX: 0,
          offsetY: 0,
          rotation: (-obj.dir * 180) / Math.PI,
          draggable: true,
          id: `obj-${i}`,
        });

        const imgNode = new Konva.Image({
          // Konva.Image accepts any CanvasImageSource (HTMLImageElement, HTMLCanvasElement, etc.)
          // but the Konva type definitions require HTMLImageElement; cast is safe here.
          image: img as HTMLImageElement,
          width: SIZE,
          height: SIZE,
          offsetX: SIZE / 2,
          offsetY: SIZE / 2,
          opacity: visible ? 1 : 0.3,
        });

        group.add(imgNode);

        if (isSel) {
          const ring = new Konva.Circle({
            radius: SIZE / 2 + 4,
            stroke: '#ffffff',
            strokeWidth: 2,
            fill: 'transparent',
          });
          group.add(ring);
        }

        node = group;
      } else {
        const color = paletteColors[typeIdx];
        const circle = new Konva.Circle({
          x: sx,
          y: sy,
          radius: Math.max(8, 12 * zoom),
          fill: isSel ? '#ffe082' : color,
          stroke: isSel ? '#fff' : 'rgba(0,0,0,0.3)',
          strokeWidth: isSel ? 2 : 1,
          opacity: visible ? 1 : 0.3,
          draggable: true,
          id: `obj-${i}`,
        });
        node = circle;
      }

      node.on('dragend', () => {
        const pos = node.getAbsolutePosition();
        const [wx, wy] = this.stageToWorld(pos.x, pos.y);
        this.onObjectDragEnd?.({ index: i, worldX: Math.round(wx), worldY: Math.round(wy) });
      });

      node.on('click', (e) => {
        e.cancelBubble = true;
        this.onObjectClick?.(i);
      });

      this.objectsLayer!.add(node as any);
    });

    this.objectsLayer.batchDraw();
  }

  /** Update a single object's position (called during drag for live feedback). */
  updateObjectPosition(index: number, worldX: number, worldY: number): void {
    const node = this.objectsLayer?.findOne(`#obj-${index}`);
    if (!node) return;
    const [sx, sy] = this.worldToStage(worldX, worldY);
    node.x(sx);
    node.y(sy);
    this.objectsLayer?.batchDraw();
  }

  // ──────────────────────────────────────────────
  // TRACK WAYPOINTS
  // ──────────────────────────────────────────────

  setTrackWaypoints(
    trackUp: {x: number, y: number}[],
    trackDown: {x: number, y: number}[],
    zoom: number,
    panX: number,
    panY: number,
  ): void {
    if (!this.trackLayer) return;
    this._zoom = zoom;
    this._panX = panX;
    this._panY = panY;

    this.trackLayer.destroyChildren();

    const R = Math.max(6, 8 * zoom);

    const addWaypoints = (pts: {x: number, y: number}[], track: 'up' | 'down', color: string) => {
      pts.forEach((pt, i) => {
        const [sx, sy] = this.worldToStage(pt.x, pt.y);
        const circle = new Konva.Circle({
          x: sx,
          y: sy,
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

        // Hover effect
        circle.on('mouseenter', () => {
          circle.radius(R + 3);
          circle.stroke('#fff');
          circle.strokeWidth(2);
          this.trackLayer!.batchDraw();
          document.body.style.cursor = 'grab';
        });
        circle.on('mouseleave', () => {
          circle.radius(R);
          circle.stroke('rgba(0,0,0,0.5)');
          circle.strokeWidth(1);
          this.trackLayer!.batchDraw();
          document.body.style.cursor = '';
        });
        circle.on('dragstart', () => {
          document.body.style.cursor = 'grabbing';
        });

        this.trackLayer!.add(circle);
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

  worldToStage(wx: number, wy: number): [number, number] {
    const sx = this._W / 2 + (wx - this._panX) * this._zoom;
    const sy = this._H / 2 - (wy - this._panY) * this._zoom; // Y flip
    return [sx, sy];
  }

  stageToWorld(sx: number, sy: number): [number, number] {
    const wx = (sx - this._W / 2) / this._zoom + this._panX;
    const wy = -(sy - this._H / 2) / this._zoom + this._panY;
    return [wx, wy];
  }

  // ──────────────────────────────────────────────
  // LIFECYCLE
  // ──────────────────────────────────────────────

  destroy(): void {
    this.stage?.destroy();
    this.stage = null;
    this.roadLayer = null;
    this.objectsLayer = null;
    this.trackLayer = null;
  }

  ngOnDestroy(): void {
    this.destroy();
  }
}
