/**
 * LevelEditorService
 *
 * Parses and serializes Reckless Drivin' level pack entries.
 *
 * Data flow:
 *   resources.dat  →  ResourceDatService.parse()  →  ResourceDatEntry[]
 *   ResourceDatEntry (type='Pack', id=140-149)  →  parsePackHandle()  →  PackEntry[]
 *   PackEntry id=1  →  parseLevelEntry()  →  ParsedLevel
 *   PackEntry id=2  →  parseMarkSegs()    →  MarkSeg[]
 *
 * Editing:
 *   mutate ParsedLevel fields → serializeLevelProperties() → Uint8Array
 *   rebuild PackEntry[] → encodePackHandle() → raw handle bytes
 *   replace ResourceDatEntry.data with new handle bytes
 */

import type { ResourceDatEntry } from './resource-dat.service';
import { parsePackHandle, encodePackHandle } from './pack-parser.service';

// ------------------------------------------------------------------
// Exported data models
// ------------------------------------------------------------------

export interface ObjectGroupRef {
  resID: number;    // SInt16
  numObjs: number;  // SInt16
}

export interface TrackSeg {
  flags: number;  // UInt16
  x: number;      // SInt16
  y: number;      // SInt32
  velo: number;   // float (big-endian)
}

export interface ObjectPos {
  x: number;        // SInt32
  y: number;        // SInt32
  dir: number;      // float
  typeRes: number;  // SInt16
}

export interface RoadSeg {
  v0: number;  // SInt16
  v1: number;  // SInt16
  v2: number;  // SInt16
  v3: number;  // SInt16
}

export interface MarkSeg {
  x1: number;  // SInt32
  y1: number;  // SInt32
  x2: number;  // SInt32
  y2: number;  // SInt32
}

export interface LevelProperties {
  roadInfo: number;   // SInt16 – index into kPackRoad
  time: number;       // UInt16 – level time limit
  xStartPos: number;  // SInt16 – player start X position
  levelEnd: number;   // UInt16 – Y position of finish line
}

/** Full in-memory representation of a decoded level. */
export interface ParsedLevel {
  resourceId: number;
  properties: LevelProperties;
  objectGroups: ObjectGroupRef[];  // 10 entries
  trackUp: TrackSeg[];
  trackDown: TrackSeg[];
  objects: ObjectPos[];
  roadSegs: RoadSeg[];
  roadSegCount: number;
  marks: MarkSeg[];
  rawEntry1: Uint8Array;
  rawEntry2: Uint8Array;
  encrypted: boolean;
}

/** Legacy tile overlay kept for backward compatibility. */
export interface EditableLevel {
  resourceId: number;
  width: number;
  height: number;
  tiles: number[];
}

export interface EditableSpriteAsset {
  id: number;
  type: string;
  size: number;
}

export interface ObjectTypeDefinition {
  typeRes: number;
  frame: number;
  numFrames: number;
  width: number;
  length: number;
}

export interface DecodedSpriteFrame {
  frameId: number;
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
  bitDepth: 8 | 16;
}

// ------------------------------------------------------------------
// Constants
// ------------------------------------------------------------------

const LEVEL_RESOURCE_IDS = Array.from({ length: 10 }, (_, i) => 140 + i);
const ENCRYPTED_LEVEL_IDS = new Set([143, 144, 145, 146, 147, 148, 149]);
const LEVEL_DATA_SIZE   = 48;  // sizeof(tLevelData)
const TRACK_SEG_SIZE    = 12;  // sizeof(tTrackInfoSeg)
const OBJECT_POS_SIZE   = 16;  // sizeof(tObjectPos)
const ROAD_SEG_SIZE     = 8;   // 4 × SInt16
const MARK_SEG_SIZE     = 16;  // 2 × t2DPoint (SInt32 x + SInt32 y)
const T2D_POINT_SIZE    = 8;   // SInt32 x + SInt32 y
const OBJECT_TYPE_SIZE  = 64;  // sizeof(tObjectType)
const OBJECT_TYPES_PACK_ID = 128;
const SPRITE_PACK_8_ID = 129;
const SPRITE_PACK_16_ID = 137;
const SPRITE_HEADER_SIZE = 8;

/** Pack ID for kPackRoad (tRoadInfo array, resource ID 135). */
const ROAD_PACK_ID = 135;
/** Pack ID for kPackTx16 (16-bit RGB555 textures, resource ID 136). */
const TX16_PACK_ID = 136;

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
 *   … (remaining fields not needed for rendering)
 *   UInt8  water         @57
 */
const RI_OFFSET_BG_TEX     = 18;
const RI_OFFSET_FG_TEX     = 20;
const RI_OFFSET_LEFT_BORD  = 22;
const RI_OFFSET_RIGHT_BORD = 24;
const RI_OFFSET_WATER      = 57;
const ROAD_INFO_SIZE       = 64;  // sizeof(tRoadInfo)

/** Texture dimensions (pixels) for tiles in kPackTx16. */
const BIG_TEX_SIZE   = 128;  // background + road surface textures: 128×128 px
const BORDER_TEX_W   = 16;   // kerb border textures: 16 px wide
const BORDER_TEX_H   = 128;  // kerb border textures: 128 px tall

// ------------------------------------------------------------------
// Road texture data types (exported so worker can transfer them)
// ------------------------------------------------------------------

