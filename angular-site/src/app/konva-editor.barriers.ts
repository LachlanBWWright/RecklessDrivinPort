import Konva from 'konva';

/**
 * Extra segment margin on each side of the visible viewport when building
 * barrier polylines. This prevents the lines from being visibly "cut off" at
 * the top and bottom of the screen.  At zoom=1, 2 world units ≈ 1 segment, so
 * 200 segments ≈ 400 world units of padding beyond the screen edge.
 */
const BARRIER_CULL_MARGIN = 200;

export function buildBarriers(
  barrierWorldGroup: Konva.Group | null,
  barrierLayer: Konva.Layer | null,
  roadSegs: readonly { v0: number; v1: number; v2: number; v3: number }[],
  cssW: number, cssH: number, logicalW: number, logicalH: number,
  zoom: number,
  panY: number,
): void {
  if (!barrierWorldGroup || !barrierLayer) return;
  barrierWorldGroup.destroyChildren();
  if (roadSegs.length === 0) return;

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
  const v1Points: number[] = [];
  const v2Points: number[] = [];
  for (let i = segFirst; i <= segLast; i++) {
    const y = i * 2;
    leftPoints.push(roadSegs[i].v0, -y);
    rightPoints.push(roadSegs[i].v3, -y);
    v1Points.push(roadSegs[i].v1, -y);
    v2Points.push(roadSegs[i].v2, -y);
  }

  const leftLine = new Konva.Line({
    points: leftPoints,
    stroke: 'rgba(255, 100, 50, 0.7)',
    strokeWidth: 2 / sx,
    listening: false,
  });
  const rightLine = new Konva.Line({
    points: rightPoints,
    stroke: 'rgba(255, 100, 50, 0.7)',
    strokeWidth: 2 / sx,
    listening: false,
  });
  barrierWorldGroup.add(leftLine);
  barrierWorldGroup.add(rightLine);

  // Draw v1/v2 lines (inner lane boundaries) - lighter color
  // Only show the v1/v2 lines when there actually IS a median (v1 ≠ v2).
  // If all visible segments have v1 == v2 the road is a single road and the
  // dashed lines would be on top of each other — skip them in that case.
  let hasMedian = false;
  for (let i = segFirst; i <= segLast; i++) {
    if (roadSegs[i].v2 - roadSegs[i].v1 > 2) { hasMedian = true; break; }
  }
  if (hasMedian) {
    const v1Line = new Konva.Line({
      points: v1Points,
      stroke: 'rgba(255, 200, 50, 0.7)',
      strokeWidth: 1.5 / sx,
      listening: false,
      dash: [6 / sx, 4 / sx],
    });
    const v2Line = new Konva.Line({
      points: v2Points,
      stroke: 'rgba(255, 200, 50, 0.7)',
      strokeWidth: 1.5 / sx,
      listening: false,
      dash: [6 / sx, 4 / sx],
    });
    barrierWorldGroup.add(v1Line);
    barrierWorldGroup.add(v2Line);
  }
}
