import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { packHandleDecompress } from './lzrw.service';
import { decompressedPackEntries } from './pack-parser.service';

function findPack(id: number): Uint8Array | null {
  const buf = new Uint8Array(readFileSync(new URL('../../../port/resources/resources.dat', import.meta.url)));
  const HEADER_SIZE = 16;
  let offset = 0;
  while (offset + HEADER_SIZE <= buf.length) {
    const typeBytes = buf.slice(offset, offset + 8);
    const type = String.fromCharCode(...typeBytes).replace(/\0+$/, '');
    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    const packId = dv.getUint32(offset + 8, true);
    const size = dv.getUint32(offset + 12, true);
    if (type === 'Pack' && packId === id) {
      return buf.slice(offset + HEADER_SIZE, offset + HEADER_SIZE + size);
    }
    offset += HEADER_SIZE + size;
  }
  return null;
}

/**
 * Parse a Pack 134 (kPackSnds) tSound entry to extract sample metadata.
 * tSound layout (big-endian):
 *   +0:  numSamples (uint32) - number of sound variants
 *   +4:  priority   (uint32)
 *   +8:  flags      (uint32)
 *   +12: offsets[0..numSamples-1] (uint32[]) - byte offsets to each SoundHeader
 * SoundHeader (at each offset):
 *   +0:  samplePtr  (uint32) = 0 inline
 *   +4:  length     (uint32) stdSH=samples; extSH=numChannels
 *   +8:  sampleRate (fixed 16.16 Hz)
 *   +12: loopStart  (uint32)
 *   +16: loopEnd    (uint32)
 *   +20: encode     (uint8)  0x00=stdSH 0xFF=extSH
 *   +21: baseFreq   (uint8)
 * For stdSH: PCM data at SoundHeader+22 (8-bit unsigned mono)
 * For extSH: numFrames at SoundHeader+22, sampleSize at SoundHeader+48, PCM at SoundHeader+64
 */
function parseTSoundFull(bytes: Uint8Array) {
  if (bytes.length < 16) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const numVariants = view.getUint32(0, false);
  if (numVariants === 0 || numVariants > 16) return null;
  const hdrOff = view.getUint32(12, false);
  if (hdrOff + 22 > bytes.length) return null;
  const sampleRateFixed = view.getUint32(hdrOff + 8, false);
  const sampleRate = sampleRateFixed / 65536;
  const encode = view.getUint8(hdrOff + 20);
  
  let numFrames: number;
  let pcmOffset: number;
  let sampleSize: number;
  
  if (encode === 0x00) {
    // stdSH: 8-bit mono PCM
    numFrames = view.getUint32(hdrOff + 4, false);
    pcmOffset = hdrOff + 22;
    sampleSize = 8;
  } else if (encode === 0xFF) {
    // extSH: multi-channel 16-bit PCM
    // numChannels at hdrOff+4, numFrames at hdrOff+22, sampleSize at hdrOff+48
    if (hdrOff + 64 > bytes.length) return null;
    numFrames = view.getUint32(hdrOff + 22, false);
    sampleSize = view.getUint16(hdrOff + 48, false) || 16;
    pcmOffset = hdrOff + 64;
  } else {
    return null;
  }
  
  return { numVariants, hdrOff, sampleRate, encode, numFrames, pcmOffset, sampleSize };
}

describe('tSound full parsing', () => {
  let entries: { id: number; data: Uint8Array }[] = [];

  beforeAll(() => {
    const raw = findPack(134);
    if (!raw) return;
    const decompressedResult = packHandleDecompress(raw);
    if (decompressedResult.isErr()) return;
    const decompressed = decompressedResult.value;
    entries = decompressedPackEntries(decompressed);
  });

  it('computes durations for all sounds', () => {
    for (const e of entries) {
      const info = parseTSoundFull(e.data);
      if (info) {
        const durationS = info.numFrames / info.sampleRate;
        const durationMs = Math.round(durationS * 1000);
        console.log(`Sound #${e.id}: encode=0x${info.encode.toString(16)} ${info.sampleRate.toFixed(1)}Hz ${info.sampleSize}bit ${info.numFrames}samples = ${durationMs}ms`);
        expect(durationS).toBeGreaterThan(0);
        expect(info.sampleRate).toBeGreaterThan(0);
      } else {
        console.log(`Sound #${e.id}: FAILED (encode not supported?)`);
      }
    }
  });
});
