/**
 * Sprite frame decoding for kPackSprt (Pack 129, 8-bit) and kPackSp16 (Pack 137, 16-bit).
 *
 * All functions are pure with no Angular dependencies.
 */
import type { ResourceDatEntry } from './resource-dat.service';
import type { DecodedSpriteFrame, EditableSpriteAsset } from './level-editor.types';
import { parsePackHandle, encodePackHandle } from './pack-parser.service';
import { rgb555ToRgba, indexed8ToRgba, rgbaToRgb555, rgbaToMacPaletteIndex } from './level-editor-colors';

export const SPRITE_PACK_8_ID  = 129;
export const SPRITE_PACK_16_ID = 137;
const SPRITE_HEADER_SIZE = 8;

// ── private helpers ────────────────────────────────────────────────────────

function decode8BitSprite(data: Uint8Array, frameId: number): DecodedSpriteFrame | null {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const width  = view.getUint16(0, false);
  const height = view.getUint16(2, false);
  const stride = 1 << data[4];
  if (width <= 0 || height <= 0 || stride <= 0) return null;
  const pixels = new Uint8ClampedArray(width * height * 4);
  const mask = data[SPRITE_HEADER_SIZE];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const srcOff = SPRITE_HEADER_SIZE + y * stride + x;
      if (srcOff >= data.length) continue;
      const value = data[srcOff];
      const dstOff = (y * width + x) * 4;
      if (value === mask) { pixels[dstOff + 3] = 0; continue; }
      const [r, g, b, a] = indexed8ToRgba(value);
      pixels[dstOff] = r; pixels[dstOff + 1] = g;
      pixels[dstOff + 2] = b; pixels[dstOff + 3] = a;
    }
  }
  return { frameId, width, height, pixels, bitDepth: 8 };
}

function decode16BitSprite(data: Uint8Array, frameId: number): DecodedSpriteFrame | null {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const width  = view.getUint16(0, false);
  const height = view.getUint16(2, false);
  const stride = 1 << data[4];
  if (width <= 0 || height <= 0 || stride <= 0) return null;
  const pixels = new Uint8ClampedArray(width * height * 4);
  const mask = view.getUint16(SPRITE_HEADER_SIZE, false);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const srcOff = SPRITE_HEADER_SIZE + (y * stride + x) * 2;
      if (srcOff + 2 > data.length) continue;
      const value = view.getUint16(srcOff, false);
      const dstOff = (y * width + x) * 4;
      if (value === mask) { pixels[dstOff + 3] = 0; continue; }
      const [r, g, b, a] = rgb555ToRgba(value);
      pixels[dstOff] = r; pixels[dstOff + 1] = g;
      pixels[dstOff + 2] = b; pixels[dstOff + 3] = a;
    }
  }
  return { frameId, width, height, pixels, bitDepth: 16 };
}

function decodeSpriteFromPack(
  resources: ResourceDatEntry[],
  packId: number,
  frameId: number,
): DecodedSpriteFrame | null {
  const pack = resources.find((e) => e.type === 'Pack' && e.id === packId);
  if (!pack) return null;
  try {
    const entry = parsePackHandle(pack.data, pack.id).find((item) => item.id === frameId);
    if (!entry || entry.data.length < SPRITE_HEADER_SIZE) return null;
    return packId === SPRITE_PACK_16_ID
      ? decode16BitSprite(entry.data, frameId)
      : decode8BitSprite(entry.data, frameId);
  } catch (err) {
    console.warn(`[Sprites] failed to decode frame ${frameId} from Pack #${packId}:`, err);
    return null;
  }
}

// ── public API ─────────────────────────────────────────────────────────────

export function extractSpriteAssets(resources: ResourceDatEntry[]): EditableSpriteAsset[] {
  return resources
    .filter((e) => e.type === 'PPic')
    .map((e) => ({ id: e.id, type: e.type, size: e.data.length }))
    .sort((a, b) => a.id - b.id);
}

export function getAllSpriteFrameIds(
  resources: ResourceDatEntry[],
): { id: number; bitDepth: 8 | 16 }[] {
  const result: { id: number; bitDepth: 8 | 16 }[] = [];
  for (const [packId, bitDepth] of [[SPRITE_PACK_16_ID, 16], [SPRITE_PACK_8_ID, 8]] as const) {
    const pack = resources.find((e) => e.type === 'Pack' && e.id === packId);
    if (!pack) continue;
    try {
      for (const e of parsePackHandle(pack.data, pack.id)) {
        result.push({ id: e.id, bitDepth });
      }
    } catch (err) {
      console.warn(`[Sprites] getAllSpriteFrameIds: failed to parse Pack #${packId}:`, err);
    }
  }
  return result.sort((a, b) => a.id - b.id);
}

/**
 * Decode all sprite frames from Pack 137 (16-bit) in a single pass.
 * Pack 129 (8-bit) uses a custom game palette; only 16-bit frames are decoded.
 */
export function decodeAllSpriteFrames(
  resources: ResourceDatEntry[],
): { id: number; bitDepth: 8 | 16; width: number; height: number; pixels: ArrayBuffer }[] {
  const result: { id: number; bitDepth: 8 | 16; width: number; height: number; pixels: ArrayBuffer }[] = [];
  const pack = resources.find((e) => e.type === 'Pack' && e.id === SPRITE_PACK_16_ID);
  if (!pack) return result;
  try {
    for (const entry of parsePackHandle(pack.data, pack.id)) {
      if (entry.data.length < SPRITE_HEADER_SIZE) continue;
      const decoded = decode16BitSprite(entry.data, entry.id);
      if (!decoded) continue;
      const buf = new ArrayBuffer(decoded.pixels.byteLength);
      new Uint8Array(buf).set(decoded.pixels);
      result.push({ id: entry.id, bitDepth: 16, width: decoded.width, height: decoded.height, pixels: buf });
    }
  } catch (err) {
    console.warn(`[Sprites] decodeAllSpriteFrames error:`, err);
  }
  return result;
}

