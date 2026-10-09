import type {
  ObjectGroupSpawnPreviewObject,
  TrackMidpointRef,
  TrackWaypointRef,
} from './level-editor.service';
import { worldDirToCanvasRotationRad } from './object-direction-utils';
import type { App } from './app';
export {
  drawMarksOnCanvas,
  drawObjectRoadPreviewCached,
  drawObjectTrackOverlay,
} from './app-helpers';
export {
  addObject,
  applyObjEdit,
  duplicateSelectedObject,
  getObjectTypeDimensionLabelForApp as getObjectTypeDimensionLabel,
  hideAllObjectTypes,
  insertBetweenClosestSegment,
  insertWaypointAfter,
  onObjDirDegInput,
  onObjTypeResChange,
  removeSelectedObject,
  saveLevelObjects,
  saveTrack,
  selectObject,
  showAllObjectTypes,
  toggleTypeVisibility,
} from './object-canvas-editing';
import { insertBetweenClosestSegment, selectObject } from './object-canvas-editing';

export interface RoadTheme {
  bg: string;
  road: string;
  dirt: string;
  kerbA: string;
  kerbB: string;
  water: boolean;
}

export const OBJ_PALETTE = [
  '#e53935',
  '#42a5f5',
  '#66bb6a',
  '#ffa726',
  '#ab47bc',
  '#26c6da',
  '#d4e157',
  '#ff7043',
  '#8d6e63',
  '#78909c',
  '#ec407a',
  '#29b6f6',
];

export const PLAYER_CAR_TYPE_RES = 128;

export const ROAD_THEMES: Record<number, RoadTheme> = {
  128: {
    bg: '#0f7d1e',
    road: '#848484',
    dirt: '#4a6830',
    kerbA: '#6b8066',
    kerbB: '#d4e8d0',
    water: false,
  },
  129: {
    bg: '#8f4e28',
    road: '#bf8460',
    dirt: '#7a4a2a',
    kerbA: '#9f764b',
    kerbB: '#d9b888',
    water: false,
  },
  130: {
    bg: '#354ab5',
    road: '#505090',
    dirt: '#3a3a6e',
    kerbA: '#4c4c9e',
    kerbB: '#c0c0ff',
    water: false,
  },
  131: {
    bg: '#b8dde0',
    road: '#98aeb0',
    dirt: '#8099a0',
    kerbA: '#aacccc',
    kerbB: '#ffffff',
    water: false,
  },
  132: {
    bg: '#b8dde0',
    road: '#98aeb0',
    dirt: '#8099a0',
    kerbA: '#6b8066',
    kerbB: '#d4e8d0',
    water: false,
  },
  133: {
    bg: '#0a7a1e',
    road: '#354ab5',
    dirt: '#2a6050',
    kerbA: '#207b44',
    kerbB: '#30bb66',
    water: true,
  },
  134: {
    bg: '#5e5a5c',
    road: '#848484',
    dirt: '#4a4648',
    kerbA: '#606060',
    kerbB: '#c0c0c0',
    water: false,
  },
  135: {
    bg: '#354ab5',
    road: '#d8c830',
    dirt: '#555580',
    kerbA: '#b8b050',
    kerbB: '#ffff88',
    water: false,
  },
  136: {
    bg: '#0a7a1e',
    road: '#a06840',
    dirt: '#4a6830',
    kerbA: '#5a7034',
    kerbB: '#99cc44',
    water: false,
  },
};

export const DEFAULT_ROAD_THEME: RoadTheme = ROAD_THEMES[128];

export const MIN_HIT_RADIUS = 10;
export const BASE_HIT_RADIUS = 8;
export const MIN_START_MARKER_HIT_RADIUS = 14;
export const BASE_START_MARKER_HIT_RADIUS = 10;

export function getObjectCanvas(): HTMLCanvasElement | null {
  const element = document.getElementById('object-canvas');
  return element instanceof HTMLCanvasElement ? element : null;
}

export function getKonvaContainer(): HTMLElement | null {
  const element = document.getElementById('konva-container');
  return element instanceof HTMLElement ? element : null;
}