/** Decoded info for a single tRoadInfo entry in kPackRoad. */
export interface RoadInfoData {
  /** tRoadInfo entry ID (= roadInfo field in level data, e.g. 128–136). */
  id: number;
  /** Texture ID in kPackTx16 for the off-road / background fill. */
  backgroundTex: number;
  /** Texture ID in kPackTx16 for the driveable road surface. */
  foregroundTex: number;
  /** Texture ID in kPackTx16 for the left (inside) kerb border. */
  roadLeftBorder: number;
  /** Texture ID in kPackTx16 for the right (outside) kerb border. */
  roadRightBorder: number;
  /** True for water levels (level 5 / roadInfo 133). */
  water: boolean;
}

/** Decoded 16-bit RGB555 texture ready for ImageData. */
export interface DecodedRoadTexture {
  texId: number;
  width: number;
  height: number;
  /** Raw RGBA8888 pixel data (width × height × 4 bytes). */
  pixels: ArrayBuffer;
}

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

function readBigFloat32(view: DataView, offset: number): number {
  return view.getFloat32(offset, false);
}

function writeBigFloat32(view: DataView, offset: number, value: number): void {
  view.setFloat32(offset, value, false);
}

/** Scale factor for converting a 5-bit channel (0–31) to 8-bit (0–255). */
const RGB5_SCALE = 255 / 31;
const RGB6_SCALE = 255 / 63;

/** Convert a packed big-endian RGB555 pixel into 8-bit RGBA for canvas previews.
 *  Mac OS 9 / PPC native 16-bit format: xRRRRRGGGGGBBBBB (bit 15 unused).
 */
function rgb555ToRgba(value: number): [number, number, number, number] {
  const r = ((value >> 10) & 0x1f) * RGB5_SCALE;
  const g = ((value >> 5)  & 0x1f) * RGB5_SCALE;
  const b = (value & 0x1f)          * RGB5_SCALE;
  return [Math.round(r), Math.round(g), Math.round(b), 255];
}

/** Convert a packed big-endian RGB565 pixel into 8-bit RGBA for canvas previews. */
function rgb565ToRgba(value: number): [number, number, number, number] {
  const r = ((value >> 11) & 0x1f) * RGB5_SCALE;
  const g = ((value >> 5) & 0x3f) * RGB6_SCALE;
  const b = (value & 0x1f) * RGB5_SCALE;
  return [Math.round(r), Math.round(g), Math.round(b), 255];
}

/** Convert RGBA8888 to packed RGB555 big-endian word (Mac OS 9 / PPC format). */
export function rgbaToRgb555(r: number, g: number, b: number): number {
  const r5 = Math.round(r * 31 / 255) & 0x1f;
  const g5 = Math.round(g * 31 / 255) & 0x1f;
  const b5 = Math.round(b * 31 / 255) & 0x1f;
  return (r5 << 10) | (g5 << 5) | b5;
}

/** Approximate the legacy 8-bit indexed sprite format as 3:3:2 RGB for previews. */
/** Mac OS System 8-bit colour table (256 entries).
 *  Indices 0-215 form the 6×6×6 RGB cube (values: 0, 51, 102, 153, 204, 255).
 *  Indices 216-255 are additional Mac-specific grays / reserved entries.
 */
