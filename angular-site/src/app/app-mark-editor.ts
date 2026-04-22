import { generateCentreDashMarkings, generateSideMarkings, type MarkingRoadSelection } from './road-marking-utils';
import type { MarkSeg } from './level-editor.service';
import type { App } from './app';
import { resultFromPromise } from './result-helpers';

export function addMark(app: App): void {
  app._pushUndo('marks');
  const ms = [...app.marks()];
  ms.push({ x1: -100, y1: 0, x2: 100, y2: 0 });
  app.marks.set(ms);
  app.selectedMarkIndex.set(ms.length - 1);
  app.scheduleMarkAutoSave();
}

export function startMarkCreateMode(app: App): void {
  app.drawMode.set('none');
  app.markCreateMode.set(true);
  app._pendingMarkPoints = [];
  app.pendingMarkPointCount.set(0);
  app._markCreateHoverPoint = null;
  app.snackBar.open(
    'Click points on the canvas to chain new markings. Click Confirm when done.',
    undefined,
    { duration: 2500 },
  );
}

export function confirmMarkCreateMode(app: App): void {
  app.markCreateMode.set(false);
  app._pendingMarkPoints = [];
  app.pendingMarkPointCount.set(0);
  app._markCreateHoverPoint = null;
  app.runtime.scheduleCanvasRedraw();
}

export function generateSideRoadMarks(
  app: App,
  roadSelection: MarkingRoadSelection,
  yStart: number,
  yEnd: number,
  inset: number,
  yFrequency: number,
): void {
  const level = app.selectedLevel();
  if (!level) return;
  const generated = generateSideMarkings(level.roadSegs, { roadSelection, yStart, yEnd, inset, yFrequency });
  appendGeneratedMarks(app, generated, 'side road');
}

export function generateCentreRoadMarks(
  app: App,
  roadSelection: MarkingRoadSelection,
  yStart: number,
  yEnd: number,
  dashLength: number,
  gapLength: number,
): void {
  const level = app.selectedLevel();
  if (!level) return;
  const generated = generateCentreDashMarkings(level.roadSegs, {
    roadSelection,
    yStart,
    yEnd,
    dashLength,
    gapLength,
  });
  appendGeneratedMarks(app, generated, 'centre dashed');
}

export function previewSideRoadMarks(
  app: App,
  roadSelection: MarkingRoadSelection,
  yStart: number,
  yEnd: number,
  inset: number,
  yFrequency: number,
): void {
  const level = app.selectedLevel();
  if (!level) return;
  const generated = generateSideMarkings(level.roadSegs, { roadSelection, yStart, yEnd, inset, yFrequency });
  app.markingPreview.set(generated);
}

export function previewCentreRoadMarks(
  app: App,
  roadSelection: MarkingRoadSelection,
  yStart: number,
  yEnd: number,
  dashLength: number,
  gapLength: number,
): void {
  const level = app.selectedLevel();
  if (!level) return;
  const generated = generateCentreDashMarkings(level.roadSegs, {
    roadSelection,
    yStart,
    yEnd,
    dashLength,
    gapLength,
  });
  app.markingPreview.set(generated);
}

export function removeSelectedMark(app: App): void {
  const idx = app.selectedMarkIndex();
  if (idx === null) return;
  app._pushUndo('marks');
  const ms = app.marks().filter((_: MarkSeg, i: number) => i !== idx);
  app.marks.set(ms);
  app.selectedMarkIndex.set(ms.length > 0 ? Math.min(idx, ms.length - 1) : null);
  app.scheduleMarkAutoSave();
}

function appendGeneratedMarks(app: App, generated: MarkSeg[], label: string): void {
  if (generated.length === 0) {
    app.snackBar.open(`No ${label} markings were generated for that range.`, undefined, {
      duration: 2000,
    });
    return;
  }
  app._pushUndo('marks');
  const marks = [...app.marks(), ...generated];
  app.marks.set(marks);
  app.selectedMarkIndex.set(marks.length - 1);
  app.snackBar.open(`Added ${generated.length} ${label} marking segments.`, undefined, {
    duration: 2200,
  });
  app.scheduleMarkAutoSave();
}

export function addMarkCreatePoint(app: App, x: number, y: number): void {
  const last = app._pendingMarkPoints[app._pendingMarkPoints.length - 1];
  if (last) {
    app._pushUndo('marks');
    const marks = [...app.marks(), { x1: last.x, y1: last.y, x2: x, y2: y }];
    app.marks.set(marks);
    app.selectedMarkIndex.set(marks.length - 1);
    app.scheduleMarkAutoSave();
  }
  app._pendingMarkPoints.push({ x, y });
  app.pendingMarkPointCount.set(app._pendingMarkPoints.length);
  app._markCreateHoverPoint = { x, y };
  app.runtime.scheduleCanvasRedraw();
}

export function hasColocatedNubs(app: App): boolean {
  const selIdx = app.selectedMarkIndex();
  if (selIdx === null) return false;
  const ms = app.marks();
  const sel = ms[selIdx];
  if (!sel) return false;
  for (let i = 0; i < ms.length; i++) {
    if (i === selIdx) continue;
    const other = ms[i];
    if (
      (other.x1 === sel.x1 && other.y1 === sel.y1) ||
      (other.x2 === sel.x1 && other.y2 === sel.y1) ||
      (other.x1 === sel.x2 && other.y1 === sel.y2) ||
      (other.x2 === sel.x2 && other.y2 === sel.y2)
    )
      return true;
  }
  return false;
}

