/** Decode Mac PackBits RLE-compressed bytes into a fixed-size output buffer. */
export function decodePackBits(src: Uint8Array, expectedSize: number): Uint8Array {
  const output = new Uint8Array(expectedSize);
  let sourceOffset = 0;
  let destinationOffset = 0;

  while (sourceOffset < src.length && destinationOffset < expectedSize) {
    const flag = src[sourceOffset++];
    if (flag === undefined || flag === 128) continue;
    if (flag > 127) {
      const count = 257 - flag;
      const value = src[sourceOffset++] ?? 0;
      for (let i = 0; i < count && destinationOffset < expectedSize; i += 1) {
        output[destinationOffset++] = value;
      }
      continue;
    }

    const count = flag + 1;
    for (
      let i = 0;
      i < count && sourceOffset < src.length && destinationOffset < expectedSize;
      i += 1
    ) {
      output[destinationOffset++] = src[sourceOffset++] ?? 0;
    }
  }
  return output;
}

/** Decode PackBits tokens whose payload consists of 16-bit words. */
export function decodePackBits16(src: Uint8Array, expectedSize: number): Uint8Array {
  const output = new Uint8Array(expectedSize);
  let sourceOffset = 0;
  let destinationOffset = 0;

  while (sourceOffset < src.length && destinationOffset + 1 < expectedSize) {
    const rawFlag = src[sourceOffset++];
    if (rawFlag === undefined) break;
    const flag = rawFlag > 127 ? rawFlag - 256 : rawFlag;
    if (flag >= 0) {
      copyLiteralWords(src, output, flag + 1, sourceOffset, destinationOffset);
      sourceOffset += (flag + 1) * 2;
      destinationOffset += (flag + 1) * 2;
      continue;
    }
    if (flag === -128) continue;

    const value = readWord(src, sourceOffset);
    if (!value) break;
    sourceOffset += 2;
    for (let i = 0; i < -flag + 1 && destinationOffset + 1 < expectedSize; i += 1) {
      output[destinationOffset++] = value[0];
      output[destinationOffset++] = value[1];
    }
  }
  return output;
}

function readWord(src: Uint8Array, offset: number): [number, number] | null {
  if (offset + 1 >= src.length) return null;
  return [src[offset] ?? 0, src[offset + 1] ?? 0];
}

function copyLiteralWords(
  src: Uint8Array,
  output: Uint8Array,
  count: number,
  sourceOffset: number,
  destinationOffset: number,
): void {
  for (
    let i = 0;
    i < count && sourceOffset + 1 < src.length && destinationOffset + 1 < output.length;
    i += 1
  ) {
    output[destinationOffset + i * 2] = src[sourceOffset + i * 2] ?? 0;
    output[destinationOffset + i * 2 + 1] = src[sourceOffset + i * 2 + 1] ?? 0;
  }
}