const MAC_SYSTEM_PALETTE: readonly [number, number, number][] = [
  [255,255,255],[255,255,204],[255,255,153],[255,255,102],[255,255,51],[255,255,0],
  [255,204,255],[255,204,204],[255,204,153],[255,204,102],[255,204,51],[255,204,0],
  [255,153,255],[255,153,204],[255,153,153],[255,153,102],[255,153,51],[255,153,0],
  [255,102,255],[255,102,204],[255,102,153],[255,102,102],[255,102,51],[255,102,0],
  [255,51,255],[255,51,204],[255,51,153],[255,51,102],[255,51,51],[255,51,0],
  [255,0,255],[255,0,204],[255,0,153],[255,0,102],[255,0,51],[255,0,0],
  [204,255,255],[204,255,204],[204,255,153],[204,255,102],[204,255,51],[204,255,0],
  [204,204,255],[204,204,204],[204,204,153],[204,204,102],[204,204,51],[204,204,0],
  [204,153,255],[204,153,204],[204,153,153],[204,153,102],[204,153,51],[204,153,0],
  [204,102,255],[204,102,204],[204,102,153],[204,102,102],[204,102,51],[204,102,0],
  [204,51,255],[204,51,204],[204,51,153],[204,51,102],[204,51,51],[204,51,0],
  [204,0,255],[204,0,204],[204,0,153],[204,0,102],[204,0,51],[204,0,0],
  [153,255,255],[153,255,204],[153,255,153],[153,255,102],[153,255,51],[153,255,0],
  [153,204,255],[153,204,204],[153,204,153],[153,204,102],[153,204,51],[153,204,0],
  [153,153,255],[153,153,204],[153,153,153],[153,153,102],[153,153,51],[153,153,0],
  [153,102,255],[153,102,204],[153,102,153],[153,102,102],[153,102,51],[153,102,0],
  [153,51,255],[153,51,204],[153,51,153],[153,51,102],[153,51,51],[153,51,0],
  [153,0,255],[153,0,204],[153,0,153],[153,0,102],[153,0,51],[153,0,0],
  [102,255,255],[102,255,204],[102,255,153],[102,255,102],[102,255,51],[102,255,0],
  [102,204,255],[102,204,204],[102,204,153],[102,204,102],[102,204,51],[102,204,0],
  [102,153,255],[102,153,204],[102,153,153],[102,153,102],[102,153,51],[102,153,0],
  [102,102,255],[102,102,204],[102,102,153],[102,102,102],[102,102,51],[102,102,0],
  [102,51,255],[102,51,204],[102,51,153],[102,51,102],[102,51,51],[102,51,0],
  [102,0,255],[102,0,204],[102,0,153],[102,0,102],[102,0,51],[102,0,0],
  [51,255,255],[51,255,204],[51,255,153],[51,255,102],[51,255,51],[51,255,0],
  [51,204,255],[51,204,204],[51,204,153],[51,204,102],[51,204,51],[51,204,0],
  [51,153,255],[51,153,204],[51,153,153],[51,153,102],[51,153,51],[51,153,0],
  [51,102,255],[51,102,204],[51,102,153],[51,102,102],[51,102,51],[51,102,0],
  [51,51,255],[51,51,204],[51,51,153],[51,51,102],[51,51,51],[51,51,0],
  [51,0,255],[51,0,204],[51,0,153],[51,0,102],[51,0,51],[51,0,0],
  [0,255,255],[0,255,204],[0,255,153],[0,255,102],[0,255,51],[0,255,0],
  [0,204,255],[0,204,204],[0,204,153],[0,204,102],[0,204,51],[0,204,0],
  [0,153,255],[0,153,204],[0,153,153],[0,153,102],[0,153,51],[0,153,0],
  [0,102,255],[0,102,204],[0,102,153],[0,102,102],[0,102,51],[0,102,0],
  [0,51,255],[0,51,204],[0,51,153],[0,51,102],[0,51,51],[0,51,0],
  [0,0,255],[0,0,204],[0,0,153],[0,0,102],[0,0,51],[0,0,0],
  // Mac-specific additional entries (indices 216-255): grays and reserved blacks
  [238,238,238],[221,221,221],[187,187,187],[170,170,170],[136,136,136],
  [119,119,119],[85,85,85],[68,68,68],[34,34,34],[17,17,17],
  [0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0],
  [0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0],
  [0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0],
  [0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0],
  [0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0],
];

function indexed8ToRgba(value: number): [number, number, number, number] {
  const entry = MAC_SYSTEM_PALETTE[value & 0xff];
  if (!entry) return [0, 0, 0, 255];
  return [entry[0], entry[1], entry[2], 255];
}

// ------------------------------------------------------------------
// Level entry parser
// ------------------------------------------------------------------

export function parseLevelEntry(data: Uint8Array): {
  properties: LevelProperties;
  objectGroups: ObjectGroupRef[];
  trackUp: TrackSeg[];
  trackDown: TrackSeg[];
  objects: ObjectPos[];
  roadSegs: RoadSeg[];
  roadSegCount: number;
  rawEntry1: Uint8Array;
} {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let pos = 0;

  if (data.length < LEVEL_DATA_SIZE) {
    throw new Error(`Level entry too small: ${data.length} < ${LEVEL_DATA_SIZE}`);
  }

  const roadInfo  = view.getInt16(pos, false);   pos += 2;
  const time      = view.getUint16(pos, false);  pos += 2;

  const objectGroups: ObjectGroupRef[] = [];
  for (let i = 0; i < 10; i++) {
    objectGroups.push({
      resID:   view.getInt16(pos,     false),
      numObjs: view.getInt16(pos + 2, false),
    });
    pos += 4;
  }

  const xStartPos = view.getInt16(pos, false);   pos += 2;
  const levelEnd  = view.getUint16(pos, false);  pos += 2;
  // pos == 48

  // tTrackInfo up
  const trackUpCount = view.getUint32(pos, false);  pos += 4;
  const trackUp: TrackSeg[] = [];
  for (let i = 0; i < trackUpCount && pos + TRACK_SEG_SIZE <= data.length; i++) {
    trackUp.push({
      flags: view.getUint16(pos, false),
      x:     view.getInt16(pos + 2, false),
      y:     view.getInt32(pos + 4, false),
      velo:  readBigFloat32(view, pos + 8),
    });
    pos += TRACK_SEG_SIZE;
  }

  // tTrackInfo down
  const trackDownCount = view.getUint32(pos, false);  pos += 4;
  const trackDown: TrackSeg[] = [];
  for (let i = 0; i < trackDownCount && pos + TRACK_SEG_SIZE <= data.length; i++) {
    trackDown.push({
      flags: view.getUint16(pos, false),
      x:     view.getInt16(pos + 2, false),
      y:     view.getInt32(pos + 4, false),
      velo:  readBigFloat32(view, pos + 8),
    });
    pos += TRACK_SEG_SIZE;
  }

  // Objects
  const objCount = pos + 4 <= data.length ? view.getUint32(pos, false) : 0;  pos += 4;
  const objects: ObjectPos[] = [];
  for (let i = 0; i < objCount && pos + OBJECT_POS_SIZE <= data.length; i++) {
    objects.push({
      x:       view.getInt32(pos, false),
      y:       view.getInt32(pos + 4, false),
      dir:     readBigFloat32(view, pos + 8),
      typeRes: view.getInt16(pos + 12, false),
    });
    pos += OBJECT_POS_SIZE;
  }

  // Road data
  const roadLen = pos + 4 <= data.length ? view.getUint32(pos, false) : 0;  pos += 4;
  const roadSegs: RoadSeg[] = [];
  for (let i = 0; i < roadLen && pos + ROAD_SEG_SIZE <= data.length; i++) {
    roadSegs.push({
      v0: view.getInt16(pos,     false),
      v1: view.getInt16(pos + 2, false),
      v2: view.getInt16(pos + 4, false),
      v3: view.getInt16(pos + 6, false),
    });
    pos += ROAD_SEG_SIZE;
  }

  return { properties: { roadInfo, time, xStartPos, levelEnd }, objectGroups,
    trackUp, trackDown, objects, roadSegs, roadSegCount: roadLen, rawEntry1: data };
}

