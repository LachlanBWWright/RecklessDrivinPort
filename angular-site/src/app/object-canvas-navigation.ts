import type { App } from './app';
import { computeFramedWorldRect } from './app-helpers';
import { canvasToWorld, getCanvasScale, getKonvaContainer, getObjectCanvas } from './object-canvas';
import { duplicateSelectedObject, removeSelectedObject } from './object-canvas-editing';

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
