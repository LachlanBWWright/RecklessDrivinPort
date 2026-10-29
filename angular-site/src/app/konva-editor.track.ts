import Konva from 'konva';
import type { TrackSeg } from './level-editor.types';
import { WAYPOINT_WORLD_R } from './konva-editor.types';

export function buildTrackWaypoints(
  trackWorldGroup: Konva.Group | null,
  trackLayer: { draw(): void } | null,
  trackUp: TrackSeg[],
  trackDown: TrackSeg[],
  panMode: boolean,
  cssW: number,
  cssH: number,
  logicalW: number,
  logicalH: number,
  zoom: number,
  onWaypointDragEnd?: (
    track: 'up' | 'down',
    segIdx: number,
    worldX: number,
    worldY: number,
  ) => void,
  onWaypointRightClick?: (
    track: 'up' | 'down',
    segIdx: number,
    worldX: number,
    worldY: number,
  ) => void,
  onWaypointDoubleClick?: (track: 'up' | 'down', segIdx: number) => void,
  onWaypointSelect?: (track: 'up' | 'down', segIdx: number) => void,
  showDetails = false,
): void {
  if (!trackWorldGroup || !trackLayer) return;

  trackWorldGroup.destroyChildren();
  const sx = zoom * (cssW / logicalW);

  const addWaypoints = (pts: TrackSeg[], track: 'up' | 'down', color: string) => {
    pts.forEach((pt, i) => {
      const circle = new Konva.Circle({
        x: pt.x,
        y: -pt.y,
        radius: WAYPOINT_WORLD_R,
        fill: color,
        stroke: 'rgba(0,0,0,0.5)',
        strokeWidth: 1.5 / sx,
        draggable: !panMode,
        id: `wp-${track}-${i}`,
      });
      circle.on('click tap dragstart', (event) => {
        event.cancelBubble = true;
        if (circle.draggable()) onWaypointSelect?.(track, i);
      });
      circle.on('dragend', () => {
        onWaypointDragEnd?.(track, i, Math.round(circle.x()), Math.round(-circle.y()));
      });
      circle.on('contextmenu', (e) => {
        e.evt.preventDefault();
        e.cancelBubble = true;
        onWaypointRightClick?.(track, i, circle.x(), -circle.y());
      });
      circle.on('dblclick', (e) => {
        e.cancelBubble = true;
        onWaypointDoubleClick?.(track, i);
      });
      circle.on('mouseenter', () => {
        circle.radius(WAYPOINT_WORLD_R * 1.4);
        circle.stroke('#fff');
        trackLayer.draw();
        document.body.style.cursor = 'grab';
      });
      circle.on('mouseleave', () => {
        const selected = circle.hasName('selected-waypoint');
        circle.radius(WAYPOINT_WORLD_R * (selected ? 1.4 : 1));
        circle.stroke(selected ? '#fff' : 'rgba(0,0,0,0.5)');
        trackLayer.draw();
        document.body.style.cursor = '';
      });
      circle.on('dragstart', () => {
        document.body.style.cursor = 'grabbing';
      });
      circle.on('dragend', () => {
        document.body.style.cursor = '';
      });
      trackWorldGroup.add(circle);
      if (showDetails) {
        const label = new Konva.Group({
          x: pt.x,
          y: -pt.y,
          listening: false,
          name: 'waypoint-details',
          offsetX: track === 'down' ? 172 : 0,
          id: `wp-label-${track}-${i}`,
        });
        label.add(
          new Konva.Rect({
            x: 12,
            y: -14,
            width: 148,
            height: 28,
            fill: '#1a1a1a',
            stroke: color,
            strokeWidth: 1,
            cornerRadius: 5,
          }),
        );
        label.add(
          new Konva.Text({
            x: 20,
            y: -7,
            text: `${i + 1} · ${Number(pt.velo.toFixed(1))} m/s`,
            fontSize: 13,
            fontFamily: 'sans-serif',
            fill: '#f0f0f0',
          }),
        );
        label.add(
          new Konva.Text({
            x: 116,
            y: -8,
            text: '⇄',
            fontSize: 17,
            fill: pt.flags === 1 ? '#66bb6a' : '#666666',
          }),
        );
        label.add(
          new Konva.Text({
            x: 139,
            y: -8,
            text: '⊘',
            fontSize: 17,
            fill: pt.flags & 2 ? '#66bb6a' : '#666666',
          }),
        );
        trackWorldGroup.add(label);
        circle.on('dragmove', () => {
          label.position(circle.position());
        });
      }
    });
  };

  addWaypoints(trackUp, 'up', '#42a5f5');
  addWaypoints(trackDown, 'down', '#ef5350');
  // Later waypoints must not cover labels belonging to earlier points.
  trackWorldGroup.find('.waypoint-details').forEach((label) => label.moveToTop());
}
