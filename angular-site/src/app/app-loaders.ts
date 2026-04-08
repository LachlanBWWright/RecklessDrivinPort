import type { EditableSpriteAsset, ObjectGroupDefinition, ObjectTypeDefinition, RoadInfoData, ParsedLevel } from './level-editor.service';
import { buildRoadInfoPreviewCanvas, getCanvasDataUrl, getTileDimensions } from './app-helpers';
import { DEFAULT_ROAD_THEME, ROAD_THEMES } from './object-canvas';
import { renderSpritePixels } from './app-helpers';
import type { App } from './app';

export async function loadResourcesBytes(app: App, bytes: Uint8Array, sourceName: string): Promise<void> {
  app.workerBusy.set(true);
  app.resourcesStatus.set(`Parsing ${sourceName}…`);
  app.editorError.set('');
  try {
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    type LoadResult = {
      levels: ParsedLevel[];
      sprites: EditableSpriteAsset[];
      objectTypesArr: [number, ObjectTypeDefinition][];
      roadInfoArr: [number, RoadInfoData][];
      objectGroups: ObjectGroupDefinition[];
    };
    const result: LoadResult = await app.runtime.dispatchWorker('LOAD', buffer, [buffer]);

    app.objectTypeDefinitionMap.clear();
    const objectTypes = result.objectTypesArr
      .map(([, def]) => def)
      .filter((def): def is ObjectTypeDefinition => !!def)
      .sort((a: ObjectTypeDefinition, b: ObjectTypeDefinition) => a.typeRes - b.typeRes);
    app.objectTypeDefinitions.set(objectTypes);
    app.syncObjectTypeLookup(objectTypes);
    app.selectedObjectTypeId.set(objectTypes[0]?.typeRes ?? null);
    app.objectTypesDirty.set(false);
    if (app.objectTypesSaveTimer !== null) {
      clearTimeout(app.objectTypesSaveTimer);
      app.objectTypesSaveTimer = null;
    }
    app.objectTypesEditRevision = 0;

    app.objectSpritePreviews.clear();
    app._spritePreviewDataUrls.clear();
    app.roadTextureCanvases.clear();
    app.roadInfoOptions.set([]);
    app._roadInfoPreviewDataUrls.clear();
    app.roadTileGroups.set([]);
    app.tileTileEntries.set([]);
    app.roadInfoDataMap.clear();
    for (const [id, roadInfo] of result.roadInfoArr) {
      app.roadInfoDataMap.set(id, roadInfo);
    }
    app.refreshRoadInfoDerivedState();

    app.objectGroupDefinitions.set(result.objectGroups);
    app.selectedObjectGroupId.set(result.objectGroups[0]?.id ?? null);
    app.objectGroupsDirty.set(false);
    if (app.objectGroupsSaveTimer !== null) {
      clearTimeout(app.objectGroupsSaveTimer);
      app.objectGroupsSaveTimer = null;
    }

    app.parsedLevels.set(result.levels);
    app.spriteAssets.set(result.sprites);
    app.hasEditorData.set(true);
    const statusMsg = `Loaded ${result.levels.length} level(s) and ${result.sprites.length} sprite(s) from ${sourceName}.`;
    app.resourcesStatus.set(statusMsg);
    app.snackBar.open(`✓ ${statusMsg}`, 'OK', { duration: 4000, panelClass: 'snack-success' });

    const curId = app.selectedLevelId();
    if (curId !== null && result.levels.some((l) => l.resourceId === curId)) {
      app.selectLevel(curId);
    } else if (result.levels.length > 0) {
      app.selectLevel(result.levels[0].resourceId);
    } else {
      app.selectedLevelId.set(null);
      app.syncSelectedRoadInfoSelection();
    }
    if (result.sprites.length > 0 && app.selectedSpriteId() === null) {
      void app.selectSprite(result.sprites[0].id);
    }

    void decodeSpritePreviewsInBackground(app, result.objectTypesArr);
    void decodeRoadTexturesInBackground(app);
    void decodePackSpritesInBackground(app);
    void app.media.loadResourceList();
    void app.media.loadAudioEntries();
    void app.media.loadIconEntries();
  } catch (error) {
    app.editorError.set(error instanceof Error ? error.message : 'Failed to parse resources');
    app.resourcesStatus.set('Failed to parse resources.');
  } finally {
    app.workerBusy.set(false);
  }
}

export function failEditor(app: App, message: string, status?: string): void {
  app.editorError.set(message);
  if (status !== undefined) app.resourcesStatus.set(status);
}

export async function decodeSpritePreviewsInBackground(
  app: App,
  objectTypesArr: [number, ObjectTypeDefinition][],
): Promise<void> {
  try {
    type DecodeResult = {
      decodedSprites: { typeRes: number; pixels: ArrayBuffer; width: number; height: number }[];
    };
    const result: DecodeResult = await app.runtime.dispatchWorker('DECODE_SPRITE_PREVIEWS', {
      objectTypesArr,
    });
    for (const { typeRes, pixels, width, height } of result.decodedSprites) {
      const clamped = new Uint8ClampedArray(pixels);
      const canvas = renderSpritePixels(document, clamped, width, height);
      if (canvas) {
        app.objectSpritePreviews.set(typeRes, canvas);
        app._spritePreviewDataUrls.delete(typeRes);
      }
    }
    app.spritePreviewsVersion.update((v: number) => v + 1);
  } catch {
    /* non-fatal */
  }
}

