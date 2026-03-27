/// <reference lib="webworker" />

/**
 * Pack Worker
 *
 * Runs LZRW3-A compression/decompression off the main thread so the UI
 * stays responsive while large resources.dat files are parsed or saved.
 *
 * Protocol
 * --------
 * Main → Worker:  { id: number, cmd: string, payload?: unknown }
 * Worker → Main:  { id: number, ok: boolean, cmd: string, result?: unknown, error?: string }
 *
 * Commands:
 *   LOAD                   payload: ArrayBuffer (raw resources.dat bytes)
 *   DECODE_SPRITE_PREVIEWS payload: { objectTypesArr: [number, ObjectTypeDefinition?][] }
 *   APPLY_PROPS            payload: { resourceId, props }
 *   APPLY_ROAD_INFO        payload: { roadInfoId, roadInfo }
 *   REMOVE_ROAD_INFO       payload: { roadInfoId }
 *   APPLY_OBJECTS          payload: { resourceId, objects }
 *   APPLY_OBJECT_TYPES     payload: { objectTypes }
 *   APPLY_TRACK            payload: { resourceId, trackUp, trackDown }
 *   APPLY_MARKS            payload: { resourceId, marks }
 *   APPLY_ROAD_SEGS        payload: { resourceId, roadSegs }
 *   APPLY_SPRITE_BYTE      payload: { spriteId, offset, value }
 *   APPLY_TILE16_PIXELS  payload: { texId: number; pixels: Uint8ClampedArray }
 *   APPLY_SPRITE_PACK_PIXELS payload: { frameId: number; bitDepth: 8 | 16; pixels: Uint8ClampedArray }
 *   DECODE_ALL_ROAD_TEXTURES (no payload) → { textures: DecodedRoadTexture[] }
 *   GET_SPRITE_BYTES       payload: { spriteId }
 *   SERIALIZE              (no payload)
 *   LIST_RESOURCES         (no payload) → { entries: {type,id,size}[] }
 *   GET_RESOURCE_RAW       payload: { type, id } → { bytes: ArrayBuffer | null }
 *   PUT_RESOURCE_RAW       payload: { type, id, bytes: ArrayBuffer }
 *   GET_STR_LIST           payload: { id } → { strings: string[] }
 *   PUT_STR_LIST           payload: { id, strings: string[] }
 *   LIST_PACK_ENTRIES      payload: { packId } → { entries: {id,size}[] | null }
 *   GET_PACK_ENTRY_RAW     payload: { packId, entryId } → { bytes: ArrayBuffer | null }
 *   PUT_PACK_ENTRY_RAW     payload: { packId, entryId, bytes: ArrayBuffer }
 */

import { ResourceDatService } from './resource-dat.service';
import { LevelEditorService } from './level-editor.service';
import {
  getRawResource, putRawResource, listResources,
  parseStrList, encodeStrList,
  listPackEntries, getPackEntryRaw, putPackEntryRaw,
  extractObjectGroupDefinitions, applyObjectGroupDefinitions,
  applyObjectTypeDefinitions,
} from './level-editor.service';
import type { ResourceDatEntry } from './resource-dat.service';
import type {
  LevelProperties,
  ObjectPos,
  MarkSeg,
  RoadSeg,
  ObjectTypeDefinition,
  DecodedRoadTexture,
  RoadInfoData,
  ObjectGroupDefinition,
} from './level-editor.service';

const resourceDatSvc = new ResourceDatService();
const levelEditorSvc = new LevelEditorService();

/** Mutable resources owned by this worker. */
let resources: ResourceDatEntry[] = [];

/**
 * Re-extract all display data after any mutation so the main thread always
 * gets fresh, consistent state.
 */
function extractAll(): {
  levels: ReturnType<typeof levelEditorSvc.extractParsedLevels>;
  sprites: ReturnType<typeof levelEditorSvc.extractSpriteAssets>;
  objectTypesArr: [number, ObjectTypeDefinition][];
  roadInfoArr: [number, RoadInfoData][];
  objectGroups: ObjectGroupDefinition[];
} {
  const objectTypesMap = levelEditorSvc.extractObjectTypeDefinitions(resources);
  const roadInfoMap = levelEditorSvc.extractRoadInfos(resources);
  return {
    levels: levelEditorSvc.extractParsedLevels(resources),
    sprites: levelEditorSvc.extractSpriteAssets(resources),
    objectTypesArr: [...objectTypesMap.entries()],
    roadInfoArr: [...roadInfoMap.entries()],
    objectGroups: extractObjectGroupDefinitions(resources),
  };
}

