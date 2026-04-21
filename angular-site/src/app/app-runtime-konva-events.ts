/**
 * Konva event handler registration for the object editor overlay.
 *
 * Wires up all app.konva.onXxx callbacks that translate Konva stage
 * interactions into application state mutations.
 */
import type { App } from './app';
import { MAX_TIME_VALUE } from './app-level';
import { dist2d, MIN_START_MARKER_HIT_RADIUS, BASE_START_MARKER_HIT_RADIUS } from './object-canvas';

export function registerKonvaEventHandlers(app: App): void {
  registerObjectHandlers(app);
  registerWaypointHandlers(app);
  registerMarkHandlers(app);
  registerFinishLineHandlers(app);
  registerStageHandlers(app);
}

function registerObjectHandlers(app: App): void {
  app.konva.onObjectDragEnd = (e) => {
    const objs = [...app.objects()];
    if (e.index < objs.length) {
      app._pushUndo('objects');
      objs[e.index] = { ...objs[e.index], x: e.worldX, y: e.worldY };
      app.objects.set(objs);
      if (app.selectedObjIndex() === e.index) {
        app.editObjX.set(e.worldX);
        app.editObjY.set(e.worldY);
      }
    }
  };
  app.konva.onObjectClick = (index) => app.selectObject(index);
  app.konva.onStageDblClick = (wx, wy) => {
    if (app.markCreateMode() || app.drawMode() !== 'none') return;
    const objs = [...app.objects()];
    const selIdx = app.selectedObjIndex();
    const typeRes = selIdx !== null && selIdx < objs.length ? objs[selIdx].typeRes : 128;
    app._pushUndo('objects');
    objs.push({ x: Math.round(wx), y: Math.round(wy), dir: 0, typeRes });
    app.objects.set(objs);
    app.selectObject(objs.length - 1);
  };
  app.konva.onStageRightClick = (wx, wy) => {
    if (!app.showTrackOverlay()) return;
    app._handleTrackContextMenuAtWorld(wx, wy);
  };
}

function registerWaypointHandlers(app: App): void {
  app.konva.onWaypointDragEnd = (e) => {
    app.selectedObjIndex.set(null);
    app._pushUndo('tracks');
    if (e.track === 'up') {
      const arr = [...app.editTrackUp()];
      if (e.segIdx < arr.length) {
        arr[e.segIdx] = { ...arr[e.segIdx], x: e.worldX, y: e.worldY };
        app.editTrackUp.set(arr);
      }
    } else {
      const arr = [...app.editTrackDown()];
      if (e.segIdx < arr.length) {
        arr[e.segIdx] = { ...arr[e.segIdx], x: e.worldX, y: e.worldY };
        app.editTrackDown.set(arr);
      }
    }
  };
  app.konva.onWaypointDoubleClick = (track, segIdx) => app._insertWaypointAfter(track, segIdx);
  app.konva.onWaypointRightClick = (track, segIdx) => {
    app._pushUndo('tracks');
    if (track === 'up') {
      const arr = [...app.editTrackUp()];
      arr.splice(segIdx, 1);
      app.editTrackUp.set(arr);
    } else {
      const arr = [...app.editTrackDown()];
      arr.splice(segIdx, 1);
      app.editTrackDown.set(arr);
    }
  };
}

function registerMarkHandlers(app: App): void {
  app.konva.onMarkEndpointDragEnd = (e) => {
    app.selectedObjIndex.set(null);
    app._pushUndo('marks');
    const ms = [...app.marks()];
    if (e.markIdx >= ms.length) return;
    const m = ms[e.markIdx];
    const oldX = e.endpoint === 'p1' ? m.x1 : m.x2;
    const oldY = e.endpoint === 'p1' ? m.y1 : m.y2;
    ms[e.markIdx] =
      e.endpoint === 'p1'
        ? { ...m, x1: e.worldX, y1: e.worldY }
        : { ...m, x2: e.worldX, y2: e.worldY };
    for (let i = 0; i < ms.length; i++) {
      if (i === e.markIdx) continue;
      const other = ms[i];
      if (other.x1 === oldX && other.y1 === oldY) ms[i] = { ...other, x1: e.worldX, y1: e.worldY };
      if (other.x2 === oldX && other.y2 === oldY) ms[i] = { ...ms[i], x2: e.worldX, y2: e.worldY };
    }
    app._lastDraggedNubKey = { markIdx: e.markIdx, endpoint: e.endpoint };
    app.marks.set(ms);
    app.scheduleMarkAutoSave();
  };
  app.konva.onMarkClick = (markIdx) => app.selectedMarkIndex.set(markIdx);
}

function registerFinishLineHandlers(app: App): void {
  app.konva.onFinishLineDragStart = (e) => {
    app._draggingFinishLine = true;
    if (!app._finishLineDragUndoCaptured) {
      app._pushUndo('props');
      app._finishLineDragUndoCaptured = true;
    }
    app.editLevelEnd.set(Math.max(0, Math.min(MAX_TIME_VALUE, Math.round(e.worldY))));
    app.markPropertiesDirty();
  };
  app.konva.onFinishLineDragMove = (e) => {
    app.editLevelEnd.set(Math.max(0, Math.min(MAX_TIME_VALUE, Math.round(e.worldY))));
    app.markPropertiesDirty();
  };
  app.konva.onFinishLineDragEnd = (e) => {
    app.editLevelEnd.set(Math.max(0, Math.min(MAX_TIME_VALUE, Math.round(e.worldY))));
    app.markPropertiesDirty();
    app._draggingFinishLine = false;
    app._finishLineDragUndoCaptured = false;
  };
}

