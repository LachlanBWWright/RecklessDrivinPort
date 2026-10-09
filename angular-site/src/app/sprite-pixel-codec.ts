const SPRITE_HEADER_SIZE = 8;

export interface SpritePixelEncoders {
  rgb555(red: number, green: number, blue: number): number;
  paletteIndex(red: number, green: number, blue: number): number;
}

/** Encode edited RGBA pixels into an existing sprite frame. */
export function encodeSpritePixels(
  data: Uint8Array,
  bitDepth: 8 | 16,
  pixels: Uint8ClampedArray,
  encoders: SpritePixelEncoders,
): Uint8Array | null {
  if (data.length < SPRITE_HEADER_SIZE) return null;

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const width = view.getUint16(0, false);
  const height = view.getUint16(2, false);
  const stride = 1 << (data[4] ?? 0);
  if (width <= 0 || height <= 0 || stride <= 0) return null;

  const next = data.slice();
  const nextView = new DataView(next.buffer, next.byteOffset, next.byteLength);
  const maskValue = readMaskValue(view, next, bitDepth);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      writeSpritePixel(next, nextView, pixels, x, y, width, stride, bitDepth, maskValue, encoders);
    }
  }
  return next;
}

function readMaskValue(view: DataView, data: Uint8Array, bitDepth: 8 | 16): number {
  return bitDepth === 16
    ? view.getUint16(SPRITE_HEADER_SIZE, false)
    : (data[SPRITE_HEADER_SIZE] ?? 0);
}

function writeSpritePixel(
  data: Uint8Array,
  view: DataView,
  pixels: Uint8ClampedArray,
  x: number,
  y: number,
  width: number,
  stride: number,
  bitDepth: 8 | 16,
  maskValue: number,
  encoders: SpritePixelEncoders,
): void {
  const sourceOffset = (y * width + x) * 4;
  const destinationOffset = spritePixelOffset(x, y, stride, bitDepth);
  if (!hasRoomForPixel(data, destinationOffset, bitDepth)) return;

  if ((pixels[sourceOffset + 3] ?? 0) === 0) {
    writeMaskValue(data, view, destinationOffset, bitDepth, maskValue);
    return;
  }

  writeOpaquePixel(
    data,
    view,
    pixels,
    sourceOffset,
    destinationOffset,
    bitDepth,
    maskValue,
    encoders,
  );
}

function spritePixelOffset(x: number, y: number, stride: number, bitDepth: 8 | 16): number {
  const bytesPerPixel = bitDepth === 16 ? 2 : 1;
  return SPRITE_HEADER_SIZE + (y * stride + x) * bytesPerPixel;
}

function hasRoomForPixel(data: Uint8Array, offset: number, bitDepth: 8 | 16): boolean {
  return offset >= 0 && offset + (bitDepth === 16 ? 2 : 1) <= data.length;
}

function writeMaskValue(
  data: Uint8Array,
  view: DataView,
  offset: number,
  bitDepth: 8 | 16,
  maskValue: number,
): void {
  if (bitDepth === 16) {
    view.setUint16(offset, maskValue, false);
    return;
  }
  data[offset] = maskValue;
}

function writeOpaquePixel(
  data: Uint8Array,
  view: DataView,
  pixels: Uint8ClampedArray,
  sourceOffset: number,
  destinationOffset: number,
  bitDepth: 8 | 16,
  maskValue: number,
  encoders: SpritePixelEncoders,
): void {
  if (bitDepth === 16) {
    const rgb = encoders.rgb555(
      pixels[sourceOffset] ?? 0,
      pixels[sourceOffset + 1] ?? 0,
      pixels[sourceOffset + 2] ?? 0,
    );
    view.setUint16(destinationOffset, rgb === maskValue ? rgb ^ 1 : rgb, false);
    return;
  }

  const index = encoders.paletteIndex(
    pixels[sourceOffset] ?? 0,
    pixels[sourceOffset + 1] ?? 0,
    pixels[sourceOffset + 2] ?? 0,
  );
  data[destinationOffset] = index === maskValue ? (index + 1) & 0xff : index;
}
