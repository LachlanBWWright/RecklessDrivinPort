import { err, ok, type Result } from 'neverthrow';
import type { ResourceDatEntry } from './resource-dat.service';
import { encodePackHandle, parsePackHandle } from './pack-parser.service';
import type {
  ObjectGroupDefinition,
  ObjectGroupEntryData,
  ObjectGroupRef,
  ObjectPos,
  RoadInfoData,
  RoadSeg,
  TrackSeg,
  MarkSeg,
  ObjectTypeDefinition,
  LevelProperties,
} from './level-editor.types';

export const LEVEL_RESOURCE_IDS = Array.from({ length: 10 }, (_, i) => 140 + i);
export const ENCRYPTED_LEVEL_IDS = new Set([143, 144, 145, 146, 147, 148, 149]);
export const LEVEL_DATA_SIZE = 48; // sizeof(tLevelData)
export const TRACK_SEG_SIZE = 12; // sizeof(tTrackInfoSeg)
export const OBJECT_POS_SIZE = 16; // sizeof(tObjectPos)
export const ROAD_SEG_SIZE = 8; // 4 × SInt16
export const MARK_SEG_SIZE = 16; // 2 × t2DPoint (SInt32 x + SInt32 y)
export const T2D_POINT_SIZE = 8; // SInt32 x + SInt32 y
export const OBJECT_TYPE_SIZE = 64; // sizeof(tObjectType)
export const OBJECT_TYPES_PACK_ID = 128;
export const SPRITE_PACK_8_ID = 129;
export const SPRITE_PACK_16_ID = 137;
export const SPRITE_HEADER_SIZE = 8;

/** Pack ID for kPackRoad (tRoadInfo array, resource ID 135). */
export const ROAD_PACK_ID = 135;
/** Pack ID for kPackTx16 (16-bit RGB555 textures, resource ID 136). */
export const TX16_PACK_ID = 136;
/** Pack ID for kPackOgrp (object group definitions, resource ID 130). */
export const OBJECT_GROUP_PACK_ID = 130;

export const OT_OFFSET_MASS = 0;
export const OT_OFFSET_MAX_ENGINE_FORCE = 4;
export const OT_OFFSET_MAX_NEG_ENGINE_FORCE = 8;
export const OT_OFFSET_FRICTION = 12;
export const OT_OFFSET_FLAGS = 16;
export const OT_OFFSET_DEATH_OBJ = 18;
export const OT_OFFSET_FRAME = 20;
export const OT_OFFSET_NUM_FRAMES = 22;
export const OT_OFFSET_FRAME_DURATION = 24;
export const OT_OFFSET_WHEEL_WIDTH = 28;
export const OT_OFFSET_WHEEL_LENGTH = 32;
export const OT_OFFSET_STEERING = 36;
export const OT_OFFSET_WIDTH = 40;
export const OT_OFFSET_LENGTH = 44;
export const OT_OFFSET_SCORE = 48;
export const OT_OFFSET_FLAGS2 = 50;
export const OT_OFFSET_CREATION_SOUND = 52;
export const OT_OFFSET_OTHER_SOUND = 54;
export const OT_OFFSET_MAX_DAMAGE = 56;
export const OT_OFFSET_WEAPON_OBJ = 60;
export const OT_OFFSET_WEAPON_INFO = 62;

/**
 * tRoadInfo struct – layout (all big-endian, no padding on PPC):
 *   float friction       @0
 *   float airResistance  @4
 *   float backResistance @8
 *   UInt16 tolerance     @12
 *   SInt16 marks         @14
 *   SInt16 deathOffs     @16
 *   SInt16 backgroundTex @18   ← bg texture ID in kPackTx16
 *   SInt16 foregroundTex @20   ← road-surface texture ID in kPackTx16
 *   SInt16 roadLeftBorder  @22 ← left border (kerb) texture ID
 *   SInt16 roadRightBorder @24 ← right border (kerb) texture ID
 *   SInt16 tracks        @26
 *   SInt16 skidSound     @28
 *   SInt16 filler        @30
 *   float xDrift         @32
 *   float yDrift         @36
 *   float xFrontDrift    @40
 *   float yFrontDrift    @44
 *   float trackSlide     @48
 *   float dustSlide      @52
 *   UInt8  dustColor     @56
 *   UInt8  water         @57
 *   UInt16 filler2       @58
 *   float slideFriction  @60
 */
