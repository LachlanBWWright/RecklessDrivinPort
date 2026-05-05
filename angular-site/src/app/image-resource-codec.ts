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
    if (flag === 128) {
      // PackBits no-op marker.
      continue;
    }
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

function decodePackBits16(src: Uint8Array, expectedSize: number): Uint8Array {
  const out = new Uint8Array(expectedSize);
  let si = 0;
  let di = 0;
  while (si < src.length && di + 1 < expectedSize) {
    const flagByte = src[si++];
    if (flagByte === undefined) break;
    const flag = flagByte > 127 ? flagByte - 256 : flagByte;
    if (flag >= 0) {
      let n = flag + 1;
      while (n > 0 && si + 1 < src.length && di + 1 < expectedSize) {
        out[di++] = src[si++] ?? 0;
        out[di++] = src[si++] ?? 0;
        n -= 1;
      }
    } else if (flag !== -128) {
      let n = -flag + 1;
      if (si + 1 >= src.length) break;
      const b0 = src[si++] ?? 0;
      const b1 = src[si++] ?? 0;
      while (n > 0 && di + 1 < expectedSize) {
        out[di++] = b0;
        out[di++] = b1;
        n -= 1;
      }
    }
  }
  return out;
}

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

export function renderPictBytes(bytes: Uint8Array): HTMLCanvasElement | null {
  if (typeof document === 'undefined' || bytes.length < 14) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  const picTop = view.getInt16(2, false);
  const picLeft = view.getInt16(4, false);
  const picBottom = view.getInt16(6, false);
  const picRight = view.getInt16(8, false);
  const picW = picRight - picLeft;
  const picH = picBottom - picTop;
  if (picW <= 0 || picH <= 0 || picW > 4096 || picH > 4096) return null;

  const canvas = document.createElement('canvas');
  canvas.width = picW;
  canvas.height = picH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const readU16 = (off: number): number => ((bytes[off] ?? 0) << 8) | (bytes[off + 1] ?? 0);

  type PictRect = { top: number; left: number; bottom: number; right: number };
  type PictTextState = {
    anchorX: number;
    anchorY: number;
    cursorX: number;
    cursorY: number;
    fontName: string;
    fontSize: number;
    textColor: [number, number, number];
  };

  const readS8 = (off: number): number => {
    const value = bytes[off] ?? 0;
    return value > 127 ? value - 256 : value;
  };
  const readRect = (off: number): PictRect => ({
    top: view.getInt16(off, false),
    left: view.getInt16(off + 2, false),
    bottom: view.getInt16(off + 4, false),
    right: view.getInt16(off + 6, false),
  });
  const rectWidth = (rect: PictRect): number => rect.right - rect.left;
  const rectHeight = (rect: PictRect): number => rect.bottom - rect.top;
  const color16To8 = (value: number): number => (value >>> 8) & 0xff;
  const isLightColor = (rgb: readonly [number, number, number]): boolean =>
    rgb[0] + rgb[1] + rgb[2] >= 384;
  const applyTextStyle = (state: PictTextState): void => {
    const quickDrawTextScale = 0.55;
    ctx.font = `${Math.max(1, Math.round(state.fontSize * quickDrawTextScale))}px "${state.fontName}", serif`;
    ctx.fillStyle = `rgb(${state.textColor[0]}, ${state.textColor[1]}, ${state.textColor[2]})`;
    ctx.textBaseline = 'alphabetic';
  };
  const parseColorTable = (
    off: number,
  ): { palette: Uint8Array<ArrayBufferLike>; nextOff: number } | null => {
    if (off + 8 > bytes.length) return null;
    const flags = readU16(off + 4);
    const ctSize = readU16(off + 6);
    const entryCount = ctSize + 1;
    const nextOff = off + 8 + entryCount * 8;
    if (nextOff > bytes.length) return null;

    const palette: Uint8Array<ArrayBufferLike> = new Uint8Array(MAC_8BIT_PALETTE);
    for (let index = 0; index < entryCount; index += 1) {
      const entryOff = off + 8 + index * 8;
      const paletteIndex = (flags & 0x8000) !== 0 ? index : readU16(entryOff) & 0xff;
      const pi = paletteIndex * 3;
      if (pi + 2 >= palette.length) continue;
      palette[pi] = color16To8(readU16(entryOff + 2));
      palette[pi + 1] = color16To8(readU16(entryOff + 4));
      palette[pi + 2] = color16To8(readU16(entryOff + 6));
    }

    return { palette, nextOff };
  };
  const expandIndexedRow = (rowData: Uint8Array, width: number, pixelSize: number): Uint8Array => {
    if (pixelSize >= 8) {
      return rowData.slice(0, width);
    }

    const out = new Uint8Array(width);
    for (let col = 0; col < width; col += 1) {
      const byte = rowData[Math.floor((col * pixelSize) / 8)] ?? 0;
      let value = 0;
      if (pixelSize === 4) {
        value = (byte >> (col % 2 === 0 ? 4 : 0)) & 0x0f;
      } else if (pixelSize === 2) {
        const shift = 6 - (col % 4) * 2;
        value = (byte >> shift) & 0x03;
      } else if (pixelSize === 1) {
        value = (byte >> (7 - (col % 8))) & 0x01;
      }
      out[col] = value;
    }
    return out;
  };
  const drawText = (
    state: PictTextState,
    text: string,
    x: number,
    y: number,
    backdropFilled: boolean,
    drewAnything: boolean,
  ): boolean => {
    if (!backdropFilled && !drewAnything && isLightColor(state.textColor)) {
      ctx.fillStyle = 'black';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      backdropFilled = true;
    }

    applyTextStyle(state);
    const canvasX = x - picLeft;
    const canvasY = y - picTop;
    ctx.fillText(text, canvasX, canvasY);
    state.anchorX = x;
    state.anchorY = y;
    state.cursorX = x + ctx.measureText(text).width;
    state.cursorY = y;
    return backdropFilled;
  };
  const drawPackedPixmap = (opcode: number, startOff: number): { nextOff: number } | null => {
    const indexed = opcode === 0x0098 || opcode === 0x0099;
    const hasRegion = opcode === 0x0099 || opcode === 0x009b;

    let rowBytesOff = startOff;
    let boundsOff = startOff + 2;
    let pixelSizeOff = startOff + 28;
    let cmpCountOff = startOff + 30;
    let cmpSizeOff = startOff + 32;
    let cursor = startOff + 46;
    let palette: Uint8Array<ArrayBufferLike> = new Uint8Array(MAC_8BIT_PALETTE);

    if (!indexed) {
      rowBytesOff = startOff + 4;
      boundsOff = startOff + 6;
      pixelSizeOff = startOff + 32;
      cmpCountOff = startOff + 34;
      cmpSizeOff = startOff + 36;
      cursor = startOff + 50;
    }
    if (cursor > bytes.length) return null;

    const rowBytes = readU16(rowBytesOff) & 0x7fff;
    const bounds = readRect(boundsOff);
    const srcWidth = rectWidth(bounds);
    const srcHeight = rectHeight(bounds);
    if (rowBytes <= 0 || srcWidth <= 0 || srcHeight <= 0) return null;

    const pixelSize = readU16(pixelSizeOff);
    const cmpCount = readU16(cmpCountOff);
    const cmpSize = readU16(cmpSizeOff);

    if (indexed) {
      const colorTable = parseColorTable(cursor);
      if (!colorTable) return null;
      palette = colorTable.palette;
      cursor = colorTable.nextOff;
    }

    if (cursor + 18 > bytes.length) return null;
    const srcRect = readRect(cursor);
    const dstRect = readRect(cursor + 8);
    cursor += 18;
    if (hasRegion) {
      if (cursor + 2 > bytes.length) return null;
      const regionSize = readU16(cursor);
      if (cursor + regionSize > bytes.length) return null;
      cursor += regionSize;
    }

    const image = ctx.createImageData(srcWidth, srcHeight);
    const bcBytes = rowBytes > 250 ? 2 : 1;
    const directPixels = pixelSize === 16 || (cmpCount === 3 && cmpSize === 5);
    let dataOff = cursor;

    for (let row = 0; row < srcHeight; row += 1) {
      if (dataOff + bcBytes > bytes.length) return null;
      const bc = bcBytes === 2 ? readU16(dataOff) : (bytes[dataOff] ?? 0);
      dataOff += bcBytes;
      if (bc < 0 || dataOff + bc > bytes.length) return null;

      const rowCompressed = bytes.subarray(dataOff, dataOff + bc);
      dataOff += bc;

      if (directPixels) {
        const rowData = decodePackBits16(rowCompressed, rowBytes);
        for (let col = 0; col < srcWidth; col += 1) {
          const di = (row * srcWidth + col) * 4;
          const off = col * 2;
          const pixel = ((rowData[off] ?? 0) << 8) | (rowData[off + 1] ?? 0);
          image.data[di] = (((pixel >> 10) & 0x1f) * 255) / 31;
          image.data[di + 1] = (((pixel >> 5) & 0x1f) * 255) / 31;
          image.data[di + 2] = ((pixel & 0x1f) * 255) / 31;
          image.data[di + 3] = 255;
        }
        continue;
      }

      const rowData = decodePackBits(rowCompressed, rowBytes);
      const indices = expandIndexedRow(rowData, srcWidth, pixelSize);
      for (let col = 0; col < srcWidth; col += 1) {
        const di = (row * srcWidth + col) * 4;
        const pi = (indices[col] ?? 0) * 3;
        image.data[di] = palette[pi] ?? 0;
        image.data[di + 1] = palette[pi + 1] ?? 0;
        image.data[di + 2] = palette[pi + 2] ?? 0;
        image.data[di + 3] = 255;
      }
    }

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = srcWidth;
    tempCanvas.height = srcHeight;
    const tempCtx = tempCanvas.getContext('2d');
    if (!tempCtx) return null;
    tempCtx.putImageData(image, 0, 0);

    const prevSmoothing = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    const drawRect = rectWidth(dstRect) > 0 && rectHeight(dstRect) > 0 ? dstRect : srcRect;
    ctx.drawImage(
      tempCanvas,
      drawRect.left - picLeft,
      drawRect.top - picTop,
      rectWidth(drawRect),
      rectHeight(drawRect),
    );
    ctx.imageSmoothingEnabled = prevSmoothing;

    return { nextOff: dataOff };
  };

  let pixDataOff = -1;
  let bestBpp: 1 | 2 = 2;
  let drewAnything = false;
  let textBackdropFilled = false;
  const textState: PictTextState = {
    anchorX: picLeft,
    anchorY: picTop,
    cursorX: picLeft,
    cursorY: picTop,
    fontName: 'Times',
    fontSize: 12,
    textColor: [0, 0, 0],
  };

  if (
    bytes.length >= 40 &&
    bytes[10] === 0x00 &&
    bytes[11] === 0x11 &&
    bytes[12] === 0x02 &&
    bytes[13] === 0xff &&
    bytes[14] === 0x0c &&
    bytes[15] === 0x00
  ) {
    let pos = 40;
    while (pos + 2 <= bytes.length) {
      const opcode = readU16(pos);
      pos += 2;

      switch (opcode) {
        case 0x0000:
        case 0x001d:
        case 0x001e:
          break;
        case 0x0001: {
          if (pos + 2 > bytes.length) {
            pos = bytes.length + 1;
            break;
          }
          const rsize = Math.max(2, readU16(pos));
          pos += rsize;
          break;
        }
        case 0x0003:
        case 0x0004:
        case 0x0005:
        case 0x0008:
        case 0x0015:
        case 0x0016:
        case 0x00a0:
          pos += 2;
          break;
        case 0x000d:
          textState.fontSize = readU16(pos);
          pos += 2;
          break;
        case 0x0006:
        case 0x0007:
        case 0x000b:
        case 0x000c:
        case 0x000e:
        case 0x000f:
        case 0x0026:
        case 0x0027:
        case 0x002e:
          pos += 4;
          break;
        case 0x001a:
          textState.textColor = [
            color16To8(readU16(pos)),
            color16To8(readU16(pos + 2)),
            color16To8(readU16(pos + 4)),
          ];
          pos += 6;
          break;
        case 0x001b:
        case 0x001f:
        case 0x0022:
        case 0x0023:
          pos += 6;
          break;
        case 0x0028: {
          if (pos + 5 > bytes.length) {
            pos = bytes.length + 1;
            break;
          }
          const y = view.getInt16(pos, false);
          const x = view.getInt16(pos + 2, false);
          const textLen = bytes[pos + 4] ?? 0;
          if (pos + 5 + textLen > bytes.length) {
            pos = bytes.length + 1;
            break;
          }
          const text = String.fromCharCode(...bytes.subarray(pos + 5, pos + 5 + textLen));
          textBackdropFilled = drawText(textState, text, x, y, textBackdropFilled, drewAnything);
          drewAnything = true;
          pos += 5 + textLen;
          if (pos % 2 !== 0) pos += 1;
          break;
        }
        case 0x0029: {
          if (pos + 2 > bytes.length) {
            pos = bytes.length + 1;
            break;
          }
          const textLen = bytes[pos + 1] ?? 0;
          if (pos + 2 + textLen > bytes.length) {
            pos = bytes.length + 1;
            break;
          }
          const text = String.fromCharCode(...bytes.subarray(pos + 2, pos + 2 + textLen));
          const x = textState.cursorX + readS8(pos);
          textBackdropFilled = drawText(
            textState,
            text,
            x,
            textState.cursorY,
            textBackdropFilled,
            drewAnything,
          );
          drewAnything = true;
          pos += 2 + textLen;
          if (pos % 2 !== 0) pos += 1;
          break;
        }
        case 0x002a: {
          if (pos + 2 > bytes.length) {
            pos = bytes.length + 1;
            break;
          }
          const textLen = bytes[pos + 1] ?? 0;
          if (pos + 2 + textLen > bytes.length) {
            pos = bytes.length + 1;
            break;
          }
          const text = String.fromCharCode(...bytes.subarray(pos + 2, pos + 2 + textLen));
          const y = textState.cursorY + readS8(pos);
          textBackdropFilled = drawText(
            textState,
            text,
            textState.cursorX,
            y,
            textBackdropFilled,
            drewAnything,
          );
          drewAnything = true;
          pos += 2 + textLen;
          if (pos % 2 !== 0) pos += 1;
          break;
        }
        case 0x002b: {
          if (pos + 3 > bytes.length) {
            pos = bytes.length + 1;
            break;
          }
          const textLen = bytes[pos + 2] ?? 0;
          if (pos + 3 + textLen > bytes.length) {
            pos = bytes.length + 1;
            break;
          }
          const text = String.fromCharCode(...bytes.subarray(pos + 3, pos + 3 + textLen));
          const x = textState.anchorX + readS8(pos);
          const y = textState.anchorY + readS8(pos + 1);
          textBackdropFilled = drawText(textState, text, x, y, textBackdropFilled, drewAnything);
          drewAnything = true;
          pos += 3 + textLen;
          if (pos % 2 !== 0) pos += 1;
          break;
        }
        case 0x002c: {
          if (pos + 5 > bytes.length) {
            pos = bytes.length + 1;
            break;
          }
          const dataLen = readU16(pos);
          if (pos + 2 + dataLen > bytes.length) {
            pos = bytes.length + 1;
            break;
          }
          const nameLen = bytes[pos + 4] ?? 0;
          const nameEnd = Math.min(pos + 5 + nameLen, pos + 2 + dataLen);
          const name = String.fromCharCode(...bytes.subarray(pos + 5, nameEnd)).trim();
          if (name) textState.fontName = name;
          pos += 2 + dataLen;
          if (pos % 2 !== 0) pos += 1;
          break;
        }
        case 0x0030:
        case 0x0031:
        case 0x0032:
        case 0x0033:
        case 0x0034:
        case 0x0038:
        case 0x0039:
        case 0x003a:
        case 0x003b:
        case 0x003c:
        case 0x0009:
        case 0x000a:
        case 0x0010:
        case 0x0020:
        case 0x0021:
          pos += 8;
          break;
        case 0x0040:
        case 0x0041:
        case 0x0042:
        case 0x0043:
        case 0x0044:
          pos += 12;
          break;
        case 0x0050:
        case 0x0051:
        case 0x0052:
        case 0x0053:
        case 0x0054:
        case 0x0060:
        case 0x0061:
        case 0x0062:
        case 0x0063:
        case 0x0064:
        case 0x0070:
        case 0x0071:
        case 0x0072:
        case 0x0073:
        case 0x0074: {
          if (pos + 2 > bytes.length) {
            pos = bytes.length + 1;
            break;
          }
          pos += readU16(pos);
          break;
        }
        case 0x00b0: {
          if (pos + 4 > bytes.length) {
            pos = bytes.length + 1;
            break;
          }
          pos += 4;
          break;
        }
        case 0x00b1:
        case 0x00b2: {
          if (pos + 3 > bytes.length) {
            pos = bytes.length + 1;
            break;
          }
          pos += 3 + (bytes[pos + 2] ?? 0);
          if (pos % 2 !== 0) pos += 1;
          break;
        }
        case 0x00b3: {
          if (pos + 4 > bytes.length) {
            pos = bytes.length + 1;
            break;
          }
          pos += 4 + readU16(pos + 2);
          if (pos % 2 !== 0) pos += 1;
          break;
        }
        case 0x00a1: {
          if (pos + 4 > bytes.length) {
            pos = bytes.length + 1;
            break;
          }
          const longSize = readU16(pos + 2);
          pos += 4 + longSize;
          break;
        }
        case 0x0098:
        case 0x0099:
        case 0x009a:
        case 0x009b: {
          const pixmap = drawPackedPixmap(opcode, pos);
          if (!pixmap) {
            pos = bytes.length + 1;
            break;
          }
          pos = pixmap.nextOff;
          drewAnything = true;
          break;
        }
        case 0x00ff:
          pos = bytes.length + 1;
          break;
        default:
          if (opcode >= 0x0100 && opcode <= 0x7fff) {
            if (pos + 2 > bytes.length) {
              pos = bytes.length + 1;
              break;
            }
            pos += 2 + readU16(pos);
          } else if (opcode >= 0x8000) {
            if (pos + 4 > bytes.length) {
              pos = bytes.length + 1;
              break;
            }
            const longLenBE =
              (bytes[pos] ?? 0) * 0x1000000 +
              (bytes[pos + 1] ?? 0) * 0x10000 +
              (bytes[pos + 2] ?? 0) * 0x100 +
              (bytes[pos + 3] ?? 0);
            const longLenLE =
              (bytes[pos + 3] ?? 0) * 0x1000000 +
              (bytes[pos + 2] ?? 0) * 0x10000 +
              (bytes[pos + 1] ?? 0) * 0x100 +
              (bytes[pos] ?? 0);

            let longLen = longLenBE;
            if (pos + 4 + longLenBE > bytes.length && pos + 4 + longLenLE <= bytes.length) {
              longLen = longLenLE;
            }
            pos += 4 + longLen;
          } else {
            pos = bytes.length + 1;
          }
          break;
      }

      if (pos < 0 || pos > bytes.length) {
        break;
      }
    }
  }

  if (drewAnything) {
    return canvas;
  }

  // Fallback: scan common packed-row offsets used by this game's PICT assets.
  if (pixDataOff < 0) {
    const OFFSETS = [
      122, 124, 126, 128, 130, 132, 134, 136, 138, 140, 142, 144, 146, 148, 150, 152, 154, 156, 106,
      108, 110, 112, 114, 116, 118, 120, 80, 82, 84, 86, 88, 90, 92, 94, 96, 98, 100, 102, 104, 158,
      160,
    ];

    for (const bpp of [2, 1] as const) {
      const rowBytes = picW * bpp;
      const bcBytes = rowBytes > 250 ? 2 : 1;
      for (const startOff of OFFSETS) {
        let off = startOff;
        let consumed = 0;
        let valid = true;
        for (let row = 0; row < picH; row += 1) {
          if (off + bcBytes > bytes.length) {
            valid = false;
            break;
          }
          const bc = bcBytes === 2 ? readU16(off) : (bytes[off] ?? 0);
          if (bc <= 0 || bc > Math.floor((rowBytes * 3) / 2) + 128) {
            valid = false;
            break;
          }
          off += bcBytes;
          if (off + bc > bytes.length) {
            valid = false;
            break;
          }
          off += bc;
          consumed += bcBytes + bc;
        }
        const minConsumed = Math.max(picH, Math.floor((rowBytes * picH) / 128));
        if (valid && consumed > minConsumed) {
          pixDataOff = startOff;
          bestBpp = bpp;
          break;
        }
      }
      if (pixDataOff >= 0) break;
    }

    if (pixDataOff < 0) {
      for (const bpp of [2, 1] as const) {
        const rowBytes = picW * bpp;
        const bcBytes = rowBytes > 250 ? 2 : 1;
        const maxStart = bytes.length - bcBytes;

        for (let startOff = 40; startOff <= maxStart; startOff += 1) {
          let probeOff = startOff;
          let quickValid = true;

          for (let row = 0; row < Math.min(8, picH); row += 1) {
            if (probeOff + bcBytes > bytes.length) {
              quickValid = false;
              break;
            }
            const bc = bcBytes === 2 ? readU16(probeOff) : (bytes[probeOff] ?? 0);
            if (bc <= 0 || bc > Math.floor((rowBytes * 3) / 2) + 128) {
              quickValid = false;
              break;
            }
            probeOff += bcBytes + bc;
          }
          if (!quickValid) continue;

          let off = startOff;
          let consumed = 0;
          let valid = true;
          for (let row = 0; row < picH; row += 1) {
            if (off + bcBytes > bytes.length) {
              valid = false;
              break;
            }
            const bc = bcBytes === 2 ? readU16(off) : (bytes[off] ?? 0);
            if (bc <= 0 || bc > Math.floor((rowBytes * 3) / 2) + 128) {
              valid = false;
              break;
            }
            off += bcBytes;
            if (off + bc > bytes.length) {
              valid = false;
              break;
            }
            off += bc;
            consumed += bcBytes + bc;
          }

          const minConsumed = Math.max(picH, Math.floor((rowBytes * picH) / 128));
          if (valid && consumed > minConsumed) {
            pixDataOff = startOff;
            bestBpp = bpp;
            break;
          }
        }

        if (pixDataOff >= 0) break;
      }
    }
  }

  if (pixDataOff < 0) return null;

  const rowBytes = picW * bestBpp;
  const bcBytes = rowBytes > 250 ? 2 : 1;
  const image = ctx.createImageData(picW, picH);
  let pos = pixDataOff;

  for (let row = 0; row < picH; row += 1) {
    if (pos + bcBytes > bytes.length) return null;
    const bc = bcBytes === 2 ? readU16(pos) : (bytes[pos] ?? 0);
    pos += bcBytes;
    if (bc < 0 || pos + bc > bytes.length) return null;

    const rowCompressed = bytes.subarray(pos, pos + bc);
    pos += bc;
    const rowData =
      bestBpp === 2
        ? decodePackBits16(rowCompressed, rowBytes)
        : decodePackBits(rowCompressed, rowBytes);

    for (let col = 0; col < picW; col += 1) {
      const di = (row * picW + col) * 4;
      if (bestBpp === 2) {
        const off = col * 2;
        const pixel = ((rowData[off] ?? 0) << 8) | (rowData[off + 1] ?? 0);
        image.data[di] = (((pixel >> 10) & 0x1f) * 255) / 31;
        image.data[di + 1] = (((pixel >> 5) & 0x1f) * 255) / 31;
        image.data[di + 2] = ((pixel & 0x1f) * 255) / 31;
      } else {
        const idx = rowData[col] ?? 0;
        const pi = idx * 3;
        image.data[di] = MAC_8BIT_PALETTE[pi] ?? idx;
        image.data[di + 1] = MAC_8BIT_PALETTE[pi + 1] ?? idx;
        image.data[di + 2] = MAC_8BIT_PALETTE[pi + 2] ?? idx;
      }
      image.data[di + 3] = 255;
    }
  }

  ctx.putImageData(image, 0, 0);
  return canvas;
}
