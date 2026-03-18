/**
 * Mac OS 'snd ' resource codec helpers.
 *
 * Exported so they can be unit-tested and used from app.ts without the file
 * becoming a monolith.  All functions are pure (no DOM / Angular dependencies).
 */

// ─── Apple IMA4 ADPCM decoder ────────────────────────────────────────────────
// Mac OS 'snd ' resources can use IMA4 (Apple ADPCM) compression.
// A cmpSH header (encode=0xFE) with format='ima4' contains packets of 34 bytes
// each representing 64 output samples.  The step-table and index-table are
// identical to the standard IMA ADPCM spec (ITU-T G.711 Annex A).

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
 * Header bits 15-7 = initial predictor (as upper 9 bits of an int16).
 * Header bits 6-0  = initial step table index (0-88).
 * Data nibbles: high nibble first within each byte.
 */
export function decodeIMA4Packet(packet: Uint8Array, pktOff: number, out: Float32Array, outOff: number): void {
  const headerWord = ((packet[pktOff] & 0xFF) << 8) | (packet[pktOff + 1] & 0xFF);
  // Recover 16-bit predictor: top 9 bits stored in bits 15..7, bottom 7 bits always 0.
  let predictor = headerWord & 0xFF80;
  if (predictor & 0x8000) predictor = predictor - 0x10000; // sign-extend to int16 range
  let index = headerWord & 0x7F;
  index = Math.max(0, Math.min(88, index));

  let pos = outOff;
  for (let bi = 0; bi < 32; bi++) {
    const byte = packet[pktOff + 2 + bi] & 0xFF;
    // Process high nibble then low nibble (Apple IMA4 byte order)
    for (let shift = 4; shift >= 0; shift -= 4) {
      const nibble = (byte >> shift) & 0x0F;
      const step = IMA4_STEP_TABLE[index]!;
      let diff = (step >> 3);
      if (nibble & 1) diff += (step >> 2);
      if (nibble & 2) diff += (step >> 1);
      if (nibble & 4) diff += step;
      if (nibble & 8) diff = -diff;
      predictor = Math.max(-32768, Math.min(32767, predictor + diff));
      index = Math.max(0, Math.min(88, index + IMA4_INDEX_TABLE[nibble]!));
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

// ─── Mac 'snd ' header parser ─────────────────────────────────────────────────

/**
 * Parse a Mac OS 'snd ' resource header to extract sample metadata.
 * Supports both format 1 and format 2 snd resources.
 * Handles stdSH (encode=0x00), cmpSH/IMA4 (encode=0xFE), and extSH (encode=0xFF).
 * Returns null if the data is too short or malformed.
 * `length` is always the total number of PCM output samples.
 * `comprFmt` is present for compressed sounds (e.g. 'ima4').
 */
export function parseSndHeader(bytes: Uint8Array): {
  format: number; sampleRate: number; length: number; encode: number; comprFmt?: string;
} | null {
  if (bytes.length < 6) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const format = view.getUint16(0, false);
  let cmdOffset = 0;

  if (format === 1) {
    // Format 1: 2 bytes format, 2 bytes numSynths, N*6 bytes synth records, then commands
    const numSynths = view.getUint16(2, false);
    cmdOffset = 4 + numSynths * 6;
  } else if (format === 2) {
    // Format 2: 2 bytes format, 2 bytes refCount, then commands
    cmdOffset = 4;
  } else {
    return null;
  }

  if (cmdOffset + 2 > bytes.length) return null;
  const numCmds = view.getUint16(cmdOffset, false);
  cmdOffset += 2;

  for (let i = 0; i < numCmds; i++) {
    if (cmdOffset + 8 > bytes.length) break;
    const cmd = view.getUint16(cmdOffset, false) & 0x7FFF;
    const param2 = view.getUint32(cmdOffset + 4, false);
    cmdOffset += 8;

    // bufferCmd (0x51/80) or soundCmd (0x52/81) — both point to a SoundHeader
    if (cmd === 80 || cmd === 81) {
      const headerOff = param2;
      // All SoundHeader types share the first 22 bytes (stdSH layout):
      //   samplePtr(4) + length/numFrames(4) + sampleRate(4.16fp)(4)
      //   + loopStart(4) + loopEnd(4) + encode(1) + baseFreq(1)
      if (headerOff + 22 > bytes.length) break;
      const numFrames       = view.getUint32(headerOff + 4, false);
      const sampleRateFixed = view.getUint32(headerOff + 8, false);
      const sampleRate      = sampleRateFixed / 65536;
      const encode          = view.getUint8(headerOff + 20);

      if (encode === 0x00) {
        // stdSH — uncompressed 8-bit mono; numFrames IS the sample count
        return { format, sampleRate, length: numFrames, encode };
      }

      if (encode === 0xFE) {
        // cmpSH — compressed.  Additional fields after the 22-byte base:
        //   numFrames2(4) + AIFFSampleRate(10) + markerChunk(4) + format(4)
        //   + futureUse2(4) + stateVars(4) + leftOverSamples(4)
        //   + compressionID(2) + packetSize(2) + snthID(2)
        //   + numChannels(2) + sampleSize(2)  → total extra = 44 bytes → data at +66
        if (headerOff + 44 > bytes.length) break;
        const fmtBytes = bytes.slice(headerOff + 40, headerOff + 44);
        const comprFmt = String.fromCharCode(...fmtBytes);
        // IMA4: 64 output samples per 34-byte packet
        const length = comprFmt === 'ima4' ? numFrames * 64 : numFrames;
        return { format, sampleRate, length, encode, comprFmt };
      }

      if (encode === 0xFF) {
        // extSH — uncompressed 16-bit or multi-channel.
        // numFrames at headerOff+4 is the sample frame count.
        return { format, sampleRate, length: numFrames, encode };
      }

      // Unknown encode — return what we have
      return { format, sampleRate, length: numFrames, encode };
    }
  }
  return null;
}

// ─── WAV builder ─────────────────────────────────────────────────────────────

/** Build a minimal RIFF/WAV file wrapping raw PCM data. */
export function buildWav(pcm: Uint8Array, sampleRate: number, numChannels: number, bitsPerSample: number): Uint8Array {
  const dataSize   = pcm.length;
  const byteRate   = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const out        = new Uint8Array(44 + dataSize);
  const dv         = new DataView(out.buffer);
  // RIFF chunk
  out.set([82, 73, 70, 70], 0);              // 'RIFF'
  dv.setUint32(4, 36 + dataSize, true);      // file size - 8
  out.set([87, 65, 86, 69], 8);              // 'WAVE'
  // fmt  sub-chunk
  out.set([102, 109, 116, 32], 12);          // 'fmt '
  dv.setUint32(16, 16, true);                // sub-chunk size = 16
  dv.setUint16(20, 1, true);                 // PCM format = 1
  dv.setUint16(22, numChannels, true);
  dv.setUint32(24, sampleRate, true);
  dv.setUint32(28, byteRate, true);
  dv.setUint16(32, blockAlign, true);
  dv.setUint16(34, bitsPerSample, true);
  // data sub-chunk
  out.set([100, 97, 116, 97], 36);           // 'data'
  dv.setUint32(40, dataSize, true);
  out.set(pcm, 44);
  return out;
}
