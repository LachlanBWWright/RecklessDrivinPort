import Konva from 'konva';

export interface FinishLineCallbacks {
  onStart?: (worldY: number) => void;
  onMove?: (worldY: number) => void;
  onEnd?: (worldY: number) => void;
}

export function updateFinishLine(
  group: Konva.Group,
  layer: Konva.Layer,
  existing: Konva.Line | null,
  levelEnd: number,
  zoom: number,
  cssH: number,
  logicalW: number,
  logicalH: number,
  panMode: boolean,
  callbacks: FinishLineCallbacks,
): Konva.Line {
  const scaleY = zoom * (cssH / logicalH);
  const strokeWidth = Math.max(2, 2.5 / Math.max(0.0001, scaleY));
  const hitStrokeWidth = 28 / Math.max(0.0001, scaleY);
  const dash = [10 / Math.max(0.0001, scaleY), 6 / Math.max(0.0001, scaleY)];
  const fixedX = -logicalW * 2;
  const fixedW = logicalW * 4;
  const node = existing ?? createFinishLine(group, fixedX, fixedW, panMode, callbacks);
  node.points([fixedX, 0, fixedW, 0]);
  node.y(-levelEnd);
  node.strokeWidth(strokeWidth);
  node.hitStrokeWidth(hitStrokeWidth);
  node.dash(dash);
  node.draggable(!panMode);
  layer.batchDraw();
  return node;
}

function createFinishLine(
  group: Konva.Group,
  fixedX: number,
  fixedW: number,
  panMode: boolean,
  callbacks: FinishLineCallbacks,
): Konva.Line {
  const node = new Konva.Line({
    points: [fixedX, 0, fixedW, 0],
    stroke: '#f9a825',
    strokeWidth: 2,
    lineCap: 'round',
    lineJoin: 'round',
    listening: true,
    draggable: !panMode,
    id: 'finish-line',
    hitStrokeWidth: 28,
  });
  node.dragBoundFunc((pos) => ({ x: 0, y: pos.y }));
  const emit = () => Math.round(-node.y());
  node.on('dragstart', () => {
    document.body.style.cursor = 'grabbing';
    callbacks.onStart?.(emit());
  });
  node.on('dragmove', () => callbacks.onMove?.(emit()));
  node.on('dragend', () => {
    document.body.style.cursor = '';
    callbacks.onEnd?.(emit());
  });
  node.on('mouseenter', () => {
    document.body.style.cursor = 'ns-resize';
  });
  node.on('mouseleave', () => {
    if (!node.isDragging()) document.body.style.cursor = '';
  });
  group.add(node);
  return node;
}
