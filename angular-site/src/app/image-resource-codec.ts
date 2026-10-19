/**
 * Image/resource byte conversion helpers extracted from app.ts.
 *
 * These functions are pure or DOM-local and do not depend on Angular state.
 */
export { decodePackBits, decodePackBits16 } from './image-packbits-codec';
export { imageDataToIconHash, renderIconBytes } from './image-icon-codec';

/** Decode Mac PackBits where tokens expand 16-bit words (packType=3 rows). */
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

/* function encodePackBitsRow8(row: Uint8Array): Uint8Array {
  const out: number[] = [];
  let pos = 0;
  while (pos < row.length) {
    const chunk = Math.min(128, row.length - pos);
    out.push(chunk - 1);
    for (let i = 0; i < chunk; i += 1) out.push(row[pos + i] ?? 0);
    pos += chunk;
  }
  return new Uint8Array(out);
} */

function encodePackBitsRow16(row: Uint8Array): Uint8Array {
  const out: number[] = [];
  let pos = 0;
  const totalWords = Math.floor(row.length / 2);
  while (pos < totalWords) {
    const chunkWords = Math.min(128, totalWords - pos);
    out.push(chunkWords - 1);
    for (let i = 0; i < chunkWords; i += 1) {
      const off = (pos + i) * 2;
      out.push(row[off] ?? 0, row[off + 1] ?? 0);
    }
    pos += chunkWords;
  }
  return new Uint8Array(out);
}

function writeU16BE(dst: number[], value: number): void {
  dst.push((value >>> 8) & 0xff, value & 0xff);
}

function writeS16BE(dst: number[], value: number): void {
  const v = value & 0xffff;
  dst.push((v >>> 8) & 0xff, v & 0xff);
}

function writeU32BE(dst: number[], value: number): void {
  dst.push((value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff);
}

function rgbaToRgb15Rows(rgba: Uint8ClampedArray, width: number, height: number): Uint8Array[] {
  const rows: Uint8Array[] = [];
  for (let y = 0; y < height; y += 1) {
    const row = new Uint8Array(width * 2);
    for (let x = 0; x < width; x += 1) {
      const si = (y * width + x) * 4;
      const r5 = (rgba[si] ?? 0) >> 3;
      const g5 = (rgba[si + 1] ?? 0) >> 3;
      const b5 = (rgba[si + 2] ?? 0) >> 3;
      const pixel = (r5 << 10) | (g5 << 5) | b5;
      row[x * 2] = (pixel >>> 8) & 0xff;
      row[x * 2 + 1] = pixel & 0xff;
    }
    rows.push(row);
  }
  return rows;
}

/**
 * Encode RGBA pixels as a QuickDraw PICT v2 DirectBitsRect stream (16-bit x5R5G5B).
 * This form is accepted by both the editor decoder and the game's runtime decoder.
 */
export function encodeRgbaToPictV2(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
): Uint8Array {
  const out: number[] = [];

  // picSize (legacy, can be 0) + picFrame
  writeU16BE(out, 0);
  writeS16BE(out, 0);
  writeS16BE(out, 0);
  writeS16BE(out, height);
  writeS16BE(out, width);

  // VersionOp + Version2
  writeU16BE(out, 0x0011);
  writeU16BE(out, 0x02ff);

  // HeaderOp (24 bytes payload)
  writeU16BE(out, 0x0c00);
  for (let i = 0; i < 24; i += 1) out.push(0);

  // DirectBitsRect
  writeU16BE(out, 0x009a);
  writeU32BE(out, 0x000000ff); // baseAddr placeholder

  const rowBytes = width * 2;
  writeU16BE(out, 0x8000 | rowBytes); // PixMap flag + rowBytes

  // bounds
  writeS16BE(out, 0);
  writeS16BE(out, 0);
  writeS16BE(out, height);
  writeS16BE(out, width);

  // Remaining PixMap fields
  writeU16BE(out, 0); // pmVersion
  writeU16BE(out, 3); // packType (PackBits 16-bit words)
  writeU32BE(out, 0); // packSize
  writeU32BE(out, 72 << 16); // hRes (72 dpi fixed)
  writeU32BE(out, 72 << 16); // vRes (72 dpi fixed)
  writeU16BE(out, 16); // pixelType (direct)
  writeU16BE(out, 16); // pixelSize
  writeU16BE(out, 3); // cmpCount
  writeU16BE(out, 5); // cmpSize
  writeU32BE(out, 0); // planeBytes
  writeU32BE(out, 0); // pmTable
  writeU32BE(out, 0); // pmReserved

  // srcRect + dstRect + mode
  writeS16BE(out, 0);
  writeS16BE(out, 0);
  writeS16BE(out, height);
  writeS16BE(out, width);
  writeS16BE(out, 0);
  writeS16BE(out, 0);
  writeS16BE(out, height);
  writeS16BE(out, width);
  writeU16BE(out, 0); // srcCopy

  const rows = rgbaToRgb15Rows(rgba, width, height);
  for (const row of rows) {
    const packed = encodePackBitsRow16(row);
    if (rowBytes > 250) {
      writeU16BE(out, packed.length);
    } else {
      out.push(packed.length & 0xff);
    }
    for (let i = 0; i < packed.length; i += 1) out.push(packed[i] ?? 0);
  }

  writeU16BE(out, 0x00ff); // EndPicture
  return new Uint8Array(out);
}

export { renderPictBytes } from './image-pict-codec';
