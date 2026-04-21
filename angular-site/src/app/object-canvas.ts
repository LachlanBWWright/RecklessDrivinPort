import type { ParsedLevel } from './level-editor.service';
import { getObjTypeDimensionLabel } from './app-helpers';
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

export function getObjectCanvas(): HTMLCanvasElement | null {
  const element = document.getElementById('object-canvas');
  return element instanceof HTMLCanvasElement ? element : null;
}

export function getKonvaContainer(): HTMLElement | null {
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

// Re-export rendering and event functions from their dedicated modules so that
// existing importers in app.ts continue to work with a single import source.
export {
  redrawObjectCanvas,
  frameAllObjects,
  centerOnSelectedObject,
  resetView,
} from './object-canvas-render';

export {
  onCanvasMouseDown,
  onCanvasMouseMove,
  onCanvasMouseUp,
  onCanvasDoubleClick,
  onCanvasContextMenu,
  onCanvasKeyDown,
  onCanvasKeyUp,
  onCanvasWheel,
} from './object-canvas-events';
