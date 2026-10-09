import type { ResourceDatEntry } from './resource-dat.service';
import { parsePackHandle, encodePackHandle } from './pack-parser.service';
import type { DecodedSpriteFrame, MarkSeg } from './level-editor.types';
import { encodeSpritePixels } from './sprite-pixel-codec';
import { serializeMarkSegs } from './level-editor-resource-editing';
import {
  SPRITE_PACK_8_ID,
  SPRITE_PACK_16_ID,
  SPRITE_HEADER_SIZE,
  rgb555ToRgba,
  indexed8ToRgba,
  rgbaToRgb555,
  rgbaToMacPaletteIndex,
} from './level-editor-binary-codecs';

export class SpriteFrameDecoder {
  decodeSpriteFrame(resources: ResourceDatEntry[], frameId: number): DecodedSpriteFrame | null {
    return (
      this.decodeSpriteFromPack(resources, SPRITE_PACK_16_ID, frameId) ??
      this.decodeSpriteFromPack(resources, SPRITE_PACK_8_ID, frameId)
    );
  }
  batchDecodeSpriteFrames(
    resources: ResourceDatEntry[],
    frameIds: number[],
  ): Map<number, DecodedSpriteFrame> {
    const result = new Map<number, DecodedSpriteFrame>();
    if (frameIds.length === 0) return result;
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
    const pack8 = getPackEntries(SPRITE_PACK_8_ID);
    for (const frameId of frameIds) {
      if (result.has(frameId)) continue;
      const data16 = pack16.get(frameId);
      if (data16 && data16.length >= SPRITE_HEADER_SIZE) {
        const decoded = this.decode16BitSprite(data16, frameId);
        if (decoded) {
          result.set(frameId, decoded);
          continue;
        }
      }
      const data8 = pack8.get(frameId);
      if (data8 && data8.length >= SPRITE_HEADER_SIZE) {
        const decoded = this.decode8BitSprite(data8, frameId);
        if (decoded) {
          result.set(frameId, decoded);
        }
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
        const newData = encodeSpritePixels(entry.data, bitDepth, pixels, {
          rgb555: rgbaToRgb555,
          paletteIndex: rgbaToMacPaletteIndex,
        });
        if (!newData) return res;
        const newEntries = packEntries.map((e) => (e.id === frameId ? { ...e, data: newData } : e));
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
          ? packEntries.map((e) => (e.id === 2 ? { ...e, data: newData } : e))
          : [...packEntries, { id: 2, data: newData }];
        return { ...res, data: encodePackHandle(newEntries, resourceId) };
      } catch (err) {
        console.error(`[LevelEditor] applyLevelMarks error id=${resourceId}:`, err);
        return res;
      }
    });
  }
  toTiles(data: Uint8Array): number[] {
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
      console.warn(
        `[LevelEditor] failed to decode sprite frame ${frameId} from Pack #${packId}:`,
        err,
      );
      return null;
    }
  }
  decode8BitSprite(data: Uint8Array, frameId: number): DecodedSpriteFrame | null {
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
  decode16BitSprite(data: Uint8Array, frameId: number): DecodedSpriteFrame | null {
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
}