export function parseMarkSegs(data: Uint8Array): MarkSeg[] {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const count = Math.floor(data.length / MARK_SEG_SIZE);
  const marks: MarkSeg[] = [];
  for (let i = 0; i < count; i++) {
    const o = i * MARK_SEG_SIZE;
    marks.push({
      x1: view.getFloat32(o,                    false),
      y1: view.getFloat32(o + 4,                false),
      x2: view.getFloat32(o + T2D_POINT_SIZE,   false),
      y2: view.getFloat32(o + T2D_POINT_SIZE + 4, false),
    });
  }
  return marks;
}

// ------------------------------------------------------------------
// Serializers
// ------------------------------------------------------------------

export function serializeLevelProperties(rawEntry1: Uint8Array, props: LevelProperties): Uint8Array {
  const out  = rawEntry1.slice();
  const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
  view.setInt16(0, props.roadInfo, false);
  view.setUint16(2, props.time, false);
  view.setInt16(44, props.xStartPos, false);
  view.setUint16(46, props.levelEnd, false);
  return out;
}

export function serializeLevelTrack(
  rawEntry1: Uint8Array,
  trackUp: { x: number; y: number; flags: number; velo: number }[],
  trackDown: { x: number; y: number; flags: number; velo: number }[],
): Uint8Array {
  const view = new DataView(rawEntry1.buffer, rawEntry1.byteOffset, rawEntry1.byteLength);
  let pos = LEVEL_DATA_SIZE;

  const oldUpCount   = view.getUint32(pos, false);
  const upStart      = pos + 4;
  pos = upStart + oldUpCount * TRACK_SEG_SIZE;
  const oldDownCount = view.getUint32(pos, false);
  const downStart    = pos + 4;
  pos = downStart + oldDownCount * TRACK_SEG_SIZE;

  // Keep the bytes before track data unchanged (tLevelData)
  const before = rawEntry1.slice(0, LEVEL_DATA_SIZE);
  // Keep everything after both track arrays unchanged (objects + road)
  const after  = rawEntry1.slice(pos);

  const writeTrack = (segs: { x: number; y: number; flags: number; velo: number }[]): Uint8Array => {
    const buf = new Uint8Array(4 + segs.length * TRACK_SEG_SIZE);
    const bv  = new DataView(buf.buffer);
    bv.setUint32(0, segs.length, false);
    for (let i = 0; i < segs.length; i++) {
      const o = 4 + i * TRACK_SEG_SIZE;
      bv.setUint16(o,     segs[i].flags, false);
      bv.setInt16(o + 2,  segs[i].x,     false);
      bv.setInt32(o + 4,  segs[i].y,     false);
      writeBigFloat32(bv, o + 8, segs[i].velo);
    }
    return buf;
  };

  const upBuf   = writeTrack(trackUp);
  const downBuf = writeTrack(trackDown);

  const result = new Uint8Array(before.length + upBuf.length + downBuf.length + after.length);
  result.set(before, 0);
  result.set(upBuf,   before.length);
  result.set(downBuf, before.length + upBuf.length);
  result.set(after,   before.length + upBuf.length + downBuf.length);
  return result;
}

export function serializeLevelObjects(rawEntry1: Uint8Array, objects: ObjectPos[]): Uint8Array {
  const view = new DataView(rawEntry1.buffer, rawEntry1.byteOffset, rawEntry1.byteLength);
  let pos = LEVEL_DATA_SIZE;
  const trackUpCount   = view.getUint32(pos, false);  pos += 4 + trackUpCount   * TRACK_SEG_SIZE;
  const trackDownCount = view.getUint32(pos, false);  pos += 4 + trackDownCount * TRACK_SEG_SIZE;

  const objBlockStart = pos;
  const oldObjCount   = pos + 4 <= rawEntry1.length ? view.getUint32(pos, false) : 0;
  const afterStart    = objBlockStart + 4 + oldObjCount * OBJECT_POS_SIZE;

  const before = rawEntry1.slice(0, objBlockStart);
  const after  = rawEntry1.slice(afterStart);

  const newObjBlock = new Uint8Array(4 + objects.length * OBJECT_POS_SIZE);
  const bv = new DataView(newObjBlock.buffer);
  bv.setUint32(0, objects.length, false);
  for (let i = 0; i < objects.length; i++) {
    const o = 4 + i * OBJECT_POS_SIZE;
    bv.setInt32(o,      objects[i].x,       false);
    bv.setInt32(o + 4,  objects[i].y,       false);
    writeBigFloat32(bv, o + 8, objects[i].dir);
    bv.setInt16(o + 12, objects[i].typeRes, false);
    bv.setInt16(o + 14, 0,                  false);
  }

  const result = new Uint8Array(before.length + newObjBlock.length + after.length);
  result.set(before, 0);
  result.set(newObjBlock, before.length);
  result.set(after, before.length + newObjBlock.length);
  return result;
}

