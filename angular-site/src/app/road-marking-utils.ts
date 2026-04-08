import type { MarkSeg, RoadSeg } from './level-editor.service';

export type BarrierDrawSide = 'v0' | 'v1' | 'i' | 'v2' | 'v3';
export type MarkingRoadSelection = 'single' | 'left' | 'right' | 'both';

export interface WorldPoint {
  x: number;
  y: number;
}

export interface SideMarkGenerationOptions {
  roadSelection: MarkingRoadSelection;
  yStart: number;
  yEnd: number;
  inset: number;
  yFrequency: number;
}

export interface CentreDashGenerationOptions {
  roadSelection: MarkingRoadSelection;
  yStart: number;
  yEnd: number;
  dashLength: number;
  gapLength: number;
}

interface LinePoint {
  x: number;
  y: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function insetBounds(left: number, right: number, inset: number): [number, number] {
  const safeInset = Math.max(0, inset);
  const innerLeft = left + safeInset;
  const innerRight = right - safeInset;
  if (innerLeft <= innerRight) return [innerLeft, innerRight];
  const mid = (left + right) / 2;
  return [mid, mid];
}

function isMerged(seg: RoadSeg): boolean {
  return Math.abs(seg.v2 - seg.v1) <= 0.5;
}

export function clampBarrierPoint(seg: RoadSeg, side: BarrierDrawSide, newX: number): RoadSeg {
  switch (side) {
    case 'v0':
      return { ...seg, v0: Math.round(Math.min(newX, seg.v1)) };
    case 'v1':
      return { ...seg, v1: Math.round(clamp(newX, seg.v0, seg.v2)) };
    case 'i': {
      const inner = Math.round(clamp(newX, seg.v0, seg.v3));
      return { ...seg, v1: inner, v2: inner };
    }
    case 'v2':
      return { ...seg, v2: Math.round(clamp(newX, seg.v1, seg.v3)) };
    case 'v3':
      return { ...seg, v3: Math.round(Math.max(newX, seg.v2)) };
  }
}

export function sampleQuadraticBezier(
  start: WorldPoint,
  control: WorldPoint,
  end: WorldPoint,
  steps?: number,
): WorldPoint[] {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const curveDist = Math.hypot(dx, dy) + Math.hypot(control.x - start.x, control.y - start.y) + Math.hypot(end.x - control.x, end.y - control.y);
  const stepCount = Math.max(16, steps ?? Math.ceil(curveDist / 12));
  const points: WorldPoint[] = [];
  for (let i = 0; i <= stepCount; i++) {
    const t = i / stepCount;
    const mt = 1 - t;
    points.push({
      x: mt * mt * start.x + 2 * mt * t * control.x + t * t * end.x,
      y: mt * mt * start.y + 2 * mt * t * control.y + t * t * end.y,
    });
  }
  return points;
}

function collectLineGroups(
  roadSegs: readonly RoadSeg[],
  yStart: number,
  yEnd: number,
  getPoint: (seg: RoadSeg, y: number) => LinePoint | null,
): LinePoint[][] {
  if (roadSegs.length < 2) return [];
  const minY = Math.max(0, Math.min(yStart, yEnd));
  const maxY = Math.max(yStart, yEnd);
  const startIdx = Math.max(0, Math.floor(minY / 2));
  const endIdx = Math.min(roadSegs.length - 1, Math.ceil(maxY / 2));
  const groups: LinePoint[][] = [];
  let current: LinePoint[] = [];

  for (let i = startIdx; i <= endIdx; i++) {
    const y = i * 2;
    if (y < minY || y > maxY) continue;
    const point = getPoint(roadSegs[i], y);
    if (!point) {
      if (current.length >= 2) groups.push(current);
      current = [];
      continue;
    }
    current.push(point);
  }

  if (current.length >= 2) groups.push(current);
  return groups;
}

function lineGroupToSegments(points: readonly LinePoint[]): MarkSeg[] {
  const segments: MarkSeg[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    segments.push({
      x1: Math.round(points[i].x),
      y1: Math.round(points[i].y),
      x2: Math.round(points[i + 1].x),
      y2: Math.round(points[i + 1].y),
    });
  }
  return segments;
}

function pointAtDistance(points: readonly LinePoint[], distance: number): LinePoint {
  if (distance <= 0) return points[0];
  let remaining = distance;
  for (let i = 0; i < points.length - 1; i++) {
    const start = points[i];
    const end = points[i + 1];
    const segLen = Math.hypot(end.x - start.x, end.y - start.y);
    if (segLen === 0) continue;
    if (remaining <= segLen) {
      const t = remaining / segLen;
      return {
        x: start.x + (end.x - start.x) * t,
        y: start.y + (end.y - start.y) * t,
      };
    }
    remaining -= segLen;
  }
  return points[points.length - 1];
}

function dashedSegmentsFromGroup(points: readonly LinePoint[], dashLength: number, gapLength: number): MarkSeg[] {
  const safeDashLength = Math.max(1, dashLength);
  const safeGapLength = Math.max(1, gapLength);
  const cycle = safeDashLength + safeGapLength;
  let totalLen = 0;
  for (let i = 0; i < points.length - 1; i++) {
    totalLen += Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y);
  }

