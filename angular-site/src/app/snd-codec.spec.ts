import { describe, it, expect } from 'vitest';
import { decodeIMA4, decodeIMA4Packet, parseSndHeader, buildWav, IMA4_STEP_TABLE, IMA4_INDEX_TABLE } from './snd-codec';

describe('IMA4_STEP_TABLE', () => {
  it('has exactly 89 entries', () => {
    expect(IMA4_STEP_TABLE.length).toBe(89);
  });

  it('starts at 7 and ends at 32767', () => {
    expect(IMA4_STEP_TABLE[0]).toBe(7);
    expect(IMA4_STEP_TABLE[88]).toBe(32767);
  });
});

describe('IMA4_INDEX_TABLE', () => {
  it('has exactly 16 entries', () => {
    expect(IMA4_INDEX_TABLE.length).toBe(16);
  });

  it('has negative deltas for nibbles 0-3 and 8-11', () => {
    for (const i of [0, 1, 2, 3, 8, 9, 10, 11]) {
      expect(IMA4_INDEX_TABLE[i]).toBe(-1);
    }
  });

  it('has positive deltas for nibbles 4-7 and 12-15', () => {
    expect(IMA4_INDEX_TABLE[4]).toBe(2);
    expect(IMA4_INDEX_TABLE[5]).toBe(4);
    expect(IMA4_INDEX_TABLE[6]).toBe(6);
    expect(IMA4_INDEX_TABLE[7]).toBe(8);
  });
});

describe('decodeIMA4Packet', () => {
  it('produces 64 samples from 34-byte packet', () => {
    const packet = new Uint8Array(34); // all-zero packet
    const out = new Float32Array(64);
    decodeIMA4Packet(packet, 0, out, 0);
    expect(out.length).toBe(64);
  });

  it('outputs silence for all-zero packet', () => {
    // All-zero packet: predictor=0, stepIndex=0, all nibbles=0
    const packet = new Uint8Array(34);
    const out = new Float32Array(64);
    decodeIMA4Packet(packet, 0, out, 0);
    // All nibbles 0 → diff = step>>3 = 7>>3 = 0, predictor stays at 0
    for (let i = 0; i < 64; i++) {
      expect(out[i]).toBe(0);
    }
  });

  it('clamps output to [-1, 1]', () => {
    // Packet with all nibbles = 7 (max positive step), high predictor
    const packet = new Uint8Array(34);
    // Set header to max predictor (0x7F80 = predictor=0x7F80 which is positive)
    packet[0] = 0x7F;
    packet[1] = 0x00; // step index = 0
    // Fill data with 0x77 = nibble 7 for both high and low → max positive
    for (let i = 2; i < 34; i++) packet[i] = 0x77;
    const out = new Float32Array(64);
    decodeIMA4Packet(packet, 0, out, 0);
    for (let i = 0; i < 64; i++) {
      expect(out[i]).toBeGreaterThanOrEqual(-1);
      expect(out[i]).toBeLessThanOrEqual(1);
    }
  });

  it('respects pktOff and outOff offsets', () => {
    const bigBuf = new Uint8Array(68); // 2 packets worth
    const out = new Float32Array(128);
    // Decode at offsets
    decodeIMA4Packet(bigBuf, 34, out, 64);
    // First 64 samples should still be 0 (untouched)
    for (let i = 0; i < 64; i++) expect(out[i]).toBe(0);
    // Last 64 should have been written (silence since all-zero)
    for (let i = 64; i < 128; i++) expect(out[i]).toBe(0);
  });
});

describe('decodeIMA4', () => {
  it('decodes 0 packets into empty Float32Array', () => {
    const result = decodeIMA4(new Uint8Array(0), 0);
    expect(result.length).toBe(0);
  });

  it('decodes 1 packet into 64 samples', () => {
    const result = decodeIMA4(new Uint8Array(34), 1);
    expect(result.length).toBe(64);
  });

  it('decodes 3 packets into 192 samples', () => {
    const result = decodeIMA4(new Uint8Array(102), 3);
    expect(result.length).toBe(192);
  });

  it('produces values in [-1, 1] for various inputs', () => {
    const data = new Uint8Array(34 * 5);
    // Fill with pseudo-random-ish bytes
    for (let i = 0; i < data.length; i++) data[i] = (i * 37 + 13) & 0xFF;
    const result = decodeIMA4(data, 5);
    expect(result.length).toBe(320);
    for (let i = 0; i < result.length; i++) {
      expect(result[i]).toBeGreaterThanOrEqual(-1);
      expect(result[i]).toBeLessThanOrEqual(1);
    }
  });
});

