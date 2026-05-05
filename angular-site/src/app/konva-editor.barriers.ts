import Konva from 'konva';

/**
 * Extra segment margin on each side of the visible viewport when building
 * barrier polylines. This prevents the lines from being visibly "cut off" at
 * the top and bottom of the screen.  At zoom=1, 2 world units ≈ 1 segment, so
 * 200 segments ≈ 400 world units of padding beyond the screen edge.
 */
const BARRIER_CULL_MARGIN = 200;

/** Stable node IDs used to reuse Konva Line nodes across rebuilds. */
const LINE_IDS = {
  v0: 'barrier-v0',
  v3: 'barrier-v3',
  v1: 'barrier-v1',
  v2: 'barrier-v2',
} as const;

/**
 * Ensure a Konva Line with the given id exists in the group.
 * Creates it on first call, reuses it on subsequent calls.
 */
function getOrCreateLine(
  group: Konva.Group,
  id: string,
  attrs: {
    stroke: string;
    strokeWidth: number;
    listening: false;
    dash?: number[];
  },
): Konva.Line {
  const existing = group.findOne(`#${id}`);
  if (existing instanceof Konva.Line) {
    existing.stroke(attrs.stroke);
    existing.strokeWidth(attrs.strokeWidth);
    if (attrs.dash) existing.dash(attrs.dash);
    // Cast to the return type after updating attributes
    return existing as unknown as Konva.Line;
  }
  const line = new Konva.Line({ ...attrs, id });
  group.add(line);
  return line;
}

export function buildBarriers(
  barrierWorldGroup: Konva.Group | null,
  barrierLayer: Konva.Layer | null,
  roadSegs: readonly { v0: number; v1: number; v2: number; v3: number }[],
  cssW: number, cssH: number, logicalW: number, logicalH: number,
  zoom: number,
  panY: number,
): void {
  if (!barrierWorldGroup || !barrierLayer) return;

  if (roadSegs.length === 0) {
    barrierWorldGroup.destroyChildren();
    return;
  }

  const sx = zoom * (cssW / logicalW);
  const sy = zoom * (cssH / logicalH);

  // Compute the visible world-Y range so we only build polyline points for
  // segments that are near the viewport.  This reduces the polyline from O(all
  // segments) down to O(viewport) — a major performance improvement for long
  // roads (e.g. 3000 segments at zoom=1 → only ~400 visible at any one time).
  const visHalfH = (cssH / sy) / 2;
  const visMinY  = panY - visHalfH - BARRIER_CULL_MARGIN * 2;  // world Y
  const visMaxY  = panY + visHalfH + BARRIER_CULL_MARGIN * 2;

  // Convert world-Y range to segment indices (each segment spans 2 world-Y units)
  const segFirst = Math.max(0, Math.floor(visMinY / 2));
  const segLast  = Math.min(roadSegs.length - 1, Math.ceil(visMaxY / 2));

  const leftPoints: number[] = [];
  const rightPoints: number[] = [];
  for (let i = segFirst; i <= segLast; i++) {
    const y = i * 2;
    leftPoints.push(roadSegs[i].v0, -y);
    rightPoints.push(roadSegs[i].v3, -y);
  }

  const lineW = 2 / sx;

  // Reuse existing Konva Line nodes instead of destroying and recreating.
  // This avoids the GC pressure of Konva.Line destructions per scroll frame.
  const leftLine = getOrCreateLine(barrierWorldGroup, LINE_IDS.v0, {
    stroke: 'rgba(255, 100, 50, 0.7)',
    strokeWidth: lineW,
    listening: false,
  });
  leftLine.points(leftPoints);

  const rightLine = getOrCreateLine(barrierWorldGroup, LINE_IDS.v3, {
    stroke: 'rgba(255, 100, 50, 0.7)',
    strokeWidth: lineW,
    listening: false,
  });
  rightLine.points(rightPoints);

  const v1Line = barrierWorldGroup.findOne(`#${LINE_IDS.v1}`);
  const v2Line = barrierWorldGroup.findOne(`#${LINE_IDS.v2}`);
  v1Line?.visible(false);
  v2Line?.visible(false);
}
