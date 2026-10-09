import { decodePackBits, decodePackBits16, MAC_8BIT_PALETTE } from './image-resource-codec';

export function drawPackedPictRows(
  ctx: CanvasRenderingContext2D,
  bytes: Uint8Array,
  width: number,
  height: number,
  bpp: 1 | 2,
  start: number,
): boolean {
  const rowBytes = width * bpp;
  const countBytes = rowBytes > 250 ? 2 : 1;
  const image = ctx.createImageData(width, height);
  let pos = start;
  for (let row = 0; row < height; row += 1) {
    if (pos + countBytes > bytes.length) return false;
    const count =
      countBytes === 2 ? ((bytes[pos] ?? 0) << 8) | (bytes[pos + 1] ?? 0) : (bytes[pos] ?? 0);
    pos += countBytes;
    if (pos + count > bytes.length) return false;
    const packed = bytes.subarray(pos, pos + count);
    pos += count;
    const rowData =
      bpp === 2 ? decodePackBits16(packed, rowBytes) : decodePackBits(packed, rowBytes);
    for (let col = 0; col < width; col += 1) {
      const pixelOffset = (row * width + col) * 4;
      if (bpp === 2) {
        const offset = col * 2;
        const pixel = ((rowData[offset] ?? 0) << 8) | (rowData[offset + 1] ?? 0);
        image.data[pixelOffset] = (((pixel >> 10) & 0x1f) * 255) / 31;
        image.data[pixelOffset + 1] = (((pixel >> 5) & 0x1f) * 255) / 31;
        image.data[pixelOffset + 2] = ((pixel & 0x1f) * 255) / 31;
      } else {
        const paletteOffset = (rowData[col] ?? 0) * 3;
        image.data[pixelOffset] = MAC_8BIT_PALETTE[paletteOffset] ?? 0;
        image.data[pixelOffset + 1] = MAC_8BIT_PALETTE[paletteOffset + 1] ?? 0;
        image.data[pixelOffset + 2] = MAC_8BIT_PALETTE[paletteOffset + 2] ?? 0;
      }
      image.data[pixelOffset + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  return true;
}
