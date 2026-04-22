/**
 * Image/resource byte conversion helpers extracted from app.ts.
 *
 * These functions are pure or DOM-local and do not depend on Angular state.
 */

/** Decode Mac PackBits RLE-compressed bytes into a fixed-size output buffer. */
export function decodePackBits(src: Uint8Array, expectedSize: number): Uint8Array {
  const out = new Uint8Array(expectedSize);
  let si = 0;
  let di = 0;
  while (si < src.length && di < expectedSize) {
    const flag = src[si++];
    if (flag === undefined) break;
    if (flag > 127) {
      const count = 257 - flag;
      const val = si < src.length ? src[si++] : 0;
      for (let k = 0; k < count && di < expectedSize; k += 1) out[di++] = val ?? 0;
    } else {
      const count = flag + 1;
      for (let k = 0; k < count && si < src.length && di < expectedSize; k += 1) {
        out[di++] = src[si++] ?? 0;
      }
    }
  }
  return out;
}

/** Standard Macintosh 8-bit system colour table (clut id=8). */
// prettier-ignore
export const MAC_8BIT_PALETTE: readonly number[] = [
  255,255,255, 255,255,204, 255,255,153, 255,255,102, 255,255,51,  255,255,0,
  255,204,255, 255,204,204, 255,204,153, 255,204,102, 255,204,51,  255,204,0,
  255,153,255, 255,153,204, 255,153,153, 255,153,102, 255,153,51,  255,153,0,
  255,102,255, 255,102,204, 255,102,153, 255,102,102, 255,102,51,  255,102,0,
  255,51,255,  255,51,204,  255,51,153,  255,51,102,  255,51,51,   255,51,0,
  255,0,255,   255,0,204,   255,0,153,   255,0,102,   255,0,51,    255,0,0,
  204,255,255, 204,255,204, 204,255,153, 204,255,102, 204,255,51,  204,255,0,
  204,204,255, 204,204,204, 204,204,153, 204,204,102, 204,204,51,  204,204,0,
  204,153,255, 204,153,204, 204,153,153, 204,153,102, 204,153,51,  204,153,0,
  204,102,255, 204,102,204, 204,102,153, 204,102,102, 204,102,51,  204,102,0,
  204,51,255,  204,51,204,  204,51,153,  204,51,102,  204,51,51,   204,51,0,
  204,0,255,   204,0,204,   204,0,153,   204,0,102,   204,0,51,    204,0,0,
  153,255,255, 153,255,204, 153,255,153, 153,255,102, 153,255,51,  153,255,0,
  153,204,255, 153,204,204, 153,204,153, 153,204,102, 153,204,51,  153,204,0,
  153,153,255, 153,153,204, 153,153,153, 153,153,102, 153,153,51,  153,153,0,
  153,102,255, 153,102,204, 153,102,153, 153,102,102, 153,102,51,  153,102,0,
  153,51,255,  153,51,204,  153,51,153,  153,51,102,  153,51,51,   153,51,0,
  153,0,255,   153,0,204,   153,0,153,   153,0,102,   153,0,51,    153,0,0,
  102,255,255, 102,255,204, 102,255,153, 102,255,102, 102,255,51,  102,255,0,
  102,204,255, 102,204,204, 102,204,153, 102,204,102, 102,204,51,  102,204,0,
  102,153,255, 102,153,204, 102,153,153, 102,153,102, 102,153,51,  102,153,0,
  102,102,255, 102,102,204, 102,102,153, 102,102,102, 102,102,51,  102,102,0,
  102,51,255,  102,51,204,  102,51,153,  102,51,102,  102,51,51,   102,51,0,
  102,0,255,   102,0,204,   102,0,153,   102,0,102,   102,0,51,    102,0,0,
  51,255,255,  51,255,204,  51,255,153,  51,255,102,  51,255,51,   51,255,0,
  51,204,255,  51,204,204,  51,204,153,  51,204,102,  51,204,51,   51,204,0,
  51,153,255,  51,153,204,  51,153,153,  51,153,102,  51,153,51,   51,153,0,
  51,102,255,  51,102,204,  51,102,153,  51,102,102,  51,102,51,   51,102,0,
  51,51,255,   51,51,204,   51,51,153,   51,51,102,   51,51,51,    51,51,0,
  51,0,255,    51,0,204,    51,0,153,    51,0,102,    51,0,51,     51,0,0,
  0,255,255,   0,255,204,   0,255,153,   0,255,102,   0,255,51,    0,255,0,
  0,204,255,   0,204,204,   0,204,153,   0,204,102,   0,204,51,    0,204,0,
  0,153,255,   0,153,204,   0,153,153,   0,153,102,   0,153,51,    0,153,0,
  0,102,255,   0,102,204,   0,102,153,   0,102,102,   0,102,51,    0,102,0,
  0,51,255,    0,51,204,    0,51,153,    0,51,102,    0,51,51,     0,51,0,
  0,0,255,     0,0,204,     0,0,153,     0,0,102,     0,0,51,      0,0,0,
  0,0,0,         17,17,17,      34,34,34,      51,51,51,      68,68,68,      85,85,85,
  102,102,102,   119,119,119,   136,136,136,   153,153,153,   170,170,170,   187,187,187,
  204,204,204,   221,221,221,   238,238,238,   255,165,0,     255,128,0,     128,0,128,
  128,128,0,     0,128,128,     0,128,0,       128,0,0,       0,0,128,       210,180,140,
  160,82,45,     139,69,19,     105,105,105,   112,128,144,   119,136,153,   47,79,79,
  72,61,139,     139,0,139,     0,100,0,       165,42,42,     188,143,143,   173,153,127,
  244,164,96,    210,105,30,    255,218,185,   0,0,0,
];