export function decodeSpriteFrame(
  resources: ResourceDatEntry[],
  frameId: number,
): DecodedSpriteFrame | null {
  return decodeSpriteFromPack(resources, SPRITE_PACK_16_ID, frameId)
    ?? decodeSpriteFromPack(resources, SPRITE_PACK_8_ID, frameId);
}

/**
 * Decode multiple sprite frames in one pass, parsing each pack only once.
 */
export function batchDecodeSpriteFrames(
  resources: ResourceDatEntry[],
  frameIds: number[],
): Map<number, DecodedSpriteFrame> {
  const result = new Map<number, DecodedSpriteFrame>();
  if (frameIds.length === 0) return result;

  const getPackEntryMap = (packId: number): Map<number, Uint8Array> => {
    const pack = resources.find((e) => e.type === 'Pack' && e.id === packId);
    if (!pack) return new Map();
    try {
      return new Map(parsePackHandle(pack.data, pack.id).map((e) => [e.id, e.data]));
    } catch { return new Map(); }
  };

  const pack16 = getPackEntryMap(SPRITE_PACK_16_ID);
  const pack8  = getPackEntryMap(SPRITE_PACK_8_ID);

  for (const frameId of frameIds) {
    if (result.has(frameId)) continue;
    const data16 = pack16.get(frameId);
    if (data16 && data16.length >= SPRITE_HEADER_SIZE) {
      const decoded = decode16BitSprite(data16, frameId);
      if (decoded) { result.set(frameId, decoded); continue; }
    }
    const data8 = pack8.get(frameId);
    if (data8 && data8.length >= SPRITE_HEADER_SIZE) {
      const decoded = decode8BitSprite(data8, frameId);
      if (decoded) result.set(frameId, decoded);
    }
  }
  return result;
}

export function applySpriteByte(
  resources: ResourceDatEntry[],
  spriteId: number,
  offset: number,
  value: number,
): ResourceDatEntry[] {
  return resources.map((e) => {
    if (e.type !== 'PPic' || e.id !== spriteId) return e;
    if (offset < 0 || offset >= e.data.length) return e;
    const next = e.data.slice();
    next[offset] = Math.max(0, Math.min(255, value));
    return { ...e, data: next };
  });
}

export function getSpriteBytes(
  resources: ResourceDatEntry[],
  spriteId: number,
): Uint8Array | null {
  return resources.find((e) => e.type === 'PPic' && e.id === spriteId)?.data ?? null;
}

/** Write edited RGBA8888 pixels back into a sprite pack entry. */
export function applySpritePackPixels(
  resources: ResourceDatEntry[],
  frameId: number,
  bitDepth: 8 | 16,
  pixels: Uint8ClampedArray,
): ResourceDatEntry[] {
  const packId = bitDepth === 16 ? SPRITE_PACK_16_ID : SPRITE_PACK_8_ID;
  return resources.map((res) => {
    if (res.type !== 'Pack' || res.id !== packId) return res;
    try {
      const packEntries = parsePackHandle(res.data, packId);
      const entry = packEntries.find((e) => e.id === frameId);
      if (!entry || entry.data.length < SPRITE_HEADER_SIZE) return res;
      const view = new DataView(entry.data.buffer, entry.data.byteOffset, entry.data.byteLength);
      const width  = view.getUint16(0, false);
      const height = view.getUint16(2, false);
      const stride = 1 << entry.data[4];
      if (width <= 0 || height <= 0 || stride <= 0) return res;
      const newData = entry.data.slice();
      const newView = new DataView(newData.buffer, newData.byteOffset, newData.byteLength);
      const maskValue = bitDepth === 16
        ? view.getUint16(SPRITE_HEADER_SIZE, false)
        : newData[SPRITE_HEADER_SIZE];
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const srcI = (y * width + x) * 4;
          if (pixels[srcI + 3] === 0) {
            if (bitDepth === 16) {
              const off = SPRITE_HEADER_SIZE + (y * stride + x) * 2;
              if (off + 2 <= newData.length) newView.setUint16(off, maskValue, false);
            } else {
              const off = SPRITE_HEADER_SIZE + y * stride + x;
              if (off < newData.length) newData[off] = maskValue;
            }
          } else if (bitDepth === 16) {
            const rgb = rgbaToRgb555(pixels[srcI], pixels[srcI + 1], pixels[srcI + 2]);
            const safe = rgb === maskValue ? (rgb ^ 1) : rgb;
            const off = SPRITE_HEADER_SIZE + (y * stride + x) * 2;
            if (off + 2 <= newData.length) newView.setUint16(off, safe, false);
          } else {
            const idx = rgbaToMacPaletteIndex(pixels[srcI], pixels[srcI + 1], pixels[srcI + 2]);
            const safe = idx === maskValue ? ((idx + 1) & 0xff) : idx;
            const off = SPRITE_HEADER_SIZE + y * stride + x;
            if (off < newData.length) newData[off] = safe;
          }
        }
      }
      const newEntries = packEntries.map((e) => e.id === frameId ? { ...e, data: newData } : e);
      return { ...res, data: encodePackHandle(newEntries, packId) };
    } catch (err) {
      console.warn('[Sprites] applySpritePackPixels error:', err);
      return res;
    }
  });
}
