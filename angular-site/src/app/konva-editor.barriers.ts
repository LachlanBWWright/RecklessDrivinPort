import Konva from 'konva';

/** World-unit radius for barrier edge handles. */
export const BARRIER_WORLD_R = 8;

/** Step between shown barrier handles (every N road segments = N*2 world Y units). */
export const BARRIER_HANDLE_STEP = 10;

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
  panMode: boolean,
  cssW: number, cssH: number, logicalW: number, logicalH: number,
  zoom: number,
  panY: number,
  onBarrierDragEnd?: (segIdx: number, side: 'left' | 'right' | 'v1' | 'v2', newX: number) => void,
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
  let v1Line: Konva.Line | null = null;
  let v2Line: Konva.Line | null = null;
  if (hasMedian) {
    v1Line = new Konva.Line({
      points: v1Points,
      stroke: 'rgba(255, 200, 50, 0.7)',
      strokeWidth: 1.5 / sx,
      listening: false,
      dash: [6 / sx, 4 / sx],
    });
    v2Line = new Konva.Line({
      points: v2Points,
      stroke: 'rgba(255, 200, 50, 0.7)',
      strokeWidth: 1.5 / sx,
      listening: false,
      dash: [6 / sx, 4 / sx],
    });
    barrierWorldGroup.add(v1Line);
    barrierWorldGroup.add(v2Line);
  }

  /**
   * Update a single x-coordinate in a Konva.Line's point array for the
   * segment at index `segIdx` (in road-segment space) and immediately
   * repaint the barrier layer.  This gives zero-delay visual feedback
   * while a handle is being dragged, without a full canvas rebuild.
   */
  const updateLinePoint = (line: Konva.Line | null, segIdx: number, newX: number) => {
    if (!line) return;
    const pts = line.points();
    const ptIdx = (segIdx - segFirst) * 2;
    if (ptIdx >= 0 && ptIdx < pts.length) {
      pts[ptIdx] = newX;
      line.points(pts);
      barrierLayer.batchDraw();
    }
  };

  // Barrier drag handles – only place handles within the visible viewport
  // (plus a small margin so handles just off-screen don't pop in).
  const handleMargin = BARRIER_HANDLE_STEP * 2;
  const handleFirst  = Math.max(0, Math.floor((panY - visHalfH - handleMargin * 2) / 2));
  const handleLast   = Math.min(roadSegs.length - 1, Math.ceil((panY + visHalfH + handleMargin * 2) / 2));

  // Round handleFirst down to the nearest multiple of BARRIER_HANDLE_STEP so
  // the handle indices stay consistent between frames.
  const handleStart = Math.floor(handleFirst / BARRIER_HANDLE_STEP) * BARRIER_HANDLE_STEP;

  for (let i = handleStart; i <= handleLast; i += BARRIER_HANDLE_STEP) {
    if (i >= roadSegs.length) break;
    const seg = roadSegs[i];
    const y = i * 2;

    // Left barrier handle (v0)
    const leftCircle = new Konva.Circle({
      x: seg.v0,
      y: -y,
      radius: BARRIER_WORLD_R,
      fill: 'rgba(255, 80, 20, 0.85)',
      stroke: 'rgba(0,0,0,0.5)',
      strokeWidth: 1.5 / sx,
      draggable: !panMode,
      id: `barrier-left-${i}`,
    });
    leftCircle.setAttr('dragBoundFunc', (pos: {x: number; y: number}) => (
      { x: pos.x, y: leftCircle.getAbsolutePosition().y }
    ));
    leftCircle.on('dragmove', () => { updateLinePoint(leftLine, i, leftCircle.x()); });
    leftCircle.on('dragend', () => {
      onBarrierDragEnd?.(i, 'left', Math.round(leftCircle.x()));
      document.body.style.cursor = '';
    });
    leftCircle.on('mouseenter', () => {
      leftCircle.radius(BARRIER_WORLD_R * 1.4);
      leftCircle.stroke('#fff');
      barrierLayer.draw();
      document.body.style.cursor = 'ew-resize';
    });
    leftCircle.on('mouseleave', () => {
      leftCircle.radius(BARRIER_WORLD_R);
      leftCircle.stroke('rgba(0,0,0,0.5)');
      barrierLayer.draw();
      document.body.style.cursor = '';
    });
    leftCircle.on('dragstart', () => { document.body.style.cursor = 'ew-resize'; });
    barrierWorldGroup.add(leftCircle);

    // Right barrier handle (v3)
    const rightCircle = new Konva.Circle({
      x: seg.v3,
      y: -y,
      radius: BARRIER_WORLD_R,
      fill: 'rgba(255, 80, 20, 0.85)',
      stroke: 'rgba(0,0,0,0.5)',
      strokeWidth: 1.5 / sx,
      draggable: !panMode,
      id: `barrier-right-${i}`,
    });
    rightCircle.setAttr('dragBoundFunc', (pos: {x: number; y: number}) => (
      { x: pos.x, y: rightCircle.getAbsolutePosition().y }
    ));
    rightCircle.on('dragmove', () => { updateLinePoint(rightLine, i, rightCircle.x()); });
    rightCircle.on('dragend', () => {
      onBarrierDragEnd?.(i, 'right', Math.round(rightCircle.x()));
      document.body.style.cursor = '';
    });
    rightCircle.on('mouseenter', () => {
      rightCircle.radius(BARRIER_WORLD_R * 1.4);
      rightCircle.stroke('#fff');
      barrierLayer.draw();
      document.body.style.cursor = 'ew-resize';
    });
    rightCircle.on('mouseleave', () => {
      rightCircle.radius(BARRIER_WORLD_R);
      rightCircle.stroke('rgba(0,0,0,0.5)');
      barrierLayer.draw();
      document.body.style.cursor = '';
    });
    rightCircle.on('dragstart', () => { document.body.style.cursor = 'ew-resize'; });
    barrierWorldGroup.add(rightCircle);

    // Inner boundary handle (v1 - left inner)
    const v1Circle = new Konva.Circle({
      x: seg.v1, y: -y,
      radius: BARRIER_WORLD_R * 0.8,
      fill: 'rgba(255, 200, 20, 0.85)',
      stroke: 'rgba(0,0,0,0.5)',
      strokeWidth: 1.5 / sx,
      draggable: !panMode,
      id: `barrier-v1-${i}`,
    });
    v1Circle.setAttr('dragBoundFunc', (pos: {x: number; y: number}) => (
      { x: pos.x, y: v1Circle.getAbsolutePosition().y }
    ));
    v1Circle.on('dragmove', () => { updateLinePoint(v1Line, i, v1Circle.x()); });
    v1Circle.on('dragend', () => { onBarrierDragEnd?.(i, 'v1', Math.round(v1Circle.x())); document.body.style.cursor = ''; });
    v1Circle.on('mouseenter', () => { v1Circle.radius(BARRIER_WORLD_R); v1Circle.stroke('#fff'); barrierLayer.draw(); document.body.style.cursor = 'ew-resize'; });
    v1Circle.on('mouseleave', () => { v1Circle.radius(BARRIER_WORLD_R * 0.8); v1Circle.stroke('rgba(0,0,0,0.5)'); barrierLayer.draw(); document.body.style.cursor = ''; });
    v1Circle.on('dragstart', () => { document.body.style.cursor = 'ew-resize'; });
    barrierWorldGroup.add(v1Circle);

    // Inner boundary handle (v2 - right inner)
    const v2Circle = new Konva.Circle({
      x: seg.v2, y: -y,
      radius: BARRIER_WORLD_R * 0.8,
      fill: 'rgba(255, 200, 20, 0.85)',
      stroke: 'rgba(0,0,0,0.5)',
      strokeWidth: 1.5 / sx,
      draggable: !panMode,
      id: `barrier-v2-${i}`,
    });
    v2Circle.setAttr('dragBoundFunc', (pos: {x: number; y: number}) => (
      { x: pos.x, y: v2Circle.getAbsolutePosition().y }
    ));
    v2Circle.on('dragmove', () => { updateLinePoint(v2Line, i, v2Circle.x()); });
    v2Circle.on('dragend', () => { onBarrierDragEnd?.(i, 'v2', Math.round(v2Circle.x())); document.body.style.cursor = ''; });
    v2Circle.on('mouseenter', () => { v2Circle.radius(BARRIER_WORLD_R); v2Circle.stroke('#fff'); barrierLayer.draw(); document.body.style.cursor = 'ew-resize'; });
    v2Circle.on('mouseleave', () => { v2Circle.radius(BARRIER_WORLD_R * 0.8); v2Circle.stroke('rgba(0,0,0,0.5)'); barrierLayer.draw(); document.body.style.cursor = ''; });
    v2Circle.on('dragstart', () => { document.body.style.cursor = 'ew-resize'; });
    barrierWorldGroup.add(v2Circle);
  }
}
