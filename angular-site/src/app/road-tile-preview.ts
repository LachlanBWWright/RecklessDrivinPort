/**
 * Road tile grouping and road-info preview canvas utilities.
 *
 * Builds the tile group list shown in the resource browser's road section
 * and renders a small thumbnail canvas for each road-info entry.
 */
import { resultFromThrowable } from './result-helpers';
import type { RoadInfoData, TextureTileEntry, RoadTileGroup } from './level-editor.service';
import type { RoadThemeLike } from './road-preview-canvas';

const createPatternWithTransform = resultFromThrowable(
  (ctx: CanvasRenderingContext2D, texture: HTMLCanvasElement, transform: DOMMatrix) => {
    const pattern = ctx.createPattern(texture, 'repeat');
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
    const ri = roadInfoDataMap.get(roadInfoId);
    if (!ri) continue;
    const ids = [ri.backgroundTex, ri.foregroundTex, ri.roadLeftBorder, ri.roadRightBorder];
    const seen = new Set<number>();
    const tiles: TextureTileEntry[] = [];
    for (const texId of ids) {
      if (texId < 0 || seen.has(texId)) continue;
      seen.add(texId);
      const entry = entryByTexId.get(texId);
      if (entry) tiles.push(entry);
    }
    if (tiles.length > 0) groups.push({ roadInfoId, label: `Road ${roadInfoId}`, tiles });
  }

  const referenced = new Set<number>(groups.flatMap((g) => g.tiles.map((t) => t.texId)));
  const unassigned = sortedEntries.filter((tile) => !referenced.has(tile.texId));
  if (unassigned.length > 0) groups.push({ roadInfoId: -1, label: 'Unassigned', tiles: unassigned });
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
  const ri = roadInfoDataMap.get(roadInfoId);
  const makePattern = (texId: number, texWorldSize: number) => {
    const texture = roadTextureCanvases.get(texId);
    if (!texture) return null;
    const scale = texWorldSize / texture.width;
    return createPatternWithTransform(ctx, texture, new DOMMatrix([scale, 0, 0, scale, 0, 0])).match(
      (p) => p, () => null,
    );
  };

  ctx.fillStyle = ri ? (makePattern(ri.backgroundTex, 128) ?? theme.bg) : theme.bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = theme.dirt;
  ctx.fillRect(0, 36, canvas.width, 20);
  ctx.fillStyle = ri ? (makePattern(ri.foregroundTex, 128) ?? theme.road) : theme.road;
  ctx.fillRect(20, 18, 120, 20);
  ctx.fillStyle = ri ? (makePattern(ri.roadLeftBorder, 16) ?? theme.kerbA) : theme.kerbA;
  ctx.fillRect(8, 18, 12, 20);
  ctx.fillStyle = ri ? (makePattern(ri.roadRightBorder, 16) ?? theme.kerbB) : theme.kerbB;
  ctx.fillRect(140, 18, 12, 20);
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, canvas.width - 2, canvas.height - 2);
  return canvas;
}
