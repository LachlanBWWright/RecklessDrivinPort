/**
 * Track context-menu actions for the object editor canvas.
 *
 * Handles right-click operations: deleting a hovered waypoint and inserting
 * a new waypoint at the nearest segment.
 */
import type { App } from './app';
import { dist2d, distToSegment2d, insertBetweenClosestSegment } from './object-canvas';

export function tryDeleteHoveredWaypoint(app: App, wx: number, wy: number): boolean {
  const trackHitR = Math.max(20, 14 / app.canvasZoom());
  const trackUp = app.editTrackUp();
  const trackDown = app.editTrackDown();
  for (let i = 0; i < trackUp.length; i++) {
    if (dist2d(trackUp[i].x, trackUp[i].y, wx, wy) < trackHitR) {
      app._pushUndo('tracks');
      app.editTrackUp.set(trackUp.filter((_, j) => j !== i));
      app._roadOffscreenKey = '';
      return true;
    }
  }
  for (let i = 0; i < trackDown.length; i++) {
    if (dist2d(trackDown[i].x, trackDown[i].y, wx, wy) < trackHitR) {
      app._pushUndo('tracks');
      app.editTrackDown.set(trackDown.filter((_, j) => j !== i));
      app._roadOffscreenKey = '';
      return true;
    }
  }
  return false;
}

export function insertTrackPointNearestSegment(app: App, wx: number, wy: number): void {
  const trackUp = app.editTrackUp();
  const trackDown = app.editTrackDown();
  let nearestUp = trackUp.length === 1 ? dist2d(trackUp[0].x, trackUp[0].y, wx, wy) : Infinity;
  for (let i = 0; i < trackUp.length - 1; i++) {
    const d = distToSegment2d(wx, wy, trackUp[i].x, trackUp[i].y, trackUp[i + 1].x, trackUp[i + 1].y);
    if (d < nearestUp) nearestUp = d;
  }
  let nearestDown = trackDown.length === 1 ? dist2d(trackDown[0].x, trackDown[0].y, wx, wy) : Infinity;
  for (let i = 0; i < trackDown.length - 1; i++) {
    const d = distToSegment2d(wx, wy, trackDown[i].x, trackDown[i].y, trackDown[i + 1].x, trackDown[i + 1].y);
    if (d < nearestDown) nearestDown = d;
  }
  app._pushUndo('tracks');
  if (nearestUp <= nearestDown || trackDown.length === 0) {
    app.editTrackUp.set(insertBetweenClosestSegment(trackUp, wx, wy));
  } else {
    app.editTrackDown.set(insertBetweenClosestSegment(trackDown, wx, wy));
  }
  app._roadOffscreenKey = '';
}