export async function decodeRoadTexturesInBackground(app: App): Promise<void> {
  try {
    type RoadTexResult = {
      textures: { texId: number; width: number; height: number; pixels: ArrayBuffer }[];
    };
    type AllTilesResult = {
      textures: { texId: number; width: number; height: number; pixels: ArrayBuffer }[];
    };

    const [result, allTilesResult] = await Promise.all([
      app.runtime.dispatchWorker('DECODE_ROAD_TEXTURES') as Promise<RoadTexResult>,
      app.runtime.dispatchWorker('DECODE_ALL_ROAD_TEXTURES') as Promise<AllTilesResult>,
    ]);

    app._roadTextureDataUrls.clear();
    const buildCanvas = (width: number, height: number, pixels: ArrayBuffer): HTMLCanvasElement | null => {
      const clamped = new Uint8ClampedArray(pixels);
      const tc = document.createElement('canvas');
      tc.width = width;
      tc.height = height;
      const tctx = tc.getContext('2d');
      if (!tctx) return null;
      tctx.putImageData(new ImageData(clamped, width, height), 0, 0);
      return tc;
    };

    for (const { texId, width, height, pixels } of result.textures) {
      const tc = buildCanvas(width, height, pixels);
      if (tc) app.roadTextureCanvases.set(texId, tc);
    }

    const tileEntries: { texId: number; width: number; height: number }[] = [];
    for (const { texId, width, height, pixels } of allTilesResult.textures) {
      const tc = buildCanvas(width, height, pixels);
      if (tc) app.roadTextureCanvases.set(texId, tc);
      tileEntries.push({ texId, width, height });
    }
    if (tileEntries.length === 0) {
      for (const { texId, width, height } of result.textures) {
        tileEntries.push({ texId, width, height });
      }
    }
    app.tileTileEntries.set(tileEntries);
    app.refreshRoadInfoDerivedState();
    app.roadTexturesVersion.update((v: number) => v + 1);
    app._roadOffscreenKey = '';
    app.runtime.scheduleCanvasRedraw();
  } catch {
    /* non-fatal */
  }
}

export async function decodePackSpritesInBackground(app: App): Promise<void> {
  try {
    type AllSpritesResult = {
      frames: {
        id: number;
        bitDepth: 8 | 16;
        width: number;
        height: number;
        pixels: ArrayBuffer;
      }[];
    };
    const result: AllSpritesResult = await app.runtime.dispatchWorker('DECODE_ALL_SPRITE_FRAMES');
    app.packSpriteCanvases.clear();
    app._packSpriteDataUrls.clear();
    app.packSpriteDecodedFrames.clear();
    const frameInfos: { id: number; bitDepth: 8 | 16; width: number; height: number }[] = [];
    for (const { id, bitDepth, width, height, pixels } of result.frames) {
      const clamped = new Uint8ClampedArray(pixels);
      const canvas = renderSpritePixels(document, clamped, width, height);
      if (canvas) app.packSpriteCanvases.set(id, canvas);
      app.packSpriteDecodedFrames.set(id, {
        frameId: id,
        width,
        height,
        pixels: clamped,
        bitDepth,
      });
      frameInfos.push({ id, bitDepth, width, height });
    }
    app.packSpriteFrames.set(frameInfos);
    app.packSpritesVersion.update((v: number) => v + 1);
    if (app.selectedPackSpriteId() === null && frameInfos.length > 0) {
      app.selectedPackSpriteId.set(frameInfos[0].id);
    }
  } catch {
    /* non-fatal */
  }
}

export function getPackSpriteDataUrl(app: App, frameId: number): string | null {
  return getCanvasDataUrl(app._packSpriteDataUrls, app.packSpriteCanvases, frameId);
}

export function getTileDataUrl(app: App, texId: number): string | null {
  return getCanvasDataUrl(app._roadTextureDataUrls, app.roadTextureCanvases, texId);
}

export function getRoadInfoPreviewDataUrl(app: App, roadInfoId: number): string | null {
  const cached = app._roadInfoPreviewDataUrls.get(roadInfoId);
  if (cached) return cached;
  const canvas = buildRoadInfoPreviewCanvas(
    document,
    app.roadInfoDataMap,
    app.roadTextureCanvases,
    roadInfoId,
    ROAD_THEMES,
    DEFAULT_ROAD_THEME,
  );
  if (!canvas) return null;
  try {
    const url = canvas.toDataURL();
    app._roadInfoPreviewDataUrls.set(roadInfoId, url);
    return url;
  } catch {
    return null;
  }
}

export function lookupTileDimensions(app: App, texId: number): string {
  return getTileDimensions(app.tileTileEntries(), texId);
}
