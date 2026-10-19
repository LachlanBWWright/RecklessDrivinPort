import { resultFromThrowable } from './result-helpers';
import type { ParsedLevel, RoadInfoData } from './level-editor.service';
import { createPatternWithTransform, type RoadThemeLike } from './road-preview-layout';

export {
  buildRoadInfoPreviewCanvas,
  buildRoadTileGroups,
  computeFramedWorldRect,
} from './road-preview-layout';
export type { RoadThemeLike } from './road-preview-layout';

export interface RoadPreviewCache {
  _roadOffscreen: HTMLCanvasElement | null;
  _roadOffscreenKey: string;
  _roadOffscreenPanY: number;
}

export interface RoadPreviewDeps {
  roadInfoDataMap: Map<number, RoadInfoData>;
  roadTextureCanvases: Map<number, HTMLCanvasElement>;
}

export const ROAD_OVERHANG_PX = 700;

export function drawObjectRoadPreviewCached(
  cache: RoadPreviewCache,
  deps: RoadPreviewDeps,
  doc: Document | undefined,
  ctx: CanvasRenderingContext2D,
  level: ParsedLevel,
  theme: RoadThemeLike,
  width: number,
  height: number,
  zoom: number,
  panX: number,
  panY: number,
  staticKey: string,
) {
  const overhang = ROAD_OVERHANG_PX;
  const offH = height + 2 * overhang;
  const offscreenCentreCanvasY = overhang + height / 2;
  const panYDeltaPx = (panY - cache._roadOffscreenPanY) * zoom;
  const srcY = offscreenCentreCanvasY - panYDeltaPx - height / 2;

  const needsRender =
    cache._roadOffscreenKey !== staticKey ||
    !cache._roadOffscreen ||
    cache._roadOffscreen.width !== width ||
    cache._roadOffscreen.height !== offH ||
    srcY < 0 ||
    srcY + height > offH;

  if (needsRender) {
    cache._roadOffscreenPanY = panY;
    if (
      !cache._roadOffscreen ||
      cache._roadOffscreen.width !== width ||
      cache._roadOffscreen.height !== offH
    ) {
      cache._roadOffscreen = doc?.createElement('canvas') ?? null;
      if (!cache._roadOffscreen) return;
      cache._roadOffscreen.width = width;
      cache._roadOffscreen.height = offH;
    }
    const offCtx = cache._roadOffscreen.getContext('2d');
    if (offCtx) {
      offCtx.clearRect(0, 0, width, offH);
      const renderOk = drawObjectRoadPreviewSafe(
        deps,
        doc,
        offCtx,
        level,
        theme,
        panX,
        panY,
        zoom,
        width,
        height,
        overhang,
      ).match(
        () => true,
        () => {
          offCtx.fillStyle = theme.bg;
          offCtx.fillRect(0, 0, width, offH);
          return false;
        },
      );
      if (renderOk) {
        cache._roadOffscreenKey = staticKey;
      }
    }
  }

  if (!cache._roadOffscreen) return;
  const offscreenSrcY =
    offscreenCentreCanvasY - (panY - cache._roadOffscreenPanY) * zoom - height / 2;
  if (offscreenSrcY >= 0 && offscreenSrcY + height <= offH) {
    ctx.drawImage(cache._roadOffscreen, 0, offscreenSrcY, width, height, 0, 0, width, height);
  } else {
    ctx.fillStyle = theme.bg;
    ctx.fillRect(0, 0, width, height);
  }
}

