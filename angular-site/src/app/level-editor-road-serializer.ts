/**
 * Road info (tRoadInfo) binary serializer.
 *
 * Converts a RoadInfoData object back to its 64-byte big-endian binary form
 * for storage in kPackRoad (Pack ID 135).
 */
import type { RoadInfoData } from './level-editor.types';
import { ROAD_PACK_ID } from './level-editor-road';
import { parsePackHandle, encodePackHandle } from './pack-parser.service';
import type { ResourceDatEntry } from './resource-dat.service';

const ROAD_INFO_SIZE       = 64;
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

export function serializeRoadInfoData(roadInfo: RoadInfoData): Uint8Array {
  const out = new Uint8Array(ROAD_INFO_SIZE);
  const v = new DataView(out.buffer, out.byteOffset, out.byteLength);
  v.setFloat32(RI_OFFSET_FRICTION, roadInfo.friction, false);
  v.setFloat32(RI_OFFSET_AIR_RESIST, roadInfo.airResistance, false);
  v.setFloat32(RI_OFFSET_BACK_RES, roadInfo.backResistance, false);
  v.setUint16(RI_OFFSET_TOLERANCE, roadInfo.tolerance, false);
  v.setInt16(RI_OFFSET_MARKS, roadInfo.marks, false);
  v.setInt16(RI_OFFSET_DEATH_OFFS, roadInfo.deathOffs, false);
  v.setInt16(RI_OFFSET_BG_TEX, roadInfo.backgroundTex, false);
  v.setInt16(RI_OFFSET_FG_TEX, roadInfo.foregroundTex, false);
  v.setInt16(RI_OFFSET_LEFT_BORD, roadInfo.roadLeftBorder, false);
  v.setInt16(RI_OFFSET_RIGHT_BORD, roadInfo.roadRightBorder, false);
  v.setInt16(RI_OFFSET_TRACKS, roadInfo.tracks, false);
  v.setInt16(RI_OFFSET_SKID_SND, roadInfo.skidSound, false);
  v.setInt16(RI_OFFSET_FILLER, roadInfo.filler, false);
  v.setFloat32(RI_OFFSET_X_DRIFT, roadInfo.xDrift, false);
  v.setFloat32(RI_OFFSET_Y_DRIFT, roadInfo.yDrift, false);
  v.setFloat32(RI_OFFSET_X_FRONT, roadInfo.xFrontDrift, false);
  v.setFloat32(RI_OFFSET_Y_FRONT, roadInfo.yFrontDrift, false);
  v.setFloat32(RI_OFFSET_TRACK_SLIDE, roadInfo.trackSlide, false);
  v.setFloat32(RI_OFFSET_DUST_SLIDE, roadInfo.dustSlide, false);
  v.setUint8(RI_OFFSET_DUST_COLOR, roadInfo.dustColor);
  v.setUint8(RI_OFFSET_WATER, roadInfo.water ? 1 : 0);
  v.setUint16(RI_OFFSET_FILLER2, roadInfo.filler2, false);
  v.setFloat32(RI_OFFSET_SLIDE_FRICTION, roadInfo.slideFriction, false);
  return out;
}

export function applyRoadInfoData(
  resources: ResourceDatEntry[],
  roadInfoId: number,
  roadInfo: RoadInfoData,
): ResourceDatEntry[] {
  return resources.map((res) => {
    if (res.type !== 'Pack' || res.id !== ROAD_PACK_ID) return res;
    try {
      const packEntries = parsePackHandle(res.data, res.id);
      const newData = serializeRoadInfoData(roadInfo);
      const exists = packEntries.some((e) => e.id === roadInfoId);
      const newEntries = exists
        ? packEntries.map((e) => (e.id === roadInfoId ? { ...e, data: newData } : e))
        : [...packEntries, { id: roadInfoId, data: newData }];
      newEntries.sort((a, b) => a.id - b.id);
      return { ...res, data: encodePackHandle(newEntries, ROAD_PACK_ID) };
    } catch (e) {
      console.error(`[LevelEditor] applyRoadInfoData error id=${roadInfoId}:`, e);
      return res;
    }
  });
}

export function removeRoadInfoData(
  resources: ResourceDatEntry[],
  roadInfoId: number,
): ResourceDatEntry[] {
  return resources.map((res) => {
    if (res.type !== 'Pack' || res.id !== ROAD_PACK_ID) return res;
    try {
      const packEntries = parsePackHandle(res.data, res.id);
      if (!packEntries.some((e) => e.id === roadInfoId)) return res;
      const newEntries = packEntries.filter((e) => e.id !== roadInfoId).sort((a, b) => a.id - b.id);
      return { ...res, data: encodePackHandle(newEntries, ROAD_PACK_ID) };
    } catch (e) {
      console.error(`[LevelEditor] removeRoadInfoData error id=${roadInfoId}:`, e);
      return res;
    }
  });
}
