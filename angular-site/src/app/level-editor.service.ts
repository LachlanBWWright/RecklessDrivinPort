/**
 * LevelEditorService
 *
 * Parses and serializes Reckless Drivin' level pack entries.
 *
 * Data flow:
 *   resources.dat  →  ResourceDatService.parse()  →  ResourceDatEntry[]
 *   ResourceDatEntry (type='Pack', id=140-149)  →  parsePackHandle()  →  PackEntry[]
 *   PackEntry id=1  →  parseLevelEntry()         →  Result<ParsedLevel, Error>
 *   PackEntry id=2  →  parseMarkSegs()           →  MarkSeg[]
 *
 * Editing:
 *   mutate ParsedLevel fields → serializeLevelProperties() → Uint8Array
 *   rebuild PackEntry[] → encodePackHandle() → raw handle bytes
 *   replace ResourceDatEntry.data with new handle bytes
 */

import { ok, err, type Result } from 'neverthrow';
import type { ResourceDatEntry } from './resource-dat.service';
import { parsePackHandle, encodePackHandle } from './pack-parser.service';

// ------------------------------------------------------------------
// Exported data models
// ------------------------------------------------------------------

export interface ObjectGroupRef {
  resID: number;    // SInt16
  numObjs: number;  // SInt16
}

export interface ObjectGroupEntryData {
  typeRes: number;   // SInt16
  minOffs: number;   // SInt16
  maxOffs: number;   // SInt16
  probility: number;  // SInt16
  dir: number;       // float
}

