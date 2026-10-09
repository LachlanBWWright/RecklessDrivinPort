import { resultFromThrowable } from './result-helpers';
import type { RoadInfoData, RoadTileGroup, TextureTileEntry } from './level-editor.service';

export interface RoadThemeLike {
  bg: string;
  road: string;
  dirt: string;
  kerbA: string;
  kerbB: string;
  water: boolean;
}

export const createPatternWithTransform = resultFromThrowable(
  (
    ctx: CanvasRenderingContext2D,
    texture: HTMLCanvasElement,
    transform: DOMMatrix,
    repeat: 'repeat' | 'repeat-y' = 'repeat',
  ) => {
    const pattern = ctx.createPattern(texture, repeat);
    if (!pattern) return null;
    pattern.setTransform(transform);
    return pattern;
  },
  'Failed to create canvas pattern',
);

export function buildRoadTileGroups(
  roadInfoDataMap: Map<number, RoadInfoData>,
  roadInfoIds: Iterable<number>,
  entries: TextureTileEntry[],
): RoadTileGroup[] {
  const sortedEntries = [...entries].sort((a, b) => a.texId - b.texId);
  const entryByTexId = new Map(sortedEntries.map((entry) => [entry.texId, entry]));
  const groups: RoadTileGroup[] = [];

  for (const roadInfoId of Array.from(roadInfoIds).sort((a, b) => a - b)) {
    const roadInfo = roadInfoDataMap.get(roadInfoId);
    if (!roadInfo) continue;
    const textureIds = [
      roadInfo.backgroundTex,
      roadInfo.foregroundTex,
      roadInfo.roadLeftBorder,
      roadInfo.roadRightBorder,
    ];
    const seen = new Set<number>();
    const tiles = textureIds.flatMap((texId) => {
      if (texId < 0 || seen.has(texId)) return [];
      seen.add(texId);
      const entry = entryByTexId.get(texId);
      return entry ? [entry] : [];
    });
    if (tiles.length > 0) groups.push({ roadInfoId, label: `Road ${roadInfoId}`, tiles });
  }

  const referenced = new Set(groups.flatMap((group) => group.tiles.map((tile) => tile.texId)));
  const unassigned = sortedEntries.filter((tile) => !referenced.has(tile.texId));
  if (unassigned.length > 0) {
    groups.push({ roadInfoId: -1, label: 'Unassigned', tiles: unassigned });
  }
  return groups;
}

export function buildRoadInfoPreviewCanvas(
  doc: Document | undefined,
  roadInfoDataMap: Map<number, RoadInfoData>,
  roadTextureCanvases: Map<number, HTMLCanvasElement>,
  roadInfoId: number,
  roadThemes: Record<number, RoadThemeLike>,
  defaultRoadTheme: RoadThemeLike,
): HTMLCanvasElement | null {
  if (typeof doc === 'undefined') return null;
  const canvas = doc.createElement('canvas');
  canvas.width = 160;
  canvas.height = 56;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const theme = roadThemes[roadInfoId] ?? defaultRoadTheme;
  const roadInfo = roadInfoDataMap.get(roadInfoId);
  const makePattern = (texId: number, texWorldSize: number) => {
    const texture = roadTextureCanvases.get(texId);
    if (!texture) return null;
    const scale = texWorldSize / texture.width;
    return createPatternWithTransform(
      ctx,
      texture,
      new DOMMatrix([scale, 0, 0, scale, 0, 0]),
    ).match(
      (pattern) => pattern,
      () => null,
    );
  };

  const bgFill = roadInfo ? (makePattern(roadInfo.backgroundTex, 128) ?? theme.bg) : theme.bg;
  const roadFill = roadInfo ? (makePattern(roadInfo.foregroundTex, 128) ?? theme.road) : theme.road;
  const leftFill = roadInfo
    ? (makePattern(roadInfo.roadRightBorder, 16) ?? theme.kerbA)
    : theme.kerbA;
  const rightFill = roadInfo
    ? (makePattern(roadInfo.roadLeftBorder, 16) ?? theme.kerbB)
    : theme.kerbB;

  ctx.fillStyle = bgFill;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = theme.dirt;
  ctx.fillRect(0, 36, canvas.width, 20);
  ctx.fillStyle = roadFill;
  ctx.fillRect(20, 18, 120, 20);
  ctx.fillStyle = leftFill;
  ctx.fillRect(8, 18, 12, 20);
  ctx.fillStyle = rightFill;
  ctx.fillRect(140, 18, 12, 20);
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, canvas.width - 2, canvas.height - 2);
  return canvas;
}

export function computeFramedWorldRect(
  viewportWidth: number,
  viewportHeight: number,
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
): { zoom: number; panX: number; panY: number } {
  const worldWidth = Math.max(120, maxX - minX);
  const worldHeight = Math.max(120, maxY - minY);
  const paddedWidth = worldWidth * 1.25;
  const paddedHeight = worldHeight * 1.25;
  const zoom = Math.min(
    10,
    Math.max(0.1, Math.min(viewportWidth / paddedWidth, viewportHeight / paddedHeight)),
  );
  return { zoom, panX: (minX + maxX) / 2, panY: (minY + maxY) / 2 };
}
