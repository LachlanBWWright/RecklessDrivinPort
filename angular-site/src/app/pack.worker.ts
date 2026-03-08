/// <reference lib="webworker" />

/**
 * Pack Worker
 *
 * Runs LZRW3-A compression/decompression off the main thread so the UI
 * stays responsive while large resources.dat files are parsed or saved.
 *
 * Protocol
 * --------
 * Main → Worker:  { id: number, cmd: WorkerCommand, payload?: unknown }
 * Worker → Main:  { id: number, ok: boolean, cmd: WorkerCommand, result?: unknown, error?: string }
 *
 * Commands:
 *   LOAD               payload: ArrayBuffer (raw resources.dat bytes)
 *   APPLY_PROPS        payload: { resourceId, props }
 *   APPLY_OBJECTS      payload: { resourceId, objects }
 *   APPLY_MARKS        payload: { resourceId, marks }
 *   APPLY_SPRITE_BYTE  payload: { spriteId, offset, value }
 *   GET_SPRITE_BYTES   payload: { spriteId }
 *   SERIALIZE          (no payload)
 */

import { ResourceDatService } from './resource-dat.service';
import { LevelEditorService } from './level-editor.service';
import type { ResourceDatEntry } from './resource-dat.service';
import type { LevelProperties, ObjectPos, MarkSeg } from './level-editor.service';

const resourceDatSvc = new ResourceDatService();
const levelEditorSvc = new LevelEditorService();

/** Mutable resources owned by this worker. */
let resources: ResourceDatEntry[] = [];

/**
 * Re-extract all display data after any mutation so the main thread always
 * gets fresh, consistent state.
 */
function extractAll() {
  const objectTypesMap = levelEditorSvc.extractObjectTypeDefinitions(resources);
  return {
    levels: levelEditorSvc.extractParsedLevels(resources),
    sprites: levelEditorSvc.extractSpriteAssets(resources),
    objectTypesArr: [...objectTypesMap.entries()] as [number, ReturnType<typeof objectTypesMap.get>][],
  };
}

/**
 * Pre-decode every object sprite so the main thread can draw previews without
 * touching resource data again.
 */
function decodeAllSpritePreviews(
  objectTypesArr: ReturnType<typeof extractAll>['objectTypesArr'],
): { typeRes: number; pixels: ArrayBuffer; width: number; height: number }[] {
  const result: { typeRes: number; pixels: ArrayBuffer; width: number; height: number }[] = [];
  for (const [typeRes, objType] of objectTypesArr) {
    if (!objType) continue;
    const decoded = levelEditorSvc.decodeSpriteFrame(resources, objType.frame);
    if (decoded) {
      // Copy into a plain ArrayBuffer to ensure it's transferable and not a SharedArrayBuffer.
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
        const { levels, sprites, objectTypesArr } = extractAll();
        const decodedSprites = decodeAllSpritePreviews(objectTypesArr);

        // Collect transferable buffers for zero-copy transfer of sprite pixel data.
        const transferables: ArrayBuffer[] = decodedSprites.map((s) => s.pixels);

        self.postMessage(
          { id, ok: true, cmd, result: { levels, sprites, objectTypesArr, decodedSprites } },
          transferables,
        );
        break;
      }

      case 'APPLY_PROPS': {
        const { resourceId, props } = payload as { resourceId: number; props: LevelProperties };
        resources = levelEditorSvc.applyLevelProperties(resources, resourceId, props);
        const { levels } = extractAll();
        self.postMessage({ id, ok: true, cmd, result: { levels } });
        break;
      }

      case 'APPLY_OBJECTS': {
        const { resourceId, objects } = payload as { resourceId: number; objects: ObjectPos[] };
        resources = levelEditorSvc.applyLevelObjects(resources, resourceId, objects);
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

      case 'APPLY_SPRITE_BYTE': {
        const { spriteId, offset, value } = payload as { spriteId: number; offset: number; value: number };
        resources = levelEditorSvc.applySpriteByte(resources, spriteId, offset, value);
        const raw = levelEditorSvc.getSpriteBytes(resources, spriteId);
        const bytes = raw ? raw.slice() : null;
        self.postMessage({ id, ok: true, cmd, result: { bytes } });
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
        // Transfer the underlying buffer for zero-copy.
        const transferBuf = serialized.buffer.slice(
          serialized.byteOffset,
          serialized.byteOffset + serialized.byteLength,
        );
        self.postMessage({ id, ok: true, cmd, result: transferBuf }, [transferBuf]);
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
