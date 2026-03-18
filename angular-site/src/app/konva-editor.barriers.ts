import Konva from 'konva';

/** World-unit radius for barrier edge handles. */
export const BARRIER_WORLD_R = 8;

/** Step between shown barrier handles (every N road segments = N*2 world Y units). */
export const BARRIER_HANDLE_STEP = 10;

export function buildBarriers(
  barrierWorldGroup: Konva.Group | null,
  barrierLayer: Konva.Layer | null,
  roadSegs: readonly { v0: number; v1: number; v2: number; v3: number }[],
  panMode: boolean,
  cssW: number, cssH: number, logicalW: number, logicalH: number,
  zoom: number,
  onBarrierDragEnd?: (segIdx: number, side: 'left' | 'right' | 'v1' | 'v2', newX: number) => void,
): void {
  if (!barrierWorldGroup || !barrierLayer) return;
  barrierWorldGroup.destroyChildren();
  if (roadSegs.length === 0) return;

  const sx = zoom * (cssW / logicalW);

  const leftPoints: number[] = [];
  const rightPoints: number[] = [];
  for (let i = 0; i < roadSegs.length; i++) {
    const y = i * 2;
    leftPoints.push(roadSegs[i].v0, -y);
    rightPoints.push(roadSegs[i].v3, -y);
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

  // Also draw v1/v2 lines (inner lane boundaries) - lighter color
  const v1Points: number[] = [];
  const v2Points: number[] = [];
  for (let i = 0; i < roadSegs.length; i++) {
    const y = i * 2;
    v1Points.push(roadSegs[i].v1, -y);
    v2Points.push(roadSegs[i].v2, -y);
  }
  const v1Line = new Konva.Line({
    points: v1Points,
    stroke: 'rgba(255, 200, 50, 0.5)',
    strokeWidth: 1.5 / sx,
    listening: false,
    dash: [6, 4],
  });
  const v2Line = new Konva.Line({
    points: v2Points,
    stroke: 'rgba(255, 200, 50, 0.5)',
    strokeWidth: 1.5 / sx,
    listening: false,
    dash: [6, 4],
  });
  barrierWorldGroup.add(v1Line);
  barrierWorldGroup.add(v2Line);

  for (let i = 0; i < roadSegs.length; i += BARRIER_HANDLE_STEP) {
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
    v2Circle.on('dragend', () => { onBarrierDragEnd?.(i, 'v2', Math.round(v2Circle.x())); document.body.style.cursor = ''; });
    v2Circle.on('mouseenter', () => { v2Circle.radius(BARRIER_WORLD_R); v2Circle.stroke('#fff'); barrierLayer.draw(); document.body.style.cursor = 'ew-resize'; });
    v2Circle.on('mouseleave', () => { v2Circle.radius(BARRIER_WORLD_R * 0.8); v2Circle.stroke('rgba(0,0,0,0.5)'); barrierLayer.draw(); document.body.style.cursor = ''; });
    v2Circle.on('dragstart', () => { document.body.style.cursor = 'ew-resize'; });
    barrierWorldGroup.add(v2Circle);
  }
}