// ------------------------------------------------------------------
// LevelEditorService
// ------------------------------------------------------------------

export class LevelEditorService {

  extractParsedLevels(resources: ResourceDatEntry[]): ParsedLevel[] {
    const levels: ParsedLevel[] = [];
    for (const entry of resources) {
      if (entry.type !== 'Pack' || !LEVEL_RESOURCE_IDS.includes(entry.id)) continue;
      try {
        const packEntries = parsePackHandle(entry.data, entry.id);
        const e1 = packEntries.find((e) => e.id === 1);
        const e2 = packEntries.find((e) => e.id === 2);
        if (!e1) continue;

        const partial = parseLevelEntry(e1.data);
        const marks   = e2 ? parseMarkSegs(e2.data) : [];

        levels.push({
          resourceId: entry.id,
          ...partial,
          marks,
          rawEntry2: e2?.data ?? new Uint8Array(0),
          encrypted: ENCRYPTED_LEVEL_IDS.has(entry.id),
        });
      } catch (e) {
        console.warn(`[LevelEditor] parse error for Pack #${entry.id}:`, e);
      }
    }
    return levels.sort((a, b) => a.resourceId - b.resourceId);
  }

  applyLevelProperties(
    resources: ResourceDatEntry[],
    resourceId: number,
    props: LevelProperties,
  ): ResourceDatEntry[] {
    return resources.map((res) => {
      if (res.type !== 'Pack' || res.id !== resourceId) return res;
      try {
        const packEntries = parsePackHandle(res.data, res.id);
        const e1 = packEntries.find((e) => e.id === 1);
        if (!e1) return res;
        const newData    = serializeLevelProperties(e1.data, props);
        const newEntries = packEntries.map((e) => e.id === 1 ? { ...e, data: newData } : e);
        return { ...res, data: encodePackHandle(newEntries, resourceId) };
      } catch (err) {
        console.error(`[LevelEditor] applyLevelProperties error id=${resourceId}:`, err);
        return res;
      }
    });
  }

  applyLevelObjects(
    resources: ResourceDatEntry[],
    resourceId: number,
    objects: ObjectPos[],
  ): ResourceDatEntry[] {
    return resources.map((res) => {
      if (res.type !== 'Pack' || res.id !== resourceId) return res;
      try {
        const packEntries = parsePackHandle(res.data, res.id);
        const e1 = packEntries.find((e) => e.id === 1);
        if (!e1) return res;
        const newData    = serializeLevelObjects(e1.data, objects);
        const newEntries = packEntries.map((e) => e.id === 1 ? { ...e, data: newData } : e);
        return { ...res, data: encodePackHandle(newEntries, resourceId) };
      } catch (err) {
        console.error(`[LevelEditor] applyLevelObjects error id=${resourceId}:`, err);
        return res;
      }
    });
  }

  applyLevelTrack(
    resources: ResourceDatEntry[],
    resourceId: number,
    trackUp: { x: number; y: number; flags: number; velo: number }[],
    trackDown: { x: number; y: number; flags: number; velo: number }[],
  ): ResourceDatEntry[] {
    return resources.map((res) => {
      if (res.type !== 'Pack' || res.id !== resourceId) return res;
      try {
        const packEntries = parsePackHandle(res.data, res.id);
        const e1 = packEntries.find((e) => e.id === 1);
        if (!e1) return res;
        const newData    = serializeLevelTrack(e1.data, trackUp, trackDown);
        const newEntries = packEntries.map((e) => e.id === 1 ? { ...e, data: newData } : e);
        return { ...res, data: encodePackHandle(newEntries, resourceId) };
      } catch (err) {
        console.error(`[LevelEditor] applyLevelTrack error id=${resourceId}:`, err);
        return res;
      }
    });
  }

  /** Legacy: extract tile overlay for the simple 16x16 view. */
  extractLevels(resources: ResourceDatEntry[]): EditableLevel[] {
    return resources
      .filter((e) => e.type === 'Pack' && LEVEL_RESOURCE_IDS.includes(e.id))
      .sort((a, b) => a.id - b.id)
      .map((entry) => ({ resourceId: entry.id, width: 16, height: 16, tiles: this.toTiles(entry.data) }));
  }

  /** Legacy: write tile overlay edits back to raw pack bytes. */
  applyLevels(resources: ResourceDatEntry[], levels: EditableLevel[]): ResourceDatEntry[] {
    const byId = new Map(levels.map((l) => [l.resourceId, l]));
    return resources.map((entry) => {
      const level = byId.get(entry.id);
      if (entry.type !== 'Pack' || !level) return entry;
      const next = entry.data.slice();
      const count = Math.min(level.tiles.length, 256, next.length);
      for (let i = 0; i < count; i++) next[i] = Math.max(0, Math.min(255, level.tiles[i]));
      return { ...entry, data: next };
    });
  }

  extractSpriteAssets(resources: ResourceDatEntry[]): EditableSpriteAsset[] {
    return resources
      .filter((e) => e.type === 'PPic')
      .map((e) => ({ id: e.id, type: e.type, size: e.data.length }))
      .sort((a, b) => a.id - b.id);
  }