describe('parseSndHeader', () => {
  it('returns null for empty input', () => {
    expect(parseSndHeader(new Uint8Array(0))).toBeNull();
  });

  it('returns null for too-short input', () => {
    expect(parseSndHeader(new Uint8Array(3))).toBeNull();
  });

  it('returns null for unknown format byte', () => {
    const bytes = new Uint8Array([0x00, 0x03, 0, 0, 0, 0]); // format=3
    expect(parseSndHeader(bytes)).toBeNull();
  });

  /**
   * Build a minimal format-1 stdSH (encode=0) snd resource:
   *   [format=1(2)] [numSynths=1(2)] [synthID(2)] [initOpt(4)]
   *   [numCmds=1(2)] [bufferCmd: cmd=0x8051(2) p1=0(2) p2=headerOff(4)]
   *   [SoundHeader: samplePtr(4) length(4) sampleRate(4) loopS(4) loopE(4) encode(1) baseF(1)]
   *   [PCM data: N bytes]
   */
  function buildStdSHSnd(
    sampleCount: number,
    sampleRateHz: number,
    pcm?: Uint8Array,
  ): Uint8Array {
    const cmdBase   = 4 + 1 * 6; // after format(2)+numSynths(2)+1 synth record(6)
    const headerOff = cmdBase + 2 + 1 * 8; // after numCmds(2) + 1 cmd(8)
    const dataStart = headerOff + 22;
    const data      = pcm ?? new Uint8Array(sampleCount);
    const out       = new Uint8Array(dataStart + data.length);
    const dv        = new DataView(out.buffer);
    dv.setUint16(0, 1, false);                         // format=1
    dv.setUint16(2, 1, false);                         // numSynths=1
    dv.setUint16(4, 5, false);                         // synthID=5 (sampledSynth)
    dv.setUint32(6, 0x80, false);                      // initOption
    dv.setUint16(cmdBase, 1, false);                   // numCmds=1
    dv.setUint16(cmdBase + 2, 0x8051, false);          // bufferCmd
    dv.setUint16(cmdBase + 4, 0, false);               // param1=0
    dv.setUint32(cmdBase + 6, headerOff, false);       // param2=headerOff
    dv.setUint32(headerOff + 0, 0, false);             // samplePtr=0
    dv.setUint32(headerOff + 4, sampleCount, false);   // length=sampleCount
    dv.setUint32(headerOff + 8, sampleRateHz * 65536, false); // sampleRate
    dv.setUint32(headerOff + 12, 0, false);            // loopStart
    dv.setUint32(headerOff + 16, 0, false);            // loopEnd
    dv.setUint8(headerOff + 20, 0);                    // encode=0 (stdSH)
    dv.setUint8(headerOff + 21, 60);                   // baseFreq=middle-C
    out.set(data, dataStart);
    return out;
  }

  it('parses a valid stdSH snd resource', () => {
    const bytes = buildStdSHSnd(1000, 22050);
    const info = parseSndHeader(bytes);
    expect(info).not.toBeNull();
    expect(info!.format).toBe(1);
    expect(info!.encode).toBe(0);
    expect(Math.round(info!.sampleRate)).toBe(22050);
    expect(info!.length).toBe(1000);
  });

  it('returns correct duration from stdSH header', () => {
    const sampleRate = 11025;
    const sampleCount = 11025; // 1 second
    const bytes = buildStdSHSnd(sampleCount, sampleRate);
    const info = parseSndHeader(bytes);
    expect(info).not.toBeNull();
    expect(info!.length / info!.sampleRate).toBeCloseTo(1.0, 2);
  });

  it('returns null for truncated snd resource', () => {
    const bytes = buildStdSHSnd(100, 22050).slice(0, 10);
    expect(parseSndHeader(bytes)).toBeNull();
  });

  it('returns non-null for format-2 snd resource', () => {
    // Format 2: [format=2(2)] [refCount(2)] [numCmds(2)] [cmd(8)] [header+data...]
    const cmdBase   = 4; // format(2)+refCount(2)
    const headerOff = cmdBase + 2 + 8;
    const dataStart = headerOff + 22;
    const out       = new Uint8Array(dataStart + 10);
    const dv        = new DataView(out.buffer);
    dv.setUint16(0, 2, false);                     // format=2
    dv.setUint16(2, 0, false);                     // refCount=0
    dv.setUint16(cmdBase, 1, false);               // numCmds=1
    dv.setUint16(cmdBase + 2, 0x8051, false);      // bufferCmd
    dv.setUint32(cmdBase + 6, headerOff, false);   // param2=headerOff
    dv.setUint32(headerOff + 4, 10, false);        // length=10
    dv.setUint32(headerOff + 8, 22050 * 65536, false); // sampleRate
    dv.setUint8(headerOff + 20, 0);                // encode=0
    const info = parseSndHeader(out);
    expect(info).not.toBeNull();
    expect(info!.format).toBe(2);
    expect(info!.length).toBe(10);
  });
});

describe('buildWav', () => {
  it('produces a valid RIFF/WAV header for 8-bit mono', () => {
    const pcm = new Uint8Array([128, 200, 50, 128]);
    const wav = buildWav(pcm, 22050, 1, 8);
    // Check RIFF magic
    expect(String.fromCharCode(wav[0], wav[1], wav[2], wav[3])).toBe('RIFF');
    expect(String.fromCharCode(wav[8], wav[9], wav[10], wav[11])).toBe('WAVE');
    expect(String.fromCharCode(wav[12], wav[13], wav[14], wav[15])).toBe('fmt ');
    expect(String.fromCharCode(wav[36], wav[37], wav[38], wav[39])).toBe('data');
  });

  it('includes PCM data at offset 44', () => {
    const pcm = new Uint8Array([10, 20, 30, 40]);
    const wav = buildWav(pcm, 22050, 1, 8);
    expect(Array.from(wav.slice(44))).toEqual([10, 20, 30, 40]);
  });

  it('reports correct file size', () => {
    const pcm = new Uint8Array(100);
    const wav = buildWav(pcm, 22050, 1, 8);
    expect(wav.length).toBe(44 + 100);
  });
});
