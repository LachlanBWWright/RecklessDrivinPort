import type { App } from './app';
import {
  DEFAULT_ROAD_THEME,
  drawMarkingRangeOverlay,
  drawObjectGroupSpawnPreviewObjects,
  drawObjectTrackOverlay,
  drawMarksOnCanvas,
  drawObjectRoadPreviewCached,
  getObjectCanvas,
  MIN_HIT_RADIUS,
  OBJ_PALETTE,
  PLAYER_CAR_TYPE_RES,
  ROAD_THEMES,
  worldToCanvas,
} from './object-canvas';
import { worldDirToCanvasRotationRad } from './object-direction-utils';

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
  const barrierDrawLock = app.drawMode() !== 'none';

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
      (x: number, y: number) => worldToCanvas(app, x, y),
      zoom,
      barrierDrawLock,
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
      (x: number, y: number) => worldToCanvas(app, x, y),
      app.marks(),
      app.selectedMarkIndex(),
      app._konvaInitialized && !barrierDrawLock,
      app.markCreateMode(),
      barrierDrawLock,
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

  const markingRangePreview = app.markingRangePreview();
  const objectGroupRangePreview = app.objectGroupRangePreview();
  const activeRangePreview = markingRangePreview ?? objectGroupRangePreview;
  if (level && activeRangePreview) {
    drawMarkingRangeOverlay(
      ctx,
      width,
      height,
      (worldY) => worldToCanvas(app, 0, worldY)[1],
      activeRangePreview,
      markingRangePreview === null
        ? { stroke: 'rgba(77,208,225,0.72)', fill: 'rgba(77,208,225,0.96)' }
        : { stroke: 'rgba(255,214,102,0.65)', fill: 'rgba(255,214,102,0.95)' },
    );
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
    const drawWidth = previewCanvas
      ? Math.max(MIN_HIT_RADIUS * 2, previewCanvas.width * zoom)
      : baseRadius * 2.5;
    const drawHeight = previewCanvas
      ? Math.max(MIN_HIT_RADIUS * 2, previewCanvas.height * zoom)
      : baseRadius * 2.5;
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

  const objectGroupSpawnPreviewObjects = app.objectGroupSpawnPreviewObjects();
  if (objectGroupSpawnPreviewObjects.length > 0) {
    drawObjectGroupSpawnPreviewObjects(
      ctx,
      app,
      objectGroupSpawnPreviewObjects,
      width,
      height,
      zoom,
      visibleTypes,
    );
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
    objsVisible && !barrierDrawLock ? objs : [],
    selIdx,
    visibleTypes,
    OBJ_PALETTE,
    (typeRes: number) => app.getObjectSpritePreview(typeRes),
    zoom,
    panX,
    panY,
  );
  if (level && app.showTrackOverlay() && !barrierDrawLock) {
    const up = app.showTrackUp() ? app.editTrackUp() : [];
    const down = app.showTrackDown() ? app.editTrackDown() : [];
    app.konva.setTrackWaypoints(up, down, zoom, panX, panY);
  } else {
    app.konva.clearTrackWaypoints();
  }
  if (level && app.showMarks() && !barrierDrawLock) {
    app.konva.setMarks(app.marks(), app.selectedMarkIndex(), zoom, panX, panY);
  } else {
    app.konva.clearMarks();
  }
  if (level && !barrierDrawLock) {
    app.konva.setFinishLine(liveFinishY, zoom, panX, panY);
  } else {
    app.konva.clearFinishLine();
  }
  app.konva.flush();
}
