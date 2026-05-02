export * from './canvas-data-url';
export * from './editor-canvas-overlays';
export * from './road-preview-canvas';

import type { ParsedLevel } from './level-editor.service';

export function levelDisplayNum(resourceId: number) {
  return resourceId - 139;
}

function sortNumbers(values: Iterable<number>) {
  return Array.from(values).sort((a, b) => a - b);
}

export function getRoadReferenceLevelNums(levels: ParsedLevel[], roadInfoId: number) {
  return levels
    .filter((level) => level.properties.roadInfo === roadInfoId)
    .map((level) => level.resourceId - 139)
    .sort((a, b) => a - b);
}

export function getTileReferenceRoadInfoIds(
  roadInfoDataMap: Map<number, import('./level-editor.service').RoadInfoData>,
  roadInfoIds: Iterable<number>,
  texId: number,
) {
  return sortNumbers(roadInfoIds).filter((roadInfoId) => {
    const ri = roadInfoDataMap.get(roadInfoId);
    if (!ri) return false;
    return (
      ri.backgroundTex === texId ||
      ri.foregroundTex === texId ||
      ri.roadLeftBorder === texId ||
      ri.roadRightBorder === texId
    );
  });
}

export function renderSpritePixels(
  doc: Document | undefined,
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
) {
  if (typeof doc === 'undefined') return null;
  const canvas = doc.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const safePixels = new Uint8ClampedArray(pixels);
  const imageData = new ImageData(safePixels, width, height);
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

export function getObjFallbackColor(typeRes: number, palette: readonly string[]) {
  const paletteIdx = ((typeRes % palette.length) + palette.length) % palette.length;
  return palette[paletteIdx] ?? '#888888';
}