  const segments: MarkSeg[] = [];
  for (let offset = 0; offset < totalLen; offset += cycle) {
    const from = pointAtDistance(points, offset);
    const to = pointAtDistance(points, Math.min(totalLen, offset + safeDashLength));
    segments.push({
      x1: Math.round(from.x),
      y1: Math.round(from.y),
      x2: Math.round(to.x),
      y2: Math.round(to.y),
    });
  }
  return segments;
}

function shouldUseMergedRoad(selection: MarkingRoadSelection): boolean {
  return selection === 'single' || selection === 'both';
}

function shouldUseLeftRoad(selection: MarkingRoadSelection): boolean {
  return selection === 'left' || selection === 'both';
}

function shouldUseRightRoad(selection: MarkingRoadSelection): boolean {
  return selection === 'right' || selection === 'both';
}

export function generateSideMarkings(
  roadSegs: readonly RoadSeg[],
  options: SideMarkGenerationOptions,
): MarkSeg[] {
  const inset = Math.max(0, options.inset);
  const cycle = Math.max(2, options.yFrequency);
  const dashLength = Math.max(1, Math.round(cycle / 2));
  const gapLength = Math.max(1, cycle - dashLength);
  const groups: LinePoint[][] = [];

  const addGroup = (getPoint: (seg: RoadSeg, y: number) => LinePoint | null) => {
    groups.push(...collectLineGroups(roadSegs, options.yStart, options.yEnd, getPoint));
  };

  addGroup((seg, y) => {
    if (isMerged(seg)) {
      if (!shouldUseMergedRoad(options.roadSelection)) return null;
    } else if (!shouldUseLeftRoad(options.roadSelection)) {
      return null;
    }
    const [outerLeft] = insetBounds(seg.v0, isMerged(seg) ? seg.v3 : seg.v1, inset);
    return { x: outerLeft, y };
  });

  addGroup((seg, y) => {
    if (isMerged(seg)) {
      if (!shouldUseMergedRoad(options.roadSelection)) return null;
    } else if (!shouldUseLeftRoad(options.roadSelection)) {
      return null;
    }
    const [, innerRight] = insetBounds(seg.v0, isMerged(seg) ? seg.v3 : seg.v1, inset);
    return { x: innerRight, y };
  });

  addGroup((seg, y) => {
    if (isMerged(seg) || !shouldUseRightRoad(options.roadSelection)) return null;
    const [outerLeft] = insetBounds(seg.v2, seg.v3, inset);
    return { x: outerLeft, y };
  });

  addGroup((seg, y) => {
    if (isMerged(seg) || !shouldUseRightRoad(options.roadSelection)) return null;
    const [, innerRight] = insetBounds(seg.v2, seg.v3, inset);
    return { x: innerRight, y };
  });

  return groups.flatMap((group) => dashedSegmentsFromGroup(group, dashLength, gapLength));
}

export function generateCentreDashMarkings(
  roadSegs: readonly RoadSeg[],
  options: CentreDashGenerationOptions,
): MarkSeg[] {
  const dashLength = Math.max(1, options.dashLength);
  const gapLength = Math.max(1, options.gapLength);
  const groups: LinePoint[][] = [];

  const addGroup = (getPoint: (seg: RoadSeg, y: number) => LinePoint | null) => {
    groups.push(...collectLineGroups(roadSegs, options.yStart, options.yEnd, getPoint));
  };

  addGroup((seg, y) => {
    if (isMerged(seg) || !shouldUseLeftRoad(options.roadSelection)) return null;
    return { x: (seg.v0 + seg.v1) / 2, y };
  });

  addGroup((seg, y) => {
    if (isMerged(seg)) {
      if (!shouldUseMergedRoad(options.roadSelection)) return null;
      return { x: (seg.v0 + seg.v3) / 2, y };
    }
    return null;
  });

  addGroup((seg, y) => {
    if (isMerged(seg) || !shouldUseRightRoad(options.roadSelection)) return null;
    return { x: (seg.v2 + seg.v3) / 2, y };
  });

  return groups.flatMap((group) => dashedSegmentsFromGroup(group, dashLength, gapLength));
}
