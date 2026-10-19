import { err, ok, type Result } from 'neverthrow';
import Konva from 'konva';

export async function createOffscreenBitmap(
  drawFn: (ctx: CanvasRenderingContext2D, logicalW: number, logicalH: number) => void,
  logicalW: number,
  logicalH: number,
  dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1)),
): Promise<Result<ImageBitmap, string>> {
  const off = document.createElement('canvas');
  off.width = Math.max(1, Math.floor(logicalW * dpr));
  off.height = Math.max(1, Math.floor(logicalH * dpr));
  const ctx = off.getContext('2d');
  if (!ctx) return err('Unable to get 2D context for offscreen canvas');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawFn(ctx, logicalW, logicalH);
  const bitmap = await createImageBitmap(off);
  return ok(bitmap);
}

export function applyBackgroundTransform(
  bgImageNode: Konva.Image | null,
  zoom: number,
  panX: number,
  panY: number,
  cssW: number,
  cssH: number,
  logicalW: number,
  logicalH: number,
): void {
  if (!bgImageNode) return;
  const sx = zoom * (cssW / logicalW);
  const sy = zoom * (cssH / logicalH);
  const gx = cssW / 2 - panX * sx;
  const gy = cssH / 2 + panY * sy;
  bgImageNode.x(gx);
  bgImageNode.y(gy);
  bgImageNode.scaleX(sx);
  bgImageNode.scaleY(sy);
}

export async function updateOffscreenBackground(
  stage: Konva.Stage | null,
  bgImageNode: Konva.Image | null,
  bgLayer: Konva.Layer | null,
  logicalW: number,
  logicalH: number,
  zoom: number,
  panX: number,
  panY: number,
  cssW: number,
  cssH: number,
  drawFn: (ctx: CanvasRenderingContext2D, logicalW: number, logicalH: number) => void,
  desiredDpr?: number,
): Promise<ImageBitmap | null> {
  if (!stage || !bgImageNode || !bgLayer) return null;
  const dpr = desiredDpr ?? Math.max(1, Math.floor(window.devicePixelRatio || 1));
  const bitmapResult = await createOffscreenBitmap(drawFn, logicalW, logicalH, dpr);
  if (!bitmapResult.isOk()) return null;
  const bitmap = bitmapResult.value;
  bgImageNode.image(bitmap);
  bgImageNode.width(logicalW);
  bgImageNode.height(logicalH);
  applyBackgroundTransform(bgImageNode, zoom, panX, panY, cssW, cssH, logicalW, logicalH);
  bgLayer.draw();
  return bitmap;
}