export function drawObjectRoadPreview(
  deps: RoadPreviewDeps,
  doc: Document | undefined,
  ctx: CanvasRenderingContext2D,
  level: ParsedLevel,
  theme: RoadThemeLike,
  panX: number,
  panY: number,
  zoom: number,
  width: number,
  height: number,
  yOverhang = 0,
) {
  if (level.roadSegs.length < 2 || typeof doc === 'undefined') return;

  const wtc = (wx: number, wy: number): [number, number] => {
    const cx = width / 2 + (wx - panX) * zoom;
    const cy = height / 2 + yOverhang - (wy - panY) * zoom;
    return [cx, cy];
  };

  const canvasH = height + 2 * yOverhang;
  const roadInfo = level.properties.roadInfo;
  const ri = deps.roadInfoDataMap.get(roadInfo);
  const KERB_WIDTH = 16;
  const makePattern = (
    texId: number,
    texWorldSize: number,
    anchorWorldX = 0,
    repeat: 'repeat' | 'repeat-y' = 'repeat',
  ) => {
    const texture = deps.roadTextureCanvases.get(texId);
    if (!texture) return null;
    const scale = (texWorldSize * zoom) / texture.width;
    const tileW = texWorldSize * zoom;
    const tileH = texture.height * scale;
    const anchorCanvasX = width / 2 + (anchorWorldX - panX) * zoom;
    const tx = repeat === 'repeat-y' ? anchorCanvasX : ((anchorCanvasX % tileW) + tileW) % tileW;
    const ty = (((height / 2 + yOverhang + panY * zoom) % tileH) + tileH) % tileH;
    return createPatternWithTransform(
      ctx,
      texture,
      new DOMMatrix([scale, 0, 0, scale, tx, ty]),
      repeat,
    ).match(
      (pattern) => pattern,
      () => null,
    );
  };

  const bgPat = ri ? (makePattern(ri.backgroundTex, 128) ?? theme.bg) : theme.bg;
  const fgPat = ri ? (makePattern(ri.foregroundTex, 128) ?? theme.road) : theme.road;
  const KERB_TEX_WORLD = 16;
  const leftBorderTextureId = ri ? ri.roadRightBorder : null;
  const rightBorderTextureId = ri ? ri.roadLeftBorder : null;
  const CENTRE_COLOUR = theme.water ? 'rgba(80, 255, 180, 0.85)' : 'rgba(255, 248, 140, 0.85)';

  const projectQuad = (
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    x3: number,
    y3: number,
  ) => {
    const [ax0, ay0] = wtc(x0, y0);
    const [ax1, ay1] = wtc(x1, y1);
    const [ax2, ay2] = wtc(x2, y2);
    const [ax3, ay3] = wtc(x3, y3);
    if (ay0 < 0 && ay1 < 0 && ay2 < 0 && ay3 < 0) return;
    if (ay0 > canvasH && ay1 > canvasH && ay2 > canvasH && ay3 > canvasH) return;
    return [ax0, ay0, ax1, ay1, ax2, ay2, ax3, ay3];
  };

  const addQuad = (
    batch: number[],
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    x3: number,
    y3: number,
  ) => {
    const quad = projectQuad(x0, y0, x1, y1, x2, y2, x3, y3);
    if (!quad) return;
    batch.push(...quad);
  };

  const flushBatch = (fill: CanvasPattern | string, batch: number[]) => {
    if (batch.length === 0) return;
    ctx.fillStyle = fill as string;
    ctx.beginPath();
    for (let j = 0; j < batch.length; j += 8) {
      ctx.moveTo(batch[j], batch[j + 1]);
      ctx.lineTo(batch[j + 2], batch[j + 3]);
      ctx.lineTo(batch[j + 4], batch[j + 5]);
      ctx.lineTo(batch[j + 6], batch[j + 7]);
      ctx.closePath();
    }
    ctx.fill();
  };

  const fillQuad = (fill: CanvasPattern | string, quad: readonly number[]) => {
    ctx.fillStyle = fill as string;
    ctx.beginPath();
    ctx.moveTo(quad[0], quad[1]);
    ctx.lineTo(quad[2], quad[3]);
    ctx.lineTo(quad[4], quad[5]);
    ctx.lineTo(quad[6], quad[7]);
    ctx.closePath();
    ctx.fill();
  };

  const fillBorderQuad = (
    textureId: number | null,
    fallback: string,
    quad: readonly number[] | null | undefined,
    anchorWorldX: number,
  ) => {
    if (!quad) return;
    const fill =
      textureId === null
        ? fallback
        : (makePattern(textureId, KERB_TEX_WORLD, anchorWorldX, 'repeat-y') ?? fallback);
    fillQuad(fill, quad);
  };

  const visibleWorldMinY = panY - (height / 2 + yOverhang) / zoom - 4;
  const visibleWorldMaxY = panY + (height / 2 + yOverhang) / zoom + 4;
  const firstSeg = Math.max(0, Math.floor(visibleWorldMinY / 2));
  const lastSeg = Math.min(level.roadSegs.length - 2, Math.ceil(visibleWorldMaxY / 2));
  const step = Math.max(1, Math.ceil(1.5 / zoom));
  const worldMinX = panX - width / (2 * zoom) - 200;
  const worldMaxX = panX + width / (2 * zoom) + 200;
  const bgBatch: number[] = [];
  const fgBatch: number[] = [];

  for (let index = firstSeg; index <= lastSeg; index += step) {
    const cur = level.roadSegs[index];
    const nxtIdx = Math.min(index + step, level.roadSegs.length - 1);
    const nxt = level.roadSegs[nxtIdx];
    const y0 = index * 2;
    const y1 = nxtIdx * 2;

    addQuad(
      bgBatch,
      worldMinX,
      y0,
      cur.v0 - KERB_WIDTH,
      y0,
      nxt.v0 - KERB_WIDTH,
      y1,
      worldMinX,
      y1,
    );
    fillBorderQuad(
      leftBorderTextureId,
      theme.kerbA,
      projectQuad(cur.v0 - KERB_WIDTH, y0, cur.v0, y0, nxt.v0, y1, nxt.v0 - KERB_WIDTH, y1),
      Math.min(cur.v0 - KERB_WIDTH, nxt.v0 - KERB_WIDTH),
    );
    addQuad(fgBatch, cur.v0, y0, cur.v1, y0, nxt.v1, y1, nxt.v0, y1);

    const medianW = Math.min(cur.v2 - cur.v1, nxt.v2 - nxt.v1);
    if (medianW > 0) {
      const halfKerb = Math.min(KERB_WIDTH, medianW / 2);
      fillBorderQuad(
        rightBorderTextureId,
        theme.kerbB,
        projectQuad(cur.v1, y0, cur.v1 + halfKerb, y0, nxt.v1 + halfKerb, y1, nxt.v1, y1),
        Math.min(cur.v1, nxt.v1),
      );
      if (medianW > halfKerb * 2) {
        addQuad(
          bgBatch,
          cur.v1 + halfKerb,
          y0,
          cur.v2 - halfKerb,
          y0,
          nxt.v2 - halfKerb,
          y1,
          nxt.v1 + halfKerb,
          y1,
        );
      }
      fillBorderQuad(
        leftBorderTextureId,
        theme.kerbA,
        projectQuad(cur.v2 - halfKerb, y0, cur.v2, y0, nxt.v2, y1, nxt.v2 - halfKerb, y1),
        Math.min(cur.v2 - halfKerb, nxt.v2 - halfKerb),
      );
    }

    addQuad(fgBatch, cur.v2, y0, cur.v3, y0, nxt.v3, y1, nxt.v2, y1);
    fillBorderQuad(
      rightBorderTextureId,
      theme.kerbB,
      projectQuad(cur.v3, y0, cur.v3 + KERB_WIDTH, y0, nxt.v3 + KERB_WIDTH, y1, nxt.v3, y1),
      Math.min(cur.v3, nxt.v3),
    );
    addQuad(
      bgBatch,
      cur.v3 + KERB_WIDTH,
      y0,
      worldMaxX,
      y0,
      worldMaxX,
      y1,
      nxt.v3 + KERB_WIDTH,
      y1,
    );
  }

  flushBatch(bgPat, bgBatch);
  flushBatch(fgPat, fgBatch);

  ctx.strokeStyle = CENTRE_COLOUR;
  ctx.lineWidth = Math.max(1, 1.5);
  ctx.setLineDash([12, 10]);
  ctx.beginPath();
  let dashStarted = false;
  for (let index = firstSeg; index <= lastSeg; index += 2) {
    const seg = level.roadSegs[index];
    const midX = (seg.v1 + seg.v2) / 2;
    const [cx, cy] = wtc(midX, index * 2);
    if (!dashStarted) {
      ctx.moveTo(cx, cy);
      dashStarted = true;
    } else {
      ctx.lineTo(cx, cy);
    }
  }
  ctx.stroke();
  ctx.setLineDash([]);

  const levelEnd = level.properties.levelEnd;
  if (levelEnd >= 0 && level.roadSegs.length > 0) {
    const endSegIdx = Math.min(Math.floor(levelEnd / 2), level.roadSegs.length - 1);
    const seg = level.roadSegs[endSegIdx];
    const [leftX, lineY] = wtc(seg.v1, levelEnd);
    const [rightX] = wtc(seg.v2, levelEnd);
    if (lineY > -10 && lineY < height + yOverhang * 2 + 10) {
      const roadWidth = Math.max(4, rightX - leftX);
      const sqSz = Math.max(6, roadWidth / 10);
      const numSq = Math.ceil(roadWidth / sqSz);
      for (let s = 0; s < numSq; s++) {
        ctx.fillStyle = s % 2 === 0 ? '#000000' : '#ffffff';
        ctx.fillRect(leftX + s * sqSz, lineY - sqSz, sqSz, sqSz * 2);
      }
      ctx.fillStyle = '#f9a825';
      ctx.font = 'bold 11px monospace';
      ctx.fillText('FINISH', leftX + 4, lineY - sqSz - 4);
    }
  }

  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.font = '9px monospace';
  const startY = Math.floor((panY - canvasH / (2 * zoom)) / 1000) * 1000;
  const endY = panY + canvasH / (2 * zoom);
  for (let wy = startY; wy <= endY; wy += 1000) {
    const [, tickY] = wtc(0, wy);
    if (tickY < 0 || tickY > canvasH) continue;
    ctx.fillRect(width - 28, tickY - 0.5, 28, 1);
    ctx.fillText(`${wy}`, width - 60, tickY - 2);
  }
}

const drawObjectRoadPreviewSafe = resultFromThrowable(
  drawObjectRoadPreview,
  'Failed to draw road preview',
);
