import type { LevelProperties, ParsedLevel, RoadInfoData } from './level-editor.service';
import type { App } from './app';
import { cloneRoadInfoData, saveLevelProperties, setLevelRoadInfo, setSelectedRoadInfo } from './app-road-editing';

export const MAX_TIME_VALUE = 65535;

/** Texture fields stored in road info data that correspond to asset references. */
export type RoadTextureField = 'backgroundTex' | 'foregroundTex' | 'roadLeftBorder' | 'roadRightBorder' | 'marks' | 'tracks' | 'skidSound';

declare module './app' {
  interface App {
    selectLevel(id: number, options?: { preserveView?: boolean }): void;
    resetViewToRoad(level: ParsedLevel): void;
    onPropsInput(field: keyof LevelProperties, value: number): void;
    onRoadInfoChange(roadInfo: number): void;
    selectRoadInfo(roadInfo: number): void;
    onRoadInfoInput(field: Exclude<keyof RoadInfoData, 'id'>, value: number | boolean): void;
    onRoadTexturePick(field: RoadTextureField, value: number): void;
    onTimeLimitChange(value: number): void;
    onObjGroupInput(index: number, field: 'resID' | 'numObjs', value: number): void;
  }
}


export function selectLevel(app: App, id: number, options?: { preserveView?: boolean }): void {
  const preserveView = options?.preserveView ?? false;
  const currentLevelId = app.selectedLevelId();
  if (currentLevelId !== null && currentLevelId !== id && app.propertiesDirty()) {
    void saveLevelProperties(app);
  }
  app.selectedLevelId.set(id);
  app._resetObjectHistory();
  app._roadOffscreenKey = '';
  const level = app.parsedLevels().find((l) => l.resourceId === id);
  if (!level) return;
  setLevelRoadInfo(app, level.properties.roadInfo);
  app.editTime.set(level.properties.time);
  app.editXStartPos.set(level.properties.xStartPos);
  app.editLevelEnd.set(level.properties.levelEnd);
  app.editObjectGroups.set(level.objectGroups.map((g) => ({ resID: g.resID, numObjs: g.numObjs })));
  app.propertiesDirty.set(false);
  app.propertiesSaveLevelId = null;
  if (app.propertiesSaveTimer !== null) {
    clearTimeout(app.propertiesSaveTimer);
    app.propertiesSaveTimer = null;
  }
  app.objects.set([...level.objects]);
  app.selectedObjIndex.set(null);
  app.visibleTypeFilter.set(new Set(app.typePalette.map((item) => item.typeId)));
  app.marks.set([...level.marks]);
  app.selectedMarkIndex.set(null);
  app.editTrackUp.set(level.trackUp.map((s) => ({ x: s.x, y: s.y, flags: s.flags, velo: s.velo })));
  app.editTrackDown.set(level.trackDown.map((s) => ({ x: s.x, y: s.y, flags: s.flags, velo: s.velo })));
  app.dragTrackWaypoint.set(null);
  if (!preserveView) {
    resetViewToRoad(app, level);
  }
  app.runtime.scheduleCanvasRedraw();
  if (typeof window !== 'undefined') {
    window.requestAnimationFrame(() => app.runtime.scheduleCanvasRedraw());
  }
}

export function resetViewToRoad(app: App, level: ParsedLevel): void {
  const canvas = document.getElementById('object-canvas');
  const W = canvas instanceof HTMLCanvasElement ? canvas.width : 640;
  const H = canvas instanceof HTMLCanvasElement ? canvas.height : 540;
  if (level.roadSegs.length > 0) {
    const minX = Math.min(...level.roadSegs.slice(0, 100).map((s) => s.v0));
    const maxX = Math.max(...level.roadSegs.slice(0, 100).map((s) => s.v3));
    const roadW = Math.max(50, maxX - minX);
    const zoom = Math.min(4.0, Math.max(0.25, (W * 0.85) / roadW));
    app.canvasZoom.set(zoom);
    app.canvasPanX.set((minX + maxX) / 2);
    const visibleH = H / zoom;
    app.canvasPanY.set(visibleH * 0.35);
  } else {
    app.canvasZoom.set(1.5);
    app.canvasPanX.set(0);
    app.canvasPanY.set(0);
  }
}

export function onPropsInput(app: App, field: keyof LevelProperties, value: number): void {
  if (Number.isNaN(value)) return;
  app._pushUndo('props');
  switch (field) {
    case 'roadInfo':
      app.editRoadInfo.set(value);
      break;
    case 'time': {
      const nextTime = Math.max(0, Math.min(MAX_TIME_VALUE, value));
      app.editTime.set(nextTime);
      break;
    }
    case 'xStartPos':
      app.editXStartPos.set(value);
      break;
    case 'levelEnd':
      app.editLevelEnd.set(Math.max(0, value));
      break;
  }
  app.markPropertiesDirty();
}

export function onRoadInfoChange(app: App, roadInfo: number): void {
  const nextRoadInfo = Number(roadInfo);
  if (Number.isNaN(nextRoadInfo)) return;
  app._pushUndo('props');
  setLevelRoadInfo(app, nextRoadInfo);
  app.markPropertiesDirty();
}

