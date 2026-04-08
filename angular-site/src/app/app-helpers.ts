import type {
  MarkSeg,
  ObjectTypeDefinition,
  ParsedLevel,
  RoadInfoData,
  RoadTileGroup,
  TextureTileEntry,
  TrackMidpointRef,
  TrackWaypointRef,
} from './level-editor.service';

export interface RoadThemeLike {
  bg: string;
  road: string;
  dirt: string;
  kerbA: string;
  kerbB: string;
  water: boolean;
}

export interface RoadPreviewCache {
  _roadOffscreen: HTMLCanvasElement | null;
  _roadOffscreenKey: string;
  _roadOffscreenPanY: number;
}

export interface RoadPreviewDeps {
  roadInfoDataMap: Map<number, RoadInfoData>;
  roadTextureCanvases: Map<number, HTMLCanvasElement>;
}

export interface TrackOverlayPoint {
  x: number;
  y: number;
}

export const ROAD_OVERHANG_PX = 700;

function sortNumbers(values: Iterable<number>): number[] {
  return Array.from(values).sort((a, b) => a - b);
}

export function getRoadReferenceLevelNums(levels: ParsedLevel[], roadInfoId: number): number[] {
  return levels
    .filter((level) => level.properties.roadInfo === roadInfoId)
    .map((level) => level.resourceId - 139)
    .sort((a, b) => a - b);
}

