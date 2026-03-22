import Konva from 'konva';
import { MARK_ENDPOINT_WORLD_R } from './konva-editor.types';

export function buildMarks(
  marksWorldGroup: Konva.Group | null,
  marksLayer: Konva.Layer | null,
  marks: readonly { x1:number;y1:number;x2:number;y2:number }[],
  selectedMarkIndex: number | null,
  panMode: boolean,
  cssW: number, cssH: number, logicalW: number, logicalH: number,
  zoom: number,
  onMarkEndpointDragEnd?: (markIdx: number, endpoint: 'p1'|'p2', worldX: number, worldY: number) => void,
  onMarkClick?: (markIdx: number) => void,
): void {
  if (!marksWorldGroup || !marksLayer) return;
  marksWorldGroup.destroyChildren();
  const sx = zoom * (cssW / logicalW);

  marks.forEach((m, markIdx) => {
    const isSel = markIdx === selectedMarkIndex;
    const color = isSel ? '#ffffff' : '#ffeb3b';
    const strokeClr = isSel ? 'rgba(255,235,59,0.8)' : 'rgba(0,0,0,0.4)';

    (['p1','p2'] as const).forEach((endpoint) => {
      const wx = endpoint === 'p1' ? m.x1 : m.x2;
      const wy = endpoint === 'p1' ? m.y1 : m.y2;
      const circle = new Konva.Circle({ x: wx, y: -wy, radius: MARK_ENDPOINT_WORLD_R, fill: color, stroke: strokeClr, strokeWidth: 1.5 / sx, draggable: !panMode, id: `mark-${markIdx}-${endpoint}` });
      circle.on('dragend', () => { onMarkEndpointDragEnd?.(markIdx, endpoint, Math.round(circle.x()), Math.round(-circle.y())); });
      circle.on('click', (e) => { e.cancelBubble = true; onMarkClick?.(markIdx); });
      circle.on('mouseenter', () => { circle.radius(MARK_ENDPOINT_WORLD_R * 1.4); circle.stroke('#fff'); marksLayer.draw(); document.body.style.cursor = 'grab'; });
      circle.on('mouseleave', () => { circle.radius(MARK_ENDPOINT_WORLD_R); circle.stroke(strokeClr); marksLayer.draw(); document.body.style.cursor = ''; });
      circle.on('dragstart', () => { document.body.style.cursor = 'grabbing'; });
      circle.on('dragend', () => { document.body.style.cursor = ''; });
      marksWorldGroup.add(circle);
    });
  });
}
