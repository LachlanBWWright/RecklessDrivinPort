import type { EditableSpriteAsset, ObjectGroupDefinition, ObjectTypeDefinition, RoadInfoData, ParsedLevel } from './level-editor.service';
import { buildRoadInfoPreviewCanvas, getCanvasDataUrl, getTileDimensions } from './app-helpers';
import { DEFAULT_ROAD_THEME, ROAD_THEMES } from './object-canvas';
import { renderSpritePixels } from './app-helpers';
import { resultFromPromise, resultFromThrowable } from './result-helpers';
import type { App } from './app';

const encodeCanvasDataUrl = resultFromThrowable((canvas: HTMLCanvasElement) => canvas.toDataURL(), 'Failed to encode canvas');

const dispatchWorkerResult = <T>(
  app: App,
  type: string,
  payload?: unknown,
  transfer?: Transferable[],
  fallback = `Worker request ${type} failed`,
) => resultFromPromise(app.runtime.dispatchWorker<T>(type, payload, transfer), fallback);

export async function loadResourcesBytes(app: App, bytes: Uint8Array, sourceName: string) {
  app.workerBusy.set(true);
  app.resourcesStatus.set(`Parsing ${sourceName}…`);
  app.editorError.set('');
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  type LoadResult = {
    levels: ParsedLevel[];
    sprites: EditableSpriteAsset[];
    objectTypesArr: [number, ObjectTypeDefinition][];
    roadInfoArr: [number, RoadInfoData][];
    objectGroups: ObjectGroupDefinition[];
  };
  const loadResult = await dispatchWorkerResult<LoadResult>(
    app,
    'LOAD',
    buffer,
    [buffer],
    'Failed to parse resources',
  );
  const result = loadResult.match(
    (loaded) => loaded,
    (error) => {
      app.editorError.set(error);
      app.resourcesStatus.set('Failed to parse resources.');
      app.workerBusy.set(false);
      return null;
    },
  );
  if (!result) return;
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
  app.workerBusy.set(false);
}

export function failEditor(app: App, message: string, status?: string): void {
  app.editorError.set(message);
  if (status !== undefined) app.resourcesStatus.set(status);
}

export async function decodeSpritePreviewsInBackground(
  app: App,
  objectTypesArr: [number, ObjectTypeDefinition][],
) {
  type DecodeResult = {
    decodedSprites: { typeRes: number; pixels: ArrayBuffer; width: number; height: number }[];
  };
  const decodeResult = await dispatchWorkerResult<DecodeResult>(
    app,
    'DECODE_SPRITE_PREVIEWS',
    { objectTypesArr },
    undefined,
    'Failed to decode sprite previews',
  );
  const decodedSprites = decodeResult.match(
    (decoded) => decoded.decodedSprites,
    () => null,
  );
  if (!decodedSprites) return;

  for (const { typeRes, pixels, width, height } of decodedSprites) {
    const clamped = new Uint8ClampedArray(pixels);
    const canvas = renderSpritePixels(document, clamped, width, height);
    if (canvas) {
      app.objectSpritePreviews.set(typeRes, canvas);
      app._spritePreviewDataUrls.delete(typeRes);
    }
  }
  app.spritePreviewsVersion.update((v: number) => v + 1);
}

export async function decodeRoadTexturesInBackground(app: App) {
  type RoadTexResult = {
    textures: { texId: number; width: number; height: number; pixels: ArrayBuffer }[];
  };
  type AllTilesResult = {
    textures: { texId: number; width: number; height: number; pixels: ArrayBuffer }[];
  };
  const texturesResult = await resultFromPromise(
    Promise.all([
      app.runtime.dispatchWorker('DECODE_ROAD_TEXTURES') as Promise<RoadTexResult>,
      app.runtime.dispatchWorker('DECODE_ALL_ROAD_TEXTURES') as Promise<AllTilesResult>,
    ]),
    'Failed to decode road textures',
  );
  const textureResults = texturesResult.match(
    (textures) => textures,
    () => null,
  );
  if (!textureResults) return;

  const [result, allTilesResult] = textureResults;
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
}

export async function decodePackSpritesInBackground(app: App) {
  type AllSpritesResult = {
    frames: {
      id: number;
      bitDepth: 8 | 16;
      width: number;
      height: number;
      pixels: ArrayBuffer;
    }[];
  };
  const decodeFramesResult = await dispatchWorkerResult<AllSpritesResult>(
    app,
    'DECODE_ALL_SPRITE_FRAMES',
    undefined,
    undefined,
    'Failed to decode sprite frames',
  );
  const frames = decodeFramesResult.match(
    (decoded) => decoded.frames,
    () => null,
  );
  if (!frames) return;

  app.packSpriteCanvases.clear();
  app._packSpriteDataUrls.clear();
  app.packSpriteDecodedFrames.clear();
  const frameInfos: { id: number; bitDepth: 8 | 16; width: number; height: number }[] = [];
  for (const { id, bitDepth, width, height, pixels } of frames) {
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
  return encodeCanvasDataUrl(canvas).match(
    (url) => {
      app._roadInfoPreviewDataUrls.set(roadInfoId, url);
      return url;
    },
    () => null,
  );
}

export function lookupTileDimensions(app: App, texId: number): string {
  return getTileDimensions(app.tileTileEntries(), texId);
}
