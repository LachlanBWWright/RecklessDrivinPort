import type { ParsedLevel, TrackMidpointRef, TrackWaypointRef } from './level-editor.service';
import {
  computeFramedWorldRect,
  drawMarksOnCanvas,
  drawObjectRoadPreviewCached,
  drawObjectTrackOverlay,
  getObjTypeDimensionLabel,
} from './app-helpers';
import { worldDirToCanvasRotationRad } from './object-direction-utils';
import type { App } from './app';

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
  128: { bg: '#0f7d1e', road: '#848484', dirt: '#4a6830', kerbA: '#6b8066', kerbB: '#d4e8d0', water: false },
  129: { bg: '#8f4e28', road: '#bf8460', dirt: '#7a4a2a', kerbA: '#9f764b', kerbB: '#d9b888', water: false },
  130: { bg: '#354ab5', road: '#505090', dirt: '#3a3a6e', kerbA: '#4c4c9e', kerbB: '#c0c0ff', water: false },
  131: { bg: '#b8dde0', road: '#98aeb0', dirt: '#8099a0', kerbA: '#aacccc', kerbB: '#ffffff', water: false },
  132: { bg: '#b8dde0', road: '#98aeb0', dirt: '#8099a0', kerbA: '#6b8066', kerbB: '#d4e8d0', water: false },
  133: { bg: '#0a7a1e', road: '#354ab5', dirt: '#2a6050', kerbA: '#207b44', kerbB: '#30bb66', water: true },
  134: { bg: '#5e5a5c', road: '#848484', dirt: '#4a4648', kerbA: '#606060', kerbB: '#c0c0c0', water: false },
  135: { bg: '#354ab5', road: '#d8c830', dirt: '#555580', kerbA: '#b8b050', kerbB: '#ffff88', water: false },
  136: { bg: '#0a7a1e', road: '#a06840', dirt: '#4a6830', kerbA: '#5a7034', kerbB: '#99cc44', water: false },
};

export const DEFAULT_ROAD_THEME: RoadTheme = ROAD_THEMES[128];

export const MIN_HIT_RADIUS = 10;
export const BASE_HIT_RADIUS = 8;
export const MIN_START_MARKER_HIT_RADIUS = 14;
export const BASE_START_MARKER_HIT_RADIUS = 10;

type TrackPoint = { x: number; y: number; flags: number; velo: number };

function getObjectCanvas(): HTMLCanvasElement | null {
  const element = document.getElementById('object-canvas');
  return element instanceof HTMLCanvasElement ? element : null;
}

