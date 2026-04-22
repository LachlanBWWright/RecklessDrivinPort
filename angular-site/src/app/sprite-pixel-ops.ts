/**
 * Pure pixel manipulation operations for the sprite editor.
 *
 * All functions operate on a flat RGBA8888 Uint8ClampedArray buffer
 * (4 bytes per pixel, row-major order). No Angular or DOM dependencies.
 */

export function setPixelRgba(
  pixels: Uint8ClampedArray,
  w: number,
  h: number,
  x: number,
  y: number,
  r: number,
  g: number,
  b: number,
  a: number,
): void {
  if (x < 0 || y < 0 || x >= w || y >= h) return;
  const i = (y * w + x) * 4;
  pixels[i] = r;
  pixels[i + 1] = g;
  pixels[i + 2] = b;
  pixels[i + 3] = a;
}

export function applyBrush(
  pixels: Uint8ClampedArray,
  w: number,
  h: number,
  cx: number,
  cy: number,
  brushSize: number,
  r: number,
  g: number,
  b: number,
  a: number,
): void {
  const half = Math.floor(brushSize / 2);
  for (let dy = -half; dy < brushSize - half; dy++) {
    for (let dx = -half; dx < brushSize - half; dx++) {
      setPixelRgba(pixels, w, h, cx + dx, cy + dy, r, g, b, a);
    }
  }
}

export function applyBresenhamLine(
  pixels: Uint8ClampedArray,
  w: number,
  h: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  brushSize: number,
  r: number,
  g: number,
  b: number,
  a: number,
): void {
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  let cx = x0;
  let cy = y0;
  while (true) {
    applyBrush(pixels, w, h, cx, cy, brushSize, r, g, b, a);
    if (cx === x1 && cy === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; cx += sx; }
    if (e2 < dx) { err += dx; cy += sy; }
  }
}

export function pickPixelColor(
  pixels: Uint8ClampedArray,
  w: number,
  x: number,
  y: number,
): [number, number, number, number] {
  const i = (y * w + x) * 4;
  return [pixels[i] ?? 0, pixels[i + 1] ?? 0, pixels[i + 2] ?? 0, pixels[i + 3] ?? 0];
}

export function floodFillPixels(
  pixels: Uint8ClampedArray,
  w: number,
  h: number,
  sx: number,
  sy: number,
  fillR: number,
  fillG: number,
  fillB: number,
  fillA: number,
): void {
  const i0 = (sy * w + sx) * 4;
  const targetR = pixels[i0] ?? 0;
  const targetG = pixels[i0 + 1] ?? 0;
  const targetB = pixels[i0 + 2] ?? 0;
  const targetA = pixels[i0 + 3] ?? 0;
  if (targetR === fillR && targetG === fillG && targetB === fillB && targetA === fillA) return;

  const stack: [number, number][] = [[sx, sy]];
  const visited = new Uint8Array(w * h);
  while (stack.length > 0) {
    const top = stack.pop();
    if (!top) break;
    const [x, y] = top;
    if (x < 0 || y < 0 || x >= w || y >= h) continue;
    const idx = y * w + x;
    if (visited[idx]) continue;
    visited[idx] = 1;
    const i = idx * 4;
    if (pixels[i] !== targetR || pixels[i + 1] !== targetG ||
        pixels[i + 2] !== targetB || pixels[i + 3] !== targetA) continue;
    pixels[i] = fillR;
    pixels[i + 1] = fillG;
    pixels[i + 2] = fillB;
    pixels[i + 3] = fillA;
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
}

export function extractSpriteFramePalette(
  pixels: Uint8ClampedArray,
): { r: number; g: number; b: number; a: number }[] {
  const seen = new Set<number>();
  const cols: { r: number; g: number; b: number; a: number }[] = [];
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i] ?? 0;
    const g = pixels[i + 1] ?? 0;
    const b = pixels[i + 2] ?? 0;
    const a = pixels[i + 3] ?? 0;
    if (a === 0) continue;
    const key = (r << 24) | (g << 16) | (b << 8) | a;
    if (!seen.has(key)) {
      seen.add(key);
      cols.push({ r, g, b, a });
      if (cols.length >= 64) break;
    }
  }
  cols.sort((a, b) => (a.r + a.g + a.b) - (b.r + b.g + b.b));
  return cols;
}

export function fitSpriteZoom(spriteW: number, spriteH: number): number {
  const maxDim = Math.max(spriteW, spriteH);
  if (maxDim <= 0) return 8;
  return Math.max(1, Math.min(16, Math.floor(512 / maxDim)));
}
