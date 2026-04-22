/**
 * Road info and road texture extraction helpers.
 *
 * Parses kPackRoad (Pack 135) and kPackTx16 (Pack 136) into typed data objects.
 * All functions are pure with no Angular dependencies.
 */
import type { ResourceDatEntry } from './resource-dat.service';
import type { RoadInfoData, DecodedRoadTexture } from './level-editor.types';
import { parsePackHandle, encodePackHandle } from './pack-parser.service';
import { rgbaToRgb555 } from './level-editor-colors';

export const ROAD_PACK_ID = 135;
export const TX16_PACK_ID = 136;

const RGB5_SCALE = 255 / 31;
const ROAD_INFO_SIZE   = 64;
const BORDER_TEX_W     = 16;
const BORDER_TEX_H     = 128;

// tRoadInfo struct offsets (big-endian, no padding)
const RI_OFFSET_FRICTION   = 0;
const RI_OFFSET_AIR_RESIST = 4;
const RI_OFFSET_BACK_RES   = 8;
const RI_OFFSET_TOLERANCE  = 12;
const RI_OFFSET_MARKS      = 14;
const RI_OFFSET_DEATH_OFFS = 16;
const RI_OFFSET_BG_TEX     = 18;
const RI_OFFSET_FG_TEX     = 20;
const RI_OFFSET_LEFT_BORD  = 22;
const RI_OFFSET_RIGHT_BORD = 24;
const RI_OFFSET_TRACKS     = 26;
const RI_OFFSET_SKID_SND   = 28;
const RI_OFFSET_FILLER     = 30;
const RI_OFFSET_X_DRIFT    = 32;
const RI_OFFSET_Y_DRIFT    = 36;
const RI_OFFSET_X_FRONT    = 40;
const RI_OFFSET_Y_FRONT    = 44;
const RI_OFFSET_TRACK_SLIDE = 48;
const RI_OFFSET_DUST_SLIDE = 52;
const RI_OFFSET_DUST_COLOR = 56;
const RI_OFFSET_WATER      = 57;
const RI_OFFSET_FILLER2    = 58;
const RI_OFFSET_SLIDE_FRICTION = 60;

function inferTextureDimensions(byteLength: number): [number, number] {
  const pixelCount = byteLength / 2;
  if (pixelCount === BORDER_TEX_W * BORDER_TEX_H) return [BORDER_TEX_W, BORDER_TEX_H];
  const w = Math.round(Math.sqrt(pixelCount));
  return [w, pixelCount / w];
}

// ── public API ─────────────────────────────────────────────────────────────

/** Parse kPackRoad (Pack 135) into a map from roadInfo ID → RoadInfoData. */
export function extractRoadInfos(
  resources: ResourceDatEntry[],
): Map<number, RoadInfoData> {
  const result = new Map<number, RoadInfoData>();
  const pack = resources.find((e) => e.type === 'Pack' && e.id === ROAD_PACK_ID);
  if (!pack) return result;
  try {
    for (const entry of parsePackHandle(pack.data, pack.id)) {
      if (entry.data.length < ROAD_INFO_SIZE) continue;
      const v = new DataView(entry.data.buffer, entry.data.byteOffset, entry.data.byteLength);
      result.set(entry.id, {
        id:              entry.id,
        friction:        v.getFloat32(RI_OFFSET_FRICTION, false),
        airResistance:   v.getFloat32(RI_OFFSET_AIR_RESIST, false),
        backResistance:  v.getFloat32(RI_OFFSET_BACK_RES, false),
        tolerance:       v.getUint16(RI_OFFSET_TOLERANCE, false),
        marks:           v.getInt16(RI_OFFSET_MARKS, false),
        deathOffs:       v.getInt16(RI_OFFSET_DEATH_OFFS, false),
        backgroundTex:   v.getInt16(RI_OFFSET_BG_TEX, false),
        foregroundTex:   v.getInt16(RI_OFFSET_FG_TEX, false),
        roadLeftBorder:  v.getInt16(RI_OFFSET_LEFT_BORD, false),
        roadRightBorder: v.getInt16(RI_OFFSET_RIGHT_BORD, false),
        tracks:          v.getInt16(RI_OFFSET_TRACKS, false),
        skidSound:       v.getInt16(RI_OFFSET_SKID_SND, false),
        filler:          v.getInt16(RI_OFFSET_FILLER, false),
        xDrift:          v.getFloat32(RI_OFFSET_X_DRIFT, false),
        yDrift:          v.getFloat32(RI_OFFSET_Y_DRIFT, false),
        xFrontDrift:     v.getFloat32(RI_OFFSET_X_FRONT, false),
        yFrontDrift:     v.getFloat32(RI_OFFSET_Y_FRONT, false),
        trackSlide:      v.getFloat32(RI_OFFSET_TRACK_SLIDE, false),
        dustSlide:       v.getFloat32(RI_OFFSET_DUST_SLIDE, false),
        dustColor:       v.getUint8(RI_OFFSET_DUST_COLOR),
        water:           entry.data[RI_OFFSET_WATER] !== 0,
        filler2:         v.getUint16(RI_OFFSET_FILLER2, false),
        slideFriction:   v.getFloat32(RI_OFFSET_SLIDE_FRICTION, false),
      });
    }
  } catch (err) {
    console.warn('[Road] extractRoadInfos error:', err);
  }
  return result;
}