export interface ObjectGroupDefinition {
  id: number;
  entries: ObjectGroupEntryData[];
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

/** Identifies a single draggable or hovered track waypoint. */
export interface TrackWaypointRef {
  track: 'up' | 'down';
  segIdx: number;
}

/**
 * Identifies the midpoint of a segment between two consecutive track waypoints.
 * `segIdx` is the index of the first of the two waypoints (so the midpoint is
 * between waypoints[segIdx] and waypoints[segIdx+1]).
 */
export interface TrackMidpointRef {
  track: 'up' | 'down';
  /** Index of the first waypoint of the segment (midpoint is between [segIdx] and [segIdx+1]). */
  segIdx: number;
}

export interface LevelProperties {
  roadInfo: number;   // SInt16 – index into kPackRoad
  time: number;       // UInt16 – level time limit
  xStartPos: number;  // SInt16 – player start X position
  levelEnd: number;   // UInt16 – Y position of finish line
  objectGroups: ObjectGroupRef[];  // 10 slots
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
  mass: number;
  maxEngineForce: number;
  maxNegEngineForce: number;
  friction: number;
  flags: number;
  deathObj: number;
  frame: number;
  numFrames: number;
  frameDuration: number;
  wheelWidth: number;
  wheelLength: number;
  steering: number;
  width: number;
  length: number;
  score: number;
  flags2: number;
  creationSound: number;
  otherSound: number;
  maxDamage: number;
  weaponObj: number;
  weaponInfo: number;
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
/** Pack ID for kPackOgrp (object group definitions, resource ID 130). */
const OBJECT_GROUP_PACK_ID = 130;

const OT_OFFSET_MASS = 0;
const OT_OFFSET_MAX_ENGINE_FORCE = 4;
const OT_OFFSET_MAX_NEG_ENGINE_FORCE = 8;
const OT_OFFSET_FRICTION = 12;
const OT_OFFSET_FLAGS = 16;
const OT_OFFSET_DEATH_OBJ = 18;
const OT_OFFSET_FRAME = 20;
const OT_OFFSET_NUM_FRAMES = 22;
const OT_OFFSET_FRAME_DURATION = 24;
const OT_OFFSET_WHEEL_WIDTH = 28;
const OT_OFFSET_WHEEL_LENGTH = 32;
const OT_OFFSET_STEERING = 36;
const OT_OFFSET_WIDTH = 40;
const OT_OFFSET_LENGTH = 44;
const OT_OFFSET_SCORE = 48;
const OT_OFFSET_FLAGS2 = 50;
const OT_OFFSET_CREATION_SOUND = 52;
const OT_OFFSET_OTHER_SOUND = 54;
const OT_OFFSET_MAX_DAMAGE = 56;
const OT_OFFSET_WEAPON_OBJ = 60;
const OT_OFFSET_WEAPON_INFO = 62;

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

/** Texture dimensions (pixels) for tiles in kPackTx16. */
// const BIG_TEX_SIZE = 128;   // background + road surface textures: 128×128 px
const BORDER_TEX_W   = 16;   // kerb border textures: 16 px wide
const BORDER_TEX_H   = 128;  // kerb border textures: 128 px tall

// ------------------------------------------------------------------
// Road texture data types (exported so worker can transfer them)
// ------------------------------------------------------------------

/** Decoded info for a single tRoadInfo entry in kPackRoad. */
export interface RoadInfoData {
  /** tRoadInfo entry ID (= roadInfo field in level data, e.g. 128–136). */
  id: number;
  friction: number;
  airResistance: number;
  backResistance: number;
  tolerance: number;
  marks: number;
  deathOffs: number;
  /** Texture ID in kPackTx16 for the off-road / background fill. */
  backgroundTex: number;
  /** Texture ID in kPackTx16 for the driveable road surface. */
  foregroundTex: number;
  /** Texture ID in kPackTx16 for the left (inside) kerb border. */
  roadLeftBorder: number;
  /** Texture ID in kPackTx16 for the right (outside) kerb border. */
  roadRightBorder: number;
  tracks: number;
  skidSound: number;
  filler: number;
  xDrift: number;
  yDrift: number;
  xFrontDrift: number;
  yFrontDrift: number;
  trackSlide: number;
  dustSlide: number;
  dustColor: number;
  /** True for water levels (level 5 / roadInfo 133). */
  water: boolean;
  filler2: number;
  slideFriction: number;
}

/** Road-info picker entry used by the editor toolbar. */
export interface RoadInfoOption {
  id: number;
  label: string;
  previewUrl: string | null;
  water: boolean;
}

export interface TextureTileEntry {
  texId: number;
  width: number;
  height: number;
}

export interface RoadTileGroup {
  roadInfoId: number;
  label: string;
  tiles: TextureTileEntry[];
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

/** Convert RGBA8888 to the nearest Mac 8-bit palette index. */
function rgbaToMacPaletteIndex(r: number, g: number, b: number): number {
  if (!rgbaToMacPaletteIndexCache) {
    const cache = new Map<number, number>();
    for (let rq = 0; rq < 32; rq++) {
      for (let gq = 0; gq < 32; gq++) {
        for (let bq = 0; bq < 32; bq++) {
          const key = (rq << 10) | (gq << 5) | bq;
          const rr = rq * 8;
          const gg = gq * 8;
          const bb = bq * 8;
          let bestIdx = 0;
          let bestDist = Infinity;
          for (let i = 0; i < MAC_SYSTEM_PALETTE.length; i++) {
            const [pr, pg, pb] = MAC_SYSTEM_PALETTE[i] ?? [0, 0, 0];
            const dr = rr - pr;
            const dg = gg - pg;
            const db = bb - pb;
            const dist = dr * dr + dg * dg + db * db;
            if (dist < bestDist) {
              bestDist = dist;
              bestIdx = i;
            }
          }
          cache.set(key, bestIdx);
        }
      }
    }
    rgbaToMacPaletteIndexCache = cache;
  }

  const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
  return rgbaToMacPaletteIndexCache.get(key) ?? 0;
}

let rgbaToMacPaletteIndexCache: Map<number, number> | null = null;

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

