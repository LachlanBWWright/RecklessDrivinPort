import Konva from 'konva';

export function updateBarrierPreview(
  group: Konva.Group,
  layer: Konva.Layer,
  existing: Konva.Line | null,
  points: number[],
  scale: number,
): Konva.Line {
  const line = existing ?? new Konva.Line({ stroke: 'rgba(0, 200, 255, 0.9)', listening: false });
  if (!existing) group.add(line);
  line.strokeWidth(3 / scale);
  line.dash([8 / scale, 4 / scale]);
  line.points(points);
  line.moveToTop();
  layer.batchDraw();
  return line;
}