function registerStageHandlers(app: App): void {
  app.konva.onStageMouseDown = (cssX, cssY, button, targetIsStage) => {
    if (handlePanStart(app, button, cssX, cssY)) return;
    if (button === 0 && app.markCreateMode() && targetIsStage) {
      const [wx, wy] = app.canvasToWorld(cssX, cssY);
      app._addMarkCreatePoint(Math.round(wx), Math.round(wy));
      return;
    }
    if (button === 0 && app.showBarriers() && app.drawMode() !== 'none' && targetIsStage) {
      handleBarrierDrawStart(app, cssX, cssY);
      return;
    }
    if (button === 0) {
      const [wx, wy] = app.canvasToWorld(cssX, cssY);
      const startHitR = Math.max(MIN_START_MARKER_HIT_RADIUS, BASE_START_MARKER_HIT_RADIUS / app.canvasZoom());
      if (dist2d(app.editXStartPos(), 0, wx, wy) < startHitR) {
        app._beginStartMarkerDrag(null);
      }
    }
  };
  app.konva.onStageMouseMove = (cssX, cssY) => {
    if (handlePanMove(app, cssX, cssY)) return;
    if (app.markCreateMode() && app._pendingMarkPoints.length > 0) {
      const [wx, wy] = app.canvasToWorld(cssX, cssY);
      app._markCreateHoverPoint = { x: Math.round(wx), y: Math.round(wy) };
      app.runtime.scheduleCanvasRedraw();
      return;
    }
    if (app.drawMode() === 'curve') {
      const [wx, wy] = app.canvasToWorld(cssX, cssY);
      app._updateCurvePreview(wx, wy);
      return;
    }
    if (app._barrierDrawing) {
      handleBarrierDrawMove(app, cssX, cssY);
      return;
    }
    if (app._draggingStartMarker) {
      const [wx] = app.canvasToWorld(cssX, cssY);
      app.editXStartPos.set(Math.round(wx));
      app.markPropertiesDirty();
    }
  };
  app.konva.onStageMouseUp = (button) => {
    if (button === 0 || button === 1) {
      handlePanEnd(app);
      handleBarrierDrawEnd(app);
      if (app._draggingStartMarker || app._draggingFinishLine) {
        app._draggingStartMarker = false;
        app._draggingFinishLine = false;
        app._startMarkerDragUndoCaptured = false;
        app._finishLineDragUndoCaptured = false;
      }
    }
  };
}

function handlePanStart(app: App, button: number, cssX: number, cssY: number): boolean {
  const isPanGesture = button === 1 || (button === 0 && app.spaceDown());
  if (!isPanGesture) return false;
  app._isPanning = true;
  app.isPanning.set(true);
  app._prevPanMouseX = cssX;
  app._prevPanMouseY = cssY;
  const kc = document.getElementById('konva-container');
  if (kc) kc.style.cursor = 'grabbing';
  return true;
}

function handlePanMove(app: App, cssX: number, cssY: number): boolean {
  if (!app._isPanning) return false;
  const zoom = app.canvasZoom();
  app.canvasPanX.update((x) => x - (cssX - app._prevPanMouseX) / zoom);
  app.canvasPanY.update((y) => y - (cssY - app._prevPanMouseY) / zoom);
  app._prevPanMouseX = cssX;
  app._prevPanMouseY = cssY;
  return true;
}

function handlePanEnd(app: App): void {
  if (!app._isPanning) return;
  app._isPanning = false;
  app.isPanning.set(false);
  const kc = document.getElementById('konva-container');
  if (kc) kc.style.cursor = app.spaceDown() ? 'grab' : app.drawMode() !== 'none' ? 'crosshair' : 'default';
}

function handleBarrierDrawStart(app: App, cssX: number, cssY: number): void {
  const [wx, wy] = app.canvasToWorld(cssX, cssY);
  if (app.drawMode() === 'curve') {
    app._handleCurveDrawClick(wx, wy);
    return;
  }
  app._barrierDrawing = true;
  if (app.drawMode() === 'straight') {
    app._barrierDrawStart = { wx, wy };
    app._barrierDrawPath = [{ wx, wy }];
  } else {
    app._barrierDrawStart = null;
    app._barrierDrawPath = [{ wx, wy }];
  }
  const kc = document.getElementById('konva-container');
  if (kc) kc.style.cursor = 'crosshair';
}

function handleBarrierDrawMove(app: App, cssX: number, cssY: number): void {
  const [wx, wy] = app.canvasToWorld(cssX, cssY);
  if (app.drawMode() === 'straight' && app._barrierDrawStart) {
    app._barrierDrawPath = [app._barrierDrawStart, { wx, wy }];
    const start = app._barrierDrawStart;
    app.konva.setBarrierDrawPreview([start.wx, -start.wy, wx, -wy]);
    app.konva.flush();
  } else {
    app._barrierDrawPath.push({ wx, wy });
    if (app._barrierDrawPath.length % 3 === 0) {
      const pts: number[] = [];
      for (const p of app._barrierDrawPath) pts.push(p.wx, -p.wy);
      app.konva.setBarrierDrawPreview(pts);
      app.konva.flush();
    }
  }
}

function handleBarrierDrawEnd(app: App): void {
  if (!app._barrierDrawing) return;
  app._barrierDrawing = false;
  app.konva.clearBarrierDrawPreview();
  if (app.drawMode() === 'straight') app._barrierDrawStart = null;
  app._applyBarrierDrawPath();
  const kc = document.getElementById('konva-container');
  if (kc) kc.style.cursor = app.spaceDown() ? 'grab' : app.drawMode() !== 'none' ? 'crosshair' : 'default';
}
