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

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

function readBigFloat32(view: DataView, offset: number): number {
  return view.getFloat32(offset, false);
}

function writeBigFloat32(view: DataView, offset: number, value: number): void {
  view.setFloat32(offset, value, false);
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
      x1: view.getInt32(o,                    false),
      y1: view.getInt32(o + 4,                false),
      x2: view.getInt32(o + T2D_POINT_SIZE,   false),
      y2: view.getInt32(o + T2D_POINT_SIZE + 4, false),
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

  private toTiles(data: Uint8Array): number[] {
    const tiles: number[] = [];
    for (let i = 0; i < 256; i++) tiles.push(i < data.length ? data[i] & 0x0f : 0);
    return tiles;
  }
}