export function drawObjectGroupSpawnPreviewObjects(
  ctx: CanvasRenderingContext2D,
  app: App,
  previewObjects: readonly ObjectGroupSpawnPreviewObject[],
  width: number,
  height: number,
  zoom: number,
  visibleTypes: ReadonlySet<number>,
): void {
  if (previewObjects.length === 0) {
    return;
  }

  const fallbackRadius = Math.min(20, Math.max(6, 8 * zoom));
  const badgeFont = `${Math.max(9, 10 * zoom)}px monospace`;

  ctx.save();
  ctx.font = badgeFont;
  for (const previewObject of previewObjects) {
    const typeIdx =
      ((previewObject.typeRes % OBJ_PALETTE.length) + OBJ_PALETTE.length) % OBJ_PALETTE.length;
    if (!visibleTypes.has(typeIdx)) {
      continue;
    }

    const [cx, cy] = worldToCanvas(app, previewObject.x, previewObject.y);
    if (cx < -60 || cx > width + 60 || cy < -60 || cy > height + 60) {
      continue;
    }

    const accent = OBJ_PALETTE[previewObject.slotIndex % OBJ_PALETTE.length] ?? '#80deea';
    const spritePreview = app.getObjectSpritePreview(previewObject.typeRes);
    const drawWidth = spritePreview
      ? Math.max(MIN_HIT_RADIUS * 2, spritePreview.width * zoom)
      : fallbackRadius * 2.4;
    const drawHeight = spritePreview
      ? Math.max(MIN_HIT_RADIUS * 2, spritePreview.height * zoom)
      : fallbackRadius * 2.4;

    if (spritePreview) {
      ctx.save();
      ctx.globalAlpha = 0.72;
      ctx.translate(cx, cy);
      ctx.rotate(worldDirToCanvasRotationRad(previewObject.dir));
      ctx.drawImage(spritePreview, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
      ctx.restore();
    } else {
      ctx.save();
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.arc(cx, cy, fallbackRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.save();
    ctx.strokeStyle = accent;
    ctx.lineWidth = Math.max(1.5, zoom * 1.5);
    ctx.setLineDash([5, 3]);
    ctx.strokeRect(cx - drawWidth / 2 - 2, cy - drawHeight / 2 - 2, drawWidth + 4, drawHeight + 4);
    ctx.restore();

    const badgeText = `S${previewObject.slotIndex}`;
    const badgeWidth = ctx.measureText(badgeText).width + 8;
    const badgeX = cx - badgeWidth / 2;
    const badgeY = cy - drawHeight / 2 - 16;
    ctx.fillStyle = 'rgba(9, 12, 18, 0.86)';
    ctx.fillRect(badgeX, badgeY, badgeWidth, 12);
    ctx.fillStyle = accent;
    ctx.fillText(badgeText, badgeX + 4, badgeY + 9);
  }
  ctx.restore();
}

export function dist2d(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}

export function distToSegment2d(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return dist2d(px, py, ax, ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  return dist2d(px, py, ax + t * dx, ay + t * dy);
}

export function drawMarkingRangeOverlay(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  worldToCanvasY: (worldY: number) => number,
  range: { yStart: number; yEnd: number },
  palette: { stroke: string; fill: string },
): void {
  const start = Math.min(range.yStart, range.yEnd);
  const end = Math.max(range.yStart, range.yEnd);
  const startY = worldToCanvasY(start);
  const endY = worldToCanvasY(end);
  const x = width - 12;
  const markerW = 12;
  const markerH = 7;
  const labelOffset = 20;
  const clampedStartY = Math.max(10, Math.min(height - 10, startY));
  const clampedEndY = Math.max(10, Math.min(height - 10, endY));

  const drawMarker = (y: number, value: number, offscreen: 'none' | 'top' | 'bottom') => {
    ctx.beginPath();
    if (offscreen === 'top') {
      ctx.moveTo(x, y - markerH);
      ctx.lineTo(x + markerW, y - markerH);
      ctx.lineTo(x + markerW / 2, y);
    } else if (offscreen === 'bottom') {
      ctx.moveTo(x, y + markerH);
      ctx.lineTo(x + markerW, y + markerH);
      ctx.lineTo(x + markerW / 2, y);
    } else {
      ctx.moveTo(x, y);
      ctx.lineTo(x + markerW, y - markerH);
      ctx.lineTo(x + markerW, y + markerH);
    }
    ctx.closePath();
    ctx.fill();

    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(value), x - labelOffset, y);
  };

  ctx.save();
  ctx.font = '11px monospace';
  ctx.strokeStyle = palette.stroke;
  ctx.fillStyle = palette.fill;
  ctx.lineWidth = 2;

  if (Math.abs(clampedEndY - clampedStartY) > 10) {
    ctx.beginPath();
    ctx.moveTo(x - 6, clampedStartY);
    ctx.lineTo(x - 6, clampedEndY);
    ctx.stroke();
  }

  drawMarker(clampedStartY, start, startY < 0 ? 'top' : startY > height ? 'bottom' : 'none');
  drawMarker(clampedEndY, end, endY < 0 ? 'top' : endY > height ? 'bottom' : 'none');
  ctx.restore();
}

export function worldToCanvas(app: App, wx: number, wy: number): [number, number] {
  const canvas = getObjectCanvas();
  const width = canvas?.width ?? 600;
  const height = canvas?.height ?? 500;
  return [
    width / 2 + (wx - app.canvasPanX()) * app.canvasZoom(),
    height / 2 - (wy - app.canvasPanY()) * app.canvasZoom(),
  ];
}

export function getCanvasScale(): number {
  const canvas = getObjectCanvas();
  if (!canvas) return 1;
  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0) return 1;
  return canvas.width / rect.width;
}

export function canvasToWorld(app: App, cx: number, cy: number): [number, number] {
  const canvas = getObjectCanvas();
  const width = canvas?.width ?? 600;
  const height = canvas?.height ?? 500;
  const scale = getCanvasScale();
  const lx = cx * scale;
  const ly = cy * scale;
  return [
    (lx - width / 2) / app.canvasZoom() + app.canvasPanX(),
    -(ly - height / 2) / app.canvasZoom() + app.canvasPanY(),
  ];
}

export function onCanvasMouseDown(app: App, event: MouseEvent): void {
  event.preventDefault();
  const isPanningGesture = event.button === 1 || (event.button === 0 && app.spaceDown());
  if (isPanningGesture) {
    app._isPanning = true;
    app.isPanning.set(true);
    app._prevPanMouseX = event.offsetX;
    app._prevPanMouseY = event.offsetY;
    return;
  }

  const [wx, wy] = app.canvasToWorld(event.offsetX, event.offsetY);
  if (app.drawMode() !== 'none') {
    app.selectedObjIndex.set(null);
    return;
  }
  const objs = app.objects();
  const hitRadius = Math.max(MIN_HIT_RADIUS, BASE_HIT_RADIUS / app.canvasZoom());

  if (app.showTrackOverlay()) {
    const trackUp = app.editTrackUp();
    const trackDown = app.editTrackDown();
    const trackHitR = Math.max(12, 10 / app.canvasZoom());
    for (let i = 0; i < trackUp.length; i++) {
      if (dist2d(trackUp[i].x, trackUp[i].y, wx, wy) < trackHitR) {
        app.dragTrackWaypoint.set({ track: 'up', segIdx: i });
        app.selectedObjIndex.set(null);
        getObjectCanvas()?.focus();
        return;
      }
    }
    for (let i = 0; i < trackDown.length; i++) {
      if (dist2d(trackDown[i].x, trackDown[i].y, wx, wy) < trackHitR) {
        app.dragTrackWaypoint.set({ track: 'down', segIdx: i });
        app.selectedObjIndex.set(null);
        getObjectCanvas()?.focus();
        return;
      }
    }
    const midHitR = Math.max(14, 12 / app.canvasZoom());
    for (let i = 0; i < trackUp.length - 1; i++) {
      const mx = (trackUp[i].x + trackUp[i + 1].x) / 2;
      const my = (trackUp[i].y + trackUp[i + 1].y) / 2;
      if (dist2d(mx, my, wx, wy) < midHitR) {
        app._insertWaypointAfter('up', i);
        return;
      }
    }
    for (let i = 0; i < trackDown.length - 1; i++) {
      const mx = (trackDown[i].x + trackDown[i + 1].x) / 2;
      const my = (trackDown[i].y + trackDown[i + 1].y) / 2;
      if (dist2d(mx, my, wx, wy) < midHitR) {
        app._insertWaypointAfter('down', i);
        return;
      }
    }
  }

  const startHitR = Math.max(
    MIN_START_MARKER_HIT_RADIUS,
    BASE_START_MARKER_HIT_RADIUS / app.canvasZoom(),
  );
  if (dist2d(app.editXStartPos(), 0, wx, wy) < startHitR) {
    app._beginStartMarkerDrag(event.target);
    return;
  }

  let closest = -1;
  let closestDist = hitRadius;
  for (let i = 0; i < objs.length; i++) {
    const d = dist2d(objs[i].x, objs[i].y, wx, wy);
    if (d < closestDist) {
      closestDist = d;
      closest = i;
    }
  }
  if (closest >= 0) {
    selectObject(app, closest);
    app.isDragging.set(true);
    app.dragObjIndex.set(closest);
    app._objectDragUndoCaptured = false;
  } else {
    app.selectedObjIndex.set(null);
  }
  getObjectCanvas()?.focus();
}

export function onCanvasMouseMove(app: App, event: MouseEvent): void {
  if (app._isPanning) {
    const zoom = app.canvasZoom();
    const dx = event.offsetX - app._prevPanMouseX;
    const dy = event.offsetY - app._prevPanMouseY;
    app._prevPanMouseX = event.offsetX;
    app._prevPanMouseY = event.offsetY;
    app.canvasPanX.set(app.canvasPanX() - dx / zoom);
    app.canvasPanY.set(app.canvasPanY() - dy / zoom);
    return;
  }

  const twp = app.dragTrackWaypoint();
  if (twp) {
    const [wx, wy] = app.canvasToWorld(event.offsetX, event.offsetY);
    const rx = Math.round(wx);
    const ry = Math.round(wy);
    app._pendingWaypointDragPos = { x: rx, y: ry };
    app.konva.moveTrackWaypointDirect(twp.track, twp.segIdx, rx, ry);
    return;
  }

  if (app._draggingStartMarker) {
    if (!app._startMarkerDragUndoCaptured) {
      app._pushUndo('props');
      app._startMarkerDragUndoCaptured = true;
    }
    const [wx] = app.canvasToWorld(event.offsetX, event.offsetY);
    app.editXStartPos.set(Math.round(wx));
    app.markPropertiesDirty();
    return;
  }

  if (!app.isDragging()) {
    if (app.drawMode() !== 'none') {
      app.hoverTrackWaypoint.set(null);
      app.hoverTrackMidpoint.set(null);
      return;
    }
    if (app.showTrackOverlay() && !app._hoverRafPending) {
      app._hoverRafPending = true;
      const evX = event.offsetX;
      const evY = event.offsetY;
      window.requestAnimationFrame(() => {
        app._hoverRafPending = false;
        const [wx, wy] = app.canvasToWorld(evX, evY);
        const trackHitR = Math.max(12, 10 / app.canvasZoom());
        let found: TrackWaypointRef | null = null;
        for (let i = 0; i < app.editTrackUp().length && !found; i++) {
          const s = app.editTrackUp()[i];
          if (dist2d(s.x, s.y, wx, wy) < trackHitR) found = { track: 'up', segIdx: i };
        }
        for (let i = 0; i < app.editTrackDown().length && !found; i++) {
          const s = app.editTrackDown()[i];
          if (dist2d(s.x, s.y, wx, wy) < trackHitR) found = { track: 'down', segIdx: i };
        }
        const prev = app.hoverTrackWaypoint();
        if (found?.track !== prev?.track || found?.segIdx !== prev?.segIdx) {
          app.hoverTrackWaypoint.set(found);
        }

        let foundMid: TrackMidpointRef | null = null;
        if (!found) {
          const midHitR = Math.max(14, 12 / app.canvasZoom());
          const upSegs = app.editTrackUp();
          for (let i = 0; i < upSegs.length - 1 && !foundMid; i++) {
            const mx = (upSegs[i].x + upSegs[i + 1].x) / 2;
            const my = (upSegs[i].y + upSegs[i + 1].y) / 2;
            if (dist2d(mx, my, wx, wy) < midHitR) foundMid = { track: 'up', segIdx: i };
          }
          const downSegs = app.editTrackDown();
          for (let i = 0; i < downSegs.length - 1 && !foundMid; i++) {
            const mx = (downSegs[i].x + downSegs[i + 1].x) / 2;
            const my = (downSegs[i].y + downSegs[i + 1].y) / 2;
            if (dist2d(mx, my, wx, wy) < midHitR) foundMid = { track: 'down', segIdx: i };
          }
        }

        const prevMid = app.hoverTrackMidpoint();
        if (foundMid?.track !== prevMid?.track || foundMid?.segIdx !== prevMid?.segIdx) {
          app.hoverTrackMidpoint.set(foundMid);
        }
      });
    }
    return;
  }

  const dragIdx = app.dragObjIndex();
  if (dragIdx === null) return;
  const [wx, wy] = app.canvasToWorld(event.offsetX, event.offsetY);
  if (!app._objectDragUndoCaptured) {
    app._pushUndo('objects');
    app._objectDragUndoCaptured = true;
  }
  const objs = [...app.objects()];
  objs[dragIdx] = { ...objs[dragIdx], x: Math.round(wx), y: Math.round(wy) };
  app.objects.set(objs);
  app.editObjX.set(Math.round(wx));
  app.editObjY.set(Math.round(wy));
}

export function onCanvasMouseUp(app: App): void {
  if (app._isPanning) {
    app._isPanning = false;
    app.isPanning.set(false);
    return;
  }

  if (app.dragTrackWaypoint()) {
    const twp = app.dragTrackWaypoint();
    const pos = app._pendingWaypointDragPos;
    if (twp && pos) {
      app._pushUndo('tracks');
      if (twp.track === 'up') {
        const arr = [...app.editTrackUp()];
        arr[twp.segIdx] = { ...arr[twp.segIdx], x: pos.x, y: pos.y };
        app.editTrackUp.set(arr);
      } else {
        const arr = [...app.editTrackDown()];
        arr[twp.segIdx] = { ...arr[twp.segIdx], x: pos.x, y: pos.y };
        app.editTrackDown.set(arr);
      }
      app._pendingWaypointDragPos = null;
    }
    app.dragTrackWaypoint.set(null);
    return;
  }

  if (app._draggingStartMarker || app._draggingFinishLine) {
    app._draggingStartMarker = false;
    app._draggingFinishLine = false;
    app._startMarkerDragUndoCaptured = false;
    app._finishLineDragUndoCaptured = false;
    app._objectRotateDragUndoCaptured = false;
    return;
  }

  app.isDragging.set(false);
  app.dragObjIndex.set(null);
  app._objectDragUndoCaptured = false;
}

export function onCanvasDoubleClick(app: App, event: MouseEvent): void {
  if (app.markCreateMode() || app.drawMode() !== 'none') return;
  const [wx, wy] = app.canvasToWorld(event.offsetX, event.offsetY);
  const objs = [...app.objects()];
  app._pushUndo('objects');
  objs.push({ x: Math.round(wx), y: Math.round(wy), dir: 0, typeRes: app.placementObjTypeRes() });
  app.objects.set(objs);
  selectObject(app, objs.length - 1);
}

export function onCanvasContextMenu(app: App, event: MouseEvent): void {
  if (app.drawMode() !== 'none') return;
  if (!app.showTrackOverlay()) return;
  const [wx, wy] = app.canvasToWorld(event.offsetX, event.offsetY);
  const trackUp = app.editTrackUp();
  const trackDown = app.editTrackDown();
  const trackHitR = Math.max(20, 14 / app.canvasZoom());
  for (let i = 0; i < trackUp.length; i++) {
    if (dist2d(trackUp[i].x, trackUp[i].y, wx, wy) < trackHitR) {
      app._pushUndo('tracks');
      app.editTrackUp.set(
        trackUp.filter(
          (_: { x: number; y: number; flags: number; velo: number }, j: number) => j !== i,
        ),
      );
      app._roadOffscreenKey = '';
      return;
    }
  }
  for (let i = 0; i < trackDown.length; i++) {
    if (dist2d(trackDown[i].x, trackDown[i].y, wx, wy) < trackHitR) {
      app._pushUndo('tracks');
      app.editTrackDown.set(
        trackDown.filter(
          (_: { x: number; y: number; flags: number; velo: number }, j: number) => j !== i,
        ),
      );
      app._roadOffscreenKey = '';
      return;
    }
  }
  if (!app.selectedLevel()) return;

  let nearestSegDistUp = Infinity;
  for (let i = 0; i < trackUp.length - 1; i++) {
    const d = distToSegment2d(
      wx,
      wy,
      trackUp[i].x,
      trackUp[i].y,
      trackUp[i + 1].x,
      trackUp[i + 1].y,
    );
    if (d < nearestSegDistUp) nearestSegDistUp = d;
  }
  if (trackUp.length === 1) nearestSegDistUp = dist2d(trackUp[0].x, trackUp[0].y, wx, wy);

  let nearestSegDistDown = Infinity;
  for (let i = 0; i < trackDown.length - 1; i++) {
    const d = distToSegment2d(
      wx,
      wy,
      trackDown[i].x,
      trackDown[i].y,
      trackDown[i + 1].x,
      trackDown[i + 1].y,
    );
    if (d < nearestSegDistDown) nearestSegDistDown = d;
  }
  if (trackDown.length === 1) nearestSegDistDown = dist2d(trackDown[0].x, trackDown[0].y, wx, wy);

  app._pushUndo('tracks');
  if (nearestSegDistUp <= nearestSegDistDown || trackDown.length === 0) {
    app.editTrackUp.set(insertBetweenClosestSegment(trackUp, wx, wy));
  } else {
    app.editTrackDown.set(insertBetweenClosestSegment(trackDown, wx, wy));
  }
  app._roadOffscreenKey = '';
}

export {
  onCanvasKeyDown,
  onCanvasKeyUp,
  onCanvasWheel,
  resetView,
  frameAllObjects,
  centerOnSelectedObject,
} from './object-canvas-navigation';
export { redrawObjectCanvas } from './object-canvas-rendering';
