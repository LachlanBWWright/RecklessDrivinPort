import { err, ok, type Result } from 'neverthrow';
import { decodeIMA4 } from './snd-codec-ima4';

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
 */

export { IMA4_STEP_TABLE, IMA4_INDEX_TABLE, decodeIMA4Packet, decodeIMA4 } from './snd-codec-ima4';

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

/** Convert a Mac OS 'snd ' resource to PCM WAV. */
export function sndToWav(bytes: Uint8Array): Uint8Array {
  const info = parseSndHeader(bytes);
  if (!info) {
    return buildWav(bytes, 22050, 1, 8);
  }
  if (info.encode === 0xfe) {
    const dataStart = info.pcmOffset;
    const pktsAvail = Math.floor((bytes.length - dataStart) / 34);
    if (pktsAvail > 0) {
      const f32 = decodeIMA4(bytes.subarray(dataStart), pktsAvail);
      const pcm16 = new Int16Array(f32.length);
      for (let s = 0; s < f32.length; s += 1) {
        pcm16[s] = Math.max(-32768, Math.min(32767, Math.round(f32[s] * 32768)));
      }
      return buildWav(
        new Uint8Array(pcm16.buffer),
        Math.round(info.sampleRate),
        info.numChannels,
        16,
      );
    }
    return buildWav(bytes, Math.round(info.sampleRate), 1, 8);
  }
  const pcmStart = Math.min(info.pcmOffset, bytes.length);
  const pcmData = bytes.slice(pcmStart);
  return buildWav(pcmData, Math.round(info.sampleRate), info.numChannels, info.sampleSize);
}

/** Convert a WAV file to a minimal Mac OS 'snd ' Format 1 resource. */
export function wavToSnd(wav: Uint8Array): Result<Uint8Array, string> {
  if (wav.length < 44) return err('WAV file too short');
  const wavView = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
  const sampleRate = wavView.getUint32(24, true);
  const numChannels = wavView.getUint16(22, true);
  const bitsPerSample = wavView.getUint16(34, true);
  let dataOff = 12;
  let dataLen = 0;
  while (dataOff + 8 <= wav.length) {
    const chunkId = String.fromCharCode(
      wav[dataOff],
      wav[dataOff + 1],
      wav[dataOff + 2],
      wav[dataOff + 3],
    );
    const chunkLen = wavView.getUint32(dataOff + 4, true);
    if (chunkId === 'data') {
      dataOff += 8;
      dataLen = chunkLen;
      break;
    }
    dataOff += 8 + chunkLen;
  }
  if (dataLen === 0) return err('No data chunk in WAV');
  let pcm = wav.slice(dataOff, dataOff + dataLen);
  if (bitsPerSample === 16) {
    const pcmView = new DataView(pcm.buffer, pcm.byteOffset, pcm.byteLength);
    const pcm8 = new Uint8Array(pcm.length / 2);
    for (let i = 0; i < pcm8.length; i += 1) {
      pcm8[i] = ((pcmView.getInt16(i * 2, true) >> 8) + 128) & 0xff;
    }
    pcm = pcm8;
  }
  if (numChannels === 2) {
    const mono = new Uint8Array(pcm.length / 2);
    for (let i = 0; i < mono.length; i += 1) {
      mono[i] = ((pcm[i * 2] + pcm[i * 2 + 1]) / 2) | 0;
    }
    pcm = mono;
  }
  const headerOff = 20;
  const out = new Uint8Array(headerOff + 22 + pcm.length);
  const dv = new DataView(out.buffer);
  dv.setUint16(0, 1, false);
  dv.setUint16(2, 1, false);
  dv.setUint16(4, 5, false);
  dv.setUint32(6, 0x80, false);
  dv.setUint16(10, 1, false);
  dv.setUint16(12, 0x8051, false);
  dv.setUint16(14, 0, false);
  dv.setUint32(16, headerOff, false);
  dv.setUint32(headerOff + 0, 0, false);
  dv.setUint32(headerOff + 4, pcm.length, false);
  dv.setUint32(headerOff + 8, sampleRate * 65536, false);
  dv.setUint32(headerOff + 12, 0, false);
  dv.setUint32(headerOff + 16, 0, false);
  dv.setUint8(headerOff + 20, 0);
  dv.setUint8(headerOff + 21, 60);
  out.set(pcm, headerOff + 22);
  return ok(out);
}

