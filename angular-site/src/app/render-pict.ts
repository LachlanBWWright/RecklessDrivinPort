/**
 * Macintosh PICT format renderer.
 *
 * Parses and renders PICT version 1 and version 2 resources to an
 * HTMLCanvasElement. Handles PackBits-compressed pixel maps for the
 * subset of opcodes actually found in Reckless Drivin' resources.
 */
import { decodePackBits } from './image-resource-codec';

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
      case 0x0000: break;
      case 0x00ff: break outer;
      case 0x0001: {
        if (pos + 2 > bytes.length) break outer;
        pos += view.getUint16(pos, false);
        break;
      }
      case 0x0003: case 0x0004: case 0x0005: case 0x0008: case 0x000d: pos += 2; break;
      case 0x0006: case 0x0007: case 0x000b: case 0x000c: case 0x000e: case 0x000f: pos += 4; break;
      case 0x0009: case 0x000a: case 0x0010: pos += 8; break;
      case 0x001a: case 0x001b: case 0x001d: case 0x001f: pos += 6; break;
      case 0x001c: case 0x001e: break;
      case 0x0c00: pos += 24; break;
      case 0x0098:
      case 0x0099:
      case 0x009a:
      case 0x009b: {
        pos = parsePictBitmap(view, bytes, ctx, pos, opcode);
        if (pos < 0) break outer;
        rendered = true;
        break outer;
      }
      default: {
        pos = skipUnknownPictOpcode(view, bytes, pos, opcode, isV2);
        if (pos < 0) break outer;
        break;
      }
    }
  }

  return rendered ? canvas : null;
}

function skipUnknownPictOpcode(
  view: DataView,
  bytes: Uint8Array,
  pos: number,
  opcode: number,
  isV2: boolean,
): number {
  if (isV2 && opcode >= 0x0100 && opcode <= 0x7fff) {
    return pos + (opcode >> 8) * 2;
  }
  if (isV2 && opcode >= 0x8000 && opcode <= 0x80ff) {
    return pos;
  }
  if (isV2 && opcode >= 0x8100) {
    if (pos + 4 > bytes.length) return -1;
    const longLen = view.getUint32(pos, false);
    return pos + 4 + longLen;
  }
  return -1;
}

function parsePictColorTable(view: DataView, bytes: Uint8Array, pos: number): { table: number[]; pos: number } | null {
  if (pos + 8 > bytes.length) return null;
  pos += 4;
  pos += 2;
  const ctSize = view.getInt16(pos, false) + 1;
  pos += 2;
  const colorTable: number[] = [];
  for (let ci = 0; ci < ctSize; ci += 1) {
    if (pos + 8 > bytes.length) return null;
    pos += 2;
    const r = view.getUint16(pos, false) >> 8; pos += 2;
    const g = view.getUint16(pos, false) >> 8; pos += 2;
    const b = view.getUint16(pos, false) >> 8; pos += 2;
    colorTable.push(r, g, b);
  }
  return { table: colorTable, pos };
}

function parsePictPixMapHeader(
  view: DataView,
  bytes: Uint8Array,
  pos: number,
  isDirect: boolean,
): { pixelSize: number; packType: number; cmpCount: number; colorTable: number[] | null; pos: number } | null {
  let pixelSize = 1;
  let packType = 0;
  let cmpCount = 1;
  let colorTable: number[] | null = null;

  if (pos + 2 > bytes.length) return null; pos += 2;
  if (pos + 2 > bytes.length) return null;
  packType = view.getUint16(pos, false); pos += 2;
  if (pos + 4 > bytes.length) return null; pos += 4;
  if (pos + 8 > bytes.length) return null; pos += 8;
  if (pos + 2 > bytes.length) return null; pos += 2;
  if (pos + 2 > bytes.length) return null;
  pixelSize = view.getUint16(pos, false); pos += 2;
  if (pos + 2 > bytes.length) return null;
  cmpCount = view.getUint16(pos, false); pos += 2;
  if (pos + 2 > bytes.length) return null; pos += 2;
  if (pos + 4 > bytes.length) return null; pos += 4;
  if (pos + 4 > bytes.length) return null; pos += 4;
  if (pos + 4 > bytes.length) return null; pos += 4;

  if (!isDirect && pixelSize <= 8) {
    const result = parsePictColorTable(view, bytes, pos);
    if (!result) return null;
    colorTable = result.table;
    pos = result.pos;
  }

  return { pixelSize, packType, cmpCount, colorTable, pos };
}