  /**
   * Return all entry IDs present in kPackSp16 (Pack 137) and kPackSprt (Pack 129).
   * Used by the sprites tab to list available decoded sprite frames.
   */
  getAllSpriteFrameIds(resources: ResourceDatEntry[]): { id: number; bitDepth: 8 | 16 }[] {
    const result: { id: number; bitDepth: 8 | 16 }[] = [];
    const getIds = (packId: number, bitDepth: 8 | 16) => {
      const pack = resources.find((e) => e.type === 'Pack' && e.id === packId);
      if (!pack) return;
      try {
        const entries = parsePackHandle(pack.data, pack.id);
        for (const e of entries) {
          result.push({ id: e.id, bitDepth });
        }
      } catch (err) {
        console.warn(`[LevelEditor] getAllSpriteFrameIds: failed to parse Pack #${packId}:`, err);
      }
    };
    getIds(SPRITE_PACK_16_ID, 16);
    getIds(SPRITE_PACK_8_ID, 8);
    result.sort((a, b) => a.id - b.id);
    return result;
  }

  /**
   * Decode all sprite frames from Pack 129 (8-bit) and Pack 137 (16-bit) in a single pass.
   * Returns decoded RGBA pixel data for each frame.
   */
  decodeAllSpriteFrames(
    resources: ResourceDatEntry[],
  ): { id: number; bitDepth: 8 | 16; width: number; height: number; pixels: ArrayBuffer }[] {
    const result: { id: number; bitDepth: 8 | 16; width: number; height: number; pixels: ArrayBuffer }[] = [];
    const decodeFromPack = (packId: number, bitDepth: 8 | 16) => {
      const pack = resources.find((e) => e.type === 'Pack' && e.id === packId);
      if (!pack) return;
      try {
        const entries = parsePackHandle(pack.data, pack.id);
        for (const entry of entries) {
          if (entry.data.length < SPRITE_HEADER_SIZE) continue;
          const decoded = bitDepth === 16
            ? this.decode16BitSprite(entry.data, entry.id)
            : this.decode8BitSprite(entry.data, entry.id);
          if (!decoded) continue;
          const buf = new ArrayBuffer(decoded.pixels.byteLength);
          new Uint8Array(buf).set(decoded.pixels);
          result.push({ id: entry.id, bitDepth, width: decoded.width, height: decoded.height, pixels: buf });
        }
      } catch (err) {
        console.warn(`[LevelEditor] decodeAllSpriteFrames pack ${packId} error:`, err);
      }
    };
    decodeFromPack(SPRITE_PACK_16_ID, 16);
    // Pack 129 (8-bit) uses a custom game palette that doesn't match MAC_SYSTEM_PALETTE.
    // Only decode 16-bit sprites to avoid visual noise.
    return result;
  }

  extractObjectTypeDefinitions(resources: ResourceDatEntry[]): Map<number, ObjectTypeDefinition> {
    const pack = resources.find((e) => e.type === 'Pack' && e.id === OBJECT_TYPES_PACK_ID);
    const defs = new Map<number, ObjectTypeDefinition>();
    if (!pack) return defs;
    try {
      const entries = parsePackHandle(pack.data, pack.id);
      for (const entry of entries) {
        if (entry.data.length < OBJECT_TYPE_SIZE) continue;
        const view = new DataView(entry.data.buffer, entry.data.byteOffset, entry.data.byteLength);
        defs.set(entry.id, {
          typeRes: entry.id,
          frame: view.getInt16(20, false),
          numFrames: view.getUint16(22, false),
          width: view.getFloat32(40, false),
          length: view.getFloat32(44, false),
        });
      }
    } catch (err) {
      console.warn('[LevelEditor] failed to parse object types:', err);
    }
    return defs;
  }

  decodeSpriteFrame(resources: ResourceDatEntry[], frameId: number): DecodedSpriteFrame | null {
    return this.decodeSpriteFromPack(resources, SPRITE_PACK_16_ID, frameId)
      ?? this.decodeSpriteFromPack(resources, SPRITE_PACK_8_ID, frameId);
  }

  /**
   * Decode multiple sprite frames in one pass, parsing each sprite pack only once.
   *
   * This is significantly faster than calling `decodeSpriteFrame` in a loop,
   * because each pack handle (LZRW3-A compressed) is decompressed only once
   * regardless of how many frames need to be decoded from it.
   */
  batchDecodeSpriteFrames(
    resources: ResourceDatEntry[],
    frameIds: number[],
  ): Map<number, DecodedSpriteFrame> {
    const result = new Map<number, DecodedSpriteFrame>();
    if (frameIds.length === 0) return result;

    // Parse each sprite pack exactly once.
    const getPackEntries = (packId: number): Map<number, Uint8Array> => {
      const pack = resources.find((e) => e.type === 'Pack' && e.id === packId);
      if (!pack) return new Map();
      try {
        const entries = parsePackHandle(pack.data, pack.id);
        return new Map(entries.map((e) => [e.id, e.data]));
      } catch {
        return new Map();
      }
    };

    const pack16 = getPackEntries(SPRITE_PACK_16_ID);
    const pack8  = getPackEntries(SPRITE_PACK_8_ID);

    for (const frameId of frameIds) {
      if (result.has(frameId)) continue;
      const data16 = pack16.get(frameId);
      if (data16 && data16.length >= SPRITE_HEADER_SIZE) {
        const decoded = this.decode16BitSprite(data16, frameId);
        if (decoded) { result.set(frameId, decoded); continue; }
      }
      const data8 = pack8.get(frameId);
      if (data8 && data8.length >= SPRITE_HEADER_SIZE) {
        const decoded = this.decode8BitSprite(data8, frameId);
        if (decoded) { result.set(frameId, decoded); }
      }
    }
    return result;
  }