export function selectRoadInfo(app: App, roadInfo: number): void {
  const nextRoadInfo = Number(roadInfo);
  if (Number.isNaN(nextRoadInfo)) return;
  setSelectedRoadInfo(app, nextRoadInfo);
}

export function onRoadInfoInput(
  app: App,
  field: Exclude<keyof RoadInfoData, 'id'>,
  value: number | boolean,
): void {
  const assetFields = new Set<Exclude<keyof RoadInfoData, 'id'>>([
    'backgroundTex',
    'foregroundTex',
    'roadLeftBorder',
    'roadRightBorder',
    'marks',
    'tracks',
    'skidSound',
    'water',
  ]);
  const currentId = assetFields.has(field) ? app.selectedRoadInfoId() : app.editRoadInfo();
  const current = currentId !== null ? cloneRoadInfoData(app, app.roadInfoDataMap.get(currentId)) : null;
  if (currentId === null || current === null) return;
  const next = { ...current };
  app._pushUndo('props');
  switch (field) {
    case 'friction':
    case 'airResistance':
    case 'backResistance':
    case 'xDrift':
    case 'yDrift':
    case 'xFrontDrift':
    case 'yFrontDrift':
    case 'trackSlide':
    case 'dustSlide':
    case 'slideFriction': {
      next[field] = Number(value);
      break;
    }
    case 'water':
      next.water = Boolean(value);
      break;
    default: {
      next[field] = Number(value);
      break;
    }
  }
  if (currentId === app.selectedRoadInfoId()) {
    app.editRoadInfoData.set(next);
    app.selectedRoadInfoData.set({ ...next });
  }
  app.roadInfoDataMap.set(currentId, next);
  if (assetFields.has(field)) {
    void app.runtime.dispatchWorker('APPLY_ROAD_INFO', {
      roadInfoId: currentId,
      roadInfo: next,
    });
  }
  app.refreshRoadInfoDerivedState();
  app.markPropertiesDirty();
}

export function onTimeLimitChange(app: App, value: number): void {
  const nextValue = Number(value);
  if (Number.isNaN(nextValue)) return;
  app._pushUndo('props');
  app.editTime.set(Math.max(0, Math.min(MAX_TIME_VALUE, Math.round(nextValue))));
  app.markPropertiesDirty();
}

/**
 * Handles a texture/asset field change coming from a `mat-select` (which
 * provides the new value directly as a number rather than through an Event).
 * Avoids the need to construct a synthetic Event object.
 */
export function onRoadTexturePick(app: App, field: RoadTextureField, value: number): void {
  const currentId = app.selectedRoadInfoId();
  const current = currentId !== null ? cloneRoadInfoData(app, app.roadInfoDataMap.get(currentId)) : null;
  if (currentId === null || current === null) return;
  app._pushUndo('props');
  const next = { ...current, [field]: value };
  app.editRoadInfoData.set(next);
  app.selectedRoadInfoData.set({ ...next });
  app.roadInfoDataMap.set(currentId, next);
  void app.runtime.dispatchWorker('APPLY_ROAD_INFO', {
    roadInfoId: currentId,
    roadInfo: next,
  });
  app.refreshRoadInfoDerivedState();
  app.markPropertiesDirty();
}

export function onObjGroupInput(app: App, index: number, field: 'resID' | 'numObjs', value: number): void {
  const groups = [...app.editObjectGroups()];
  if (index < 0 || index >= groups.length) return;
  groups[index] = { ...groups[index], [field]: value };
  app.editObjectGroups.set(groups);
  app.markPropertiesDirty();
}

export function applyLevelsResult(
  app: App,
  levels: ParsedLevel[],
  options?: { preserveCanvasView?: boolean; refreshSelectedLevelState?: boolean },
): void {
  const preserveCanvasView = options?.preserveCanvasView ?? false;
  const refreshSelectedLevelState = options?.refreshSelectedLevelState ?? true;
  // Preserve in-memory road segments: barrier drags update parsedLevels directly (in-memory)
  // but are NOT flushed to the worker until download time. If the worker returns stale levels
  // (e.g., after a sprite/tile edit), we must keep the locally-edited road segs.
  const existingById = new Map(app.parsedLevels().map((l) => [l.resourceId, l]));
  const merged = levels.map((l) => {
    const cur = existingById.get(l.resourceId);
    return cur ? { ...l, roadSegs: cur.roadSegs } : l;
  });
  app.parsedLevels.set(merged);
  app._roadOffscreenKey = ''; // road segs may have changed; invalidate the road cache
  app.roadSegsVersion.update((v) => v + 1);
  if (!refreshSelectedLevelState) {
    return;
  }
  const curId = app.selectedLevelId();
  if (curId !== null && merged.some((l) => l.resourceId === curId)) {
    app.selectLevel(curId, { preserveView: preserveCanvasView });
  } else if (merged.length > 0) {
    app.selectLevel(merged[0].resourceId);
  } else {
    app.selectedLevelId.set(null);
  }
}
