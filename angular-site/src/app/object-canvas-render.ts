/**
 * Canvas rendering for the object editor viewport.
 *
 * Pure rendering helpers that draw to a 2D canvas context. Depends on
 * object-canvas.ts for coordinate helpers and constants.
 */
import type { App } from './app';
import {
  OBJ_PALETTE,
  ROAD_THEMES,
  DEFAULT_ROAD_THEME,
  MIN_HIT_RADIUS,
  worldToCanvas,
  getObjectCanvas,
} from './object-canvas';
import {
  drawObjectRoadPreviewCached,
  drawObjectTrackOverlay,
  drawMarksOnCanvas,
  computeFramedWorldRect,
} from './app-helpers';
import { worldDirToCanvasForwardVector, worldDirToCanvasRotationRad } from './object-direction-utils';
import { drawStartMarkerOnCanvas, drawFinishLineOnCanvas, drawOriginDotOnCanvas, drawGridLines, drawOriginAxes } from './object-canvas-markers';

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

  drawGridLines(app, ctx, width, height, zoom, panX, panY);

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
    drawOriginAxes(ctx, width, height, app);
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

  drawMarkingPreview(app, ctx);
  drawBarriers(app, ctx, level, zoom, panX, panY);
  drawObjects(app, ctx, objs, selIdx, visibleTypes, width, height, zoom);
  drawOriginDotOnCanvas(ctx, app);
  drawStartMarkerOnCanvas(app, ctx, level, width, height, zoom);
  drawFinishLineOnCanvas(app, ctx, level, width, height, zoom);
  syncKonva(app);
}

function syncKonva(app: App): void {
  const zoom = app.canvasZoom();
  const panX = app.canvasPanX();
  const panY = app.canvasPanY();
  const objs = app.objects();
  const selIdx = app.selectedObjIndex();
  const visibleTypes = app.visibleTypeFilter();
  const level = app.selectedLevel();

  app.initKonvaIfNeeded();
  app.konva.setTransform(zoom, panX, panY);
  app.konva.setObjects(
    app.showObjects() ? objs : [], selIdx, visibleTypes, OBJ_PALETTE,
    (typeRes: number) => app.getObjectSpritePreview(typeRes), zoom, panX, panY,
  );
  if (level && app.showTrackOverlay()) {
    app.konva.setTrackWaypoints(
      app.showTrackUp() ? app.editTrackUp() : [],
      app.showTrackDown() ? app.editTrackDown() : [],
      zoom, panX, panY,
    );
  } else {
    app.konva.clearTrackWaypoints();
  }
  if (level && app.showMarks()) app.konva.setMarks(app.marks(), app.selectedMarkIndex(), zoom, panX, panY);
  else app.konva.clearMarks();
  if (level) app.konva.setFinishLine(app.editLevelEnd(), zoom, panX, panY);
  else app.konva.clearFinishLine();
  app.konva.flush();
}
function drawMarkingPreview(app: App, ctx: CanvasRenderingContext2D): void {
  const preview = app.markingPreview();
  if (preview.length === 0) return;
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

function drawBarriers(
  app: App,
  ctx: CanvasRenderingContext2D,
  level: ReturnType<App['selectedLevel']>,
  zoom: number,
  panX: number,
  panY: number,
): void {
  if (!level || !app.showBarriers() || level.roadSegs.length === 0) {
    if (app._lastBarriersSerialized !== '') {
      app._lastBarriersSerialized = '';
      app.konva.clearBarriers();
    }
    return;
  }
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
}

function drawObjects(
  app: App,
  ctx: CanvasRenderingContext2D,
  objs: ReturnType<App['objects']>,
  selIdx: number | null,
  visibleTypes: Set<number>,
  width: number,
  height: number,
  zoom: number,
): void {
  const PLAYER_CAR_TYPE_RES = 128;
  const objsVisible = app.showObjects();
  const baseRadius = Math.min(20, Math.max(5, 8 * zoom));
  const labelFont = `${Math.max(9, 10 * zoom)}px monospace`;

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

    ctx.strokeStyle = isSel ? '#ffffff' : isPlayerCar ? '#ffe082' : color;
    ctx.lineWidth = isSel ? 2 : 1;
    ctx.strokeRect(cx - drawWidth / 2, cy - drawHeight / 2, drawWidth, drawHeight);

    const arrowLen = Math.max(baseRadius * 1.2, drawHeight * 0.6);
    const arrow = worldDirToCanvasForwardVector(obj.dir, arrowLen);
    ctx.strokeStyle = isSel ? '#ffffff' : 'rgba(255,255,255,0.6)';
    ctx.lineWidth = isSel ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + arrow.dx, cy + arrow.dy);
    ctx.stroke();

    if (isSel) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(drawWidth, drawHeight) / 2 + 5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
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
}