let mac8bitLut: Map<number, number> | null = null;

function getMac8bitLut(): Map<number, number> {
  if (mac8bitLut) return mac8bitLut;
  const pal = MAC_8BIT_PALETTE;
  const palLen = pal.length / 3;
  const lut = new Map<number, number>();
  for (let rq = 0; rq < 32; rq += 1) {
    for (let gq = 0; gq < 32; gq += 1) {
      for (let bq = 0; bq < 32; bq += 1) {
        const r = rq * 8;
        const g = gq * 8;
        const b = bq * 8;
        let bestIdx = 0;
        let bestDist = Infinity;
        for (let p = 0; p < palLen; p += 1) {
          const dr = r - (pal[p * 3] ?? 0);
          const dg = g - (pal[p * 3 + 1] ?? 0);
          const db = b - (pal[p * 3 + 2] ?? 0);
          const dist = dr * dr + dg * dg + db * db;
          if (dist < bestDist) {
            bestDist = dist;
            bestIdx = p;
          }
        }
        lut.set((rq << 10) | (gq << 5) | bq, bestIdx);
      }
    }
  }
  mac8bitLut = lut;
  return lut;
}

export function renderIconBytes(bytes: Uint8Array): HTMLCanvasElement | null {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const imgData = ctx.createImageData(32, 32);
  for (let row = 0; row < 32; row += 1) {
    const rowByte = Math.floor(row * 4);
    for (let col = 0; col < 32; col += 1) {
      const byteIdx = rowByte + Math.floor(col / 8);
      const bitIdx = 7 - (col % 8);
      const bit = byteIdx < bytes.length ? (bytes[byteIdx] >> bitIdx) & 1 : 0;
      const i = (row * 32 + col) * 4;
      imgData.data[i] = bit ? 0 : 255;
      imgData.data[i + 1] = bit ? 0 : 255;
      imgData.data[i + 2] = bit ? 0 : 255;
      imgData.data[i + 3] = 255;
    }
  }
  ctx.putImageData(imgData, 0, 0);
  return canvas;
}

export function imageDataToIconHash(rgba: Uint8ClampedArray): Uint8Array {
  const out = new Uint8Array(256);
  for (let row = 0; row < 32; row += 1) {
    for (let byteInRow = 0; byteInRow < 4; byteInRow += 1) {
      let b = 0;
      let mask = 0xff;
      for (let bit = 0; bit < 8; bit += 1) {
        const col = byteInRow * 8 + bit;
        const i = (row * 32 + col) * 4;
        const lum = rgba[i] * 0.299 + rgba[i + 1] * 0.587 + rgba[i + 2] * 0.114;
        if (lum < 128) b |= 1 << (7 - bit);
      }
      out[row * 4 + byteInRow] = b;
      out[128 + row * 4 + byteInRow] = mask;
    }
  }
  return out;
}

function renderPalettedIcon(bytes: Uint8Array, w: number, h: number): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const imgData = ctx.createImageData(w, h);
  const pal = MAC_8BIT_PALETTE;
  const palLen = pal.length / 3;
  for (let i = 0; i < w * h; i += 1) {
    const idx = i < bytes.length ? bytes[i] : 0;
    const pi = (idx < palLen ? idx : palLen - 1) * 3;
    const di = i * 4;
    imgData.data[di] = pal[pi] ?? 0;
    imgData.data[di + 1] = pal[pi + 1] ?? 0;
    imgData.data[di + 2] = pal[pi + 2] ?? 0;
    imgData.data[di + 3] = 255;
  }
  ctx.putImageData(imgData, 0, 0);
  return canvas;
}

export function renderIcl8Bytes(bytes: Uint8Array): HTMLCanvasElement | null {
  return renderPalettedIcon(bytes, 32, 32);
}

export function renderIcs8Bytes(bytes: Uint8Array): HTMLCanvasElement | null {
  return renderPalettedIcon(bytes, 16, 16);
}

export function imageDataToIcl8(rgba: Uint8ClampedArray): Uint8Array {
  const pixelCount = rgba.length / 4;
  const out = new Uint8Array(pixelCount);
  const lut = getMac8bitLut();
  for (let i = 0; i < pixelCount; i += 1) {
    const rq = rgba[i * 4] >> 3;
    const gq = rgba[i * 4 + 1] >> 3;
    const bq = rgba[i * 4 + 2] >> 3;
    out[i] = lut.get((rq << 10) | (gq << 5) | bq) ?? 0;
  }
  return out;
}

export { renderPictBytes } from './render-pict';
