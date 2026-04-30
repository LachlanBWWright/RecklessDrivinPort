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

function renderMonoIcon(
  bytes: Uint8Array,
  width: number,
  height: number,
): HTMLCanvasElement | null {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const bytesPerRow = Math.ceil(width / 8);
  const planeSize = bytesPerRow * height;
  const hasMaskPlane = bytes.length >= planeSize * 2;
  const bitmapPlane = bytes.subarray(0, planeSize);
  const maskPlane = hasMaskPlane ? bytes.subarray(planeSize, planeSize * 2) : null;

  const imgData = ctx.createImageData(width, height);
  for (let row = 0; row < height; row += 1) {
    const rowByte = row * bytesPerRow;
    for (let col = 0; col < width; col += 1) {
      const byteIdx = rowByte + Math.floor(col / 8);
      const bitIdx = 7 - (col % 8);
      const bit = byteIdx < bitmapPlane.length ? (bitmapPlane[byteIdx] >> bitIdx) & 1 : 0;
      const maskBit =
        maskPlane && byteIdx < maskPlane.length ? (maskPlane[byteIdx] >> bitIdx) & 1 : 1;
      const i = (row * width + col) * 4;
      imgData.data[i] = bit ? 0 : 255;
      imgData.data[i + 1] = bit ? 0 : 255;
      imgData.data[i + 2] = bit ? 0 : 255;
      imgData.data[i + 3] = maskBit ? 255 : 0;
    }
  }
  ctx.putImageData(imgData, 0, 0);
  return canvas;
}

export function renderIconBytes(
  bytes: Uint8Array,
  iconType: string = 'ICN#',
): HTMLCanvasElement | null {
  const normalizedType = iconType.trim().toUpperCase();
  if (normalizedType === 'ICS#') {
    return renderMonoIcon(bytes, 16, 16);
  }
  return renderMonoIcon(bytes, 32, 32);
}