/** Decode all textures from kPackTx16 (Pack 136). */
export function extractAllRoadTextures(resources: ResourceDatEntry[]): DecodedRoadTexture[] {
  const pack = resources.find((e) => e.type === 'Pack' && e.id === TX16_PACK_ID);
  if (!pack) return [];
  try {
    const allIds = parsePackHandle(pack.data, pack.id).map((e) => e.id);
    return extractRoadTextures(resources, allIds);
  } catch { return []; }
}

/** Decode a specific subset of textures from kPackTx16 (Pack 136). */
export function extractRoadTextures(
  resources: ResourceDatEntry[],
  neededTexIds: number[],
): DecodedRoadTexture[] {
  const result: DecodedRoadTexture[] = [];
  const pack = resources.find((e) => e.type === 'Pack' && e.id === TX16_PACK_ID);
  if (!pack) return result;
  try {
    const entryMap = new Map(parsePackHandle(pack.data, pack.id).map((e) => [e.id, e.data]));
    for (const texId of neededTexIds) {
      const data = entryMap.get(texId);
      if (!data || data.length < 2) continue;
      const [w, h] = inferTextureDimensions(data.length);
      const pixels = new Uint8ClampedArray(w * h * 4);
      const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
      for (let i = 0; i < w * h; i++) {
        const pv = view.getUint16(i * 2, false);
        pixels[i * 4]     = Math.round(((pv >> 10) & 0x1f) * RGB5_SCALE);
        pixels[i * 4 + 1] = Math.round(((pv >> 5)  & 0x1f) * RGB5_SCALE);
        pixels[i * 4 + 2] = Math.round((pv & 0x1f)          * RGB5_SCALE);
        pixels[i * 4 + 3] = 255;
      }
      const buf = new ArrayBuffer(pixels.byteLength);
      new Uint8Array(buf).set(pixels);
      result.push({ texId, width: w, height: h, pixels: buf });
    }
  } catch (err) {
    console.warn('[Road] extractRoadTextures error:', err);
  }
  return result;
}

/** Write edited RGBA8888 pixels back into a kPackTx16 tile entry. */
export function applyTile16Pixels(
  resources: ResourceDatEntry[],
  texId: number,
  pixels: Uint8ClampedArray,
): ResourceDatEntry[] {
  return resources.map((res) => {
    if (res.type !== 'Pack' || res.id !== TX16_PACK_ID) return res;
    try {
      const packEntries = parsePackHandle(res.data, res.id);
      const entry = packEntries.find((e) => e.id === texId);
      if (!entry || entry.data.length < 2) return res;
      const [w, h] = inferTextureDimensions(entry.data.length);
      const newData = entry.data.slice();
      const newView = new DataView(newData.buffer, newData.byteOffset, newData.byteLength);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const srcI  = (y * w + x) * 4;
          const dstOff = (y * w + x) * 2;
          if (dstOff + 2 > newData.length) continue;
          newView.setUint16(dstOff, rgbaToRgb555(pixels[srcI], pixels[srcI + 1], pixels[srcI + 2]), false);
        }
      }
      const newEntries = packEntries.map((e) => e.id === texId ? { ...e, data: newData } : e);
      return { ...res, data: encodePackHandle(newEntries, res.id) };
    } catch (err) {
      console.warn('[Road] applyTile16Pixels error:', err);
      return res;
    }
  });
}
