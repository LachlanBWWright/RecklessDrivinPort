/**
 * LZRW3-A compression / decompression – TypeScript port.
 *
 * Based on the public-domain C implementation by Ross Williams (15-Jul-1991)
 * as used by the Reckless Drivin' port in port/lzrw/lzrw.c.
 *
 * The pack handle format used by Reckless Drivin' is:
 *   [4-byte big-endian uncompressed size] [FLAG_BYTE + 3 zero bytes] [payload…]
 *
 * FLAG_BYTE = 0  → LZRW3-A compressed payload (in the first of the 4 flag bytes)
 * FLAG_BYTE = 1  → uncompressed copy (payload is raw data)
 *
 * Exported helpers:
 *   lzrw3aDecompress(src)    – decompress payload bytes (FLAG_BYTE already stripped)
 *   packHandleDecompress(src) – read the 4-byte header + FLAG_BYTE and return decompressed data
 *   packHandleCompress(data)  – encode as FLAG_COPY (uncompressed) handle for round-trip writes
 */

import { err, ok, type Result } from 'neverthrow';

const HASH_TABLE_LEN = 4096;
const DEPTH_BITS = 3;
const DEPTH = 1 << DEPTH_BITS; // 8
const PARTITION_LEN = 1 << (12 - DEPTH_BITS); // 512
const HASH_MASK = PARTITION_LEN - 1; // 511
const DEPTH_MASK = DEPTH - 1; // 7
const FLAG_BYTES = 4; // lzrw.c line 275: FLAG_BYTES = 4 (FLAG_BYTE + 3 padding zeros)
const FLAG_COPY = 1;
const MAX_CMP_GROUP = 2 + 16 * 2; // 34
const COMPRESS_OVERRUN = 1024;

/** "123456789012345678" – the 18-byte initializer for all hash-table slots. */
const START_STRING = new Uint8Array([
  49, 50, 51, 52, 53, 54, 55, 56, 57, 48, 49, 50, 51, 52, 53, 54, 55, 56,
]);
const START_STRING_LEN = START_STRING.length; // 18

/** HASH macro: three bytes → partition-base index into hash table */
function lzrwHash(buf: Uint8Array, pos: number): number {
  const inner = (buf[pos] << 8) ^ (buf[pos + 1] << 4) ^ buf[pos + 2];
  return ((Math.imul(40543, inner) >> 4) & HASH_MASK) << DEPTH_BITS;
}

/**
 * Decompress LZRW3-A compressed bytes.
 *
 * @param src – the payload bytes AFTER the 4-byte size header and INCLUDING the FLAG_BYTE.
 */
export function lzrw3aDecompress(src: Uint8Array): Uint8Array {
  if (src.length === 0) return new Uint8Array(0);

  if (src[0] === FLAG_COPY) {
    // Stored-copy: payload follows the flag byte unchanged.
    return src.slice(FLAG_BYTES);
  }

  // LZRW3-A compressed stream.
  // We work in a "combined" buffer: [startString(18)][output bytes…].
  // Hash-table entries are absolute offsets into combined.
  // Worst-case expansion: each input byte could become 1 literal (1 byte of output)
  // plus 1 control bit (1/8 byte overhead) = ~9/8 bytes → multiply by 9 for safety
  // (matching COMPRESS_MAX_COM / COMPRESS_MAX_ORG = 9× in the original C code).
  const maxOut = src.length * 9 + COMPRESS_OVERRUN;
  const combined = new Uint8Array(START_STRING_LEN + maxOut);
  combined.set(START_STRING, 0);

  // All hash table slots initialized to 0 (= start of START_STRING).
  const hashTable = new Int32Array(HASH_TABLE_LEN);

  let pSrc = FLAG_BYTES; // skip FLAG_BYTE
  let dstOff = 0; // next write offset within combined[START_STRING_LEN+…]
  const srcLen = src.length;
  // Threshold: if pSrc > this, only process 1 item per outer loop iteration.
  const srcMax16 = srcLen - (MAX_CMP_GROUP - 2); // src_len - 32

  let control = 1;
  let literals = 0;
  let cycle = 0;

  const updateHash = (iBase: number, ptr: number): void => {
    hashTable[iBase + cycle] = ptr;
    cycle = (cycle + 1) & DEPTH_MASK;
  };

  while (pSrc < srcLen) {
    // When control reaches 1 all 16 bits of the current group have been consumed;
    // read the next control word.
    if (control === 1) {
      const c0 = src[pSrc++];
      const c1 = src[pSrc++];
      control = 0x10000 | c0 | (c1 << 8);
    }

    const unroll = pSrc <= srcMax16 ? 16 : 1;

    for (let u = 0; u < unroll && pSrc < srcLen; u++) {
      if (control & 1) {
        // ---- Copy item ----
        if (pSrc + 1 >= srcLen) {
          // Incomplete copy item at end of stream: advance past end to
          // terminate the outer while loop and avoid an infinite loop.
          pSrc = srcLen;
          break;
        }
        const lenmt_raw = src[pSrc++];
        const byte2 = src[pSrc++];
        const index = ((lenmt_raw & 0xf0) << 4) | byte2;
        const lenmt = lenmt_raw & 0xf;
        const copyLen = lenmt + 3;

        const pZivCombined = START_STRING_LEN + dstOff;
        const srcCopyPos = hashTable[index];

        // Byte-by-byte copy supports overlapping (RLE-style repetition).
        for (let k = 0; k < copyLen; k++) {
          combined[START_STRING_LEN + dstOff + k] = combined[srcCopyPos + k];
        }
        dstOff += copyLen;

        // Flush any pending literal hashings (max 2).
        if (literals > 0) {
          const r = pZivCombined - literals;
          updateHash(lzrwHash(combined, r), r);
          if (literals === 2) {
            updateHash(lzrwHash(combined, r + 1), r + 1);
          }
          literals = 0;
        }

        // Update hash with start of current copy output.
        updateHash(index & ~DEPTH_MASK, pZivCombined);
      } else {
        // ---- Literal item ----
        combined[START_STRING_LEN + dstOff] = src[pSrc++];
        dstOff++;

        // Once 3 literals have accumulated, hash the oldest.
        if (++literals === 3) {
          const p = START_STRING_LEN + dstOff - 3;
          updateHash(lzrwHash(combined, p), p);
          literals = 2;
        }
      }

      control >>>= 1;
    }
  }

  return combined.slice(START_STRING_LEN, START_STRING_LEN + dstOff);
}