export function imageDataToIconHash(rgba: Uint8ClampedArray, width = 32, height = 32): Uint8Array {
  const bytesPerRow = Math.ceil(width / 8);
  const planeSize = bytesPerRow * height;
  const out = new Uint8Array(planeSize * 2);
  for (let row = 0; row < height; row += 1) {
    for (let byteInRow = 0; byteInRow < bytesPerRow; byteInRow += 1) {
      let b = 0;
      let mask = 0xff;
      for (let bit = 0; bit < 8; bit += 1) {
        const col = byteInRow * 8 + bit;
        if (col >= width) {
          continue;
        }
        const i = (row * width + col) * 4;
        const lum = rgba[i] * 0.299 + rgba[i + 1] * 0.587 + rgba[i + 2] * 0.114;
        if (lum < 128) b |= 1 << (7 - bit);
      }
      out[row * bytesPerRow + byteInRow] = b;
      out[planeSize + row * bytesPerRow + byteInRow] = mask;
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

export function renderPictBytes(bytes: Uint8Array): HTMLCanvasElement | null {
  if (typeof document === 'undefined' || bytes.length < 14) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  let pos = 2;
  const picTop = view.getInt16(pos, false);
  pos += 2;
  const picLeft = view.getInt16(pos, false);
  pos += 2;
  const picBottom = view.getInt16(pos, false);
  pos += 2;
  const picRight = view.getInt16(pos, false);
  pos += 2;
  const picW = picRight - picLeft;
  const picH = picBottom - picTop;
  if (picW <= 0 || picH <= 0 || picW > 4096 || picH > 4096) return null;

  const canvas = document.createElement('canvas');
  canvas.width = picW;
  canvas.height = picH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  let isV2 = false;
  if (pos + 2 <= bytes.length && view.getUint16(pos, false) === 0x0011) {
    pos += 2;
    if (pos + 2 <= bytes.length && view.getUint16(pos, false) === 0x02ff) {
      isV2 = true;
      pos += 2;
    }
  }

  let rendered = false;
  outer: while (pos + (isV2 ? 2 : 1) <= bytes.length) {
    let opcode: number;
    if (isV2) {
      if (pos % 2 !== 0) pos += 1;
      if (pos + 2 > bytes.length) break;
      opcode = view.getUint16(pos, false);
      pos += 2;
    } else {
      opcode = view.getUint8(pos++);
    }

    switch (opcode) {
      case 0x0000:
        break;
      case 0x00ff:
        break outer;
      case 0x0001: {
        if (pos + 2 > bytes.length) break outer;
        const rgnSize = view.getUint16(pos, false);
        pos += rgnSize;
        break;
      }
      case 0x0003:
        pos += 2;
        break;
      case 0x0004:
        pos += 2;
        break;
      case 0x0005:
        pos += 2;
        break;
      case 0x0006:
        pos += 4;
        break;
      case 0x0007:
        pos += 4;
        break;
      case 0x0008:
        pos += 2;
        break;
      case 0x0009:
        pos += 8;
        break;
      case 0x000a:
        pos += 8;
        break;
      case 0x000b:
        pos += 4;
        break;
      case 0x000c:
        pos += 4;
        break;
      case 0x000d:
        pos += 2;
        break;
      case 0x000e:
        pos += 4;
        break;
      case 0x000f:
        pos += 4;
        break;
      case 0x0010:
        pos += 8;
        break;
      case 0x001a:
        pos += 6;
        break;
      case 0x001b:
        pos += 6;
        break;
      case 0x001c:
        break;
      case 0x001d:
        pos += 6;
        break;
      case 0x001e:
        break;
      case 0x001f:
        pos += 6;
        break;
      case 0x00a0:
        // ShortComment: 2-byte kind (no data)
        pos += 2;
        break;
      case 0x00a1: {
        // LongComment: 2-byte kind + 2-byte size + size bytes of data
        pos += 2; // skip kind
        if (pos + 2 > bytes.length) break outer;
        const commentSize = view.getUint16(pos, false);
        pos += 2 + commentSize;
        break;
      }
      case 0x0c00:
        pos += 24;
        break;
      case 0x0098:
      case 0x0099:
      case 0x009a:
      case 0x009b: {
        const isDirect = opcode === 0x009a || opcode === 0x009b;
        if (isDirect && pos + 4 <= bytes.length) pos += 4;

        if (pos + 2 > bytes.length) break outer;
        const rowBytesRaw = view.getUint16(pos, false);
        pos += 2;
        const rowBytes = rowBytesRaw & 0x3fff;
        const isPixMap = (rowBytesRaw & 0x8000) !== 0 || isDirect;

        if (pos + 8 > bytes.length) break outer;
        const bTop = view.getInt16(pos, false);
        pos += 2;
        const bLeft = view.getInt16(pos, false);
        pos += 2;
        const bBottom = view.getInt16(pos, false);
        pos += 2;
        const bRight = view.getInt16(pos, false);
        pos += 2;
        const imgW = bRight - bLeft;
        const imgH = bBottom - bTop;
        if (imgW <= 0 || imgH <= 0 || imgW > 4096 || imgH > 4096) break outer;

        let pixelSize = 1;
        let packType = 0;
        let cmpCount = 1;
        let colorTable: number[] | null = null;

        if (isPixMap) {
          if (pos + 2 > bytes.length) break outer;
          pos += 2;
          if (pos + 2 > bytes.length) break outer;
          packType = view.getUint16(pos, false);
          pos += 2;
          if (pos + 4 > bytes.length) break outer;
          pos += 4;
          if (pos + 8 > bytes.length) break outer;
          pos += 8;
          if (pos + 2 > bytes.length) break outer;
          pos += 2;
          if (pos + 2 > bytes.length) break outer;
          pixelSize = view.getUint16(pos, false);
          pos += 2;
          if (pos + 2 > bytes.length) break outer;
          cmpCount = view.getUint16(pos, false);
          pos += 2;
          if (pos + 2 > bytes.length) break outer;
          pos += 2;
          if (pos + 4 > bytes.length) break outer;
          pos += 4;
          if (pos + 4 > bytes.length) break outer;
          pos += 4;
          if (pos + 4 > bytes.length) break outer;
          pos += 4;

          if (!isDirect && pixelSize <= 8) {
            if (pos + 8 > bytes.length) break outer;
            pos += 4;
            pos += 2;
            const ctSize = view.getInt16(pos, false) + 1;
            pos += 2;
            colorTable = [];
            for (let ci = 0; ci < ctSize; ci += 1) {
              if (pos + 8 > bytes.length) break outer;
              pos += 2;
              const r = view.getUint16(pos, false) >> 8;
              pos += 2;
              const g = view.getUint16(pos, false) >> 8;
              pos += 2;
              const b = view.getUint16(pos, false) >> 8;
              pos += 2;
              colorTable.push(r, g, b);
            }
          }
        }

        if (pos + 18 > bytes.length) break outer;
        pos += 8;
        pos += 8;
        pos += 2;

        if (opcode === 0x0099 || opcode === 0x009b) {
          if (pos + 2 > bytes.length) break outer;
          const rgnSize = view.getUint16(pos, false);
          pos += rgnSize;
        }

        const imgData = ctx.createImageData(imgW, imgH);
        const isPacked = rowBytes > 250 || (packType !== 1 && pixelSize !== 1);

        for (let row = 0; row < imgH; row += 1) {
          let rowData: Uint8Array;
          const bytesPerRow = rowBytes;
          if (isPacked) {
            if (pos + (bytesPerRow > 250 ? 2 : 1) > bytes.length) break outer;
            const compLen =
              bytesPerRow > 250
                ? view.getUint16(pos, false) + ((pos += 2), 0)
                : view.getUint8(pos++) + 0;
            if (pos + compLen > bytes.length) break outer;
            rowData = decodePackBits(bytes.subarray(pos, pos + compLen), bytesPerRow);
            pos += compLen;
          } else {
            if (pos + bytesPerRow > bytes.length) break outer;
            rowData = bytes.subarray(pos, pos + bytesPerRow);
            pos += bytesPerRow;
          }

          for (let col = 0; col < imgW; col += 1) {
            const di = (row * imgW + col) * 4;
            if (pixelSize === 16) {
              const pixOff = col * 2;
              if (pixOff + 2 > rowData.length) break;
              const pixel = ((rowData[pixOff] ?? 0) << 8) | (rowData[pixOff + 1] ?? 0);
              imgData.data[di] = (((pixel >> 10) & 0x1f) * 255) / 31;
              imgData.data[di + 1] = (((pixel >> 5) & 0x1f) * 255) / 31;
              imgData.data[di + 2] = ((pixel & 0x1f) * 255) / 31;
              imgData.data[di + 3] = 255;
            } else if (pixelSize === 32) {
              const planeStride = imgW;
              if (cmpCount >= 4) {
                const aOff = col;
                const rOff = planeStride + col;
                const gOff = planeStride * 2 + col;
                const bOff = planeStride * 3 + col;
                if (bOff >= rowData.length) break;
                imgData.data[di] = rowData[rOff] ?? 0;
                imgData.data[di + 1] = rowData[gOff] ?? 0;
                imgData.data[di + 2] = rowData[bOff] ?? 0;
                imgData.data[di + 3] = rowData[aOff] || 255;
              } else {
                const rOff = col;
                const gOff = planeStride + col;
                const bOff = planeStride * 2 + col;
                if (bOff >= rowData.length) break;
                imgData.data[di] = rowData[rOff] ?? 0;
                imgData.data[di + 1] = rowData[gOff] ?? 0;
                imgData.data[di + 2] = rowData[bOff] ?? 0;
                imgData.data[di + 3] = 255;
              }
            } else if (pixelSize === 8) {
              const idx = rowData[col] ?? 0;
              if (colorTable && colorTable.length >= (idx + 1) * 3) {
                imgData.data[di] = colorTable[idx * 3] ?? 0;
                imgData.data[di + 1] = colorTable[idx * 3 + 1] ?? 0;
                imgData.data[di + 2] = colorTable[idx * 3 + 2] ?? 0;
              } else {
                imgData.data[di] = imgData.data[di + 1] = imgData.data[di + 2] = idx;
              }
              imgData.data[di + 3] = 255;
            } else {
              imgData.data[di] = imgData.data[di + 1] = imgData.data[di + 2] = 128;
              imgData.data[di + 3] = 255;
            }
          }
        }
        ctx.putImageData(imgData, 0, 0);
        rendered = true;
        break outer;
      }
      default: {
        if (isV2 && opcode >= 0x0100 && opcode <= 0x7fff) {
          pos += (opcode >> 8) * 2;
        } else if (isV2 && opcode >= 0x8000 && opcode <= 0x80ff) {
          // no data
        } else if (isV2 && opcode >= 0x8100) {
          if (pos + 4 > bytes.length) break outer;
          const longLen = view.getUint32(pos, false);
          pos += 4 + longLen;
        } else {
          break outer;
        }
        break;
      }
    }
  }

  return rendered ? canvas : null;
}