/**
 * Decode every object sprite.
 * Uses batchDecodeSpriteFrames so each sprite pack is decompressed only once.
 */
function decodeAllSpritePreviews(
  objectTypesArr: [number, ObjectTypeDefinition | undefined][],
): { typeRes: number; pixels: ArrayBuffer; width: number; height: number }[] {
  const result: { typeRes: number; pixels: ArrayBuffer; width: number; height: number }[] = [];

  const frameIds = [...new Set(
    objectTypesArr
      .map(([, def]) => def?.frame)
      .filter((f): f is number => f !== undefined),
  )];

  if (frameIds.length === 0) return result;

  const frameMap = levelEditorSvc.batchDecodeSpriteFrames(resources, frameIds);

  for (const [typeRes, objType] of objectTypesArr) {
    if (!objType) continue;
    const decoded = frameMap.get(objType.frame);
    if (decoded) {
      const buf = new ArrayBuffer(decoded.pixels.byteLength);
      new Uint8Array(buf).set(decoded.pixels);
      result.push({ typeRes, pixels: buf, width: decoded.width, height: decoded.height });
    }
  }
  return result;
}

self.addEventListener('message', (event: MessageEvent) => {
  const { id, cmd, payload } = event.data as { id: number; cmd: string; payload: unknown };
  try {
    switch (cmd) {
      case 'LOAD': {
        const bytes = new Uint8Array(payload as ArrayBuffer);
        resources = resourceDatSvc.parse(bytes);
        const { levels, sprites, objectTypesArr, roadInfoArr, objectGroups } = extractAll();
        // Reply immediately without sprite pre-decoding (sprites decode separately).
        self.postMessage({
          id,
          ok: true,
          cmd,
          result: { levels, sprites, objectTypesArr, roadInfoArr, objectGroups },
        });
        break;
      }

      case 'DECODE_SPRITE_PREVIEWS': {
        const { objectTypesArr } = payload as { objectTypesArr: [number, ObjectTypeDefinition | undefined][] };
        const decodedSprites = decodeAllSpritePreviews(objectTypesArr);
        const transferables: ArrayBuffer[] = decodedSprites.map((s) => s.pixels);
        self.postMessage({ id, ok: true, cmd, result: { decodedSprites } }, transferables);
        break;
      }

      case 'DECODE_ROAD_TEXTURES': {
        // Parse kPackRoad to get texture IDs used by each roadInfo.
        const roadInfoMap = levelEditorSvc.extractRoadInfos(resources);
        // Collect unique texture IDs needed across all roadInfo entries.
        const neededTexIds = new Set<number>();
        for (const ri of roadInfoMap.values()) {
          neededTexIds.add(ri.backgroundTex);
          neededTexIds.add(ri.foregroundTex);
          neededTexIds.add(ri.roadLeftBorder);
          neededTexIds.add(ri.roadRightBorder);
        }
        const textures: DecodedRoadTexture[] = levelEditorSvc.extractRoadTextures(
          resources,
          [...neededTexIds],
        );
        // Transfer pixel ArrayBuffers to avoid copying.
        const transferables2: ArrayBuffer[] = textures.map((t) => t.pixels);
        self.postMessage(
          { id, ok: true, cmd, result: { roadInfoArr: [...roadInfoMap.entries()], textures } },
          transferables2,
        );
        break;
      }

      case 'DECODE_ALL_SPRITE_FRAMES': {
        const frames = levelEditorSvc.decodeAllSpriteFrames(resources);
        const framePixelBuffers: ArrayBuffer[] = frames.map((f) => f.pixels);
        self.postMessage({ id, ok: true, cmd, result: { frames } }, framePixelBuffers);
        break;
      }

      case 'DECODE_ALL_ROAD_TEXTURES': {
        // Decode every tile in kPackTx16 (not just those referenced by road infos).
        const textures = levelEditorSvc.extractAllRoadTextures(resources);
        const transferables3: ArrayBuffer[] = textures.map((t) => t.pixels);
        self.postMessage(
          { id, ok: true, cmd, result: { textures } },
          transferables3,
        );
        break;
      }

      case 'APPLY_TILE16_PIXELS': {
        const { texId, pixels } = payload as { texId: number; pixels: Uint8ClampedArray };
        resources = levelEditorSvc.applyTile16Pixels(resources, texId, pixels);
        self.postMessage({ id, ok: true, cmd, result: {} });
        break;
      }

      case 'APPLY_PROPS': {
        const { resourceId, props } = payload as { resourceId: number; props: LevelProperties };
        resources = levelEditorSvc.applyLevelProperties(resources, resourceId, props);
        const { levels } = extractAll();
        self.postMessage({ id, ok: true, cmd, result: { levels } });
        break;
      }

      case 'APPLY_ROAD_INFO': {
        const { roadInfoId, roadInfo } = payload as { roadInfoId: number; roadInfo: RoadInfoData };
        resources = levelEditorSvc.applyRoadInfoData(resources, roadInfoId, roadInfo);
        const { roadInfoArr } = extractAll();
        self.postMessage({ id, ok: true, cmd, result: { roadInfoArr } });
        break;
      }

      case 'REMOVE_ROAD_INFO': {
        const { roadInfoId } = payload as { roadInfoId: number };
        resources = levelEditorSvc.removeRoadInfoData(resources, roadInfoId);
        const { roadInfoArr } = extractAll();
        self.postMessage({ id, ok: true, cmd, result: { roadInfoArr } });
        break;
      }

      case 'APPLY_OBJECTS': {
        const { resourceId, objects } = payload as { resourceId: number; objects: ObjectPos[] };
        resources = levelEditorSvc.applyLevelObjects(resources, resourceId, objects);
        const { levels } = extractAll();
        self.postMessage({ id, ok: true, cmd, result: { levels } });
        break;
      }

      case 'APPLY_OBJECT_TYPES': {
        const { objectTypes } = payload as { objectTypes: ObjectTypeDefinition[] };
        resources = applyObjectTypeDefinitions(resources, objectTypes);
        const { objectTypesArr } = extractAll();
        self.postMessage({ id, ok: true, cmd, result: { objectTypesArr } });
        break;
      }

      case 'APPLY_TRACK': {
        const { resourceId, trackUp, trackDown } = payload as {
          resourceId: number;
          trackUp: { x: number; y: number; flags: number; velo: number }[];
          trackDown: { x: number; y: number; flags: number; velo: number }[];
        };
        resources = levelEditorSvc.applyLevelTrack(resources, resourceId, trackUp, trackDown);
        const { levels } = extractAll();
        self.postMessage({ id, ok: true, cmd, result: { levels } });
        break;
      }

      case 'APPLY_MARKS': {
        const { resourceId, marks } = payload as { resourceId: number; marks: MarkSeg[] };
        resources = levelEditorSvc.applyLevelMarks(resources, resourceId, marks);
        const { levels } = extractAll();
        self.postMessage({ id, ok: true, cmd, result: { levels } });
        break;
      }

      case 'APPLY_ROAD_SEGS': {
        const { resourceId, roadSegs } = payload as { resourceId: number; roadSegs: RoadSeg[] };
        resources = levelEditorSvc.applyLevelRoadSegs(resources, resourceId, roadSegs);
        const { levels } = extractAll();
        self.postMessage({ id, ok: true, cmd, result: { levels } });
        break;
      }

      case 'APPLY_SPRITE_BYTE': {
        const { spriteId, offset, value } = payload as { spriteId: number; offset: number; value: number };
        resources = levelEditorSvc.applySpriteByte(resources, spriteId, offset, value);
        const raw = levelEditorSvc.getSpriteBytes(resources, spriteId);
        const bytes = raw ? raw.slice() : null;
        self.postMessage({ id, ok: true, cmd, result: { bytes } });
        break;
      }

      case 'APPLY_SPRITE_PACK_PIXELS': {
        const {
          frameId,
          bitDepth,
          pixels,
        } = payload as { frameId: number; bitDepth: 8 | 16; pixels: Uint8ClampedArray };
        resources = levelEditorSvc.applySpritePackPixels(resources, frameId, bitDepth, pixels);
        // Return updated levels so canvas previews refresh
        const { levels } = extractAll();
        self.postMessage({ id, ok: true, cmd, result: { levels } });
        break;
      }

      case 'APPLY_OBJECT_GROUPS': {
        const { objectGroups } = payload as { objectGroups: ObjectGroupDefinition[] };
        resources = applyObjectGroupDefinitions(resources, objectGroups);
        const { objectGroups: updatedObjectGroups } = extractAll();
        self.postMessage({ id, ok: true, cmd, result: { objectGroups: updatedObjectGroups } });
        break;
      }

      case 'GET_SPRITE_BYTES': {
        const { spriteId } = payload as { spriteId: number };
        const raw = levelEditorSvc.getSpriteBytes(resources, spriteId);
        const bytes = raw ? raw.slice() : null;
        self.postMessage({ id, ok: true, cmd, result: { bytes } });
        break;
      }

      case 'SERIALIZE': {
        const serialized = resourceDatSvc.serialize(resources);
        const transferBuf = new ArrayBuffer(serialized.byteLength);
        new Uint8Array(transferBuf).set(serialized);
        self.postMessage({ id, ok: true, cmd, result: transferBuf }, [transferBuf]);
        break;
      }

      case 'LIST_RESOURCES': {
        const entries = listResources(resources);
        self.postMessage({ id, ok: true, cmd, result: { entries } });
        break;
      }

      case 'GET_RESOURCE_RAW': {
        const { type, id: resId } = payload as { type: string; id: number };
        const raw = getRawResource(resources, type, resId);
        if (raw) {
          const buf = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
          self.postMessage({ id, ok: true, cmd, result: { bytes: buf } }, [buf]);
        } else {
          self.postMessage({ id, ok: true, cmd, result: { bytes: null } });
        }
        break;
      }

      case 'PUT_RESOURCE_RAW': {
        const { type, id: resId, bytes } = payload as { type: string; id: number; bytes: ArrayBuffer };
        resources = putRawResource(resources, type, resId, new Uint8Array(bytes));
        self.postMessage({ id, ok: true, cmd, result: {} });
        break;
      }

      case 'GET_STR_LIST': {
        const { id: strId } = payload as { id: number };
        const raw = getRawResource(resources, 'STR#', strId);
        const strings = raw ? parseStrList(raw) : [];
        self.postMessage({ id, ok: true, cmd, result: { strings } });
        break;
      }

      case 'PUT_STR_LIST': {
        const { id: strId, strings } = payload as { id: number; strings: string[] };
        const encoded = encodeStrList(strings);
        resources = putRawResource(resources, 'STR#', strId, encoded);
        self.postMessage({ id, ok: true, cmd, result: {} });
        break;
      }

      case 'LIST_PACK_ENTRIES': {
        const { packId } = payload as { packId: number };
        const entries = listPackEntries(resources, packId);
        self.postMessage({ id, ok: true, cmd, result: { entries } });
        break;
      }

      case 'GET_PACK_ENTRY_RAW': {
        const { packId, entryId } = payload as { packId: number; entryId: number };
        const raw = getPackEntryRaw(resources, packId, entryId);
        if (raw) {
          const buf = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
          self.postMessage({ id, ok: true, cmd, result: { bytes: buf } }, [buf]);
        } else {
          self.postMessage({ id, ok: true, cmd, result: { bytes: null } });
        }
        break;
      }

      case 'PUT_PACK_ENTRY_RAW': {
        const { packId, entryId, bytes } = payload as { packId: number; entryId: number; bytes: ArrayBuffer };
        resources = putPackEntryRaw(resources, packId, entryId, new Uint8Array(bytes));
        self.postMessage({ id, ok: true, cmd, result: {} });
        break;
      }

      default:
        self.postMessage({ id, ok: false, cmd, error: `Unknown worker command: ${cmd}` });
    }
  } catch (error) {
    self.postMessage({
      id,
      ok: false,
      cmd,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});