export function getTileReferenceRoadInfoIds(
  roadInfoDataMap: Map<number, RoadInfoData>,
  roadInfoIds: Iterable<number>,
  texId: number,
): number[] {
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

export function buildRoadTileGroups(
  roadInfoDataMap: Map<number, RoadInfoData>,
  roadInfoIds: Iterable<number>,
  entries: TextureTileEntry[],
): RoadTileGroup[] {
  const sortedEntries = [...entries].sort((a, b) => a.texId - b.texId);
  const entryByTexId = new Map(sortedEntries.map((entry) => [entry.texId, entry]));
  const groups: RoadTileGroup[] = [];

  for (const roadInfoId of sortNumbers(roadInfoIds)) {
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
    if (tiles.length > 0) {
      groups.push({ roadInfoId, label: `Road ${roadInfoId}`, tiles });
    }
  }

  const referenced = new Set<number>(groups.flatMap((group) => group.tiles.map((tile) => tile.texId)));
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
  const ri = roadInfoDataMap.get(roadInfoId);
  const makePattern = (texId: number, texWorldSize: number): CanvasPattern | string | null => {
    const tc = roadTextureCanvases.get(texId);
    if (!tc) return null;
    try {
      const pat = ctx.createPattern(tc, 'repeat');
      if (!pat) return null;
      const scale = texWorldSize / tc.width;
      pat.setTransform(new DOMMatrix([scale, 0, 0, scale, 0, 0]));
      return pat;
    } catch {
      return null;
    }
  };

  const bgFill = ri ? (makePattern(ri.backgroundTex, 128) ?? theme.bg) : theme.bg;
  const roadFill = ri ? (makePattern(ri.foregroundTex, 128) ?? theme.road) : theme.road;
  const leftFill = ri ? (makePattern(ri.roadLeftBorder, 16) ?? theme.kerbA) : theme.kerbA;
  const rightFill = ri ? (makePattern(ri.roadRightBorder, 16) ?? theme.kerbB) : theme.kerbB;

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
  const zoom = Math.min(10, Math.max(0.1, Math.min(viewportWidth / paddedWidth, viewportHeight / paddedHeight)));
  return {
    zoom,
    panX: (minX + maxX) / 2,
    panY: (minY + maxY) / 2,
  };
}

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
): void {
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
    if (!cache._roadOffscreen || cache._roadOffscreen.width !== width || cache._roadOffscreen.height !== offH) {
      cache._roadOffscreen = doc?.createElement('canvas') ?? null;
      if (!cache._roadOffscreen) return;
      cache._roadOffscreen.width = width;
      cache._roadOffscreen.height = offH;
    }
    const offCtx = cache._roadOffscreen.getContext('2d');
    if (offCtx) {
      offCtx.clearRect(0, 0, width, offH);
      let renderOk = false;
      try {
        drawObjectRoadPreview(deps, doc, offCtx, level, theme, panX, panY, zoom, width, height, overhang);
        renderOk = true;
      } catch {
        offCtx.fillStyle = theme.bg;
        offCtx.fillRect(0, 0, width, offH);
      }
      if (renderOk) {
        cache._roadOffscreenKey = staticKey;
      }
    }
  }

  if (!cache._roadOffscreen) return;
  const offscreenSrcY = offscreenCentreCanvasY - (panY - cache._roadOffscreenPanY) * zoom - height / 2;
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
): void {
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
  ): CanvasPattern | string | null => {
    const tc = deps.roadTextureCanvases.get(texId);
    if (!tc) return null;
    try {
      const pat = ctx.createPattern(tc, 'repeat');
      if (!pat) return null;
      const scale = (texWorldSize * zoom) / tc.width;
      const tileW = texWorldSize * zoom;
      const tileH = tc.height * scale;
      const tx = (((width / 2 + (anchorWorldX - panX) * zoom) % tileW) + tileW) % tileW;
      const ty = (((height / 2 + yOverhang + panY * zoom) % tileH) + tileH) % tileH;
      pat.setTransform(new DOMMatrix([scale, 0, 0, scale, tx, ty]));
      return pat;
    } catch {
      return null;
    }
  };

  const bgPat = ri ? (makePattern(ri.backgroundTex, 128) ?? theme.bg) : theme.bg;
  const fgPat = ri ? (makePattern(ri.foregroundTex, 128) ?? theme.road) : theme.road;
  const KERB_TEX_WORLD = 16;
  const lbPat = ri ? (makePattern(ri.roadLeftBorder, KERB_TEX_WORLD) ?? theme.kerbA) : theme.kerbA;
  const rbPat = ri ? (makePattern(ri.roadRightBorder, KERB_TEX_WORLD) ?? theme.kerbB) : theme.kerbB;
  const CENTRE_COLOUR = theme.water ? 'rgba(80, 255, 180, 0.85)' : 'rgba(255, 248, 140, 0.85)';

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
  ): void => {
    const [ax0, ay0] = wtc(x0, y0);
    const [ax1, ay1] = wtc(x1, y1);
    const [ax2, ay2] = wtc(x2, y2);
    const [ax3, ay3] = wtc(x3, y3);
    if (ay0 < 0 && ay1 < 0 && ay2 < 0 && ay3 < 0) return;
    if (ay0 > canvasH && ay1 > canvasH && ay2 > canvasH && ay3 > canvasH) return;
    batch.push(ax0, ay0, ax1, ay1, ax2, ay2, ax3, ay3);
  };

  const flushBatch = (fill: CanvasPattern | string, batch: number[]): void => {
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

  const visibleWorldMinY = panY - (height / 2 + yOverhang) / zoom - 4;
  const visibleWorldMaxY = panY + (height / 2 + yOverhang) / zoom + 4;
  const firstSeg = Math.max(0, Math.floor(visibleWorldMinY / 2));
  const lastSeg = Math.min(level.roadSegs.length - 2, Math.ceil(visibleWorldMaxY / 2));
  const step = Math.max(1, Math.ceil(1.5 / zoom));
  const worldMinX = panX - width / (2 * zoom) - 200;
  const worldMaxX = panX + width / (2 * zoom) + 200;
  const bgBatch: number[] = [];
  const fgBatch: number[] = [];
  const lbBatch: number[] = [];
  const rbBatch: number[] = [];

  for (let index = firstSeg; index <= lastSeg; index += step) {
    const cur = level.roadSegs[index];
    const nxtIdx = Math.min(index + step, level.roadSegs.length - 1);
    const nxt = level.roadSegs[nxtIdx];
    const y0 = index * 2;
    const y1 = nxtIdx * 2;

    addQuad(bgBatch, worldMinX, y0, cur.v0 - KERB_WIDTH, y0, nxt.v0 - KERB_WIDTH, y1, worldMinX, y1);
    addQuad(lbBatch, cur.v0 - KERB_WIDTH, y0, cur.v0, y0, nxt.v0, y1, nxt.v0 - KERB_WIDTH, y1);
    addQuad(fgBatch, cur.v0, y0, cur.v1, y0, nxt.v1, y1, nxt.v0, y1);

    const medianW = Math.min(cur.v2 - cur.v1, nxt.v2 - nxt.v1);
    if (medianW > 0) {
      const halfKerb = Math.min(KERB_WIDTH, medianW / 2);
      addQuad(rbBatch, cur.v1, y0, cur.v1 + halfKerb, y0, nxt.v1 + halfKerb, y1, nxt.v1, y1);
      if (medianW > halfKerb * 2) {
        addQuad(bgBatch, cur.v1 + halfKerb, y0, cur.v2 - halfKerb, y0, nxt.v2 - halfKerb, y1, nxt.v1 + halfKerb, y1);
      }
      addQuad(lbBatch, cur.v2 - halfKerb, y0, cur.v2, y0, nxt.v2, y1, nxt.v2 - halfKerb, y1);
    }

    addQuad(fgBatch, cur.v2, y0, cur.v3, y0, nxt.v3, y1, nxt.v2, y1);
    addQuad(rbBatch, cur.v3, y0, cur.v3 + KERB_WIDTH, y0, nxt.v3 + KERB_WIDTH, y1, nxt.v3, y1);
    addQuad(bgBatch, cur.v3 + KERB_WIDTH, y0, worldMaxX, y0, worldMaxX, y1, nxt.v3 + KERB_WIDTH, y1);
  }

  flushBatch(bgPat, bgBatch);
  flushBatch(lbPat, lbBatch);
  flushBatch(rbPat, rbBatch);
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

export function drawObjectTrackOverlay(
  ctx: CanvasRenderingContext2D,
  worldToCanvas: (x: number, y: number) => [number, number],
  zoom: number,
  dragWp: TrackWaypointRef | null,
  hoverWp: TrackWaypointRef | null,
  hoverMid: TrackMidpointRef | null,
  editTrackUp: { x: number; y: number }[],
  editTrackDown: { x: number; y: number }[],
): void {
  const canvas = ctx.canvas as HTMLCanvasElement;
  const width = canvas.width;
  const height = canvas.height;

  const drawPath = (
    segs: { x: number; y: number }[],
    lineColor: string,
    dotColor: string,
    label: string,
    track: 'up' | 'down',
  ): void => {
    if (segs.length === 0) return;

    ctx.strokeStyle = lineColor;
    ctx.lineWidth = Math.max(1.5, 2.5 * Math.min(zoom, 1));
    ctx.beginPath();
    segs.forEach((seg, i) => {
      const [cx, cy] = worldToCanvas(seg.x, seg.y);
      if (i === 0) ctx.moveTo(cx, cy);
      else ctx.lineTo(cx, cy);
    });
    ctx.stroke();

    const arrowStep = Math.max(1, Math.floor(segs.length / 10));
    ctx.fillStyle = lineColor;
    for (let i = arrowStep; i < segs.length - 1; i += arrowStep) {
      const [x1, y1] = worldToCanvas(segs[i - 1].x, segs[i - 1].y);
      const [x2, y2] = worldToCanvas(segs[i].x, segs[i].y);
      const angle = Math.atan2(y2 - y1, x2 - x1);
      const sz = 7;
      ctx.save();
      ctx.translate(x2, y2);
      ctx.rotate(angle);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-sz, -sz / 2);
      ctx.lineTo(-sz, sz / 2);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    const showAllMids = zoom > 0.5 && segs.length <= 80;
    for (let i = 0; i < segs.length - 1; i++) {
      const isHovMid = hoverMid?.track === track && hoverMid.segIdx === i;
      if (!isHovMid && !showAllMids) continue;
      const mx = (segs[i].x + segs[i + 1].x) / 2;
      const my = (segs[i].y + segs[i + 1].y) / 2;
      const [cx, cy] = worldToCanvas(mx, my);
      if (cx < -10 || cx > width + 10 || cy < -10 || cy > height + 10) continue;
      const size = isHovMid ? 9 : 5;
      ctx.fillStyle = isHovMid ? '#ffdd00' : 'rgba(255,255,255,0.35)';
      ctx.strokeStyle = isHovMid ? 'rgba(0,0,0,0.7)' : 'rgba(0,0,0,0.2)';
      ctx.lineWidth = isHovMid ? 1.5 : 0.8;
      ctx.beginPath();
      ctx.moveTo(cx, cy - size);
      ctx.lineTo(cx + size, cy);
      ctx.lineTo(cx, cy + size);
      ctx.lineTo(cx - size, cy);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    const dotEvery = Math.max(1, Math.floor(segs.length / 40));
    const dotR = Math.max(3, Math.min(6, 4 * zoom));
    for (let i = 0; i < segs.length; i += dotEvery) {
      const [cx, cy] = worldToCanvas(segs[i].x, segs[i].y);
      if (cx < -10 || cx > width + 10 || cy < -10 || cy > height + 10) continue;
      const isDragged = dragWp?.track === track && dragWp.segIdx === i;
      const isHovered = !isDragged && hoverWp?.track === track && hoverWp.segIdx === i;
      ctx.fillStyle = isDragged ? '#ffffff' : isHovered ? '#ffdd00' : dotColor;
      ctx.beginPath();
      ctx.arc(cx, cy, isDragged ? dotR + 3 : isHovered ? dotR + 2 : dotR, 0, Math.PI * 2);
      ctx.fill();
      if (isHovered) {
        ctx.strokeStyle = 'rgba(255,255,255,0.7)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }

    const [sx, sy] = worldToCanvas(segs[0].x, segs[0].y);
    if (sx > -20 && sx < width + 20 && sy > -20 && sy < height + 20) {
      ctx.fillStyle = lineColor;
      ctx.beginPath();
      ctx.arc(sx, sy, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = 'bold 10px monospace';
      ctx.fillText(label, sx + 9, sy + 4);
    }
  };

  drawPath(editTrackUp, 'rgba(66,165,245,0.9)', 'rgba(66,165,245,0.7)', '▲ Up', 'up');
  drawPath(editTrackDown, 'rgba(239,83,80,0.9)', 'rgba(239,83,80,0.7)', '▼ Down', 'down');
}

export function drawMarksOnCanvas(
  ctx: CanvasRenderingContext2D,
  worldToCanvas: (x: number, y: number) => [number, number],
  marks: MarkSeg[],
  selectedMarkIndex: number | null,
  konvaActive: boolean,
  markCreateMode: boolean,
  pendingMarkPoints: TrackOverlayPoint[],
  markCreateHoverPoint: TrackOverlayPoint | null,
): void {
  marks.forEach((m, i) => {
    const [x1, y1] = worldToCanvas(m.x1, m.y1);
    const [x2, y2] = worldToCanvas(m.x2, m.y2);
    const isSel = i === selectedMarkIndex;
    ctx.strokeStyle = isSel ? '#00e5ff' : '#ffd600';
    ctx.lineWidth = isSel ? 3 : 2;
    ctx.setLineDash(isSel ? [] : [8, 4]);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    if (!konvaActive) {
      ctx.fillStyle = isSel ? '#00e5ff' : '#ffd600';
      [
        [x1, y1],
        [x2, y2],
      ].forEach(([px, py]) => {
        ctx.beginPath();
        ctx.arc(px, py, isSel ? 12 : 8, 0, Math.PI * 2);
        ctx.fill();
      });
    }
  });

  if (markCreateMode && pendingMarkPoints.length > 0) {
    const last = pendingMarkPoints[pendingMarkPoints.length - 1];
    const [px, py] = worldToCanvas(last.x, last.y);
    ctx.fillStyle = '#00e5ff';
    ctx.beginPath();
    ctx.arc(px, py, 8, 0, Math.PI * 2);
    ctx.fill();
    if (markCreateHoverPoint) {
      const [hx, hy] = worldToCanvas(markCreateHoverPoint.x, markCreateHoverPoint.y);
      ctx.strokeStyle = 'rgba(0,229,255,0.8)';
      ctx.lineWidth = 2;
      ctx.setLineDash([10, 6]);
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(hx, hy);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
}

export function renderSpritePixels(
  doc: Document | undefined,
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
): HTMLCanvasElement | null {
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

export function getCanvasDataUrl(
  cache: Map<number, string>,
  canvases: Map<number, HTMLCanvasElement>,
  id: number,
): string | null {
  const cached = cache.get(id);
  if (cached) return cached;
  const canvas = canvases.get(id) ?? null;
  if (!canvas) return null;
  try {
    const url = canvas.toDataURL();
    cache.set(id, url);
    return url;
  } catch {
    return null;
  }
}

export function getKeyedCanvasDataUrl(
  cache: Map<string, string>,
  canvases: Map<string, HTMLCanvasElement>,
  key: string,
): string | null {
  const cached = cache.get(key);
  if (cached) return cached;
  const canvas = canvases.get(key);
  if (!canvas) return null;
  try {
    const url = canvas.toDataURL();
    cache.set(key, url);
    return url;
  } catch {
    return null;
  }
}

export function getTileDimensions(entries: TextureTileEntry[], texId: number): string {
  const entry = entries.find((tile) => tile.texId === texId);
  if (!entry) return '?';
  return `${entry.width}×${entry.height} px`;
}

export function getObjTypeDimensionLabel(
  objectTypeDefinitionMap: Map<number, ObjectTypeDefinition>,
  typeRes: number,
): string {
  const def = objectTypeDefinitionMap.get(typeRes);
  if (!def) return '';
  return `${def.width.toFixed(1)}×${def.length.toFixed(1)} m`;
}

export function getObjFallbackColor(typeRes: number, palette: readonly string[]): string {
  const paletteIdx = ((typeRes % palette.length) + palette.length) % palette.length;
  return palette[paletteIdx] ?? '#888888';
}
