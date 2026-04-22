/**
 * Marker drawing helpers for the object editor canvas.
 *
 * Renders the start marker flag and finish line onto a 2D canvas context.
 */
import type { App } from './app';
import { worldToCanvas } from './object-canvas';
import { OBJ_PALETTE } from './object-canvas';

export function drawStartMarkerOnCanvas(
  app: App,
  ctx: CanvasRenderingContext2D,
  level: App['selectedLevel'] extends (...args: unknown[]) => infer R ? R : never,
  width: number,
  height: number,
  zoom: number,
): void {
  if (!level) return;
  const startX = app.editXStartPos();
  const [sx, sy] = worldToCanvas(app, startX, 0);
  if (sx < -20 || sx > width + 20 || sy < -20 || sy > height + 20) return;
  const zf = Math.min(zoom, 2);
  const color = app._draggingStartMarker ? '#ffffff' : '#00e5ff';
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(sx, sy - 20 * zf);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(sx, sy - 20 * zf);
  ctx.lineTo(sx + 10 * zf, sy - 14 * zf);
  ctx.lineTo(sx, sy - 8 * zf);
  ctx.closePath();
  ctx.fill();
  if (zoom > 0.4) {
    ctx.font = `${Math.max(9, 10 * zoom)}px monospace`;
    ctx.fillText(`START X=${startX}`, sx + 6, sy - 20 * zf - 2);
  }
}

export function drawFinishLineOnCanvas(
  app: App,
  ctx: CanvasRenderingContext2D,
  level: App['selectedLevel'] extends (...args: unknown[]) => infer R ? R : never,
  width: number,
  height: number,
  zoom: number,
): void {
  const liveFinishY = app.editLevelEnd();
  if (!level || liveFinishY < 0) return;
  const [, finishY] = worldToCanvas(app, 0, liveFinishY);
  if (finishY < -2 || finishY > height + 2) return;
  const color = app._draggingFinishLine ? '#ffffff' : '#f9a825';
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.setLineDash([10, 6]);
  ctx.beginPath();
  ctx.moveTo(0, finishY);
  ctx.lineTo(width, finishY);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = color;
  ctx.font = `${Math.max(9, 11 * zoom)}px monospace`;
  ctx.fillText(`FINISH Y=${liveFinishY}`, 6, finishY - 4);
}

export function drawOriginDotOnCanvas(ctx: CanvasRenderingContext2D, app: App): void {
  const [ox, oy] = worldToCanvas(app, 0, 0);
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.beginPath();
  ctx.arc(ox, oy, 3, 0, Math.PI * 2);
  ctx.fill();
}

export { OBJ_PALETTE };

export function drawGridLines(
  app: App,
  ctx: CanvasRenderingContext2D,
  width: number, height: number, zoom: number, panX: number, panY: number,
): void {
  if (!app.showGrid()) return;
  const gridStep = 100;
  if (gridStep * zoom <= 8) return;
  ctx.strokeStyle = 'rgba(0,0,0,0.18)';
  ctx.lineWidth = 1;
  const [swx, swY] = [panX - width / (2 * zoom), panY - height / (2 * zoom)];
  const [ewX, ewY] = [panX + width / (2 * zoom), panY + height / (2 * zoom)];
  ctx.beginPath();
  for (let gx = Math.floor(swx / gridStep) * gridStep; gx <= ewX; gx += gridStep) {
    const [cx] = worldToCanvas(app, gx, 0);
    ctx.moveTo(cx, 0); ctx.lineTo(cx, height);
  }
  for (let gy = Math.floor(swY / gridStep) * gridStep; gy <= ewY; gy += gridStep) {
    const [, cy] = worldToCanvas(app, 0, gy);
    ctx.moveTo(0, cy); ctx.lineTo(width, cy);
  }
  ctx.stroke();
}

export function drawOriginAxes(
  ctx: CanvasRenderingContext2D, width: number, height: number, app: App,
): void {
  const [ox, oy] = worldToCanvas(app, 0, 0);
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(ox, 0); ctx.lineTo(ox, height); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, oy); ctx.lineTo(width, oy); ctx.stroke();
}
