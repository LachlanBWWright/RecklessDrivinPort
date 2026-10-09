import type { ResourceDatEntry } from './resource-dat.service';
import { parsePackHandle, encodePackHandle } from './pack-parser.service';
export {
  encodeStrList,
  getPackEntryRaw,
  getRawResource,
  listPackEntries,
  listResources,
  parseStrList,
  putPackEntryRaw,
  putRawResource,
  removePackEntryRaw,
} from './resource-accessors';
import { removePackEntryRaw } from './resource-accessors';
import { replacePackEntry, updatePackResource } from './level-pack-editing';
import type {
  ObjectPos,
  MarkSeg,
  LevelProperties,
  ParsedLevel,
  EditableLevel,
  EditableSpriteAsset,
  ObjectTypeDefinition,
  LevelScriptBinding,
  ScriptBinding,
  ScriptDefinition,
  DecodedSpriteFrame,
  RoadInfoData,
  DecodedRoadTexture,
} from './level-editor.types';
import {
  LEVEL_SCRIPT_BINDINGS_RESOURCE_ID,
  LEVEL_SCRIPT_BINDINGS_RESOURCE_TYPE,
  SCRIPT_BINDINGS_RESOURCE_ID,
  SCRIPT_BINDINGS_RESOURCE_TYPE,
  SCRIPT_RESOURCE_TYPE,
  parseLevelScriptBindings,
  parseScriptBindings,
  parseScriptDefinition,
} from './script-format';
export type {
  ObjectGroupRef,
  ObjectGroupEntryData,
  ObjectGroupDefinition,
  ObjectGroupSpawnPreviewObject,
  TrackSeg,
  ObjectPos,
  RoadSeg,
  MarkSeg,
  TrackWaypointRef,
  TrackMidpointRef,
  LevelProperties,
  ParsedLevel,
  EditableLevel,
  EditableSpriteAsset,
  ObjectTypeDefinition,
  LevelScriptBinding,
  ScriptBinding,
  ScriptDefinition,
  ScriptHookId,
  ScriptValidationIssue,
  DecodedSpriteFrame,
  RoadInfoData,
  RoadInfoOption,
  TextureTileEntry,
  RoadTileGroup,
  DecodedRoadTexture,
} from './level-editor.types';
import {
  LEVEL_RESOURCE_IDS,
  ENCRYPTED_LEVEL_IDS,
  OBJECT_TYPES_PACK_ID,
  SPRITE_PACK_8_ID,
  SPRITE_PACK_16_ID,
  SPRITE_HEADER_SIZE,
  ROAD_PACK_ID,
  TX16_PACK_ID,
  ROAD_INFO_SIZE,
  RI_OFFSET_FRICTION,
  RI_OFFSET_AIR_RESIST,
  RI_OFFSET_BACK_RES,
  RI_OFFSET_TOLERANCE,
  RI_OFFSET_MARKS,
  RI_OFFSET_DEATH_OFFS,
  RI_OFFSET_BG_TEX,
  RI_OFFSET_FG_TEX,
  RI_OFFSET_LEFT_BORD,
  RI_OFFSET_RIGHT_BORD,
  RI_OFFSET_TRACKS,
  RI_OFFSET_SKID_SND,
  RI_OFFSET_FILLER,
  RI_OFFSET_X_DRIFT,
  RI_OFFSET_Y_DRIFT,
  RI_OFFSET_X_FRONT,
  RI_OFFSET_Y_FRONT,
  RI_OFFSET_TRACK_SLIDE,
  RI_OFFSET_DUST_SLIDE,
  RI_OFFSET_DUST_COLOR,
  RI_OFFSET_WATER,
  RI_OFFSET_FILLER2,
  RI_OFFSET_SLIDE_FRICTION,
  BORDER_TEX_W,
  BORDER_TEX_H,
  RGB5_SCALE,
  rgbaToRgb555,
  parseLevelEntry,
  parseMarkSegs,
  serializeLevelProperties,
  serializeRoadInfoData,
  parseObjectTypeDefinition,
  serializeLevelTrack,
  serializeLevelObjects,
  serializeLevelRoadSegs,
} from './level-editor-binary-codecs';
export {
  applyObjectTypeDefinitions,
  applyScriptResources,
  stripScriptResources,
  serializeMarkSegs,
  extractScriptResources,
} from './level-editor-resource-editing';
import { SpriteFrameDecoder } from './level-editor-sprite-decoder';
export * from './level-editor-binary-codecs';
export class LevelEditorService {
  private readonly spriteDecoder = new SpriteFrameDecoder();
  extractParsedLevels(resources: ResourceDatEntry[]): ParsedLevel[] {
    const levels: ParsedLevel[] = [];
    for (const entry of resources) {
      if (entry.type !== 'Pack' || !LEVEL_RESOURCE_IDS.includes(entry.id)) continue;
      try {
        const packEntries = parsePackHandle(entry.data, entry.id);
        const e1 = packEntries.find((e) => e.id === 1);
        const e2 = packEntries.find((e) => e.id === 2);
        if (!e1) continue;
        const partial = parseLevelEntry(e1.data).match(
          (value) => value,
          (error) => {
            console.warn(`[LevelEditor] parse error for Pack #${entry.id}:`, error);
            return null;
          },
        );
        if (!partial) continue;
        const marks = e2 ? parseMarkSegs(e2.data) : [];
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
    return updatePackResource(resources, resourceId, 'applyLevelProperties', (entries) => {
      const entry = entries.find((item) => item.id === 1);
      return entry
        ? replacePackEntry(entries, 1, serializeLevelProperties(entry.data, props))
        : null;
    });
  }
  applyRoadInfoData(
    resources: ResourceDatEntry[],
    roadInfoId: number,
    roadInfo: RoadInfoData,
  ): ResourceDatEntry[] {
    return updatePackResource(resources, ROAD_PACK_ID, 'applyRoadInfoData', (entries) => {
      const data = serializeRoadInfoData(roadInfo);
      const next = entries.some((entry) => entry.id === roadInfoId)
        ? entries.map((entry) => (entry.id === roadInfoId ? { ...entry, data } : entry))
        : [...entries, { id: roadInfoId, data }];
      return next.sort((a, b) => a.id - b.id);
    });
  }
  removeRoadInfoData(resources: ResourceDatEntry[], roadInfoId: number): ResourceDatEntry[] {
    return updatePackResource(resources, ROAD_PACK_ID, 'removeRoadInfoData', (entries) =>
      entries.some((entry) => entry.id === roadInfoId)
        ? entries.filter((entry) => entry.id !== roadInfoId).sort((a, b) => a.id - b.id)
        : null,
    );
  }
  applyLevelObjects(
    resources: ResourceDatEntry[],
    resourceId: number,
    objects: ObjectPos[],
  ): ResourceDatEntry[] {
    return updatePackResource(resources, resourceId, 'applyLevelObjects', (entries) => {
      const entry = entries.find((item) => item.id === 1);
      return entry
        ? replacePackEntry(entries, 1, serializeLevelObjects(entry.data, objects))
        : null;
    });
  }
  applyLevelTrack(
    resources: ResourceDatEntry[],
    resourceId: number,
    trackUp: { x: number; y: number; flags: number; velo: number }[],
    trackDown: { x: number; y: number; flags: number; velo: number }[],
  ): ResourceDatEntry[] {
    return updatePackResource(resources, resourceId, 'applyLevelTrack', (entries) => {
      const entry = entries.find((item) => item.id === 1);
      return entry
        ? replacePackEntry(entries, 1, serializeLevelTrack(entry.data, trackUp, trackDown))
        : null;
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
        const newData = serializeLevelRoadSegs(e1.data, roadSegs);
        const newEntries = packEntries.map((e) => (e.id === 1 ? { ...e, data: newData } : e));
        return { ...res, data: encodePackHandle(newEntries, resourceId) };
      } catch (err) {
        console.error(`[LevelEditor] applyLevelRoadSegs error id=${resourceId}:`, err);
        return res;
      }
    });
  }
  extractLevels(resources: ResourceDatEntry[]): EditableLevel[] {
    return resources
      .filter((e) => e.type === 'Pack' && LEVEL_RESOURCE_IDS.includes(e.id))
      .sort((a, b) => a.id - b.id)
      .map((entry) => ({
        resourceId: entry.id,
        width: 16,
        height: 16,
        tiles: this.spriteDecoder.toTiles(entry.data),
      }));
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
  extractSpriteAssets(resources: ResourceDatEntry[]): EditableSpriteAsset[] {
    return resources
      .filter((e) => e.type === 'PPic')
      .map((e) => ({ id: e.id, type: e.type, size: e.data.length }))
      .sort((a, b) => a.id - b.id);
  }
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
  decodeAllSpriteFrames(
    resources: ResourceDatEntry[],
  ): { id: number; bitDepth: 8 | 16; width: number; height: number; pixels: ArrayBuffer }[] {
    const result: {
      id: number;
      bitDepth: 8 | 16;
      width: number;
      height: number;
      pixels: ArrayBuffer;
    }[] = [];
    const decodeFromPack = (packId: number, bitDepth: 8 | 16) => {
      const pack = resources.find((e) => e.type === 'Pack' && e.id === packId);
      if (!pack) return;
      try {
        const entries = parsePackHandle(pack.data, pack.id);
        for (const entry of entries) {
          if (entry.data.length < SPRITE_HEADER_SIZE) continue;
          const decoded = this.decodeSpriteEntry(entry.data, entry.id, bitDepth);
          if (!decoded) continue;
          const buf = new ArrayBuffer(decoded.pixels.byteLength);
          new Uint8Array(buf).set(decoded.pixels);
          result.push({
            id: entry.id,
            bitDepth,
            width: decoded.width,
            height: decoded.height,
            pixels: buf,
          });
        }
      } catch (err) {
        console.warn(`[LevelEditor] decodeAllSpriteFrames pack ${packId} error:`, err);
      }
    };
    decodeFromPack(SPRITE_PACK_16_ID, 16);
    return result;
  }

  private decodeSpriteEntry(
    data: Uint8Array,
    id: number,
    bitDepth: 8 | 16,
  ): DecodedSpriteFrame | null {
    if (bitDepth === 16) return this.spriteDecoder.decode16BitSprite(data, id);
    return this.spriteDecoder.decode8BitSprite(data, id);
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
  extractScriptDefinitions(resources: ResourceDatEntry[]): Map<number, ScriptDefinition> {
    const scripts = new Map<number, ScriptDefinition>();
    for (const resource of resources) {
      if (resource.type !== SCRIPT_RESOURCE_TYPE) continue;
      parseScriptDefinition(resource.id, resource.data).match(
        (parsed) => {
          scripts.set(resource.id, parsed);
        },
        (error) => {
          console.warn('[LevelEditor] failed to parse script definition:', error);
        },
      );
    }
    return scripts;
  }
  extractScriptBindings(resources: ResourceDatEntry[]): ScriptBinding[] {
    const resource = resources.find(
      (entry) =>
        entry.type === SCRIPT_BINDINGS_RESOURCE_TYPE && entry.id === SCRIPT_BINDINGS_RESOURCE_ID,
    );
    if (!resource) return [];
    return parseScriptBindings(resource.data).match(
      (bindings) => bindings,
      (error) => {
        console.warn('[LevelEditor] failed to parse script bindings:', error);
        return [];
      },
    );
  }
  extractLevelScriptBindings(resources: ResourceDatEntry[]): LevelScriptBinding[] {
    const resource = resources.find(
      (entry) =>
        entry.type === LEVEL_SCRIPT_BINDINGS_RESOURCE_TYPE &&
        entry.id === LEVEL_SCRIPT_BINDINGS_RESOURCE_ID,
    );
    if (!resource) return [];
    return parseLevelScriptBindings(resource.data).match(
      (bindings) => bindings,
      (error) => {
        console.warn('[LevelEditor] failed to parse level script bindings:', error);
        return [];
      },
    );
  }
  decodeSpriteFrame(resources: ResourceDatEntry[], frameId: number): DecodedSpriteFrame | null {
    return this.spriteDecoder.decodeSpriteFrame(resources, frameId);
  }
  batchDecodeSpriteFrames(
    resources: ResourceDatEntry[],
    frameIds: number[],
  ): Map<number, DecodedSpriteFrame> {
    return this.spriteDecoder.batchDecodeSpriteFrames(resources, frameIds);
  }
  applySpriteByte(
    resources: ResourceDatEntry[],
    spriteId: number,
    offset: number,
    value: number,
  ): ResourceDatEntry[] {
    return this.spriteDecoder.applySpriteByte(resources, spriteId, offset, value);
  }
  getSpriteBytes(resources: ResourceDatEntry[], spriteId: number): Uint8Array | null {
    return this.spriteDecoder.getSpriteBytes(resources, spriteId);
  }
  applySpritePackPixels(
    resources: ResourceDatEntry[],
    frameId: number,
    bitDepth: 8 | 16,
    pixels: Uint8ClampedArray,
  ): ResourceDatEntry[] {
    return this.spriteDecoder.applySpritePackPixels(resources, frameId, bitDepth, pixels);
  }
  applyLevelMarks(
    resources: ResourceDatEntry[],
    resourceId: number,
    marks: MarkSeg[],
  ): ResourceDatEntry[] {
    return this.spriteDecoder.applyLevelMarks(resources, resourceId, marks);
  }

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
          backgroundTex: view.getInt16(RI_OFFSET_BG_TEX, false),
          foregroundTex: view.getInt16(RI_OFFSET_FG_TEX, false),
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
        const pixelCount = entry.data.length / 2;
        let w: number, h: number;
        if (pixelCount === BORDER_TEX_W * BORDER_TEX_H) {
          w = BORDER_TEX_W;
          h = BORDER_TEX_H;
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
        const newEntries = packEntries.map((e) => (e.id === texId ? { ...e, data: newData } : e));
        return { ...res, data: encodePackHandle(newEntries, res.id) };
      } catch (err) {
        console.warn('[LevelEditor] applyTile16Pixels error:', err);
        return res;
      }
    });
  }
  removeTile16Texture(resources: ResourceDatEntry[], texId: number): ResourceDatEntry[] {
    return removePackEntryRaw(resources, TX16_PACK_ID, texId);
  }
  extractRoadTextures(resources: ResourceDatEntry[], neededTexIds: number[]): DecodedRoadTexture[] {
    const result: DecodedRoadTexture[] = [];
    const pack = resources.find((e) => e.type === 'Pack' && e.id === TX16_PACK_ID);
    if (!pack) return result;
    try {
      const entries = parsePackHandle(pack.data, pack.id);
      const entryMap = new Map(entries.map((e) => [e.id, e.data]));
      for (const texId of neededTexIds) {
        const data = entryMap.get(texId);
        if (!data || data.length < 2) continue;
        let w: number, h: number;
        const pixelCount = data.length / 2;
        if (pixelCount === BORDER_TEX_W * BORDER_TEX_H) {
          w = BORDER_TEX_W;
          h = BORDER_TEX_H;
        } else {
          w = Math.round(Math.sqrt(pixelCount));
          h = pixelCount / w;
        }
        const pixels = new Uint8ClampedArray(w * h * 4);
        const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
        for (let i = 0; i < w * h; i++) {
          const pv = view.getUint16(i * 2, false); // big-endian RGB555
          pixels[i * 4] = Math.round(((pv >> 10) & 0x1f) * RGB5_SCALE);
          pixels[i * 4 + 1] = Math.round(((pv >> 5) & 0x1f) * RGB5_SCALE);
          pixels[i * 4 + 2] = Math.round((pv & 0x1f) * RGB5_SCALE);
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