  return ok({ properties: { roadInfo, time, xStartPos, levelEnd, objectGroups }, objectGroups,
    trackUp, trackDown, objects, roadSegs, roadSegCount: roadLen, rawEntry1: data });
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
  // Object groups: 10 × 4 bytes starting at offset 4
  for (let i = 0; i < 10; i++) {
    const grp = props.objectGroups[i];
    if (grp) {
      view.setInt16(4 + i * 4,     grp.resID,   false);
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

function parseObjectTypeDefinition(data: Uint8Array): ObjectTypeDefinition | null {
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

function serializeObjectTypeDefinition(def: ObjectTypeDefinition, baseData?: Uint8Array): Uint8Array {
  const out = baseData && baseData.length >= OBJECT_TYPE_SIZE
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

function parseObjectGroupDefinition(data: Uint8Array): ObjectGroupDefinition | null {
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

function serializeObjectGroupDefinition(group: ObjectGroupDefinition): Uint8Array {
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

export function extractObjectGroupDefinitions(resources: ResourceDatEntry[]): ObjectGroupDefinition[] {
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

export function serializeLevelRoadSegs(
  rawEntry1: Uint8Array,
  roadSegs: { v0: number; v1: number; v2: number; v3: number }[],
): Uint8Array {
  const view = new DataView(rawEntry1.buffer, rawEntry1.byteOffset, rawEntry1.byteLength);
  let pos = LEVEL_DATA_SIZE;
  const trackUpCount   = view.getUint32(pos, false);  pos += 4 + trackUpCount   * TRACK_SEG_SIZE;
  const trackDownCount = view.getUint32(pos, false);  pos += 4 + trackDownCount * TRACK_SEG_SIZE;
  const objCount       = view.getUint32(pos, false);  pos += 4 + objCount       * OBJECT_POS_SIZE;

  // pos now points to road segment count
  const roadStart = pos;
  const oldRoadCount = pos + 4 <= rawEntry1.length ? view.getUint32(pos, false) : 0;
  const afterStart   = roadStart + 4 + oldRoadCount * ROAD_SEG_SIZE;

  const before = rawEntry1.slice(0, roadStart);
  const after  = rawEntry1.slice(afterStart);

  const newRoadBlock = new Uint8Array(4 + roadSegs.length * ROAD_SEG_SIZE);
  const bv = new DataView(newRoadBlock.buffer);
  bv.setUint32(0, roadSegs.length, false);
  for (let i = 0; i < roadSegs.length; i++) {
    const o = 4 + i * ROAD_SEG_SIZE;
    bv.setInt16(o,     roadSegs[i].v0, false);
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

        const parseResult = parseLevelEntry(e1.data);
        if (parseResult.isErr()) {
          console.warn(`[LevelEditor] parse error for Pack #${entry.id}:`, parseResult.error);
          continue;
        }
        const partial = parseResult.value;
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

  applyRoadInfoData(
    resources: ResourceDatEntry[],
    roadInfoId: number,
    roadInfo: RoadInfoData,
  ): ResourceDatEntry[] {
    return resources.map((res) => {
      if (res.type !== 'Pack' || res.id !== ROAD_PACK_ID) return res;
      try {
        const packEntries = parsePackHandle(res.data, res.id);
        const newData = serializeRoadInfoData(roadInfo);
        const newEntries = packEntries.some((entry) => entry.id === roadInfoId)
          ? packEntries.map((entry) => (entry.id === roadInfoId ? { ...entry, data: newData } : entry))
          : [...packEntries, { id: roadInfoId, data: newData }];
        newEntries.sort((a, b) => a.id - b.id);
        return { ...res, data: encodePackHandle(newEntries, ROAD_PACK_ID) };
      } catch (err) {
        console.error(`[LevelEditor] applyRoadInfoData error id=${roadInfoId}:`, err);
        return res;
      }
    });
  }

  removeRoadInfoData(
    resources: ResourceDatEntry[],
    roadInfoId: number,
  ): ResourceDatEntry[] {
    return resources.map((res) => {
      if (res.type !== 'Pack' || res.id !== ROAD_PACK_ID) return res;
      try {
        const packEntries = parsePackHandle(res.data, res.id);
        if (!packEntries.some((entry) => entry.id === roadInfoId)) return res;
        const newEntries = packEntries
          .filter((entry) => entry.id !== roadInfoId)
          .sort((a, b) => a.id - b.id);
        return { ...res, data: encodePackHandle(newEntries, ROAD_PACK_ID) };
      } catch (err) {
        console.error(`[LevelEditor] removeRoadInfoData error id=${roadInfoId}:`, err);
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

  applyLevelRoadSegs(
    resources: ResourceDatEntry[],
    resourceId: number,
    roadSegs: { v0: number; v1: number; v2: number; v3: number }[],
  ): ResourceDatEntry[] {
    return resources.map((res) => {
      if (res.type !== 'Pack' || res.id !== resourceId) return res;
      try {
        const packEntries = parsePackHandle(res.data, res.id);
        const e1 = packEntries.find((e) => e.id === 1);
        if (!e1) return res;
        const newData    = serializeLevelRoadSegs(e1.data, roadSegs);
        const newEntries = packEntries.map((e) => e.id === 1 ? { ...e, data: newData } : e);
        return { ...res, data: encodePackHandle(newEntries, resourceId) };
      } catch (err) {
        console.error(`[LevelEditor] applyLevelRoadSegs error id=${resourceId}:`, err);
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
        const def = parseObjectTypeDefinition(entry.data);
        if (!def) continue;
        defs.set(entry.id, { ...def, typeRes: entry.id });
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
   * Write edited RGBA8888 pixels back into the sprite pack.
   * Pack 137 uses 16-bit RGB555 pixels; Pack 129 uses 8-bit indexed pixels.
   */
  applySpritePackPixels(
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
        const log2xSize = entry.data[4];
        const stride = 1 << log2xSize;
        if (width <= 0 || height <= 0 || stride <= 0) return res;
        const newData = entry.data.slice();
        const newView = new DataView(newData.buffer, newData.byteOffset, newData.byteLength);
        const maskValue = bitDepth === 16
          ? view.getUint16(SPRITE_HEADER_SIZE, false)
          : newData[SPRITE_HEADER_SIZE]; // transparent colour unchanged
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            const srcI = (y * width + x) * 4;
            const a = pixels[srcI + 3];
            if (a === 0) {
              // transparent – restore mask value
              if (bitDepth === 16) {
                const dstOffset = SPRITE_HEADER_SIZE + (y * stride + x) * 2;
                if (dstOffset + 2 > newData.length) continue;
                newView.setUint16(dstOffset, maskValue, false);
              } else {
                const dstOffset = SPRITE_HEADER_SIZE + y * stride + x;
                if (dstOffset >= newData.length) continue;
                newData[dstOffset] = maskValue;
              }
            } else {
              if (bitDepth === 16) {
                const rgb = rgbaToRgb555(pixels[srcI], pixels[srcI + 1], pixels[srcI + 2]);
                // Flip the LSB to create a visually similar but distinct RGB555 value so it won't
                // be misidentified as the transparent mask colour by the game renderer.
                const safe = rgb === maskValue ? (rgb ^ 1) : rgb;
                const dstOffset = SPRITE_HEADER_SIZE + (y * stride + x) * 2;
                if (dstOffset + 2 > newData.length) continue;
                newView.setUint16(dstOffset, safe, false);
              } else {
                const idx = rgbaToMacPaletteIndex(pixels[srcI], pixels[srcI + 1], pixels[srcI + 2]);
                const safe = idx === maskValue ? ((idx + 1) & 0xff) : idx;
                const dstOffset = SPRITE_HEADER_SIZE + y * stride + x;
                if (dstOffset >= newData.length) continue;
                newData[dstOffset] = safe;
              }
            }
          }
        }
        const newEntries = packEntries.map((e) => e.id === frameId ? { ...e, data: newData } : e);
        return { ...res, data: encodePackHandle(newEntries, packId) };
      } catch (err) {
        console.warn('[LevelEditor] applySpritePackPixels error:', err);
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
        if (entry.data.length < ROAD_INFO_SIZE) continue;
        const view = new DataView(entry.data.buffer, entry.data.byteOffset, entry.data.byteLength);
        result.set(entry.id, {
          id: entry.id,
          friction: view.getFloat32(RI_OFFSET_FRICTION, false),
          airResistance: view.getFloat32(RI_OFFSET_AIR_RESIST, false),
          backResistance: view.getFloat32(RI_OFFSET_BACK_RES, false),
          tolerance: view.getUint16(RI_OFFSET_TOLERANCE, false),
          marks: view.getInt16(RI_OFFSET_MARKS, false),
          deathOffs: view.getInt16(RI_OFFSET_DEATH_OFFS, false),
          backgroundTex:  view.getInt16(RI_OFFSET_BG_TEX,    false),
          foregroundTex:  view.getInt16(RI_OFFSET_FG_TEX,    false),
          roadLeftBorder: view.getInt16(RI_OFFSET_LEFT_BORD, false),
          roadRightBorder: view.getInt16(RI_OFFSET_RIGHT_BORD, false),
          tracks: view.getInt16(RI_OFFSET_TRACKS, false),
          skidSound: view.getInt16(RI_OFFSET_SKID_SND, false),
          filler: view.getInt16(RI_OFFSET_FILLER, false),
          xDrift: view.getFloat32(RI_OFFSET_X_DRIFT, false),
          yDrift: view.getFloat32(RI_OFFSET_Y_DRIFT, false),
          xFrontDrift: view.getFloat32(RI_OFFSET_X_FRONT, false),
          yFrontDrift: view.getFloat32(RI_OFFSET_Y_FRONT, false),
          trackSlide: view.getFloat32(RI_OFFSET_TRACK_SLIDE, false),
          dustSlide: view.getFloat32(RI_OFFSET_DUST_SLIDE, false),
          dustColor: view.getUint8(RI_OFFSET_DUST_COLOR),
          water: entry.data[RI_OFFSET_WATER] !== 0,
          filler2: view.getUint16(RI_OFFSET_FILLER2, false),
          slideFriction: view.getFloat32(RI_OFFSET_SLIDE_FRICTION, false),
        });
      }
    } catch (err) {
      console.warn('[LevelEditor] extractRoadInfos error:', err);
    }
    return result;
  }

  /**
   * Decode ALL textures from kPackTx16 (Pack ID 136) regardless of which road
   * info entries reference them.  Used by the tile editor to list every tile.
   */
  extractAllRoadTextures(resources: ResourceDatEntry[]): DecodedRoadTexture[] {
    const pack = resources.find((e) => e.type === 'Pack' && e.id === TX16_PACK_ID);
    if (!pack) return [];
    try {
      const entries = parsePackHandle(pack.data, pack.id);
      const allIds = entries.map((e) => e.id);
      return this.extractRoadTextures(resources, allIds);
    } catch {
      return [];
    }
  }

  /**
   * Write edited RGBA8888 pixels back into a kPackTx16 tile entry.
   * The tile format is raw big-endian RGB555 with no header; dimensions are
   * inferred from the existing data length exactly as in extractRoadTextures.
   */
  applyTile16Pixels(
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

        // Infer dimensions the same way as extractRoadTextures.
        const pixelCount = entry.data.length / 2;
        let w: number, h: number;
        if (pixelCount === BORDER_TEX_W * BORDER_TEX_H) {
          w = BORDER_TEX_W; h = BORDER_TEX_H;
        } else {
          w = Math.round(Math.sqrt(pixelCount));
          h = pixelCount / w;
        }

        const newData = entry.data.slice();
        const newView = new DataView(newData.buffer, newData.byteOffset, newData.byteLength);
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const srcI = (y * w + x) * 4;
            const dstOffset = (y * w + x) * 2;
            if (dstOffset + 2 > newData.length) continue;
            const rgb = rgbaToRgb555(pixels[srcI], pixels[srcI + 1], pixels[srcI + 2]);
            newView.setUint16(dstOffset, rgb, false);
          }
        }
        const newEntries = packEntries.map((e) => e.id === texId ? { ...e, data: newData } : e);
        return { ...res, data: encodePackHandle(newEntries, res.id) };
      } catch (err) {
        console.warn('[LevelEditor] applyTile16Pixels error:', err);
        return res;
      }
    });
  }

  /** Remove a single tile entry from kPackTx16 (Pack ID 136). */
  removeTile16Texture(resources: ResourceDatEntry[], texId: number): ResourceDatEntry[] {
    return removePackEntryRaw(resources, TX16_PACK_ID, texId);
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

export function applyObjectTypeDefinitions(
  resources: ResourceDatEntry[],
  objectTypes: ObjectTypeDefinition[],
): ResourceDatEntry[] {
  return resources.map((res) => {
    if (res.type !== 'Pack' || res.id !== OBJECT_TYPES_PACK_ID) return res;
    try {
      const packEntries = parsePackHandle(res.data, res.id);
      const existingById = new Map(packEntries.map((entry) => [entry.id, entry.data] as const));
      const newEntries = [...objectTypes]
        .sort((a, b) => a.typeRes - b.typeRes)
        .map((def) => ({
          id: def.typeRes,
          data: serializeObjectTypeDefinition(def, existingById.get(def.typeRes)),
        }));
      return { ...res, data: encodePackHandle(newEntries, OBJECT_TYPES_PACK_ID) };
    } catch (err) {
      console.error('[LevelEditor] applyObjectTypeDefinitions error:', err);
      return res;
    }
  });
}

// ------------------------------------------------------------------
// Raw resource accessor helpers (used by the resource browser tab)
// ------------------------------------------------------------------

/**
 * Return raw byte payload for the given resource (type + id), or null if not found.
 * The returned slice is a copy so mutations don't affect the live state.
 */
export function getRawResource(
  resources: ResourceDatEntry[],
  type: string,
  id: number,
): Uint8Array | null {
  const entry = resources.find((e) => e.type === type && e.id === id);
  return entry ? entry.data.slice() : null;
}

/**
 * Replace the raw byte payload for the given resource (type + id).
 * If the entry doesn't exist, it is appended at the end.
 * Returns a new resources array (immutable update pattern).
 */
export function putRawResource(
  resources: ResourceDatEntry[],
  type: string,
  id: number,
  data: Uint8Array,
): ResourceDatEntry[] {
  const idx = resources.findIndex((e) => e.type === type && e.id === id);
  const newEntry: ResourceDatEntry = { type, id, data: data.slice() };
  if (idx === -1) {
    return [...resources, newEntry];
  }
  return resources.map((e, i) => (i === idx ? newEntry : e));
}

/** Return a summary list of all resources (no payloads – just metadata). */
export function listResources(
  resources: ResourceDatEntry[],
): { type: string; id: number; size: number }[] {
  return resources.map((e) => ({ type: e.type, id: e.id, size: e.data.byteLength }));
}

/**
 * Parse a Mac OS 'STR#' resource into an array of Pascal strings.
 * Format: UInt16BE count, then `count` Pascal strings (UInt8 length prefix + bytes).
 */
export function parseStrList(data: Uint8Array): string[] {
  if (data.length < 2) return [];
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const count = view.getUint16(0, false); // big-endian
  const strings: string[] = [];
  let offset = 2;
  for (let i = 0; i < count; i++) {
    if (offset >= data.length) break;
    const len = data[offset++];
    const bytes = data.slice(offset, offset + len);
    // Decode as Latin-1 (Mac Roman) — iterate to avoid spread stack overflow on large strings
    let s = '';
    for (let j = 0; j < bytes.length; j++) s += String.fromCharCode(bytes[j]);
    strings.push(s);
    offset += len;
  }
  return strings;
}

/**
 * Encode an array of strings back into Mac OS 'STR#' binary format.
 */
export function encodeStrList(strings: string[]): Uint8Array {
  let totalBytes = 2; // UInt16 count
  for (const s of strings) totalBytes += 1 + Math.min(255, s.length);
  const buf = new Uint8Array(totalBytes);
  const view = new DataView(buf.buffer);
  view.setUint16(0, strings.length, false);
  let offset = 2;
  for (const s of strings) {
    const len = Math.min(255, s.length);
    buf[offset++] = len;
    for (let i = 0; i < len; i++) {
      buf[offset++] = s.charCodeAt(i) & 0xff;
    }
  }
  return buf;
}

/**
 * List the entry IDs within a single Pack resource.
 * Returns null if the pack doesn't exist or can't be parsed.
 */
export function listPackEntries(
  resources: ResourceDatEntry[],
  packId: number,
): { id: number; size: number }[] | null {
  const pack = resources.find((e) => e.type === 'Pack' && e.id === packId);
  if (!pack) return null;
  try {
    const entries = parsePackHandle(pack.data, packId);
    return entries.map((e) => ({ id: e.id, size: e.data.byteLength }));
  } catch {
    return null;
  }
}

/**
 * Return raw bytes for a single entry within a Pack resource.
 */
export function getPackEntryRaw(
  resources: ResourceDatEntry[],
  packId: number,
  entryId: number,
): Uint8Array | null {
  const pack = resources.find((e) => e.type === 'Pack' && e.id === packId);
  if (!pack) return null;
  try {
    const entries = parsePackHandle(pack.data, packId);
    const entry = entries.find((e) => e.id === entryId);
    return entry ? entry.data.slice() : null;
  } catch {
    return null;
  }
}

/**
 * Replace a single entry inside a Pack resource with new raw bytes.
 * If the entry doesn't exist it is appended.
 * Returns a new resources array.
 */
export function putPackEntryRaw(
  resources: ResourceDatEntry[],
  packId: number,
  entryId: number,
  data: Uint8Array,
): ResourceDatEntry[] {
  const pack = resources.find((e) => e.type === 'Pack' && e.id === packId);
  if (!pack) return resources;
  try {
    const entries = parsePackHandle(pack.data, packId);
    const newEntries = entries.some((e) => e.id === entryId)
      ? entries.map((e) => (e.id === entryId ? { ...e, data: data.slice() } : e))
      : [...entries, { id: entryId, data: data.slice() }];
    const newPackData = encodePackHandle(newEntries, packId);
    return resources.map((e) =>
      e.type === 'Pack' && e.id === packId ? { ...e, data: newPackData } : e,
    );
  } catch {
    return resources;
  }
}

/**
 * Remove a single entry from a Pack resource.
 * Returns the original resources array unchanged if the pack or entry is missing.
 */
export function removePackEntryRaw(
  resources: ResourceDatEntry[],
  packId: number,
  entryId: number,
): ResourceDatEntry[] {
  const pack = resources.find((e) => e.type === 'Pack' && e.id === packId);
  if (!pack) return resources;
  try {
    const entries = parsePackHandle(pack.data, packId);
    if (!entries.some((e) => e.id === entryId)) return resources;
    const newEntries = entries.filter((e) => e.id !== entryId);
    const newPackData = encodePackHandle(newEntries, packId);
    return resources.map((e) =>
      e.type === 'Pack' && e.id === packId ? { ...e, data: newPackData } : e,
    );
  } catch {
    return resources;
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