export const ROAD_INFO_SIZE = 64;
export const RI_OFFSET_FRICTION = 0;
export const RI_OFFSET_AIR_RESIST = 4;
export const RI_OFFSET_BACK_RES = 8;
export const RI_OFFSET_TOLERANCE = 12;
export const RI_OFFSET_MARKS = 14;
export const RI_OFFSET_DEATH_OFFS = 16;
export const RI_OFFSET_BG_TEX = 18;
export const RI_OFFSET_FG_TEX = 20;
export const RI_OFFSET_LEFT_BORD = 22;
export const RI_OFFSET_RIGHT_BORD = 24;
export const RI_OFFSET_TRACKS = 26;
export const RI_OFFSET_SKID_SND = 28;
export const RI_OFFSET_FILLER = 30;
export const RI_OFFSET_X_DRIFT = 32;
export const RI_OFFSET_Y_DRIFT = 36;
export const RI_OFFSET_X_FRONT = 40;
export const RI_OFFSET_Y_FRONT = 44;
export const RI_OFFSET_TRACK_SLIDE = 48;
export const RI_OFFSET_DUST_SLIDE = 52;
export const RI_OFFSET_DUST_COLOR = 56;
export const RI_OFFSET_WATER = 57;
export const RI_OFFSET_FILLER2 = 58;
export const RI_OFFSET_SLIDE_FRICTION = 60;

/** Texture dimensions (pixels) for tiles in kPackTx16. */
// const BIG_TEX_SIZE = 128;   // background + road surface textures: 128×128 px
export const BORDER_TEX_W = 16; // kerb border textures: 16 px wide
export const BORDER_TEX_H = 128; // kerb border textures: 128 px tall

// ------------------------------------------------------------------
// Road texture data types (exported so worker can transfer them)
// ------------------------------------------------------------------

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

export function readBigFloat32(view: DataView, offset: number): number {
  return view.getFloat32(offset, false);
}

export function writeBigFloat32(view: DataView, offset: number, value: number): void {
  view.setFloat32(offset, value, false);
}

/** Scale factor for converting a 5-bit channel (0–31) to 8-bit (0–255). */
export const RGB5_SCALE = 255 / 31;
export const RGB6_SCALE = 255 / 63;

/** Convert a packed big-endian RGB555 pixel into 8-bit RGBA for canvas previews.
 *  Mac OS 9 / PPC native 16-bit format: xRRRRRGGGGGBBBBB (bit 15 unused).
 */
export function rgb555ToRgba(value: number): [number, number, number, number] {
  const r = ((value >> 10) & 0x1f) * RGB5_SCALE;
  const g = ((value >> 5) & 0x1f) * RGB5_SCALE;
  const b = (value & 0x1f) * RGB5_SCALE;
  return [Math.round(r), Math.round(g), Math.round(b), 255];
}

/** Convert a packed big-endian RGB565 pixel into 8-bit RGBA for canvas previews.
 *  Used for RGB565 texture format support. */
export function rgb565ToRgba(value: number): [number, number, number, number] {
  const r = ((value >> 11) & 0x1f) * RGB5_SCALE;
  const g = ((value >> 5) & 0x3f) * RGB6_SCALE;
  const b = (value & 0x1f) * RGB5_SCALE;
  return [Math.round(r), Math.round(g), Math.round(b), 255];
}

