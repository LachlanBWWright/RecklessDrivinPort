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
  onBarrierDragEnd?: (segIdx: number, side: 'left' | 'right', newX: number) => void,
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
      dragBoundFunc: (pos) => {
        return { x: pos.x, y: leftCircle.getAbsolutePosition().y };
      },
    });
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
      dragBoundFunc: (pos) => {
        return { x: pos.x, y: rightCircle.getAbsolutePosition().y };
      },
    });
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
  }
}