function getKonvaContainer(): HTMLElement | null {
  const element = document.getElementById('konva-container');
  return element instanceof HTMLElement ? element : null;
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

export function insertBetweenClosestSegment(points: readonly TrackPoint[], wx: number, wy: number): TrackPoint[] {
  const newPoint = { x: Math.round(wx), y: Math.round(wy), flags: 0, velo: 0 };
  if (points.length === 0) return [newPoint];
  if (points.length === 1) return [...points, newPoint];
  const copy = [...points];
  let bestIdx = 0;
  let bestDist = Infinity;
  for (let i = 0; i < copy.length - 1; i++) {
    const d = distToSegment2d(wx, wy, copy[i].x, copy[i].y, copy[i + 1].x, copy[i + 1].y);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }
  copy.splice(bestIdx + 1, 0, newPoint);
  return copy;
}

export function selectObject(app: App, index: number, centerCanvas = false): void {
  app.selectedObjIndex.set(index);
  if (app._barrierDrawing) {
    app._barrierDrawing = false;
    app._barrierDrawPath = [];
  }
  const container = getKonvaContainer();
  if (container) container.style.cursor = 'default';
  app.konva.clearBarrierDrawPreview();
  const objs = app.objects();
  if (index < 0 || index >= objs.length) return;
  const obj = objs[index];
  app.editObjX.set(obj.x);
  app.editObjY.set(obj.y);
  app.editObjDir.set(obj.dir);
  app.editObjTypeRes.set(obj.typeRes);
  if (centerCanvas) {
    app.canvasPanX.set(obj.x);
    app.canvasPanY.set(obj.y);
  }
}

export function onObjDirDegInput(app: App, value: string): void {
  const deg = parseFloat(value);
  if (Number.isNaN(deg)) return;
  const rad = (deg * Math.PI) / 180;
  app.editObjDir.set(Math.atan2(Math.sin(rad), Math.cos(rad)));
  applyObjEdit(app);
}

export function onObjTypeResChange(app: App, typeRes: number): void {
  app.editObjTypeRes.set(typeRes);
  applyObjEdit(app);
}

export function applyObjEdit(app: App): void {
  const idx = app.selectedObjIndex();
  if (idx === null) return;
  const objs = [...app.objects()];
  if (idx < 0 || idx >= objs.length) return;
  app._pushUndo('objects');
  objs[idx] = {
    x: app.editObjX(),
    y: app.editObjY(),
    dir: app.editObjDir(),
    typeRes: app.editObjTypeRes(),
  };
  app.objects.set(objs);
}

export function addObject(app: App): void {
  app._pushUndo('objects');
  const objs = [...app.objects()];
  objs.push({ x: Math.round(app.canvasPanX()), y: Math.round(app.canvasPanY()), dir: 0, typeRes: 128 });
  app.objects.set(objs);
  selectObject(app, objs.length - 1);
}

export function duplicateSelectedObject(app: App): void {
  const idx = app.selectedObjIndex();
  if (idx === null) return;
  const objs = [...app.objects()];
  if (idx < 0 || idx >= objs.length) return;
  app._pushUndo('objects');
  const original = objs[idx];
  objs.push({ ...original, x: original.x + 50 });
  app.objects.set(objs);
  selectObject(app, objs.length - 1);
}

export function toggleTypeVisibility(app: App, typeId: number): void {
  const next = new Set(app.visibleTypeFilter());
  if (next.has(typeId)) next.delete(typeId);
  else next.add(typeId);
  app.visibleTypeFilter.set(next);
}

export function showAllObjectTypes(app: App): void {
  app.visibleTypeFilter.set(new Set(app.typePalette.map((item: { typeId: number }) => item.typeId)));
}

export function hideAllObjectTypes(app: App): void {
  app.visibleTypeFilter.set(new Set());
}

export function getObjectTypeDimensionLabel(app: App, typeRes: number): string {
  return getObjTypeDimensionLabel(app.objectTypeDefinitionMap, typeRes);
}

export function removeSelectedObject(app: App): void {
  const idx = app.selectedObjIndex();
  if (idx === null) return;
  app._pushUndo('objects');
  const objs = app.objects().filter((_: { x: number; y: number; dir: number; typeRes: number }, i: number) => i !== idx);
  app.objects.set(objs);
  app.selectedObjIndex.set(objs.length > 0 ? Math.min(idx, objs.length - 1) : null);
}

export function insertWaypointAfter(app: App, track: 'up' | 'down', segIdx: number): void {
  const source = track === 'up' ? app.editTrackUp() : app.editTrackDown();
  if (segIdx < 0 || segIdx >= source.length - 1) return;
  const cur = source[segIdx];
  const next = source[segIdx + 1];
  const inserted = {
    x: Math.round((cur.x + next.x) / 2),
    y: Math.round((cur.y + next.y) / 2),
    flags: 0,
    velo: 0,
  };
  app._pushUndo('tracks');
  const copy = [...source];
  copy.splice(segIdx + 1, 0, inserted);
  if (track === 'up') app.editTrackUp.set(copy);
  else app.editTrackDown.set(copy);
  app.hoverTrackMidpoint.set(null);
  app._roadOffscreenKey = '';
  app.snackBar.open(`Inserted ${track} waypoint at midpoint.`, undefined, { duration: 1500 });
}

export async function saveLevelObjects(app: App): Promise<void> {
  const id = app.selectedLevelId();
  if (id === null) return;
  try {
    app.workerBusy.set(true);
    const result: { levels: ParsedLevel[] } = await app.runtime.dispatchWorker('APPLY_OBJECTS', {
      resourceId: id,
      objects: app.objects(),
    });
    app.applyLevelsResult(result.levels, {
      preserveCanvasView: true,
      refreshSelectedLevelState: false,
    });
    const msg = `Saved ${app.objects().length} objects for level ${id - 139}.`;
    app.resourcesStatus.set(msg);
    app.snackBar.open(`✓ ${msg}`, 'OK', { duration: 3000, panelClass: 'snack-success' });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Save failed';
    app.editorError.set(msg);
    app.snackBar.open(`✗ ${msg}`, 'Dismiss', { duration: 5000, panelClass: 'snack-error' });
  } finally {
    app.workerBusy.set(false);
  }
}

export async function saveTrack(app: App): Promise<void> {
  const id = app.selectedLevelId();
  if (id === null) return;
  try {
    app.workerBusy.set(true);
    const result: { levels: ParsedLevel[] } = await app.runtime.dispatchWorker('APPLY_TRACK', {
      resourceId: id,
      trackUp: app.editTrackUp(),
      trackDown: app.editTrackDown(),
    });
    app.applyLevelsResult(result.levels, {
      preserveCanvasView: true,
      refreshSelectedLevelState: false,
    });
    const msg = `Saved track waypoints for level ${id - 139}.`;
    app.resourcesStatus.set(msg);
    app.snackBar.open(`✓ ${msg}`, 'OK', { duration: 3000, panelClass: 'snack-success' });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Track save failed';
    app.editorError.set(msg);
    app.snackBar.open(`✗ ${msg}`, 'Dismiss', { duration: 5000, panelClass: 'snack-error' });
  } finally {
    app.workerBusy.set(false);
  }
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
  objs.push({ x: Math.round(wx), y: Math.round(wy), dir: 0, typeRes: 128 });
  app.objects.set(objs);
  selectObject(app, objs.length - 1);
}

export function onCanvasContextMenu(app: App, event: MouseEvent): void {
  if (!app.showTrackOverlay()) return;
  const [wx, wy] = app.canvasToWorld(event.offsetX, event.offsetY);
  const trackUp = app.editTrackUp();
  const trackDown = app.editTrackDown();
  const trackHitR = Math.max(20, 14 / app.canvasZoom());
  for (let i = 0; i < trackUp.length; i++) {
    if (dist2d(trackUp[i].x, trackUp[i].y, wx, wy) < trackHitR) {
      app._pushUndo('tracks');
      app.editTrackUp.set(trackUp.filter((_: { x: number; y: number; flags: number; velo: number }, j: number) => j !== i));
      app._roadOffscreenKey = '';
      return;
    }
  }
  for (let i = 0; i < trackDown.length; i++) {
    if (dist2d(trackDown[i].x, trackDown[i].y, wx, wy) < trackHitR) {
      app._pushUndo('tracks');
      app.editTrackDown.set(trackDown.filter((_: { x: number; y: number; flags: number; velo: number }, j: number) => j !== i));
      app._roadOffscreenKey = '';
      return;
    }
  }
  if (!app.selectedLevel()) return;

  let nearestSegDistUp = Infinity;
  for (let i = 0; i < trackUp.length - 1; i++) {
    const d = distToSegment2d(wx, wy, trackUp[i].x, trackUp[i].y, trackUp[i + 1].x, trackUp[i + 1].y);
    if (d < nearestSegDistUp) nearestSegDistUp = d;
  }
  if (trackUp.length === 1) nearestSegDistUp = dist2d(trackUp[0].x, trackUp[0].y, wx, wy);

  let nearestSegDistDown = Infinity;
  for (let i = 0; i < trackDown.length - 1; i++) {
    const d = distToSegment2d(wx, wy, trackDown[i].x, trackDown[i].y, trackDown[i + 1].x, trackDown[i + 1].y);
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

export function onCanvasKeyDown(app: App, event: KeyboardEvent): void {
  if (event.key === ' ') {
    app.spaceDown.set(true);
    app.konva.setPanMode(true);
    const container = getKonvaContainer();
    if (container) container.style.cursor = 'grab';
    event.preventDefault();
    return;
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && !event.shiftKey) {
    event.preventDefault();
    app.undo();
    return;
  }
  if (
    (event.ctrlKey || event.metaKey) &&
    (event.key.toLowerCase() === 'y' || (event.key.toLowerCase() === 'z' && event.shiftKey))
  ) {
    event.preventDefault();
    app.redo();
    return;
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd') {
    event.preventDefault();
    duplicateSelectedObject(app);
    return;
  }
  if (event.key === 'Delete' || event.key === 'Backspace') {
    event.preventDefault();
    removeSelectedObject(app);
    return;
  }
  if (app.showMarks() && event.key === 'n' && !event.ctrlKey && !event.metaKey && !event.altKey) {
    event.preventDefault();
    if (app._hasColocatedNubs()) {
      app._splitCollocatedMarkNubs();
    } else {
      app._joinAdjacentMarkNubs();
    }
    return;
  }
  const panStep = 50 / app.canvasZoom();
  if (event.key === 'ArrowUp') {
    event.preventDefault();
    app.canvasPanY.update((y: number) => y + panStep);
  }
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    app.canvasPanY.update((y: number) => y - panStep);
  }
  if (event.key === 'ArrowLeft') {
    event.preventDefault();
    app.canvasPanX.update((x: number) => x - panStep);
  }
  if (event.key === 'ArrowRight') {
    event.preventDefault();
    app.canvasPanX.update((x: number) => x + panStep);
  }
}

export function onCanvasKeyUp(app: App, event: KeyboardEvent): void {
  if (event.key !== ' ') return;
  app.spaceDown.set(false);
  app.konva.setPanMode(false);
  const container = getKonvaContainer();
  if (container) container.style.cursor = app.drawMode() !== 'none' ? 'crosshair' : 'default';
  if (app._isPanning) {
    app._isPanning = false;
    app.isPanning.set(false);
  }
}

export function onCanvasWheel(app: App, event: WheelEvent): void {
  event.preventDefault();
  const oldZoom = app.canvasZoom();
  let delta = event.deltaY;
  if (event.deltaMode === WheelEvent.DOM_DELTA_PIXEL) {
    delta /= 4;
  } else if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
    delta *= 120;
  }
  const nextZoom = Math.min(10, Math.max(0.1, oldZoom * (1 - delta * 0.001)));
  if (Math.abs(nextZoom - oldZoom) < 1e-6) return;

  const [wx, wy] = canvasToWorld(app, event.offsetX, event.offsetY);
  const canvas = getObjectCanvas();
  const width = canvas?.width ?? 900;
  const height = canvas?.height ?? 700;
  const scale = getCanvasScale();
  const lx = event.offsetX * scale;
  const ly = event.offsetY * scale;
  app.canvasZoom.set(nextZoom);
  app.canvasPanX.set(wx - (lx - width / 2) / nextZoom);
  app.canvasPanY.set(wy + (ly - height / 2) / nextZoom);
}

export function resetView(app: App): void {
  const level = app.selectedLevel();
  if (level) {
    app.resetViewToRoad(level);
    return;
  }
  app.canvasZoom.set(1.5);
  app.canvasPanX.set(0);
  app.canvasPanY.set(0);
}

export function frameAllObjects(app: App): void {
  const objs = app.objects();
  if (objs.length === 0) {
    resetView(app);
    return;
  }
  const xs = objs.map((obj: { x: number }) => obj.x);
  const ys = objs.map((obj: { y: number }) => obj.y);
  const canvas = getObjectCanvas();
  const framed = computeFramedWorldRect(
    canvas?.width ?? 600,
    canvas?.height ?? 500,
    Math.min(...xs),
    Math.max(...xs),
    Math.min(...ys),
    Math.max(...ys),
  );
  app.canvasZoom.set(framed.zoom);
  app.canvasPanX.set(framed.panX);
  app.canvasPanY.set(framed.panY);
}

export function centerOnSelectedObject(app: App): void {
  const idx = app.selectedObjIndex();
  if (idx === null) return;
  const obj = app.objects()[idx];
  if (!obj) return;
  app.canvasPanX.set(obj.x);
  app.canvasPanY.set(obj.y);
}

export function redrawObjectCanvas(app: App): void {
  const canvas = getObjectCanvas();
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const width = canvas.width;
  const height = canvas.height;
  const zoom = app.canvasZoom();
  const panX = app.canvasPanX();
  const panY = app.canvasPanY();
  const objs = app.objects();
  const selIdx = app.selectedObjIndex();
  const visibleTypes = app.visibleTypeFilter();
  const level = app.selectedLevel();

  ctx.clearRect(0, 0, width, height);

  const roadInfo = level?.properties.roadInfo ?? 0;
  const theme = ROAD_THEMES[roadInfo] ?? DEFAULT_ROAD_THEME;
  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, width, height);

  if (app.showGrid()) {
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.lineWidth = 1;
    const gridStep = 100;
    const gridStepPx = gridStep * zoom;
    if (gridStepPx > 8) {
      const startWorldX = panX - width / (2 * zoom);
      const startWorldY = panY - height / (2 * zoom);
      const endWorldX = panX + width / (2 * zoom);
      const endWorldY = panY + height / (2 * zoom);
      const firstX = Math.floor(startWorldX / gridStep) * gridStep;
      const firstY = Math.floor(startWorldY / gridStep) * gridStep;
      ctx.beginPath();
      for (let gx = firstX; gx <= endWorldX; gx += gridStep) {
        const [cx] = worldToCanvas(app, gx, 0);
        ctx.moveTo(cx, 0);
        ctx.lineTo(cx, height);
      }
      for (let gy = firstY; gy <= endWorldY; gy += gridStep) {
        const [, cy] = worldToCanvas(app, 0, gy);
        ctx.moveTo(0, cy);
        ctx.lineTo(width, cy);
      }
      ctx.stroke();
    }
  }

  if (level && app.showRoad()) {
    drawObjectRoadPreviewCached(
      app,
      app,
      document,
      ctx,
      level,
      theme,
      width,
      height,
      zoom,
      panX,
      panY,
      `${level.resourceId}|${width}|${height}|${zoom.toFixed(3)}|${panX.toFixed(0)}|${app.roadTexturesVersion()}|${app.roadInfoVersion()}|${app.roadSegsVersion()}`,
    );
  }

  if (!level || level.roadSegs.length === 0) {
    const [ox, oy] = worldToCanvas(app, 0, 0);
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(ox, 0);
    ctx.lineTo(ox, height);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, oy);
    ctx.lineTo(width, oy);
    ctx.stroke();
  }

  if (level && app.showTrackOverlay()) {
    drawObjectTrackOverlay(
      ctx,
      (x, y) => worldToCanvas(app, x, y),
      zoom,
      app.dragTrackWaypoint(),
      app.hoverTrackWaypoint(),
      app.hoverTrackMidpoint(),
      app.editTrackUp(),
      app.editTrackDown(),
    );
  }

  if (level && app.showMarks()) {
    drawMarksOnCanvas(
      ctx,
      (x, y) => worldToCanvas(app, x, y),
      app.marks(),
      app.selectedMarkIndex(),
      app._konvaInitialized,
      app.markCreateMode(),
      app._pendingMarkPoints,
      app._markCreateHoverPoint,
    );
  }

  const preview = app.markingPreview();
  if (preview.length > 0) {
    ctx.save();
    ctx.strokeStyle = 'rgba(66,165,245,0.85)';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 3]);
    for (const mark of preview) {
      const [x1, y1] = worldToCanvas(app, mark.x1, mark.y1);
      const [x2, y2] = worldToCanvas(app, mark.x2, mark.y2);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.restore();
  }

  if (level && app.showBarriers() && level.roadSegs.length > 0) {
    const segs = level.roadSegs;
    const sampleStep = Math.max(1, Math.floor(segs.length / 20));
    const panYQ = Math.round(panY / 8) * 8;
    let barrierKey = `${level.resourceId}:${app.roadSegsVersion()}:${segs.length}:${zoom.toFixed(2)}:${panYQ}`;
    for (let i = 0; i < segs.length; i += sampleStep) {
      const s = segs[i];
      barrierKey += `:${s.v0},${s.v1},${s.v2},${s.v3}`;
    }
    if (barrierKey !== app._lastBarriersSerialized) {
      app._lastBarriersSerialized = barrierKey;
      app.konva.setBarriers(segs, zoom, panY);
    }
  } else if (app._lastBarriersSerialized !== '') {
    app._lastBarriersSerialized = '';
    app.konva.clearBarriers();
  }

  const baseRadius = Math.min(20, Math.max(5, 8 * zoom));
  const labelFont = `${Math.max(9, 10 * zoom)}px monospace`;
  const objsVisible = app.showObjects();
  for (let i = 0; i < objs.length; i++) {
    const obj = objs[i];
    const typeIdx = ((obj.typeRes % OBJ_PALETTE.length) + OBJ_PALETTE.length) % OBJ_PALETTE.length;
    const isFilteredOut = !visibleTypes.has(typeIdx) || !objsVisible;
    if (isFilteredOut && i !== selIdx) continue;
    const [cx, cy] = worldToCanvas(app, obj.x, obj.y);
    if (cx < -50 || cx > width + 50 || cy < -50 || cy > height + 50) continue;

    ctx.globalAlpha = isFilteredOut ? 0.3 : 1.0;
    const color = OBJ_PALETTE[typeIdx] ?? '#888888';
    const previewCanvas = app.getObjectSpritePreview(obj.typeRes);
    const drawWidth = previewCanvas ? Math.max(MIN_HIT_RADIUS * 2, previewCanvas.width * zoom) : baseRadius * 2.5;
    const drawHeight = previewCanvas ? Math.max(MIN_HIT_RADIUS * 2, previewCanvas.height * zoom) : baseRadius * 2.5;
    const isPlayerCar = obj.typeRes === PLAYER_CAR_TYPE_RES;
    const isSel = i === selIdx;

    if (previewCanvas) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(worldDirToCanvasRotationRad(obj.dir));
      ctx.drawImage(previewCanvas, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
      ctx.restore();
    } else {
      ctx.fillStyle = isPlayerCar ? '#ffe082' : color;
      ctx.beginPath();
      ctx.arc(cx, cy, baseRadius, 0, Math.PI * 2);
      ctx.fill();
    }

    if (isPlayerCar) {
      ctx.fillStyle = '#ffe082';
      ctx.font = `${Math.max(10, 12 * zoom)}px sans-serif`;
      ctx.fillText('★', cx - 6, cy - drawHeight / 2 - 4);
    }

    if (zoom > 0.35 || isSel) {
      ctx.fillStyle = isSel ? '#ffffff' : 'rgba(220,220,220,0.85)';
      ctx.font = labelFont;
      ctx.fillText(`#${i} T${obj.typeRes}`, cx + drawWidth / 2 + 4, cy + 4);
    }
    ctx.globalAlpha = 1.0;
  }

  const [originX, originY] = worldToCanvas(app, 0, 0);
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.beginPath();
  ctx.arc(originX, originY, 3, 0, Math.PI * 2);
  ctx.fill();

  if (level) {
    const startX = app.editXStartPos();
    const [startCanvasX, startCanvasY] = worldToCanvas(app, startX, 0);
    if (
      startCanvasX > -20 &&
      startCanvasX < width + 20 &&
      startCanvasY > -20 &&
      startCanvasY < height + 20
    ) {
      const zf = Math.min(zoom, 2);
      const poleHeight = 20 * zf;
      const flagTip = 10 * zf;
      const flagMid = 14 * zf;
      const flagBottom = 8 * zf;
      ctx.strokeStyle = app._draggingStartMarker ? '#ffffff' : '#00e5ff';
      ctx.fillStyle = app._draggingStartMarker ? '#ffffff' : '#00e5ff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(startCanvasX, startCanvasY);
      ctx.lineTo(startCanvasX, startCanvasY - poleHeight);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(startCanvasX, startCanvasY - poleHeight);
      ctx.lineTo(startCanvasX + flagTip, startCanvasY - flagMid);
      ctx.lineTo(startCanvasX, startCanvasY - flagBottom);
      ctx.closePath();
      ctx.fill();
      if (zoom > 0.4) {
        ctx.font = `${Math.max(9, 10 * zoom)}px monospace`;
        ctx.fillStyle = app._draggingStartMarker ? '#ffffff' : '#00e5ff';
        ctx.fillText(`START X=${startX}`, startCanvasX + 6, startCanvasY - poleHeight - 2);
      }
    }
  }

  const liveFinishY = app.editLevelEnd();
  if (level && liveFinishY >= 0) {
    const [, finishCanvasY] = worldToCanvas(app, 0, liveFinishY);
    if (finishCanvasY > -2 && finishCanvasY < height + 2) {
      ctx.strokeStyle = app._draggingFinishLine ? '#ffffff' : '#f9a825';
      ctx.lineWidth = 2;
      ctx.setLineDash([10, 6]);
      ctx.beginPath();
      ctx.moveTo(0, finishCanvasY);
      ctx.lineTo(width, finishCanvasY);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = app._draggingFinishLine ? '#ffffff' : '#f9a825';
      ctx.font = `${Math.max(9, 11 * zoom)}px monospace`;
      ctx.fillText(`FINISH Y=${liveFinishY}`, 6, finishCanvasY - 4);
    }
  }

  app.initKonvaIfNeeded();
  app.konva.setTransform(zoom, panX, panY);
  app.konva.setObjects(
    objsVisible ? objs : [],
    selIdx,
    visibleTypes,
    OBJ_PALETTE,
    (typeRes: number) => app.getObjectSpritePreview(typeRes),
    zoom,
    panX,
    panY,
  );
  if (level && app.showTrackOverlay()) {
    const up = app.showTrackUp() ? app.editTrackUp() : [];
    const down = app.showTrackDown() ? app.editTrackDown() : [];
    app.konva.setTrackWaypoints(up, down, zoom, panX, panY);
  } else {
    app.konva.clearTrackWaypoints();
  }
  if (level && app.showMarks()) {
    app.konva.setMarks(app.marks(), app.selectedMarkIndex(), zoom, panX, panY);
  } else {
    app.konva.clearMarks();
  }
  if (level) {
    app.konva.setFinishLine(liveFinishY, zoom, panX, panY);
  } else {
    app.konva.clearFinishLine();
  }
  app.konva.flush();
}