/**
 * Read a Reckless Drivin' "pack handle" blob and return the decompressed data.
 *
 * Handle format: [4-byte BE uint32 uncompressed_size] [FLAG_BYTE…payload]
 */
export function packHandleDecompress(handle: Uint8Array): Result<Uint8Array, string> {
  if (handle.length < 5) return err('Pack handle too short');

  const view = new DataView(handle.buffer, handle.byteOffset, handle.byteLength);
  const uncompressedSize = view.getUint32(0, false); // big-endian

  if (uncompressedSize > 32 * 1024 * 1024) {
    return err(`Suspicious uncompressed size: ${uncompressedSize}`);
  }

  const payload = handle.slice(4); // [FLAG_BYTE][…]
  const decompressed = lzrw3aDecompress(payload);

  if (decompressed.length !== uncompressedSize) {
    // Use actual length; size mismatch is non-fatal.
    console.warn(
      `[lzrw] size mismatch: got ${decompressed.length}, header says ${uncompressedSize}`,
    );
  }

  return ok(decompressed);
}

/**
 * Encode raw data as a pack handle.
 *
 * Attempts LZRW3-A compression (FLAG_BYTE=0). Falls back to FLAG_COPY (FLAG_BYTE=1)
 * if compression does not reduce size.
 *
 * Format: [4-byte BE uint32 uncompressed_size][FLAG_BYTE][0x00][0x00][0x00][payload…]
 *   FLAG_BYTE = 0  → LZRW3-A compressed payload
 *   FLAG_BYTE = 1  → uncompressed copy
 *
 * Both forms are accepted by the runtime's LZRWDecodeHandle.
 */
export function packHandleCompress(data: Uint8Array): Uint8Array {
  const compressed = lzrw3aCompress(data);
  const out = new Uint8Array(4 + compressed.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length, false); // big-endian uncompressed size
  out.set(compressed, 4);
  return out;
}

/**
 * LZRW3-A compressor with hash-table back-reference matching.
 *
 * Maintains the hash table using EXACTLY the same update rules as the decompressor
 * (lazy literal hashing, copy flush) so that encoded copy-item indices are always valid.
 *
 * Falls back to FLAG_COPY if the compressed output is not smaller than the raw input.
 *
 * Returns FLAG_BYTES prefix + payload.
 */
