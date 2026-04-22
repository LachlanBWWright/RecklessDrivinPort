/**
 * Mouse, keyboard, and wheel event handlers for the object editor canvas.
 */
import type { App } from './app';
import type { TrackWaypointRef, TrackMidpointRef } from './level-editor.service';
import {
  dist2d,
  selectObject,
  getObjectCanvas,
  getKonvaContainer,
  MIN_HIT_RADIUS,
  BASE_HIT_RADIUS,
  MIN_START_MARKER_HIT_RADIUS,
  BASE_START_MARKER_HIT_RADIUS,
  canvasToWorld,
  getCanvasScale,
} from './object-canvas';
import { tryDeleteHoveredWaypoint, insertTrackPointNearestSegment } from './object-canvas-track-editor';

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

  if (app.showTrackOverlay() && tryHitTrackWaypoint(app, wx, wy)) return;

  const startHitR = Math.max(MIN_START_MARKER_HIT_RADIUS, BASE_START_MARKER_HIT_RADIUS / app.canvasZoom());
  if (dist2d(app.editXStartPos(), 0, wx, wy) < startHitR) {
    app._beginStartMarkerDrag(event.target);
    return;
  }

  const hitRadius = Math.max(MIN_HIT_RADIUS, BASE_HIT_RADIUS / app.canvasZoom());
  const objs = app.objects();
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

function tryHitTrackWaypoint(app: App, wx: number, wy: number): boolean {
  const trackUp = app.editTrackUp();
  const trackDown = app.editTrackDown();
  const trackHitR = Math.max(12, 10 / app.canvasZoom());

  for (let i = 0; i < trackUp.length; i++) {
    if (dist2d(trackUp[i].x, trackUp[i].y, wx, wy) < trackHitR) {
      app.dragTrackWaypoint.set({ track: 'up', segIdx: i });
      app.selectedObjIndex.set(null);
      getObjectCanvas()?.focus();
      return true;
    }
  }
  for (let i = 0; i < trackDown.length; i++) {
    if (dist2d(trackDown[i].x, trackDown[i].y, wx, wy) < trackHitR) {
      app.dragTrackWaypoint.set({ track: 'down', segIdx: i });
      app.selectedObjIndex.set(null);
      getObjectCanvas()?.focus();
      return true;
    }
  }

  const midHitR = Math.max(14, 12 / app.canvasZoom());
  for (let i = 0; i < trackUp.length - 1; i++) {
    const mx = (trackUp[i].x + trackUp[i + 1].x) / 2;
    const my = (trackUp[i].y + trackUp[i + 1].y) / 2;
    if (dist2d(mx, my, wx, wy) < midHitR) {
      app._insertWaypointAfter('up', i);
      return true;
    }
  }
  for (let i = 0; i < trackDown.length - 1; i++) {
    const mx = (trackDown[i].x + trackDown[i + 1].x) / 2;
    const my = (trackDown[i].y + trackDown[i + 1].y) / 2;
    if (dist2d(mx, my, wx, wy) < midHitR) {
      app._insertWaypointAfter('down', i);
      return true;
    }
  }
  return false;
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
      scheduleTrackHoverUpdate(app, event.offsetX, event.offsetY);
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

function scheduleTrackHoverUpdate(app: App, evX: number, evY: number): void {
  app._hoverRafPending = true;
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

    if (!found) {
      const foundMid = findHoverMidpoint(app, wx, wy);
      const prevMid = app.hoverTrackMidpoint();
      if (foundMid?.track !== prevMid?.track || foundMid?.segIdx !== prevMid?.segIdx) {
        app.hoverTrackMidpoint.set(foundMid);
      }
    }
  });
}

function findHoverMidpoint(app: App, wx: number, wy: number): TrackMidpointRef | null {
  const midHitR = Math.max(14, 12 / app.canvasZoom());
  const upSegs = app.editTrackUp();
  for (let i = 0; i < upSegs.length - 1; i++) {
    const mx = (upSegs[i].x + upSegs[i + 1].x) / 2;
    const my = (upSegs[i].y + upSegs[i + 1].y) / 2;
    if (dist2d(mx, my, wx, wy) < midHitR) return { track: 'up', segIdx: i };
  }
  const downSegs = app.editTrackDown();
  for (let i = 0; i < downSegs.length - 1; i++) {
    const mx = (downSegs[i].x + downSegs[i + 1].x) / 2;
    const my = (downSegs[i].y + downSegs[i + 1].y) / 2;
    if (dist2d(mx, my, wx, wy) < midHitR) return { track: 'down', segIdx: i };
  }
  return null;
}

export function onCanvasMouseUp(app: App): void {
  if (app._isPanning) {
    app._isPanning = false;
    app.isPanning.set(false);
    return;
  }

  const twp = app.dragTrackWaypoint();
  if (twp) {
    const pos = app._pendingWaypointDragPos;
    if (pos) {
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
  if (tryDeleteHoveredWaypoint(app, wx, wy)) return;
  if (!app.selectedLevel()) return;
  insertTrackPointNearestSegment(app, wx, wy);
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
    app.duplicateSelectedObject();
    return;
  }
  if (event.key === 'Delete' || event.key === 'Backspace') {
    event.preventDefault();
    app.removeSelectedObject();
    return;
  }
  if (app.showMarks() && event.key === 'n' && !event.ctrlKey && !event.metaKey && !event.altKey) {
    event.preventDefault();
    if (app._hasColocatedNubs()) app._splitCollocatedMarkNubs();
    else app._joinAdjacentMarkNubs();
    return;
  }
  const panStep = 50 / app.canvasZoom();
  const panMap: Record<string, () => void> = {
    ArrowUp:    () => app.canvasPanY.update((y) => y + panStep),
    ArrowDown:  () => app.canvasPanY.update((y) => y - panStep),
    ArrowLeft:  () => app.canvasPanX.update((x) => x - panStep),
    ArrowRight: () => app.canvasPanX.update((x) => x + panStep),
  };
  const panFn = panMap[event.key];
  if (panFn) { event.preventDefault(); panFn(); }
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
  if (event.deltaMode === WheelEvent.DOM_DELTA_PIXEL) delta /= 4;
  else if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) delta *= 120;
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
