/**
 * Barrier drawing tools for the konva editor overlay.
 *
 * Handles the three drawing modes: straight lines, freehand paths, and
 * quadratic Bézier curves.  All functions mutate app state directly.
 */
import type { App } from './app';
import type { RoadSeg } from './level-editor.service';
import { clampBarrierPoint, sampleQuadraticBezier } from './road-marking-utils';

export function handleCurveDrawClick(app: App, wx: number, wy: number): void {
  if (!app._curveStartPoint) {
    app._curveStartPoint = { wx, wy };
    app._curveEndPoint = null;
    app.konva.setBarrierDrawPreview([wx, -wy]);
    app.konva.flush();
    app.snackBar.open('Curve start set. Click the curve end point next.', undefined, { duration: 1500 });
    return;
  }
  if (!app._curveEndPoint) {
    app._curveEndPoint = { wx, wy };
    updateCurvePreview(app, wx, wy);
    app.snackBar.open('Curve end set. Move to adjust the bend, then click again to apply.', undefined, {
      duration: 1800,
    });
    return;
  }
  const points = sampleQuadraticBezier(
    { x: app._curveStartPoint.wx, y: app._curveStartPoint.wy },
    { x: wx, y: wy },
    { x: app._curveEndPoint.wx, y: app._curveEndPoint.wy },
  );
  app._barrierDrawPath = points.map((p) => ({ wx: p.x, wy: p.y }));
  applyBarrierDrawPath(app);
  app._curveStartPoint = null;
  app._curveEndPoint = null;
  app.konva.clearBarrierDrawPreview();
}

export function updateCurvePreview(app: App, wx: number, wy: number): void {
  if (!app._curveStartPoint) return;
  if (!app._curveEndPoint) {
    app.konva.setBarrierDrawPreview([app._curveStartPoint.wx, -app._curveStartPoint.wy, wx, -wy]);
    app.konva.flush();
    return;
  }
  const preview = sampleQuadraticBezier(
    { x: app._curveStartPoint.wx, y: app._curveStartPoint.wy },
    { x: wx, y: wy },
    { x: app._curveEndPoint.wx, y: app._curveEndPoint.wy },
    24,
  );
  const pts: number[] = [];
  for (const p of preview) pts.push(p.x, -p.y);
  app.konva.setBarrierDrawPreview(pts);
  app.konva.flush();
}

export function applyBarrierDrawPath(app: App): void {
  const path = app._barrierDrawPath;
  app._barrierDrawPath = [];
  if (path.length < 2) return;
  const level = app.selectedLevel();
  if (!level || level.roadSegs.length === 0) return;

  const side = app.barrierDrawSide();
  const sorted = [...path].sort((a, b) => a.wy - b.wy);
  const xAtY = (wy: number): number => {
    if (wy <= sorted[0].wy) return sorted[0].wx;
    if (wy >= sorted[sorted.length - 1].wy) return sorted[sorted.length - 1].wx;
    let lo = 0, hi = sorted.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (sorted[mid].wy < wy) lo = mid; else hi = mid;
    }
    const t = (wy - sorted[lo].wy) / (sorted[hi].wy - sorted[lo].wy);
    return sorted[lo].wx + t * (sorted[hi].wx - sorted[lo].wx);
  };

  const minWy = sorted[0].wy;
  const maxWy = sorted[sorted.length - 1].wy;
  app._pushUndo('road');
  const segs = level.roadSegs.map((seg: RoadSeg, i: number) => {
    const segWy = i * 2;
    if (segWy < minWy || segWy > maxWy) return seg;
    return clampBarrierPoint(seg, side, Math.round(xAtY(segWy)));
  });
  app.parsedLevels.update((levels) =>
    levels.map((l) => (l.resourceId === level.resourceId ? { ...l, roadSegs: segs } : l)),
  );
  app._lastBarriersSerialized = '';
  app._roadOffscreenKey = '';
  app.roadSegsVersion.update((v: number) => v + 1);
  app.runtime.scheduleCanvasRedraw();
  app.snackBar.open(`✓ Barrier draw applied to ${side}.`, undefined, { duration: 1500 });
}