function renderPictRow(
  imgData: ImageData,
  rowData: Uint8Array,
  row: number,
  imgW: number,
  pixelSize: number,
  cmpCount: number,
  colorTable: number[] | null,
): void {
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
      renderPict32bppPixel(imgData.data, di, rowData, col, imgW, cmpCount);
    } else if (pixelSize === 8) {
      renderPict8bppPixel(imgData.data, di, rowData, col, colorTable);
    } else {
      imgData.data[di] = imgData.data[di + 1] = imgData.data[di + 2] = 128;
      imgData.data[di + 3] = 255;
    }
  }
}

function renderPict32bppPixel(
  data: Uint8ClampedArray,
  di: number,
  rowData: Uint8Array,
  col: number,
  planeStride: number,
  cmpCount: number,
): void {
  if (cmpCount >= 4) {
    const bOff = planeStride * 3 + col;
    if (bOff >= rowData.length) return;
    data[di] = rowData[planeStride + col] ?? 0;
    data[di + 1] = rowData[planeStride * 2 + col] ?? 0;
    data[di + 2] = rowData[bOff] ?? 0;
    data[di + 3] = rowData[col] || 255;
  } else {
    const bOff = planeStride * 2 + col;
    if (bOff >= rowData.length) return;
    data[di] = rowData[col] ?? 0;
    data[di + 1] = rowData[planeStride + col] ?? 0;
    data[di + 2] = rowData[bOff] ?? 0;
    data[di + 3] = 255;
  }
}

function renderPict8bppPixel(
  data: Uint8ClampedArray,
  di: number,
  rowData: Uint8Array,
  col: number,
  colorTable: number[] | null,
): void {
  const idx = rowData[col] ?? 0;
  if (colorTable && colorTable.length >= (idx + 1) * 3) {
    data[di] = colorTable[idx * 3] ?? 0;
    data[di + 1] = colorTable[idx * 3 + 1] ?? 0;
    data[di + 2] = colorTable[idx * 3 + 2] ?? 0;
  } else {
    data[di] = data[di + 1] = data[di + 2] = idx;
  }
  data[di + 3] = 255;
}

function parsePictBitmap(
  view: DataView,
  bytes: Uint8Array,
  ctx: CanvasRenderingContext2D,
  pos: number,
  opcode: number,
): number {
  const isDirect = opcode === 0x009a || opcode === 0x009b;
  if (isDirect && pos + 4 <= bytes.length) pos += 4;

  if (pos + 2 > bytes.length) return -1;
  const rowBytesRaw = view.getUint16(pos, false);
  pos += 2;
  const rowBytes = rowBytesRaw & 0x3fff;
  const isPixMap = (rowBytesRaw & 0x8000) !== 0 || isDirect;

  if (pos + 8 > bytes.length) return -1;
  const bTop = view.getInt16(pos, false); pos += 2;
  const bLeft = view.getInt16(pos, false); pos += 2;
  const bBottom = view.getInt16(pos, false); pos += 2;
  const bRight = view.getInt16(pos, false); pos += 2;
  const imgW = bRight - bLeft;
  const imgH = bBottom - bTop;
  if (imgW <= 0 || imgH <= 0 || imgW > 4096 || imgH > 4096) return -1;

  let pixelSize = 1;
  let packType = 0;
  let cmpCount = 1;
  let colorTable: number[] | null = null;

  if (isPixMap) {
    const header = parsePictPixMapHeader(view, bytes, pos, isDirect);
    if (!header) return -1;
    pixelSize = header.pixelSize;
    packType = header.packType;
    cmpCount = header.cmpCount;
    colorTable = header.colorTable;
    pos = header.pos;
  }

  if (pos + 18 > bytes.length) return -1;
  pos += 18;

  if (opcode === 0x0099 || opcode === 0x009b) {
    if (pos + 2 > bytes.length) return -1;
    pos += view.getUint16(pos, false);
  }

  const imgData = ctx.createImageData(imgW, imgH);
  const isPacked = rowBytes > 250 || (packType !== 1 && pixelSize !== 1);

  for (let row = 0; row < imgH; row += 1) {
    let rowData: Uint8Array;
    if (isPacked) {
      if (pos + (rowBytes > 250 ? 2 : 1) > bytes.length) return -1;
      const compLen = rowBytes > 250
        ? view.getUint16(pos, false) + ((pos += 2), 0)
        : view.getUint8(pos++) + 0;
      if (pos + compLen > bytes.length) return -1;
      rowData = decodePackBits(bytes.subarray(pos, pos + compLen), rowBytes);
      pos += compLen;
    } else {
      if (pos + rowBytes > bytes.length) return -1;
      rowData = bytes.subarray(pos, pos + rowBytes);
      pos += rowBytes;
    }
    renderPictRow(imgData, rowData, row, imgW, pixelSize, cmpCount, colorTable);
  }

  ctx.putImageData(imgData, 0, 0);
  return pos;
}
