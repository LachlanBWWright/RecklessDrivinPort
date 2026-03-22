import Konva from 'konva';

export async function createOffscreenBitmap(
  drawFn: (ctx: CanvasRenderingContext2D, logicalW: number, logicalH: number) => void,
  logicalW: number,
  logicalH: number,
  dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1)),
): Promise<ImageBitmap> {
  const off = document.createElement('canvas');
  off.width = Math.max(1, Math.floor(logicalW * dpr));
  off.height = Math.max(1, Math.floor(logicalH * dpr));
  const ctx = off.getContext('2d');
  if (!ctx) throw new Error('Unable to get 2D context for offscreen canvas');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawFn(ctx, logicalW, logicalH);
  const bitmap = await createImageBitmap(off);
  return bitmap;
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