export function lzrw3aCompress(src: Uint8Array): Uint8Array {
  const srcLen = src.length;
  if (srcLen === 0) {
    const out = new Uint8Array(FLAG_BYTES);
    out[0] = 0;
    return out;
  }

  // combined buffer: START_STRING (18) + full source copy
  // This mirrors the decompressor's combined buffer (START_STRING + decoded output).
  // Since the compressor encodes in order, combined[18+i] == decompressed[i] == src[i].
  const combinedOff = START_STRING_LEN; // 18
  const combined = new Uint8Array(combinedOff + srcLen);
  combined.set(START_STRING, 0);
  combined.set(src, combinedOff);

  // Hash table and cycle: identical to decompressor state.
  const hashTable = new Int32Array(HASH_TABLE_LEN); // all 0 initially
  let cycle = 0;
  // "Pending literal" counter – mirrors the decompressor's `literals` variable.
  let pendingLiterals = 0;

  const updateHash = (iBase: number, ptr: number): void => {
    hashTable[iBase + cycle] = ptr;
    cycle = (cycle + 1) & DEPTH_MASK;
  };

  /**
   * Flush pending literal hashings (up to 2 positions), then update hash at cPos.
   * This matches the copy-item hash update in the decompressor exactly.
   */
  const flushAndUpdateForCopy = (cPos: number): void => {
    if (pendingLiterals > 0) {
      const r = cPos - pendingLiterals;
      updateHash(lzrwHash(combined, r), r);
      if (pendingLiterals === 2) {
        updateHash(lzrwHash(combined, r + 1), r + 1);
      }
      pendingLiterals = 0;
    }
    updateHash(lzrwHash(combined, cPos) & ~DEPTH_MASK, cPos);
  };

  // Worst-case: all literals → FLAG_BYTES + ceil(n/16)*2 + n bytes.
  const maxDst = FLAG_BYTES + Math.ceil(srcLen / 16) * 2 + srcLen + 64;
  const dst = new Uint8Array(maxDst);
  dst[0] = 0; // FLAG_BYTE = 0 (LZRW3-A)

  let pSrc = 0;
  let pDst = FLAG_BYTES;

  while (pSrc < srcLen) {
    const ctrlOff = pDst; // reserve 2 bytes for control word
    pDst += 2;
    let ctrl = 0;

    for (let item = 0; item < 16 && pSrc < srcLen; item++) {
      const cPos = combinedOff + pSrc;

      // Need at least 3 bytes ahead to compute a meaningful hash.
      if (pSrc + 2 < srcLen) {
        const iBase = lzrwHash(combined, cPos);

        // Search DEPTH slots for the best match.
        let bestLen = 2; // minimum useful match = 3; start below threshold
        let bestIdx = -1;
        const maxMatchLen = Math.min(18, srcLen - pSrc);

        for (let d = 0; d < DEPTH; d++) {
          const idx = iBase + d;
          const pos = hashTable[idx];
          // Only use positions that are strictly before the current position.
          // Also skip positions so close that they'd require an overlapping copy
          // that the decompressor can't faithfully reproduce (match <= distance case).
          if (pos > 0 && pos < cPos) {
            const dist = cPos - pos;
            // Limit match length to avoid overlap beyond what RLE can faithfully reproduce.
            const safeMax = Math.min(maxMatchLen, dist >= 3 ? maxMatchLen : dist);
            let mLen = 0;
            while (mLen < safeMax && combined[pos + mLen] === combined[cPos + mLen]) {
              mLen++;
            }
            if (mLen >= 3 && mLen > bestLen) {
              bestLen = mLen;
              bestIdx = idx;
            }
          }
        }

        if (bestIdx >= 0) {
          // Emit a copy item (control bit = 1).
          ctrl |= (1 << item);
          flushAndUpdateForCopy(cPos);
          const I = bestIdx; // 12-bit hash table index
          dst[pDst++] = ((I >> 4) & 0xF0) | (bestLen - 3);
          dst[pDst++] = I & 0xFF;
          pSrc += bestLen;
          continue;
        }
      }

      // Emit a literal (control bit = 0).
      dst[pDst++] = src[pSrc++];
      if (++pendingLiterals === 3) {
        const r = combinedOff + pSrc - 3;
        updateHash(lzrwHash(combined, r), r);
        pendingLiterals = 2;
      }
    }

    // Write control word (little-endian).
    dst[ctrlOff]     = ctrl & 0xFF;
    dst[ctrlOff + 1] = (ctrl >> 8) & 0xFF;
  }

  const compressed = dst.slice(0, pDst);

  // Fall back to FLAG_COPY if compression didn't help.
  const copySize = FLAG_BYTES + srcLen;
  if (compressed.length >= copySize) {
    const copy = new Uint8Array(copySize);
    copy[0] = FLAG_COPY;
    copy.set(src, FLAG_BYTES);
    return copy;
  }
  return compressed;
}
