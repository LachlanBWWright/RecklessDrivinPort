import { decodePackBits, decodePackBits16, MAC_8BIT_PALETTE } from './image-resource-codec';
import { drawPackedPictRows } from './image-pict-rendering';

function advanceUnknownOpcode(
  opcode: number,
  pos: number,
  bytes: Uint8Array,
  readU16: (offset: number) => number,
): number {
  if (opcode >= 0x0100 && opcode <= 0x7fff) {
    return pos + 2 > bytes.length ? bytes.length + 1 : pos + 2 + readU16(pos);
  }
  if (opcode < 0x8000 || pos + 4 > bytes.length) return bytes.length + 1;
  const big =
    (bytes[pos] ?? 0) * 0x1000000 +
    (bytes[pos + 1] ?? 0) * 0x10000 +
    (bytes[pos + 2] ?? 0) * 0x100 +
    (bytes[pos + 3] ?? 0);
  const little =
    (bytes[pos + 3] ?? 0) * 0x1000000 +
    (bytes[pos + 2] ?? 0) * 0x10000 +
    (bytes[pos + 1] ?? 0) * 0x100 +
    (bytes[pos] ?? 0);
  const size = pos + 4 + big > bytes.length && pos + 4 + little <= bytes.length ? little : big;
  return pos + 4 + size;
}

function packedRowLength(
  bytes: Uint8Array,
  offset: number,
  byteCount: number,
  readU16: (offset: number) => number,
): number {
  return byteCount === 2 ? readU16(offset) : (bytes[offset] ?? 0);
}

function hasValidPackedPrefix(
  bytes: Uint8Array,
  start: number,
  rows: number,
  rowBytes: number,
  byteCount: number,
  readU16: (offset: number) => number,
): boolean {
  let offset = start;
  for (let row = 0; row < Math.min(8, rows); row++) {
    if (offset + byteCount > bytes.length) return false;
    const length = packedRowLength(bytes, offset, byteCount, readU16);
    if (length <= 0 || length > Math.floor((rowBytes * 3) / 2) + 128) return false;
    offset += byteCount + length;
  }
  return true;
}

function measurePackedRows(
  bytes: Uint8Array,
  start: number,
  rows: number,
  rowBytes: number,
  byteCount: number,
  readU16: (offset: number) => number,
): number | null {
  let offset = start;
  let consumed = 0;
  for (let row = 0; row < rows; row++) {
    if (offset + byteCount > bytes.length) return null;
    const length = packedRowLength(bytes, offset, byteCount, readU16);
    if (length <= 0 || length > Math.floor((rowBytes * 3) / 2) + 128) return null;
    offset += byteCount;
    if (offset + length > bytes.length) return null;
    offset += length;
    consumed += byteCount + length;
  }
  return consumed;
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
    fontName: string;
    fontSize: number;
    textColor: [number, number, number];
  };

  const readTextOffset = (off: number): number => bytes[off] ?? 0;
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
  let originX = 0;
  let originY = 0;
  const applyTextStyle = (state: PictTextState): void => {
    ctx.font = `${Math.max(1, state.fontSize)}px "${state.fontName}", serif`;
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
    const canvasX = x - picLeft - originX;
    const canvasY = y - picTop - originY;
    ctx.fillText(text, canvasX, canvasY);
    state.anchorX = x;
    state.anchorY = y;
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
      drawRect.left - picLeft - originX,
      drawRect.top - picTop - originY,
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
        case 0x000e:
        case 0x000f:
        case 0x0026:
        case 0x0027:
        case 0x002e:
          pos += 4;
          break;
        case 0x000c:
          originX += view.getInt16(pos, false);
          originY += view.getInt16(pos + 2, false);
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
          const x = textState.anchorX + readTextOffset(pos);
          textBackdropFilled = drawText(
            textState,
            text,
            x,
            textState.anchorY,
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
          const y = textState.anchorY + readTextOffset(pos);
          textBackdropFilled = drawText(
            textState,
            text,
            textState.anchorX,
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
          const x = textState.anchorX + readTextOffset(pos);
          const y = textState.anchorY + readTextOffset(pos + 1);
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
          pos = advanceUnknownOpcode(opcode, pos, bytes, readU16);
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
          if (!hasValidPackedPrefix(bytes, startOff, picH, rowBytes, bcBytes, readU16)) continue;
          const consumed = measurePackedRows(bytes, startOff, picH, rowBytes, bcBytes, readU16);
          const minConsumed = Math.max(picH, Math.floor((rowBytes * picH) / 128));
          if (consumed !== null && consumed > minConsumed) {
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

  if (!drawPackedPictRows(ctx, bytes, picW, picH, bestBpp, pixDataOff)) return null;
  return canvas;
}
