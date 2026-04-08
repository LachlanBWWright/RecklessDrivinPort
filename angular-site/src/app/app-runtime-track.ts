import { dist2d, distToSegment2d, insertBetweenClosestSegment } from './object-canvas';

import type { App } from './app';

export function beginStartMarkerDrag(app: App, focusTarget: EventTarget | null) {
  app._draggingStartMarker = true;
  app._startMarkerDragUndoCaptured = false;
  app.selectedObjIndex.set(null);
  const focusable = focusTarget as unknown as { focus?: () => void } | null;
  if (focusable && typeof focusable.focus === 'function') focusable.focus();
}

export function beginFinishLineDrag(app: App, focusTarget: EventTarget | null) {
  app._draggingFinishLine = true;
  app._finishLineDragUndoCaptured = false;
  app.selectedObjIndex.set(null);
  const focusable = focusTarget as unknown as { focus?: () => void } | null;
  if (focusable && typeof focusable.focus === 'function') focusable.focus();
}

export function handleTrackContextMenuAtWorld(app: App, wx: number, wy: number) {
  const trackUp = app.editTrackUp();
  const trackDown = app.editTrackDown();
  const trackHitR = Math.max(20, 14 / app.canvasZoom());

  for (let i = 0; i < trackUp.length; i++) {
    if (dist2d(trackUp[i].x, trackUp[i].y, wx, wy) < trackHitR) {
      const arr = [...trackUp];
      arr.splice(i, 1);
      app.editTrackUp.set(arr);
      return;
    }
  }
  for (let i = 0; i < trackDown.length; i++) {
    if (dist2d(trackDown[i].x, trackDown[i].y, wx, wy) < trackHitR) {
      const arr = [...trackDown];
      arr.splice(i, 1);
      app.editTrackDown.set(arr);
      return;
    }
  }

  const level = app.selectedLevel();
  if (!level) return;

  let nearestSegDistUp = Infinity;
  for (let i = 0; i < trackUp.length - 1; i++) {
    const d = distToSegment2d(wx, wy, trackUp[i].x, trackUp[i].y, trackUp[i + 1].x, trackUp[i + 1].y);
    if (d < nearestSegDistUp) nearestSegDistUp = d;
  }
  if (trackUp.length === 1) nearestSegDistUp = dist2d(trackUp[0].x, trackUp[0].y, wx, wy);

  let nearestSegDistDown = Infinity;
  for (let i = 0; i < trackDown.length - 1; i++) {
    const d = distToSegment2d(wx, wy, trackDown[i].x, trackDown[i].y, trackDown[i + 1].x, trackDown[i + 1].y);
    if (d < nearestSegDistDown) nearestSegDistDown = d;
  }
  if (trackDown.length === 1) nearestSegDistDown = dist2d(trackDown[0].x, trackDown[0].y, wx, wy);

  if (nearestSegDistUp <= nearestSegDistDown || trackDown.length === 0) {
    app.editTrackUp.set(insertBetweenClosestSegment(trackUp, wx, wy));
  } else {
    app.editTrackDown.set(insertBetweenClosestSegment(trackDown, wx, wy));
  }
}
