/**
 * LevelEditorService
 *
 * Parses and serializes Reckless Drivin' level pack entries.
 *
 * Sub-modules:
 *   level-editor-colors.ts          — colour conversion helpers
 *   level-editor-sprites.ts         — sprite pack decoding / encoding
 *   level-editor-road.ts            — road texture extraction
 *   level-editor-road-serializer.ts — road info serialization
 *   level-editor-object-types.ts    — object type / group codec
 *   level-editor-serializers.ts     — level/track/objects/road serializers
 *   level-editor-resource-utils.ts  — raw resource / pack entry helpers
 */
import { ok, err, type Result } from 'neverthrow';
import type { ResourceDatEntry } from './resource-dat.service';
import { parsePackHandle, encodePackHandle } from './pack-parser.service';
import type {
  ObjectGroupRef, TrackSeg, ObjectPos, RoadSeg, MarkSeg,
  LevelProperties, ParsedLevel, EditableLevel,
} from './level-editor.types';

// Re-export all data-model types so callers keep their import path.
export type {
  ObjectGroupRef, ObjectGroupEntryData, ObjectGroupDefinition,
  TrackSeg, ObjectPos, RoadSeg, MarkSeg,
  TrackWaypointRef, TrackMidpointRef,
  LevelProperties, ParsedLevel, EditableLevel, EditableSpriteAsset,
  ObjectTypeDefinition, DecodedSpriteFrame,
  RoadInfoData, RoadInfoOption, TextureTileEntry, RoadTileGroup, DecodedRoadTexture,
} from './level-editor.types';

export { rgb565ToRgba, rgbaToRgb555 } from './level-editor-colors';
export {
  extractSpriteAssets, getAllSpriteFrameIds, decodeAllSpriteFrames,
  decodeSpriteFrame, batchDecodeSpriteFrames,
  applySpriteByte, getSpriteBytes, applySpritePackPixels,
  SPRITE_PACK_8_ID, SPRITE_PACK_16_ID,
} from './level-editor-sprites';
export {
  extractRoadInfos, extractAllRoadTextures, extractRoadTextures,
  applyTile16Pixels, ROAD_PACK_ID, TX16_PACK_ID,
} from './level-editor-road';
export { serializeRoadInfoData, applyRoadInfoData, removeRoadInfoData } from './level-editor-road-serializer';
export {
  extractObjectTypeDefinitions, applyObjectTypeDefinitions,
  extractObjectGroupDefinitions, applyObjectGroupDefinitions,
  OBJECT_TYPES_PACK_ID, OBJECT_GROUP_PACK_ID,
} from './level-editor-object-types';
export {
  serializeLevelProperties, serializeLevelTrack,
  serializeLevelObjects, serializeLevelRoadSegs,
} from './level-editor-serializers';
export {
  getRawResource, putRawResource, listResources,
  parseStrList, encodeStrList,
  listPackEntries, getPackEntryRaw, putPackEntryRaw, removePackEntryRaw,
} from './level-editor-resource-utils';

// Import concrete implementations for use inside this file and the class adapter.
import {
  extractSpriteAssets, getAllSpriteFrameIds, decodeAllSpriteFrames,
  decodeSpriteFrame, batchDecodeSpriteFrames,
  applySpriteByte, getSpriteBytes, applySpritePackPixels,
} from './level-editor-sprites';
import {
  extractRoadInfos, extractAllRoadTextures, extractRoadTextures,
  applyTile16Pixels, TX16_PACK_ID,
} from './level-editor-road';
import { applyRoadInfoData, removeRoadInfoData } from './level-editor-road-serializer';
import {
  extractObjectTypeDefinitions, applyObjectTypeDefinitions,
} from './level-editor-object-types';
import {
  serializeLevelProperties, serializeLevelTrack,
  serializeLevelObjects, serializeLevelRoadSegs,
} from './level-editor-serializers';
import { removePackEntryRaw } from './level-editor-resource-utils';

// ── Constants ─────────────────────────────────────────────────────────────
const LEVEL_RESOURCE_IDS  = Array.from({ length: 10 }, (_, i) => 140 + i);
const ENCRYPTED_LEVEL_IDS = new Set([143, 144, 145, 146, 147, 148, 149]);
const LEVEL_DATA_SIZE = 48;
const TRACK_SEG_SIZE  = 12;
const MARK_SEG_SIZE   = 16;
const T2D_POINT_SIZE  = 8;