/** Convert RGBA8888 to packed RGB555 big-endian word (Mac OS 9 / PPC format). */
export function rgbaToRgb555(r: number, g: number, b: number): number {
  const r5 = Math.round((r * 31) / 255) & 0x1f;
  const g5 = Math.round((g * 31) / 255) & 0x1f;
  const b5 = Math.round((b * 31) / 255) & 0x1f;
  return (r5 << 10) | (g5 << 5) | b5;
}

/** Approximate the legacy 8-bit indexed sprite format as 3:3:2 RGB for previews. */
/** Mac OS System 8-bit colour table (256 entries).
 *  Indices 0-215 form the 6×6×6 RGB cube (values: 0, 51, 102, 153, 204, 255).
 *  Indices 216-255 are additional Mac-specific grays / reserved entries.
 */

export function indexed8ToRgba(value: number): [number, number, number, number] {
  const entry = MAC_SYSTEM_PALETTE[value & 0xff];
  if (!entry) return [0, 0, 0, 255];
  return [entry[0], entry[1], entry[2], 255];
}

/** Convert RGBA8888 to the nearest Mac 8-bit palette index. */
export function rgbaToMacPaletteIndex(r: number, g: number, b: number): number {
  if (!rgbaToMacPaletteIndexCache) {
    const cache = new Map<number, number>();
    for (let rq = 0; rq < 32; rq++) {
      for (let gq = 0; gq < 32; gq++) {
        for (let bq = 0; bq < 32; bq++) {
          const key = (rq << 10) | (gq << 5) | bq;
          const rr = rq * 8;
          const gg = gq * 8;
          const bb = bq * 8;
          cache.set(key, nearestMacPaletteIndex(rr, gg, bb));
        }
      }
    }
    rgbaToMacPaletteIndexCache = cache;
  }

  const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
  return rgbaToMacPaletteIndexCache.get(key) ?? 0;
}

