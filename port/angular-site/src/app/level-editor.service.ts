import { isOk, packStruct, structTemplateFromString, unpackRecord } from '@lachlanbwwright/rsrcdump-ts';
import type { ResourceDatEntry } from './resource-dat.service';

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

const LEVEL_TILE_COUNT = 16 * 16;
const LEVEL_IDS = new Set(Array.from({ length: 10 }, (_, index) => 140 + index));
const LEVEL_HEADER_RESULT = structTemplateFromString('>hH20hh:roadInfo,time,objGrps,xStartPos,levelEnd');

export class LevelEditorService {
  extractLevels(resources: ResourceDatEntry[]): EditableLevel[] {
    const levels = resources
      .filter((entry) => entry.type === 'Pack' && LEVEL_IDS.has(entry.id))
      .sort((left, right) => left.id - right.id)
      .map((entry) => ({
        resourceId: entry.id,
        width: 16,
        height: 16,
        tiles: this.toEditableTiles(entry.data),
      }));

    return levels;
  }

  applyLevels(resources: ResourceDatEntry[], levels: EditableLevel[]): ResourceDatEntry[] {
    const byId = new Map(levels.map((level) => [level.resourceId, level]));

    return resources.map((entry) => {
      const level = byId.get(entry.id);
      if (entry.type !== 'Pack' || !level) {
        return entry;
      }

      const nextData = entry.data.slice();
      const tileCount = Math.min(level.tiles.length, LEVEL_TILE_COUNT, nextData.length);
      for (let index = 0; index < tileCount; index += 1) {
        nextData[index] = Math.max(0, Math.min(255, level.tiles[index]));
      }

      return {
        ...entry,
        data: nextData,
      };
    });
  }

  extractSpriteAssets(resources: ResourceDatEntry[]): EditableSpriteAsset[] {
    return resources
      .filter((entry) => entry.type === 'PPic')
      .map((entry) => ({
        id: entry.id,
        type: entry.type,
        size: entry.data.length,
      }))
      .sort((left, right) => left.id - right.id);
  }

  applySpriteByte(resources: ResourceDatEntry[], spriteId: number, offset: number, value: number): ResourceDatEntry[] {
    return resources.map((entry) => {
      if (entry.type !== 'PPic' || entry.id !== spriteId) {
        return entry;
      }

      if (offset < 0 || offset >= entry.data.length) {
        return entry;
      }

      const nextData = entry.data.slice();
      nextData[offset] = Math.max(0, Math.min(255, value));
      return {
        ...entry,
        data: nextData,
      };
    });
  }

  extractLevelMetadata(packBytes: Uint8Array): {
    roadInfo: number;
    time: number;
    xStartPos: number;
    levelEnd: number;
  } | null {
    if (!isOk(LEVEL_HEADER_RESULT)) {
      return null;
    }

    if (packBytes.length < LEVEL_HEADER_RESULT.value.recordLength) {
      return null;
    }

    const unpacked = unpackRecord(LEVEL_HEADER_RESULT.value, packBytes, 0);
    if (!isOk(unpacked)) {
      return null;
    }

    const metadata = unpacked.value as {
      roadInfo: number;
      time: number;
      xStartPos: number;
      levelEnd: number;
    };

    return {
      roadInfo: metadata.roadInfo,
      time: metadata.time,
      xStartPos: metadata.xStartPos,
      levelEnd: metadata.levelEnd,
    };
  }

  patchLevelMetadata(
    packBytes: Uint8Array,
    metadata: {
      roadInfo: number;
      time: number;
      xStartPos: number;
      levelEnd: number;
    },
  ): Uint8Array {
    if (!isOk(LEVEL_HEADER_RESULT)) {
      return packBytes;
    }

    const packed = packStruct(LEVEL_HEADER_RESULT.value, {
      roadInfo: metadata.roadInfo,
      time: metadata.time,
      objGrps: '0'.repeat(40),
      xStartPos: metadata.xStartPos,
      levelEnd: metadata.levelEnd,
    });

    if (!isOk(packed)) {
      return packBytes;
    }

    const output = packBytes.slice();
    const writeLength = Math.min(packed.value.length, output.length);
    output.set(packed.value.slice(0, writeLength), 0);
    return output;
  }

  private toEditableTiles(data: Uint8Array): number[] {
    const tiles: number[] = [];
    for (let index = 0; index < LEVEL_TILE_COUNT; index += 1) {
      tiles.push(index < data.length ? data[index] & 0x0f : 0);
    }
    return tiles;
  }
}
