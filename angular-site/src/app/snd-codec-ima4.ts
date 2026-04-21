/**
 * Apple IMA4 ADPCM decoder.
 *
 * Kept separate from the main snd-codec since IMA4 is not used in the
 * Reckless Drivin' sound pack, but the decoder is preserved for completeness.
 */

/** IMA ADPCM step table (89 entries). */
export const IMA4_STEP_TABLE: readonly number[] = [
  7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 19, 21, 23, 25, 28, 31, 34, 37, 41, 45,
  50, 55, 60, 66, 73, 80, 88, 97, 107, 118, 130, 143, 157, 173, 190, 209, 230,
  253, 279, 307, 337, 371, 408, 449, 494, 544, 598, 658, 724, 796, 876, 963,
  1060, 1166, 1282, 1411, 1552, 1707, 1878, 2066, 2272, 2499, 2749, 3024, 3327,
  3660, 4026, 4428, 4871, 5358, 5894, 6484, 7132, 7845, 8630, 9493, 10442,
  11487, 12635, 13899, 15289, 16818, 18500, 20350, 22385, 24623, 27086, 29794, 32767,
];

/** IMA ADPCM index adjustment table (indexed by low 4 bits of each nibble). */
export const IMA4_INDEX_TABLE: readonly number[] = [-1, -1, -1, -1, 2, 4, 6, 8, -1, -1, -1, -1, 2, 4, 6, 8];

/**
 * Decode one 34-byte Apple IMA4 packet into 64 Float32 samples.
 * Packet layout: 2-byte big-endian header (predictor + step index) + 32 data bytes.
 */
export function decodeIMA4Packet(packet: Uint8Array, pktOff: number, out: Float32Array, outOff: number): void {
  const headerWord = ((packet[pktOff] & 0xFF) << 8) | (packet[pktOff + 1] & 0xFF);
  let predictor = headerWord & 0xFF80;
  if (predictor & 0x8000) predictor = predictor - 0x10000;
  let index = Math.max(0, Math.min(88, headerWord & 0x7F));
  let pos = outOff;
  for (let bi = 0; bi < 32; bi++) {
    const byte = packet[pktOff + 2 + bi] & 0xFF;
    for (let shift = 4; shift >= 0; shift -= 4) {
      const nibble = (byte >> shift) & 0x0F;
      const step = IMA4_STEP_TABLE[index] ?? 0;
      let diff = (step >> 3);
      if (nibble & 1) diff += (step >> 2);
      if (nibble & 2) diff += (step >> 1);
      if (nibble & 4) diff += step;
      if (nibble & 8) diff = -diff;
      predictor = Math.max(-32768, Math.min(32767, predictor + diff));
      index = Math.max(0, Math.min(88, index + (IMA4_INDEX_TABLE[nibble] ?? 0)));
      out[pos++] = predictor / 32768.0;
    }
  }
}

/**
 * Decode a complete IMA4-compressed byte buffer into a Float32Array.
 * @param data    - compressed bytes (sequence of 34-byte packets)
 * @param numPkts - number of packets to decode
 * @returns Float32Array of numPkts×64 samples normalised to [-1, 1]
 */
export function decodeIMA4(data: Uint8Array, numPkts: number): Float32Array {
  const out = new Float32Array(numPkts * 64);
  for (let p = 0; p < numPkts; p++) {
    decodeIMA4Packet(data, p * 34, out, p * 64);
  }
  return out;
}