  applySpriteByte(
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

  getSpriteBytes(resources: ResourceDatEntry[], spriteId: number): Uint8Array | null {
    const entry = resources.find((e) => e.type === 'PPic' && e.id === spriteId);
    return entry ? entry.data : null;
  }

  /**
   * Write edited RGBA8888 pixels back into the sprite pack (Pack 137, 16-bit RGB555).
   * Only writes to 16-bit sprite pack entries; 8-bit PPic PPic entries are not modified.
   */
  applySpritePack16Pixels(
    resources: ResourceDatEntry[],
    frameId: number,
    pixels: Uint8ClampedArray,
  ): ResourceDatEntry[] {
    const packId = SPRITE_PACK_16_ID;
    return resources.map((res) => {
      if (res.type !== 'Pack' || res.id !== packId) return res;
      try {
        const packEntries = parsePackHandle(res.data, packId);
        const entry = packEntries.find((e) => e.id === frameId);
        if (!entry || entry.data.length < SPRITE_HEADER_SIZE) return res;
        const view = new DataView(entry.data.buffer, entry.data.byteOffset, entry.data.byteLength);
        const width  = view.getUint16(0, false);
        const height = view.getUint16(2, false);
        const log2xSize = entry.data[4];
        const stride = 1 << log2xSize;
        if (width <= 0 || height <= 0 || stride <= 0) return res;
        // Write edited pixels back (convert RGBA8888 → RGB555 BE)
        const newData = entry.data.slice();
        const newView = new DataView(newData.buffer, newData.byteOffset, newData.byteLength);
        const maskValue = view.getUint16(SPRITE_HEADER_SIZE, false); // transparent colour unchanged
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            const srcI = (y * width + x) * 4;
            const dstOffset = SPRITE_HEADER_SIZE + (y * stride + x) * 2;
            if (dstOffset + 2 > newData.length) continue;
            const a = pixels[srcI + 3];
            if (a === 0) {
              // transparent – restore mask value
              newView.setUint16(dstOffset, maskValue, false);
            } else {
              const rgb = rgbaToRgb555(pixels[srcI], pixels[srcI + 1], pixels[srcI + 2]);
              // Avoid accidentally writing the mask value with an opaque pixel
              const safe = rgb === maskValue ? (rgb ^ 1) : rgb;
              newView.setUint16(dstOffset, safe, false);
            }
          }
        }
        const newEntries = packEntries.map((e) => e.id === frameId ? { ...e, data: newData } : e);
        return { ...res, data: encodePackHandle(newEntries, packId) };
      } catch (err) {
        console.warn('[LevelEditor] applySpritePack16Pixels error:', err);
        return res;
      }
    });
  }

  applyLevelMarks(
    resources: ResourceDatEntry[],
    resourceId: number,
    marks: MarkSeg[],
  ): ResourceDatEntry[] {
    return resources.map((res) => {
      if (res.type !== 'Pack' || res.id !== resourceId) return res;
      try {
        const packEntries = parsePackHandle(res.data, res.id);
        const e2 = packEntries.find((e) => e.id === 2);
        const newData = serializeMarkSegs(marks);
        const newEntries = e2
          ? packEntries.map((e) => e.id === 2 ? { ...e, data: newData } : e)
          : [...packEntries, { id: 2, data: newData }];
        return { ...res, data: encodePackHandle(newEntries, resourceId) };
      } catch (err) {
        console.error(`[LevelEditor] applyLevelMarks error id=${resourceId}:`, err);
        return res;
      }
    });
  }

  private toTiles(data: Uint8Array): number[] {
    const tiles: number[] = [];
    for (let i = 0; i < 256; i++) tiles.push(i < data.length ? data[i] & 0x0f : 0);
    return tiles;
  }

  private decodeSpriteFromPack(
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
        ? this.decode16BitSprite(entry.data, frameId)
        : this.decode8BitSprite(entry.data, frameId);
    } catch (err) {
      console.warn(`[LevelEditor] failed to decode sprite frame ${frameId} from Pack #${packId}:`, err);
      return null;
    }
  }

  private decode8BitSprite(data: Uint8Array, frameId: number): DecodedSpriteFrame | null {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const width = view.getUint16(0, false);
    const height = view.getUint16(2, false);
    const log2xSize = data[4];
    const stride = 1 << log2xSize;
    if (width <= 0 || height <= 0 || stride <= 0) return null;
    const pixels = new Uint8ClampedArray(width * height * 4);
    const mask = data[SPRITE_HEADER_SIZE];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const srcOffset = SPRITE_HEADER_SIZE + y * stride + x;
        if (srcOffset >= data.length) continue;
        const value = data[srcOffset];
        const dstOffset = (y * width + x) * 4;
        if (value === mask) {
          pixels[dstOffset + 3] = 0;
          continue;
        }
        const [r, g, b, a] = indexed8ToRgba(value);
        pixels[dstOffset] = r;
        pixels[dstOffset + 1] = g;
        pixels[dstOffset + 2] = b;
        pixels[dstOffset + 3] = a;
      }
    }
    return { frameId, width, height, pixels, bitDepth: 8 };
  }

  private decode16BitSprite(data: Uint8Array, frameId: number): DecodedSpriteFrame | null {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const width = view.getUint16(0, false);
    const height = view.getUint16(2, false);
    const log2xSize = data[4];
    const stride = 1 << log2xSize;
    if (width <= 0 || height <= 0 || stride <= 0) return null;
    const pixels = new Uint8ClampedArray(width * height * 4);
    const mask = view.getUint16(SPRITE_HEADER_SIZE, false);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const srcOffset = SPRITE_HEADER_SIZE + (y * stride + x) * 2;
        if (srcOffset + 2 > data.length) continue;
        const value = view.getUint16(srcOffset, false);
        const dstOffset = (y * width + x) * 4;
        if (value === mask) {
          pixels[dstOffset + 3] = 0;
          continue;
        }
        const [r, g, b, a] = rgb555ToRgba(value);
        pixels[dstOffset] = r;
        pixels[dstOffset + 1] = g;
        pixels[dstOffset + 2] = b;
        pixels[dstOffset + 3] = a;
      }
    }
    return { frameId, width, height, pixels, bitDepth: 16 };
  }

  // ------------------------------------------------------------------
  // Road texture extraction
  // ------------------------------------------------------------------

  /**
   * Parse kPackRoad (Pack ID 135) and return per-roadInfo texture ID mappings.
   * Each entry in kPackRoad is a tRoadInfo struct (64 bytes, big-endian).
   */
  extractRoadInfos(resources: ResourceDatEntry[]): Map<number, RoadInfoData> {
    const result = new Map<number, RoadInfoData>();
    const pack = resources.find((e) => e.type === 'Pack' && e.id === ROAD_PACK_ID);
    if (!pack) return result;
    try {
      const entries = parsePackHandle(pack.data, pack.id);
      for (const entry of entries) {
        if (entry.data.length < RI_OFFSET_WATER + 1) continue;
        const view = new DataView(entry.data.buffer, entry.data.byteOffset, entry.data.byteLength);
        result.set(entry.id, {
          id: entry.id,
          backgroundTex:  view.getInt16(RI_OFFSET_BG_TEX,    false),
          foregroundTex:  view.getInt16(RI_OFFSET_FG_TEX,    false),
          roadLeftBorder: view.getInt16(RI_OFFSET_LEFT_BORD, false),
          roadRightBorder: view.getInt16(RI_OFFSET_RIGHT_BORD, false),
          water: entry.data[RI_OFFSET_WATER] !== 0,
        });
      }
    } catch (err) {
      console.warn('[LevelEditor] extractRoadInfos error:', err);
    }
    return result;
  }

  /**
   * Decode all textures needed for road rendering from kPackTx16 (Pack ID 136).
   * Returns decoded RGBA8888 textures keyed by texture ID.
   *
   * Large textures (128–137, 2000–3000): 128×128 px (32768 bytes @ 16bpp)
   * Border textures (1000–1014): 16×128 px  (4096 bytes @ 16bpp)
   */
  extractRoadTextures(
    resources: ResourceDatEntry[],
    neededTexIds: number[],
  ): DecodedRoadTexture[] {
    const result: DecodedRoadTexture[] = [];
    const pack = resources.find((e) => e.type === 'Pack' && e.id === TX16_PACK_ID);
    if (!pack) return result;
    try {
      const entries = parsePackHandle(pack.data, pack.id);
      const entryMap = new Map(entries.map((e) => [e.id, e.data]));
      for (const texId of neededTexIds) {
        const data = entryMap.get(texId);
        if (!data || data.length < 2) continue;

        // Determine dimensions from size: 4096 = 16×128 (border), 32768 = 128×128 (main)
        let w: number, h: number;
        const pixelCount = data.length / 2;
        if (pixelCount === BORDER_TEX_W * BORDER_TEX_H) {
          w = BORDER_TEX_W; h = BORDER_TEX_H;
        } else {
          // Default: square (128×128, or 256×256 for 2000-2004)
          w = Math.round(Math.sqrt(pixelCount));
          h = pixelCount / w;
        }
        const pixels = new Uint8ClampedArray(w * h * 4);
        const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
        for (let i = 0; i < w * h; i++) {
          const pv = view.getUint16(i * 2, false); // big-endian RGB555
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
      console.warn('[LevelEditor] extractRoadTextures error:', err);
    }
    return result;
  }
}

/** Serialize mark segments back to binary */
export function serializeMarkSegs(marks: MarkSeg[]): Uint8Array {
  const buf = new Uint8Array(marks.length * 16);
  const view = new DataView(buf.buffer);
  for (let i = 0; i < marks.length; i++) {
    const o = i * 16;
    // false = big-endian, matching parseMarkSegs deserialization (float x + float y)
    view.setFloat32(o,      marks[i].x1, false);
    view.setFloat32(o + 4,  marks[i].y1, false);
    view.setFloat32(o + 8,  marks[i].x2, false);
    view.setFloat32(o + 12, marks[i].y2, false);
  }
  return buf;
}