// ── Level entry parser ────────────────────────────────────────────────────

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
  const roadInfo  = view.getInt16(pos, false);  pos += 2;
  const time      = view.getUint16(pos, false); pos += 2;
  const objectGroups: ObjectGroupRef[] = [];
  for (let i = 0; i < 10; i++) {
    objectGroups.push({ resID: view.getInt16(pos, false), numObjs: view.getInt16(pos + 2, false) });
    pos += 4;
  }
  const xStartPos = view.getInt16(pos, false);  pos += 2;
  const levelEnd  = view.getUint16(pos, false); pos += 2;

  const trackUpCount = view.getUint32(pos, false);  pos += 4;
  const trackUp: TrackSeg[] = [];
  for (let i = 0; i < trackUpCount && pos + TRACK_SEG_SIZE <= data.length; i++) {
    trackUp.push({ flags: view.getUint16(pos, false), x: view.getInt16(pos + 2, false),
      y: view.getInt32(pos + 4, false), velo: view.getFloat32(pos + 8, false) });
    pos += TRACK_SEG_SIZE;
  }
  const trackDownCount = view.getUint32(pos, false);  pos += 4;
  const trackDown: TrackSeg[] = [];
  for (let i = 0; i < trackDownCount && pos + TRACK_SEG_SIZE <= data.length; i++) {
    trackDown.push({ flags: view.getUint16(pos, false), x: view.getInt16(pos + 2, false),
      y: view.getInt32(pos + 4, false), velo: view.getFloat32(pos + 8, false) });
    pos += TRACK_SEG_SIZE;
  }
  const OBJECT_POS_SIZE = 16, ROAD_SEG_SIZE = 8;
  const objCount = pos + 4 <= data.length ? view.getUint32(pos, false) : 0;  pos += 4;
  const objects: ObjectPos[] = [];
  for (let i = 0; i < objCount && pos + OBJECT_POS_SIZE <= data.length; i++) {
    objects.push({ x: view.getInt32(pos, false), y: view.getInt32(pos + 4, false),
      dir: view.getFloat32(pos + 8, false), typeRes: view.getInt16(pos + 12, false) });
    pos += OBJECT_POS_SIZE;
  }
  const roadLen = pos + 4 <= data.length ? view.getUint32(pos, false) : 0;  pos += 4;
  const roadSegs: RoadSeg[] = [];
  for (let i = 0; i < roadLen && pos + ROAD_SEG_SIZE <= data.length; i++) {
    roadSegs.push({ v0: view.getInt16(pos, false), v1: view.getInt16(pos + 2, false),
      v2: view.getInt16(pos + 4, false), v3: view.getInt16(pos + 6, false) });
    pos += ROAD_SEG_SIZE;
  }
  return ok({ properties: { roadInfo, time, xStartPos, levelEnd, objectGroups }, objectGroups,
    trackUp, trackDown, objects, roadSegs, roadSegCount: roadLen, rawEntry1: data });
}

export function parseMarkSegs(data: Uint8Array): MarkSeg[] {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const count = Math.floor(data.length / MARK_SEG_SIZE);
  return Array.from({ length: count }, (_, i) => ({
    x1: view.getFloat32(i * MARK_SEG_SIZE, false),
    y1: view.getFloat32(i * MARK_SEG_SIZE + 4, false),
    x2: view.getFloat32(i * MARK_SEG_SIZE + T2D_POINT_SIZE, false),
    y2: view.getFloat32(i * MARK_SEG_SIZE + T2D_POINT_SIZE + 4, false),
  }));
}

export function serializeMarkSegs(marks: MarkSeg[]): Uint8Array {
  const buf = new Uint8Array(marks.length * 16);
  const view = new DataView(buf.buffer);
  for (let i = 0; i < marks.length; i++) {
    const o = i * 16;
    view.setFloat32(o, marks[i].x1, false);
    view.setFloat32(o + 4, marks[i].y1, false);
    view.setFloat32(o + 8, marks[i].x2, false);
    view.setFloat32(o + 12, marks[i].y2, false);
  }
  return buf;
}

// ── Level extraction / application ────────────────────────────────────────

export function extractParsedLevels(resources: ResourceDatEntry[]): ParsedLevel[] {
  const levels: ParsedLevel[] = [];
  for (const entry of resources) {
    if (entry.type !== 'Pack' || !LEVEL_RESOURCE_IDS.includes(entry.id)) continue;
    try {
      const packEntries = parsePackHandle(entry.data, entry.id);
      const e1 = packEntries.find((e) => e.id === 1);
      const e2 = packEntries.find((e) => e.id === 2);
      if (!e1) continue;
      const partial = parseLevelEntry(e1.data).match(
        (v) => v,
        (error) => { console.warn(`[LevelEditor] parse error Pack #${entry.id}:`, error); return null; },
      );
      if (!partial) continue;
      levels.push({ resourceId: entry.id, ...partial,
        marks: e2 ? parseMarkSegs(e2.data) : [],
        rawEntry2: e2?.data ?? new Uint8Array(0),
        encrypted: ENCRYPTED_LEVEL_IDS.has(entry.id) });
    } catch (e) {
      console.warn(`[LevelEditor] parse error Pack #${entry.id}:`, e);
    }
  }
  return levels.sort((a, b) => a.resourceId - b.resourceId);
}