export function splitCollocatedMarkNubs(app: App): void {
  const selIdx = app.selectedMarkIndex();
  if (selIdx === null) return;
  const ms = [...app.marks()];
  const sel = ms[selIdx];
  if (!sel) return;
  app._pushUndo('marks');
  const NUDGE = 1;
  for (const ep of ['p1', 'p2'] as const) {
    const ox = ep === 'p1' ? sel.x1 : sel.x2;
    const oy = ep === 'p1' ? sel.y1 : sel.y2;
    let nudged = false;
    for (let i = 0; i < ms.length; i++) {
      if (i === selIdx) continue;
      if (ms[i].x1 === ox && ms[i].y1 === oy) {
        ms[i] = { ...ms[i], x1: ox + NUDGE, y1: oy + NUDGE };
        nudged = true;
      }
      if (ms[i].x2 === ox && ms[i].y2 === oy) {
        ms[i] = { ...ms[i], x2: ox + NUDGE, y2: oy + NUDGE };
        nudged = true;
      }
    }
    if (!nudged) {
      app.snackBar.open(`No colocated nubs found at ${ep}.`, undefined, { duration: 2000 });
    }
  }
  app.marks.set(ms);
  app.scheduleMarkAutoSave();
}

export function joinAdjacentMarkNubs(app: App): void {
  const ms = [...app.marks()];
  if (ms.length < 2) return;
  const SNAP_R = 30;

  const selIdx = app.selectedMarkIndex();
  let srcX: number, srcY: number, srcI: number;
  if (app._lastDraggedNubKey && app._lastDraggedNubKey.markIdx < ms.length) {
    const { markIdx, endpoint } = app._lastDraggedNubKey;
    srcI = markIdx;
    srcX = endpoint === 'p1' ? ms[markIdx].x1 : ms[markIdx].x2;
    srcY = endpoint === 'p1' ? ms[markIdx].y1 : ms[markIdx].y2;
  } else if (selIdx !== null && selIdx < ms.length) {
    srcI = selIdx;
    srcX = ms[selIdx].x1;
    srcY = ms[selIdx].y1;
  } else {
    app.snackBar.open('Select a mark first.', undefined, { duration: 2000 });
    return;
  }

  let bestDist = SNAP_R;
  let bestJ = -1;
  let bestJEpX: 'x1' | 'x2' = 'x1';

  for (let j = 0; j < ms.length; j++) {
    if (j === srcI) continue;
    for (const epX of ['x1', 'x2'] as const) {
      const epY = epX === 'x1' ? ('y1' as const) : ('y2' as const);
      const dx = srcX - ms[j][epX];
      const dy = srcY - ms[j][epY];
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > 0 && d < bestDist) {
        bestDist = d;
        bestJ = j;
        bestJEpX = epX;
      }
    }
  }

  if (bestJ < 0) {
    app.snackBar.open('No nearby mark endpoints to join (within 30 world units).', undefined, {
      duration: 2500,
    });
    return;
  }
  app._pushUndo('marks');
  const bestJEpY = bestJEpX === 'x1' ? ('y1' as const) : ('y2' as const);
  ms[bestJ] = { ...ms[bestJ], [bestJEpX]: srcX, [bestJEpY]: srcY };
  app.marks.set(ms);
  app.snackBar.open('Joined nearest mark endpoints.', undefined, { duration: 2000 });
  app.scheduleMarkAutoSave();
}

export function onMarkFieldInput(app: App, markIdx: number, field: 'x1' | 'y1' | 'x2' | 'y2', value: number): void {
  const val = Number(value);
  if (Number.isNaN(val)) return;
  app._pushUndo('marks');
  const ms = [...app.marks()];
  ms[markIdx] = { ...ms[markIdx], [field]: val };
  app.marks.set(ms);
  app.scheduleMarkAutoSave();
}

export async function saveMarks(app: App): Promise<void> {
  const id = app.selectedLevelId();
  if (id === null) return;
  app.workerBusy.set(true);
  type MarkResult = { levels: import('./level-editor.service').ParsedLevel[] };
  await resultFromPromise(
    app.runtime.dispatchWorker<MarkResult>('APPLY_MARKS', { resourceId: id, marks: app.marks() }),
    'Save failed',
  ).match(
    (result) => {
      app.applyLevelsResult(result.levels, { preserveCanvasView: true, refreshSelectedLevelState: false });
      app.resourcesStatus.set(`Saved ${app.marks().length} mark segments for level ${id - 139}.`);
    },
    (msg) => {
      app.editorError.set(msg);
    },
  );
  app.workerBusy.set(false);
}

export function scheduleMarkAutoSave(app: App): void {
  if (app._markAutoSaveTimer !== null) clearTimeout(app._markAutoSaveTimer);
  app._markAutoSaveTimer = setTimeout(() => {
    app._markAutoSaveTimer = null;
    if (!app.workerBusy()) saveMarks(app);
  }, 800);
}


export { handleCurveDrawClick, updateCurvePreview, applyBarrierDrawPath } from './app-barrier-draw';