/**
 * Attempt to play a Mac OS 'snd ' resource using the Web Audio API.
 * Returns true if playback started, false if format is unsupported.
 */
export function tryPlaySndResource(bytes: Uint8Array, audioCtx: AudioContext): boolean {
  if (bytes.length < 6) return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const format = view.getUint16(0, false);
  let cmdOffset = 0;

  if (format === 1) {
    const numSynths = view.getUint16(2, false);
    cmdOffset = 4 + numSynths * 6;
  } else if (format === 2) {
    cmdOffset = 4;
  } else {
    return false;
  }

  if (cmdOffset + 2 > bytes.length) return false;
  const numCmds = view.getUint16(cmdOffset, false);
  cmdOffset += 2;

  for (let i = 0; i < numCmds; i += 1) {
    if (cmdOffset + 8 > bytes.length) break;
    const cmd = view.getUint16(cmdOffset, false) & 0x7fff;
    const param2 = view.getUint32(cmdOffset + 4, false);
    cmdOffset += 8;

    if (cmd === 80 || cmd === 81) {
      const headerOff = param2;
      if (headerOff + 22 > bytes.length) break;
      const numFrames = view.getUint32(headerOff + 4, false);
      const sampleRateFixed = view.getUint32(headerOff + 8, false);
      const sampleRate = Math.max(sampleRateFixed / 65536, 100);
      const encode = view.getUint8(headerOff + 20);

      if (encode === 0x00) {
        const dataStart = headerOff + 22;
        const sampleCount = Math.min(numFrames, bytes.length - dataStart);
        if (sampleCount <= 0 || sampleCount > 10_000_000) break;
        const audioBuffer = audioCtx.createBuffer(1, sampleCount, sampleRate);
        const ch = audioBuffer.getChannelData(0);
        for (let s = 0; s < sampleCount; s += 1) ch[s] = (bytes[dataStart + s] - 128) / 128;
        const src = audioCtx.createBufferSource();
        src.buffer = audioBuffer;
        src.connect(audioCtx.destination);
        src.start();
        return true;
      }

      if (encode === 0xfe) {
        if (headerOff + 66 > bytes.length) break;
        const fmtBytes = bytes.slice(headerOff + 40, headerOff + 44);
        const comprFmt = String.fromCharCode(...fmtBytes);
        if (comprFmt !== 'ima4') break;

        const dataStart = headerOff + 66;
        const numPackets = numFrames;
        const totalSamples = numPackets * 64;
        if (totalSamples <= 0 || totalSamples > 10_000_000) break;
        const available = Math.floor((bytes.length - dataStart) / 34);
        const pktsToUse = Math.min(numPackets, available);
        if (pktsToUse <= 0) break;

        const f32 = decodeIMA4(bytes.subarray(dataStart), pktsToUse);
        const audioBuffer = audioCtx.createBuffer(1, f32.length, sampleRate);
        audioBuffer.getChannelData(0).set(f32);
        const src = audioCtx.createBufferSource();
        src.buffer = audioBuffer;
        src.connect(audioCtx.destination);
        src.start();
        return true;
      }

      if (encode === 0xff) {
        const dataStart = headerOff + 64;
        if (dataStart + 2 > bytes.length) break;
        const sampleCount = Math.min(numFrames, Math.floor((bytes.length - dataStart) / 2));
        if (sampleCount <= 0 || sampleCount > 10_000_000) break;
        const audioBuffer = audioCtx.createBuffer(1, sampleCount, sampleRate);
        const ch = audioBuffer.getChannelData(0);
        for (let s = 0; s < sampleCount; s += 1) {
          const sample = view.getInt16(dataStart + s * 2, false);
          ch[s] = sample / 32768.0;
        }
        const src = audioCtx.createBufferSource();
        src.buffer = audioBuffer;
        src.connect(audioCtx.destination);
        src.start();
        return true;
      }

      break;
    }
  }
  return false;
}