function applyPackEntry1(
  resources: ResourceDatEntry[],
  resourceId: number,
  transform: (e1: Uint8Array) => Uint8Array,
  label: string,
): ResourceDatEntry[] {
  return resources.map((res) => {
    if (res.type !== 'Pack' || res.id !== resourceId) return res;
    try {
      const entries = parsePackHandle(res.data, res.id);
      const e1 = entries.find((e) => e.id === 1);
      if (!e1) return res;
      return { ...res, data: encodePackHandle(entries.map((e) => e.id === 1 ? { ...e, data: transform(e1.data) } : e), resourceId) };
    } catch (e) {
      console.error(`[LevelEditor] ${label} error id=${resourceId}:`, e);
      return res;
    }
  });
}

export function applyLevelProperties(
  resources: ResourceDatEntry[], resourceId: number, props: LevelProperties,
): ResourceDatEntry[] {
  return applyPackEntry1(resources, resourceId, (e1) => serializeLevelProperties(e1, props), 'applyLevelProperties');
}

export function applyLevelObjects(
  resources: ResourceDatEntry[], resourceId: number, objects: ObjectPos[],
): ResourceDatEntry[] {
  return applyPackEntry1(resources, resourceId, (e1) => serializeLevelObjects(e1, objects), 'applyLevelObjects');
}

export function applyLevelTrack(
  resources: ResourceDatEntry[], resourceId: number,
  trackUp: { x: number; y: number; flags: number; velo: number }[],
  trackDown: { x: number; y: number; flags: number; velo: number }[],
): ResourceDatEntry[] {
  return applyPackEntry1(resources, resourceId,
    (e1) => serializeLevelTrack(e1, trackUp, trackDown), 'applyLevelTrack');
}

export function applyLevelRoadSegs(
  resources: ResourceDatEntry[], resourceId: number,
  roadSegs: { v0: number; v1: number; v2: number; v3: number }[],
): ResourceDatEntry[] {
  return applyPackEntry1(resources, resourceId,
    (e1) => serializeLevelRoadSegs(e1, roadSegs), 'applyLevelRoadSegs');
}

export function applyLevelMarks(
  resources: ResourceDatEntry[], resourceId: number, marks: MarkSeg[],
): ResourceDatEntry[] {
  return resources.map((res) => {
    if (res.type !== 'Pack' || res.id !== resourceId) return res;
    try {
      const entries = parsePackHandle(res.data, res.id);
      const e2 = entries.find((e) => e.id === 2);
      const newData = serializeMarkSegs(marks);
      const newEntries = e2
        ? entries.map((e) => e.id === 2 ? { ...e, data: newData } : e)
        : [...entries, { id: 2, data: newData }];
      return { ...res, data: encodePackHandle(newEntries, resourceId) };
    } catch (e) {
      console.error(`[LevelEditor] applyLevelMarks error id=${resourceId}:`, e);
      return res;
    }
  });
}

// ── LevelEditorService: thin adapter (kept for pack.worker.ts + spec compat) ──
export class LevelEditorService {
  extractParsedLevels = extractParsedLevels;
  extractSpriteAssets = extractSpriteAssets;
  getAllSpriteFrameIds = getAllSpriteFrameIds;
  decodeAllSpriteFrames = decodeAllSpriteFrames;
  decodeSpriteFrame = decodeSpriteFrame;
  batchDecodeSpriteFrames = batchDecodeSpriteFrames;
  applySpriteByte = applySpriteByte;
  getSpriteBytes = getSpriteBytes;
  applySpritePackPixels = applySpritePackPixels;
  extractObjectTypeDefinitions = extractObjectTypeDefinitions;
  applyObjectTypeDefinitions = applyObjectTypeDefinitions;
  applyLevelProperties = applyLevelProperties;
  applyRoadInfoData = applyRoadInfoData;
  removeRoadInfoData = removeRoadInfoData;
  applyLevelObjects = applyLevelObjects;
  applyLevelTrack = applyLevelTrack;
  applyLevelRoadSegs = applyLevelRoadSegs;
  applyLevelMarks = applyLevelMarks;
  applyTile16Pixels = applyTile16Pixels;
  removeTile16Texture(resources: ResourceDatEntry[], texId: number): ResourceDatEntry[] {
    return removePackEntryRaw(resources, TX16_PACK_ID, texId);
  }
  extractRoadInfos = extractRoadInfos;
  extractAllRoadTextures = extractAllRoadTextures;
  extractRoadTextures = extractRoadTextures;

  extractLevels(resources: ResourceDatEntry[]): EditableLevel[] {
    return resources
      .filter((e) => e.type === 'Pack' && LEVEL_RESOURCE_IDS.includes(e.id))
      .sort((a, b) => a.id - b.id)
      .map((e) => ({ resourceId: e.id, width: 16, height: 16, tiles: toTiles(e.data) }));
  }
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
}

function toTiles(data: Uint8Array): number[] {
  return Array.from({ length: 256 }, (_, i) => (i < data.length ? data[i] & 0x0f : 0));
}