function nearestMacPaletteIndex(r: number, g: number, b: number): number {
  let bestIndex = 0;
  let bestDistance = Infinity;
  for (let index = 0; index < MAC_SYSTEM_PALETTE.length; index++) {
    const [pr, pg, pb] = MAC_SYSTEM_PALETTE[index] ?? [0, 0, 0];
    const distance = (r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2;
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  }
  return bestIndex;
}

export let rgbaToMacPaletteIndexCache: Map<number, number> | null = null;

// ------------------------------------------------------------------
// Level entry parser
// ------------------------------------------------------------------

export type LevelEntryData = {
  properties: LevelProperties;
  objectGroups: ObjectGroupRef[];
  trackUp: TrackSeg[];
  trackDown: TrackSeg[];
  objects: ObjectPos[];
  roadSegs: RoadSeg[];
  roadSegCount: number;
  rawEntry1: Uint8Array;
};

export function parseLevelEntry(data: Uint8Array): Result<LevelEntryData, Error> {
  if (data.length < LEVEL_DATA_SIZE) {
    return err(new Error(`Level entry too small: ${data.length} < ${LEVEL_DATA_SIZE}`));
  }

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let pos = 0;

  const roadInfo = view.getInt16(pos, false);
  pos += 2;
  const time = view.getUint16(pos, false);
  pos += 2;

  const objectGroups: ObjectGroupRef[] = [];
  for (let i = 0; i < 10; i++) {
    objectGroups.push({
      resID: view.getInt16(pos, false),
      numObjs: view.getInt16(pos + 2, false),
    });
    pos += 4;
  }

  const xStartPos = view.getInt16(pos, false);
  pos += 2;
  const levelEnd = view.getUint16(pos, false);
  pos += 2;
  // pos == 48

  // tTrackInfo up
  const trackUpCount = view.getUint32(pos, false);
  pos += 4;
  const trackUp: TrackSeg[] = [];
  for (let i = 0; i < trackUpCount && pos + TRACK_SEG_SIZE <= data.length; i++) {
    trackUp.push({
      flags: view.getUint16(pos, false),
      x: view.getInt16(pos + 2, false),
      y: view.getInt32(pos + 4, false),
      velo: readBigFloat32(view, pos + 8),
    });
    pos += TRACK_SEG_SIZE;
  }

  // tTrackInfo down
  const trackDownCount = view.getUint32(pos, false);
  pos += 4;
  const trackDown: TrackSeg[] = [];
  for (let i = 0; i < trackDownCount && pos + TRACK_SEG_SIZE <= data.length; i++) {
    trackDown.push({
      flags: view.getUint16(pos, false),
      x: view.getInt16(pos + 2, false),
      y: view.getInt32(pos + 4, false),
      velo: readBigFloat32(view, pos + 8),
    });
    pos += TRACK_SEG_SIZE;
  }

  // Objects
  const objCount = pos + 4 <= data.length ? view.getUint32(pos, false) : 0;
  pos += 4;
  const objects: ObjectPos[] = [];
  for (let i = 0; i < objCount && pos + OBJECT_POS_SIZE <= data.length; i++) {
    objects.push({
      x: view.getInt32(pos, false),
      y: view.getInt32(pos + 4, false),
      dir: readBigFloat32(view, pos + 8),
      typeRes: view.getInt16(pos + 12, false),
    });
    pos += OBJECT_POS_SIZE;
  }

  // Road data
  const roadLen = pos + 4 <= data.length ? view.getUint32(pos, false) : 0;
  pos += 4;
  const roadSegs: RoadSeg[] = [];
  for (let i = 0; i < roadLen && pos + ROAD_SEG_SIZE <= data.length; i++) {
    roadSegs.push({
      v0: view.getInt16(pos, false),
      v1: view.getInt16(pos + 2, false),
      v2: view.getInt16(pos + 4, false),
      v3: view.getInt16(pos + 6, false),
    });
    pos += ROAD_SEG_SIZE;
  }

  return ok({
    properties: { roadInfo, time, xStartPos, levelEnd, objectGroups },
    objectGroups,
    trackUp,
    trackDown,
    objects,
    roadSegs,
    roadSegCount: roadLen,
    rawEntry1: data,
  });
}

export function parseMarkSegs(data: Uint8Array): MarkSeg[] {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const count = Math.floor(data.length / MARK_SEG_SIZE);
  const marks: MarkSeg[] = [];
  for (let i = 0; i < count; i++) {
    const o = i * MARK_SEG_SIZE;
    marks.push({
      x1: view.getFloat32(o, false),
      y1: view.getFloat32(o + 4, false),
      x2: view.getFloat32(o + T2D_POINT_SIZE, false),
      y2: view.getFloat32(o + T2D_POINT_SIZE + 4, false),
    });
  }
  return marks;
}

// ------------------------------------------------------------------
// Serializers
// ------------------------------------------------------------------

export function serializeLevelProperties(
  rawEntry1: Uint8Array,
  props: LevelProperties,
): Uint8Array {
  const out = rawEntry1.slice();
  const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
  view.setInt16(0, props.roadInfo, false);
  view.setUint16(2, props.time, false);
  // Object groups: 10 × 4 bytes starting at offset 4
  for (let i = 0; i < 10; i++) {
    const grp = props.objectGroups[i];
    if (grp) {
      view.setInt16(4 + i * 4, grp.resID, false);
      view.setInt16(4 + i * 4 + 2, grp.numObjs, false);
    }
  }
  view.setInt16(44, props.xStartPos, false);
  view.setUint16(46, props.levelEnd, false);
  return out;
}

export function serializeRoadInfoData(roadInfo: RoadInfoData): Uint8Array {
  const out = new Uint8Array(ROAD_INFO_SIZE);
  const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
  view.setFloat32(RI_OFFSET_FRICTION, roadInfo.friction, false);
  view.setFloat32(RI_OFFSET_AIR_RESIST, roadInfo.airResistance, false);
  view.setFloat32(RI_OFFSET_BACK_RES, roadInfo.backResistance, false);
  view.setUint16(RI_OFFSET_TOLERANCE, roadInfo.tolerance, false);
  view.setInt16(RI_OFFSET_MARKS, roadInfo.marks, false);
  view.setInt16(RI_OFFSET_DEATH_OFFS, roadInfo.deathOffs, false);
  view.setInt16(RI_OFFSET_BG_TEX, roadInfo.backgroundTex, false);
  view.setInt16(RI_OFFSET_FG_TEX, roadInfo.foregroundTex, false);
  view.setInt16(RI_OFFSET_LEFT_BORD, roadInfo.roadLeftBorder, false);
  view.setInt16(RI_OFFSET_RIGHT_BORD, roadInfo.roadRightBorder, false);
  view.setInt16(RI_OFFSET_TRACKS, roadInfo.tracks, false);
  view.setInt16(RI_OFFSET_SKID_SND, roadInfo.skidSound, false);
  view.setInt16(RI_OFFSET_FILLER, roadInfo.filler, false);
  view.setFloat32(RI_OFFSET_X_DRIFT, roadInfo.xDrift, false);
  view.setFloat32(RI_OFFSET_Y_DRIFT, roadInfo.yDrift, false);
  view.setFloat32(RI_OFFSET_X_FRONT, roadInfo.xFrontDrift, false);
  view.setFloat32(RI_OFFSET_Y_FRONT, roadInfo.yFrontDrift, false);
  view.setFloat32(RI_OFFSET_TRACK_SLIDE, roadInfo.trackSlide, false);
  view.setFloat32(RI_OFFSET_DUST_SLIDE, roadInfo.dustSlide, false);
  view.setUint8(RI_OFFSET_DUST_COLOR, roadInfo.dustColor);
  view.setUint8(RI_OFFSET_WATER, roadInfo.water ? 1 : 0);
  view.setUint16(RI_OFFSET_FILLER2, roadInfo.filler2, false);
  view.setFloat32(RI_OFFSET_SLIDE_FRICTION, roadInfo.slideFriction, false);
  return out;
}

export function parseObjectTypeDefinition(data: Uint8Array): ObjectTypeDefinition | null {
  if (data.length < OBJECT_TYPE_SIZE) return null;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  return {
    typeRes: 0,
    mass: view.getFloat32(OT_OFFSET_MASS, false),
    maxEngineForce: view.getFloat32(OT_OFFSET_MAX_ENGINE_FORCE, false),
    maxNegEngineForce: view.getFloat32(OT_OFFSET_MAX_NEG_ENGINE_FORCE, false),
    friction: view.getFloat32(OT_OFFSET_FRICTION, false),
    flags: view.getUint16(OT_OFFSET_FLAGS, false),
    deathObj: view.getInt16(OT_OFFSET_DEATH_OBJ, false),
    frame: view.getInt16(OT_OFFSET_FRAME, false),
    numFrames: view.getUint16(OT_OFFSET_NUM_FRAMES, false),
    frameDuration: view.getFloat32(OT_OFFSET_FRAME_DURATION, false),
    wheelWidth: view.getFloat32(OT_OFFSET_WHEEL_WIDTH, false),
    wheelLength: view.getFloat32(OT_OFFSET_WHEEL_LENGTH, false),
    steering: view.getFloat32(OT_OFFSET_STEERING, false),
    width: view.getFloat32(OT_OFFSET_WIDTH, false),
    length: view.getFloat32(OT_OFFSET_LENGTH, false),
    score: view.getUint16(OT_OFFSET_SCORE, false),
    flags2: view.getUint16(OT_OFFSET_FLAGS2, false),
    creationSound: view.getInt16(OT_OFFSET_CREATION_SOUND, false),
    otherSound: view.getInt16(OT_OFFSET_OTHER_SOUND, false),
    maxDamage: view.getFloat32(OT_OFFSET_MAX_DAMAGE, false),
    weaponObj: view.getInt16(OT_OFFSET_WEAPON_OBJ, false),
    weaponInfo: view.getInt16(OT_OFFSET_WEAPON_INFO, false),
  };
}

export function serializeObjectTypeDefinition(
  def: ObjectTypeDefinition,
  baseData?: Uint8Array,
): Uint8Array {
  const out =
    baseData && baseData.length >= OBJECT_TYPE_SIZE
      ? baseData.slice(0, OBJECT_TYPE_SIZE)
      : new Uint8Array(OBJECT_TYPE_SIZE);
  const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
  view.setFloat32(OT_OFFSET_MASS, def.mass, false);
  view.setFloat32(OT_OFFSET_MAX_ENGINE_FORCE, def.maxEngineForce, false);
  view.setFloat32(OT_OFFSET_MAX_NEG_ENGINE_FORCE, def.maxNegEngineForce, false);
  view.setFloat32(OT_OFFSET_FRICTION, def.friction, false);
  view.setUint16(OT_OFFSET_FLAGS, def.flags, false);
  view.setInt16(OT_OFFSET_DEATH_OBJ, def.deathObj, false);
  view.setInt16(OT_OFFSET_FRAME, def.frame, false);
  view.setUint16(OT_OFFSET_NUM_FRAMES, def.numFrames, false);
  view.setFloat32(OT_OFFSET_FRAME_DURATION, def.frameDuration, false);
  view.setFloat32(OT_OFFSET_WHEEL_WIDTH, def.wheelWidth, false);
  view.setFloat32(OT_OFFSET_WHEEL_LENGTH, def.wheelLength, false);
  view.setFloat32(OT_OFFSET_STEERING, def.steering, false);
  view.setFloat32(OT_OFFSET_WIDTH, def.width, false);
  view.setFloat32(OT_OFFSET_LENGTH, def.length, false);
  view.setUint16(OT_OFFSET_SCORE, def.score, false);
  view.setUint16(OT_OFFSET_FLAGS2, def.flags2, false);
  view.setInt16(OT_OFFSET_CREATION_SOUND, def.creationSound, false);
  view.setInt16(OT_OFFSET_OTHER_SOUND, def.otherSound, false);
  view.setFloat32(OT_OFFSET_MAX_DAMAGE, def.maxDamage, false);
  view.setInt16(OT_OFFSET_WEAPON_OBJ, def.weaponObj, false);
  view.setInt16(OT_OFFSET_WEAPON_INFO, def.weaponInfo, false);
  return out;
}

export function parseObjectGroupDefinition(data: Uint8Array): ObjectGroupDefinition | null {
  if (data.length < 4) return null;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const numEntries = view.getUint32(0, false);
  if (numEntries > 1000) return null;

  const entries: ObjectGroupEntryData[] = [];
  let pos = 4;
  for (let i = 0; i < numEntries && pos + 12 <= data.length; i++) {
    entries.push({
      typeRes: view.getInt16(pos, false),
      minOffs: view.getInt16(pos + 2, false),
      maxOffs: view.getInt16(pos + 4, false),
      probility: view.getInt16(pos + 6, false),
      dir: view.getFloat32(pos + 8, false),
    });
    pos += 12;
  }

  return { id: 0, entries };
}

export function serializeObjectGroupDefinition(group: ObjectGroupDefinition): Uint8Array {
  const buf = new Uint8Array(4 + group.entries.length * 12);
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  view.setUint32(0, group.entries.length, false);
  for (let i = 0; i < group.entries.length; i++) {
    const pos = 4 + i * 12;
    const entry = group.entries[i];
    view.setInt16(pos, entry.typeRes, false);
    view.setInt16(pos + 2, entry.minOffs, false);
    view.setInt16(pos + 4, entry.maxOffs, false);
    view.setInt16(pos + 6, entry.probility, false);
    view.setFloat32(pos + 8, entry.dir, false);
  }
  return buf;
}

export function serializeLevelTrack(
  rawEntry1: Uint8Array,
  trackUp: { x: number; y: number; flags: number; velo: number }[],
  trackDown: { x: number; y: number; flags: number; velo: number }[],
): Uint8Array {
  const view = new DataView(rawEntry1.buffer, rawEntry1.byteOffset, rawEntry1.byteLength);
  let pos = LEVEL_DATA_SIZE;

  const oldUpCount = view.getUint32(pos, false);
  const upStart = pos + 4;
  pos = upStart + oldUpCount * TRACK_SEG_SIZE;
  const oldDownCount = view.getUint32(pos, false);
  const downStart = pos + 4;
  pos = downStart + oldDownCount * TRACK_SEG_SIZE;

  // Keep the bytes before track data unchanged (tLevelData)
  const before = rawEntry1.slice(0, LEVEL_DATA_SIZE);
  // Keep everything after both track arrays unchanged (objects + road)
  const after = rawEntry1.slice(pos);

  const writeTrack = (
    segs: { x: number; y: number; flags: number; velo: number }[],
  ): Uint8Array => {
    const buf = new Uint8Array(4 + segs.length * TRACK_SEG_SIZE);
    const bv = new DataView(buf.buffer);
    bv.setUint32(0, segs.length, false);
    for (let i = 0; i < segs.length; i++) {
      const o = 4 + i * TRACK_SEG_SIZE;
      bv.setUint16(o, segs[i].flags, false);
      bv.setInt16(o + 2, segs[i].x, false);
      bv.setInt32(o + 4, segs[i].y, false);
      writeBigFloat32(bv, o + 8, segs[i].velo);
    }
    return buf;
  };

  const upBuf = writeTrack(trackUp);
  const downBuf = writeTrack(trackDown);

  const result = new Uint8Array(before.length + upBuf.length + downBuf.length + after.length);
  result.set(before, 0);
  result.set(upBuf, before.length);
  result.set(downBuf, before.length + upBuf.length);
  result.set(after, before.length + upBuf.length + downBuf.length);
  return result;
}

export function extractObjectGroupDefinitions(
  resources: ResourceDatEntry[],
): ObjectGroupDefinition[] {
  const pack = resources.find((e) => e.type === 'Pack' && e.id === OBJECT_GROUP_PACK_ID);
  if (!pack) return [];
  try {
    const entries = parsePackHandle(pack.data, pack.id);
    return entries
      .map((entry) => {
        const parsed = parseObjectGroupDefinition(entry.data);
        return parsed ? { id: entry.id, entries: parsed.entries } : null;
      })
      .filter((entry): entry is ObjectGroupDefinition => entry !== null)
      .sort((a, b) => a.id - b.id);
  } catch (err) {
    console.warn('[LevelEditor] failed to parse object groups:', err);
    return [];
  }
}

export function applyObjectGroupDefinitions(
  resources: ResourceDatEntry[],
  groups: ObjectGroupDefinition[],
): ResourceDatEntry[] {
  return resources.map((res) => {
    if (res.type !== 'Pack' || res.id !== OBJECT_GROUP_PACK_ID) return res;
    try {
      const newEntries = [...groups]
        .sort((a, b) => a.id - b.id)
        .map((group) => ({ id: group.id, data: serializeObjectGroupDefinition(group) }));
      return { ...res, data: encodePackHandle(newEntries, OBJECT_GROUP_PACK_ID) };
    } catch (err) {
      console.warn('[LevelEditor] applyObjectGroupDefinitions error:', err);
      return res;
    }
  });
}

export function serializeLevelObjects(rawEntry1: Uint8Array, objects: ObjectPos[]): Uint8Array {
  const view = new DataView(rawEntry1.buffer, rawEntry1.byteOffset, rawEntry1.byteLength);
  let pos = LEVEL_DATA_SIZE;
  const trackUpCount = view.getUint32(pos, false);
  pos += 4 + trackUpCount * TRACK_SEG_SIZE;
  const trackDownCount = view.getUint32(pos, false);
  pos += 4 + trackDownCount * TRACK_SEG_SIZE;

  const objBlockStart = pos;
  const oldObjCount = pos + 4 <= rawEntry1.length ? view.getUint32(pos, false) : 0;
  const afterStart = objBlockStart + 4 + oldObjCount * OBJECT_POS_SIZE;

  const before = rawEntry1.slice(0, objBlockStart);
  const after = rawEntry1.slice(afterStart);

  const newObjBlock = new Uint8Array(4 + objects.length * OBJECT_POS_SIZE);
  const bv = new DataView(newObjBlock.buffer);
  bv.setUint32(0, objects.length, false);
  for (let i = 0; i < objects.length; i++) {
    const o = 4 + i * OBJECT_POS_SIZE;
    bv.setInt32(o, objects[i].x, false);
    bv.setInt32(o + 4, objects[i].y, false);
    writeBigFloat32(bv, o + 8, objects[i].dir);
    bv.setInt16(o + 12, objects[i].typeRes, false);
    bv.setInt16(o + 14, 0, false);
  }

  const result = new Uint8Array(before.length + newObjBlock.length + after.length);
  result.set(before, 0);
  result.set(newObjBlock, before.length);
  result.set(after, before.length + newObjBlock.length);
  return result;
}

export function serializeLevelRoadSegs(
  rawEntry1: Uint8Array,
  roadSegs: { v0: number; v1: number; v2: number; v3: number }[],
): Uint8Array {
  const view = new DataView(rawEntry1.buffer, rawEntry1.byteOffset, rawEntry1.byteLength);
  let pos = LEVEL_DATA_SIZE;
  const trackUpCount = view.getUint32(pos, false);
  pos += 4 + trackUpCount * TRACK_SEG_SIZE;
  const trackDownCount = view.getUint32(pos, false);
  pos += 4 + trackDownCount * TRACK_SEG_SIZE;
  const objCount = view.getUint32(pos, false);
  pos += 4 + objCount * OBJECT_POS_SIZE;

  // pos now points to road segment count
  const roadStart = pos;
  const oldRoadCount = pos + 4 <= rawEntry1.length ? view.getUint32(pos, false) : 0;
  const afterStart = roadStart + 4 + oldRoadCount * ROAD_SEG_SIZE;

  const before = rawEntry1.slice(0, roadStart);
  const after = rawEntry1.slice(afterStart);

  const newRoadBlock = new Uint8Array(4 + roadSegs.length * ROAD_SEG_SIZE);
  const bv = new DataView(newRoadBlock.buffer);
  bv.setUint32(0, roadSegs.length, false);
  for (let i = 0; i < roadSegs.length; i++) {
    const o = 4 + i * ROAD_SEG_SIZE;
    bv.setInt16(o, roadSegs[i].v0, false);
    bv.setInt16(o + 2, roadSegs[i].v1, false);
    bv.setInt16(o + 4, roadSegs[i].v2, false);
    bv.setInt16(o + 6, roadSegs[i].v3, false);
  }

  const result = new Uint8Array(before.length + newRoadBlock.length + after.length);
  result.set(before, 0);
  result.set(newRoadBlock, before.length);
  result.set(after, before.length + newRoadBlock.length);
  return result;
}

// ------------------------------------------------------------------
// LevelEditorService
// ------------------------------------------------------------------
import { MAC_SYSTEM_PALETTE } from './mac-system-palette';
export { MAC_SYSTEM_PALETTE } from './mac-system-palette';
