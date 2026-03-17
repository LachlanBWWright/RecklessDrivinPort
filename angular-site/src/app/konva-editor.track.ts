import Konva from 'konva';
import { WAYPOINT_WORLD_R } from './konva-editor.types';

export function buildTrackWaypoints(
  trackWorldGroup: Konva.Group | null,
  trackLayer: Konva.Layer | null,
  trackUp: { x: number; y: number }[],
  trackDown: { x: number; y: number }[],
  panMode: boolean,
  cssW: number, cssH: number, logicalW: number, logicalH: number,
  zoom: number,
  onWaypointDragEnd?: (track: 'up'|'down', segIdx: number, worldX: number, worldY: number) => void,
  onWaypointRightClick?: (track: 'up'|'down', segIdx: number, worldX: number, worldY: number) => void,
): void {
  if (!trackWorldGroup || !trackLayer) return;

  trackWorldGroup.destroyChildren();
  const sx = zoom * (cssW / logicalW);

  const addWaypoints = (pts: {x:number;y:number}[], track: 'up'|'down', color: string) => {
    pts.forEach((pt, i) => {
      const circle = new Konva.Circle({ x: pt.x, y: -pt.y, radius: WAYPOINT_WORLD_R, fill: color, stroke: 'rgba(0,0,0,0.5)', strokeWidth: 1.5 / sx, draggable: !panMode, id: `wp-${track}-${i}` });
      circle.on('dragend', () => { onWaypointDragEnd?.(track, i, Math.round(circle.x()), Math.round(-circle.y())); });
      circle.on('contextmenu', (e) => { e.evt.preventDefault(); e.cancelBubble = true; onWaypointRightClick?.(track, i, circle.x(), -circle.y()); });
      circle.on('mouseenter', () => { circle.radius(WAYPOINT_WORLD_R * 1.4); circle.stroke('#fff'); trackLayer.draw(); document.body.style.cursor = 'grab'; });
      circle.on('mouseleave', () => { circle.radius(WAYPOINT_WORLD_R); circle.stroke('rgba(0,0,0,0.5)'); trackLayer.draw(); document.body.style.cursor = ''; });
      circle.on('dragstart', () => { document.body.style.cursor = 'grabbing'; });
      circle.on('dragend', () => { document.body.style.cursor = ''; });
      trackWorldGroup.add(circle);
    });
  };

  addWaypoints(trackUp, 'up', '#42a5f5');
  addWaypoints(trackDown, 'down', '#ef5350');
}
