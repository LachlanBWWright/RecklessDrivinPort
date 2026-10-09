import type { ParsedLevel } from './level-editor.service';
import { getObjTypeDimensionLabel } from './app-helpers';
import type { App } from './app';

type TrackPoint = { x: number; y: number; flags: number; velo: number };

function distanceToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  if (dx === 0 && dy === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

export function insertBetweenClosestSegment(
  points: readonly TrackPoint[],
  wx: number,
  wy: number,
): TrackPoint[] {
  const newPoint = { x: Math.round(wx), y: Math.round(wy), flags: 0, velo: 0 };
  if (points.length < 2) return points.length === 0 ? [newPoint] : [...points, newPoint];

  let bestIndex = 0;
  let bestDistance = Infinity;
  for (let index = 0; index < points.length - 1; index += 1) {
    const current = points[index];
    const next = points[index + 1];
    const distance = distanceToSegment(wx, wy, current.x, current.y, next.x, next.y);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  }

  const result = [...points];
  result.splice(bestIndex + 1, 0, newPoint);
  return result;
}

export function selectObject(app: App, index: number, centerCanvas = false): void {
  app.selectedObjIndex.set(index);
  if (app._barrierDrawing) {
    app._barrierDrawing = false;
    app._barrierDrawPath = [];
  }
  const container = document.getElementById('konva-container');
  if (container instanceof HTMLElement) container.style.cursor = 'default';
  app.konva.clearBarrierDrawPreview();

  const object = app.objects()[index];
  if (!object) return;
  app.editObjX.set(object.x);
  app.editObjY.set(object.y);
  app.editObjDir.set(object.dir);
  app.editObjTypeRes.set(object.typeRes);
  if (centerCanvas) {
    app.canvasPanX.set(object.x);
    app.canvasPanY.set(object.y);
  }
}

export function onObjDirDegInput(app: App, value: string): void {
  const degrees = Number.parseFloat(value);
  if (Number.isNaN(degrees)) return;
  const radians = (degrees * Math.PI) / 180;
  app.editObjDir.set(Math.atan2(Math.sin(radians), Math.cos(radians)));
  applyObjEdit(app);
}

export function onObjTypeResChange(app: App, typeRes: number): void {
  app.editObjTypeRes.set(typeRes);
  applyObjEdit(app);
}

export function applyObjEdit(app: App): void {
  const index = app.selectedObjIndex();
  if (index === null || index < 0 || index >= app.objects().length) return;
  const objects = [...app.objects()];
  app._pushUndo('objects');
  objects[index] = {
    x: app.editObjX(),
    y: app.editObjY(),
    dir: app.editObjDir(),
    typeRes: app.editObjTypeRes(),
  };
  app.objects.set(objects);
}

export function addObject(app: App): void {
  app._pushUndo('objects');
  const objects = [
    ...app.objects(),
    {
      x: Math.round(app.canvasPanX()),
      y: Math.round(app.canvasPanY()),
      dir: 0,
      typeRes: app.placementObjTypeRes(),
    },
  ];
  app.objects.set(objects);
  selectObject(app, objects.length - 1);
}

export function duplicateSelectedObject(app: App): void {
  const index = app.selectedObjIndex();
  if (index === null || index < 0 || index >= app.objects().length) return;
  app._pushUndo('objects');
  const original = app.objects()[index];
  const objects = [...app.objects(), { ...original, x: original.x + 50 }];
  app.objects.set(objects);
  selectObject(app, objects.length - 1);
}

export function toggleTypeVisibility(app: App, typeId: number): void {
  const visible = new Set(app.visibleTypeFilter());
  if (visible.has(typeId)) visible.delete(typeId);
  else visible.add(typeId);
  app.visibleTypeFilter.set(visible);
}

export function showAllObjectTypes(app: App): void {
  app.visibleTypeFilter.set(new Set(app.typePalette.map((item) => item.typeId)));
}

export function hideAllObjectTypes(app: App): void {
  app.visibleTypeFilter.set(new Set());
}

export function getObjectTypeDimensionLabelForApp(app: App, typeRes: number): string {
  return getObjTypeDimensionLabel(app.objectTypeDefinitionMap, typeRes);
}

export function removeSelectedObject(app: App): void {
  const index = app.selectedObjIndex();
  if (index === null || index < 0 || index >= app.objects().length) return;
  app._pushUndo('objects');
  const objects = app.objects().filter((_, itemIndex) => itemIndex !== index);
  app.objects.set(objects);
  app.selectedObjIndex.set(objects.length > 0 ? Math.min(index, objects.length - 1) : null);
}

export function insertWaypointAfter(app: App, track: 'up' | 'down', segmentIndex: number): void {
  const source = track === 'up' ? app.editTrackUp() : app.editTrackDown();
  if (segmentIndex < 0 || segmentIndex >= source.length - 1) return;
  const current = source[segmentIndex];
  const next = source[segmentIndex + 1];
  const inserted = {
    x: Math.round((current.x + next.x) / 2),
    y: Math.round((current.y + next.y) / 2),
    flags: 0,
    velo: 0,
  };
  const copy = [...source];
  copy.splice(segmentIndex + 1, 0, inserted);
  app._pushUndo('tracks');
  if (track === 'up') app.editTrackUp.set(copy);
  else app.editTrackDown.set(copy);
  app.hoverTrackMidpoint.set(null);
  app._roadOffscreenKey = '';
  app.snackBar.open(`Inserted ${track} waypoint at midpoint.`, undefined, { duration: 1500 });
}

export async function saveLevelObjects(app: App): Promise<void> {
  const id = app.selectedLevelId();
  if (id === null) return;
  await saveLevelEdit(
    app,
    'APPLY_OBJECTS',
    { resourceId: id, objects: app.objects() },
    `Saved ${app.objects().length} objects for level ${id - 139}.`,
    'Save failed',
  );
}

export async function saveTrack(app: App): Promise<void> {
  const id = app.selectedLevelId();
  if (id === null) return;
  await saveLevelEdit(
    app,
    'APPLY_TRACK',
    {
      resourceId: id,
      trackUp: app.editTrackUp(),
      trackDown: app.editTrackDown(),
    },
    `Saved track waypoints for level ${id - 139}.`,
    'Track save failed',
  );
}

async function saveLevelEdit(
  app: App,
  operation: 'APPLY_OBJECTS' | 'APPLY_TRACK',
  payload: Record<string, unknown>,
  successMessage: string,
  failureMessage: string,
): Promise<void> {
  try {
    app.workerBusy.set(true);
    const result = await app.runtime.dispatchWorker<{ levels: ParsedLevel[] }>(operation, payload);
    app.applyLevelsResult(result.levels, {
      preserveCanvasView: true,
      refreshSelectedLevelState: false,
    });
    app.resourcesStatus.set(successMessage);
    app.snackBar.open(`✓ ${successMessage}`, 'OK', { duration: 3000 });
  } catch (error) {
    const message = error instanceof Error ? error.message : failureMessage;
    app.editorError.set(message);
    app.snackBar.open(`✗ ${message}`, 'Dismiss', { duration: 5000 });
  } finally {
    app.workerBusy.set(false);
  }
}
