/**
 * Mac OS 'snd ' resource codec helpers.
 *
 * Exported so they can be unit-tested and used from app.ts without the file
 * becoming a monolith.  All functions are pure (no DOM / Angular dependencies).
 *
 * ─── tSound pack format (Pack 134 / kPackSnds) ────────────────────────────
 * Pack 134 entries use the game's custom `tSound` struct, NOT standard Mac
 * snd format 1/2 resources (which start with a 2-byte format word and a
 * command table).  The struct layout is big-endian throughout:
 *
 *   offset  0: numVariants (uint32) – number of alternate sound headers
 *   offset  4: priority    (uint32)
 *   offset  8: flags       (uint32)
 *   offset 12: offsets[0..numVariants-1] (uint32 each)
 *              each value is a byte offset from the start of the struct
 *              to a Mac OS SoundHeader.
 *
 * Mac OS SoundHeader (at bytes[offsets[i]]):
 *   +0:  samplePtr  (uint32) = 0 for inline data
 *   +4:  length     (uint32) = stdSH: sample count; extSH: numChannels
 *   +8:  sampleRate (uint32, unsigned 16.16 fixed-point Hz)
 *   +12: loopStart  (uint32)
 *   +16: loopEnd    (uint32)
 *   +20: encode     (uint8)  0x00 = stdSH, 0xFF = extSH
 *   +21: baseFreq   (uint8)
 *
 * stdSH (encode=0x00):
 *   8-bit unsigned mono PCM starts at SoundHeader+22.
 *
 * extSH (encode=0xFF):
 *   +22: numFrames     (uint32) – total PCM sample frames
 *   +26: AIFFSampleRate (10-byte 80-bit IEEE 754 extended) – redundant; ignored
 *   +36: markerChunk   (uint32) – reserved
 *   +40: instrumentChunks (uint32) – reserved
 *   +44: AESRecording  (uint32) – reserved
 *   +48: sampleSize    (uint16) – bits per sample (typically 16)
 *   +50..+63: reserved (14 bytes)
 *   +64: PCM data (16-bit signed big-endian, interleaved by channel)
 *
 * ─── Apple IMA4 ADPCM decoder ─────────────────────────────────────────────
 * IMA4 is NOT used in the Reckless Drivin' sound pack, but the decoder is
 * kept here for completeness (cmpSH, encode=0xFE, format='ima4').
 * A cmpSH header contains 34-byte packets each producing 64 output samples.
 * The step-table and index-table are standard IMA ADPCM (ITU-T G.711 Annex A).

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

// ─── tSound / SoundHeader parser ──────────────────────────────────────────────

/**
 * Metadata extracted from a Pack 134 (kPackSnds) tSound entry.
 * All byte offsets are relative to the start of the raw pack entry bytes.
 */
export interface SndInfo {
  /** 0x00 = stdSH (8-bit unsigned mono), 0xFF = extSH (16-bit big-endian) */
  encode: number;
  /** Playback sample rate in Hz (from the SoundHeader's 16.16 Fixed field) */
  sampleRate: number;
  /** Total PCM frames (= samples for mono, = frames for stereo extSH) */
  numFrames: number;
  /** Number of audio channels (1 = mono, 2 = stereo) */
  numChannels: number;
  /** Bits per sample (8 for stdSH, 16 for extSH) */
  sampleSize: number;
  /** Byte offset within the raw bytes where PCM data begins */
  pcmOffset: number;
}

/**
 * Parse a Pack 134 (kPackSnds) tSound entry and return audio metadata.
 * Returns null if the bytes are too short, the numVariants field is out of range,
 * or the encode value is not 0x00 (stdSH) or 0xFF (extSH).
 *
 * The first sound variant (offsets[0]) is always used; alternates are ignored.
 */
export function parseSndHeader(bytes: Uint8Array): SndInfo | null {
  if (bytes.length < 16) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  // tSound header (all big-endian uint32):
  const numVariants = view.getUint32(0, false); // offset 0: number of SoundHeader variants
  if (numVariants === 0 || numVariants > 32) return null; // sanity check

  // offsets[0] at byte 12 (after numVariants+priority+flags = 12 bytes)
  const hdrOff = view.getUint32(12, false);
  if (hdrOff + 22 > bytes.length) return null;

  // SoundHeader fields (big-endian):
  const sampleRateFixed = view.getUint32(hdrOff + 8, false); // 16.16 fixed-point Hz
  const sampleRate      = sampleRateFixed / 65536;
  const encode          = view.getUint8(hdrOff + 20);

  if (encode === 0x00) {
    // stdSH: 8-bit unsigned mono PCM immediately after the 22-byte header
    const numFrames = view.getUint32(hdrOff + 4, false); // sample count
    return { encode, sampleRate, numFrames, numChannels: 1, sampleSize: 8, pcmOffset: hdrOff + 22 };
  }

  if (encode === 0xFF) {
    // extSH: 16-bit big-endian PCM, additional header fields at +22..+63
    // numChannels is stored at hdrOff+4 (the stdSH "length" slot repurposed)
    // numFrames (true frame count) is at hdrOff+22
    // sampleSize (bits per sample) is at hdrOff+48
    if (hdrOff + 64 > bytes.length) return null;
    const numChannels = Math.max(1, view.getUint32(hdrOff + 4, false)) || 1;
    const numFrames   = view.getUint32(hdrOff + 22, false);
    const sampleSize  = view.getUint16(hdrOff + 48, false) || 16;
    return { encode, sampleRate, numFrames, numChannels, sampleSize, pcmOffset: hdrOff + 64 };
  }

  return null; // cmpSH and other encode values not used in this game's sound pack
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
