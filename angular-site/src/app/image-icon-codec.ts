/** Render a 1-bit Macintosh icon with an optional mask plane. */
export function renderMonoIcon(
  bytes: Uint8Array,
  width: number,
  height: number,
): HTMLCanvasElement | null {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return null;

  const bytesPerRow = Math.ceil(width / 8);
  const planeSize = bytesPerRow * height;
  const bitmap = bytes.subarray(0, planeSize);
  const mask = bytes.length >= planeSize * 2 ? bytes.subarray(planeSize, planeSize * 2) : null;
  const image = context.createImageData(width, height);

  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < width; column += 1) {
      const byteIndex = row * bytesPerRow + Math.floor(column / 8);
      const bit = 7 - (column % 8);
      const value = byteIndex < bitmap.length ? (bitmap[byteIndex] >> bit) & 1 : 0;
      const alpha = mask && byteIndex < mask.length ? ((mask[byteIndex] >> bit) & 1) * 255 : 255;
      const offset = (row * width + column) * 4;
      const colour = value ? 0 : 255;
      image.data[offset] = colour;
      image.data[offset + 1] = colour;
      image.data[offset + 2] = colour;
      image.data[offset + 3] = alpha;
    }
  }

  context.putImageData(image, 0, 0);
  return canvas;
}

export function renderIconBytes(bytes: Uint8Array, iconType = 'ICN#'): HTMLCanvasElement | null {
  return renderMonoIcon(
    bytes,
    iconType.trim().toUpperCase() === 'ICS#' ? 16 : 32,
    iconType.trim().toUpperCase() === 'ICS#' ? 16 : 32,
  );
}

export function imageDataToIconHash(rgba: Uint8ClampedArray, width = 32, height = 32): Uint8Array {
  const bytesPerRow = Math.ceil(width / 8);
  const planeSize = bytesPerRow * height;
  const output = new Uint8Array(planeSize * 2);
  for (let row = 0; row < height; row += 1) {
    for (let byteInRow = 0; byteInRow < bytesPerRow; byteInRow += 1) {
      let bitmapByte = 0;
      for (let bit = 0; bit < 8; bit += 1) {
        const column = byteInRow * 8 + bit;
        if (column >= width) continue;
        const offset = (row * width + column) * 4;
        const luminance =
          (rgba[offset] ?? 0) * 0.299 +
          (rgba[offset + 1] ?? 0) * 0.587 +
          (rgba[offset + 2] ?? 0) * 0.114;
        if (luminance < 128) bitmapByte |= 1 << (7 - bit);
      }
      const outputOffset = row * bytesPerRow + byteInRow;
      output[outputOffset] = bitmapByte;
      output[planeSize + outputOffset] = 0xff;
    }
  }
  return output;
}
