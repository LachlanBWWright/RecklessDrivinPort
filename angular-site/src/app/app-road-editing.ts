import type { LevelProperties, RoadInfoData, ParsedLevel } from './level-editor.service';
import { buildRoadTileGroups, getRoadReferenceLevelNums, getTileReferenceRoadInfoIds } from './app-helpers';
import { ROAD_THEMES } from './object-canvas';
import type { App } from './app';

declare module './app' {
  interface App {
    readonly getRoadReferenceLevelNums: (roadInfoId: number) => number[];
    readonly getTileReferenceRoadInfoIds: (texId: number) => number[];
    syncSelectedRoadInfoSelection(preferredId?: number | null): void;
    refreshRoadInfoDerivedState(): void;
    queueRoadInfoSync(syncPromises: Promise<unknown>[]): void;
    queuePackSync(syncPromises: Promise<unknown>[]): void;
    markPropertiesDirty(): void;
    scheduleObjectGroupsAutoSave(): void;
    markObjectGroupsDirty(): void;
    saveLevelProperties(): Promise<void>;
  }
}

export function cloneRoadInfoData(app: App, roadInfo: RoadInfoData | null | undefined): RoadInfoData | null {
  return roadInfo ? { ...roadInfo } : null;
}

export function getSortedRoadInfoIds(app: App): number[] {
  return [...app.roadInfoDataMap.keys()].sort((a, b) => a - b);
}

export function lookupRoadReferenceLevelNums(app: App, roadInfoId: number): number[] {
  return getRoadReferenceLevelNums(app.parsedLevels(), roadInfoId);
}

export function lookupTileReferenceRoadInfoIds(app: App, texId: number): number[] {
  return getTileReferenceRoadInfoIds(app.roadInfoDataMap, getSortedRoadInfoIds(app), texId);
}

export function getNextRoadInfoId(app: App): number {
  const ids = getSortedRoadInfoIds(app);
  const base = ids.length > 0 ? ids[ids.length - 1] + 1 : 128;
  let candidate = base;
  while (app.roadInfoDataMap.has(candidate)) candidate += 1;
  return candidate;
}

export function makeDefaultRoadInfo(app: App, roadInfoId: number): RoadInfoData {
  return {
    id: roadInfoId,
    friction: 0,
    airResistance: 0,
    backResistance: 0,
    tolerance: 0,
    marks: 0,
    deathOffs: 0,
    backgroundTex: 0,
    foregroundTex: 0,
    roadLeftBorder: 0,
    roadRightBorder: 0,
    tracks: 0,
    skidSound: 0,
    filler: 0,
    xDrift: 0,
    yDrift: 0,
    xFrontDrift: 0,
    yFrontDrift: 0,
    trackSlide: 0,
    dustSlide: 0,
    dustColor: 0,
    water: false,
    filler2: 0,
    slideFriction: 0,
  };
}

export function setSelectedRoadInfo(app: App, roadInfoId: number | null): void {
  const nextId = roadInfoId !== null && app.roadInfoDataMap.has(roadInfoId) ? roadInfoId : null;
  app.selectedRoadInfoId.set(nextId);
  app.selectedRoadInfoData.set(cloneRoadInfoData(app, nextId === null ? null : app.roadInfoDataMap.get(nextId)));
}

export function setLevelRoadInfo(app: App, roadInfoId: number): void {
  app.editRoadInfo.set(roadInfoId);
  app.editRoadInfoData.set(cloneRoadInfoData(app, app.roadInfoDataMap.get(roadInfoId)));
  setSelectedRoadInfo(app, roadInfoId);
}

export function syncSelectedRoadInfoSelection(app: App, preferredId: number | null = app.selectedRoadInfoId()): void {
  const availableIds = getSortedRoadInfoIds(app);
  let nextId = preferredId;
  if (nextId === null || !app.roadInfoDataMap.has(nextId)) {
    if (app.roadInfoDataMap.has(app.editRoadInfo())) {
      nextId = app.editRoadInfo();
    } else {
      nextId = availableIds[0] ?? null;
    }
  }
  setSelectedRoadInfo(app, nextId);
}

export function refreshRoadInfoDerivedState(app: App): void {
  app._roadInfoPreviewDataUrls.clear();
  const ids = getSortedRoadInfoIds(app);
  const roadInfoOptions = ids.map((id) => ({
    id,
    label: `Road ${id}`,
    previewUrl: app.getRoadInfoPreviewDataUrl(id),
    water: ROAD_THEMES[id]?.water ?? false,
  }));
  app.roadInfoOptions.set(roadInfoOptions);
  app.roadTileGroups.set(buildRoadTileGroups(app.roadInfoDataMap, ids, app.tileTileEntries()));
  app.roadInfoVersion.update((v: number) => v + 1);
}

export async function applyRoadInfoDataToWorker(app: App, roadInfoId: number, roadInfo: RoadInfoData): Promise<void> {
  await app.runtime.dispatchWorker('APPLY_ROAD_INFO', {
    roadInfoId,
    roadInfo,
  });
}

export async function createRoadInfo(app: App): Promise<void> {
  const baseId = app.selectedRoadInfoId() ?? app.editRoadInfo();
  const baseRoad = baseId !== null ? app.roadInfoDataMap.get(baseId) ?? null : null;
  const newRoadInfoId = getNextRoadInfoId(app);
  const newRoadInfo = baseRoad ? { ...baseRoad, id: newRoadInfoId } : makeDefaultRoadInfo(app, newRoadInfoId);

  const previousMap = new Map(app.roadInfoDataMap);
  const previousSelectedRoadId = app.selectedRoadInfoId();
  const previousEditRoadInfoData = app.editRoadInfoData();
  const previousEditRoadInfo = previousEditRoadInfoData ? { ...previousEditRoadInfoData } : null;

  app.roadInfoDataMap.set(newRoadInfoId, newRoadInfo);
  refreshRoadInfoDerivedState(app);
  setSelectedRoadInfo(app, newRoadInfoId);

  try {
    app.workerBusy.set(true);
    await applyRoadInfoDataToWorker(app, newRoadInfoId, newRoadInfo);
    app.resourcesStatus.set(`Created road ${newRoadInfoId}.`);
    app.snackBar.open(`✓ Road ${newRoadInfoId} created`, 'OK', {
      duration: 3000,
      panelClass: 'snack-success',
    });
  } catch (error) {
    app.roadInfoDataMap.clear();
    for (const [id, roadInfo] of previousMap.entries()) app.roadInfoDataMap.set(id, roadInfo);
    refreshRoadInfoDerivedState(app);
    setSelectedRoadInfo(app, previousSelectedRoadId);
    app.editRoadInfoData.set(previousEditRoadInfo);
    const msg = error instanceof Error ? error.message : 'Failed to create road';
    app.editorError.set(msg);
    app.snackBar.open(`✗ ${msg}`, 'Dismiss', { duration: 5000, panelClass: 'snack-error' });
  } finally {
    app.workerBusy.set(false);
  }
}

export async function deleteRoadInfo(app: App, roadInfoId: number | null = app.selectedRoadInfoId()): Promise<void> {
  if (roadInfoId === null) return;
  const refs = lookupRoadReferenceLevelNums(app, roadInfoId);
  if (refs.length > 0) {
    const msg = `Road ${roadInfoId} is still used by level${refs.length > 1 ? 's' : ''} ${refs.join(', ')}. Reassign those level road selections first.`;
    app.editorError.set(msg);
    app.snackBar.open(`✗ ${msg}`, 'Dismiss', { duration: 6000, panelClass: 'snack-error' });
    return;
  }

  const previousMap = new Map(app.roadInfoDataMap);
  const previousSelectedRoadId = app.selectedRoadInfoId();
  const previousEditRoadInfoData = app.editRoadInfoData();
  const previousEditRoadInfo = previousEditRoadInfoData ? { ...previousEditRoadInfoData } : null;
  app.roadInfoDataMap.delete(roadInfoId);
  refreshRoadInfoDerivedState(app);
  syncSelectedRoadInfoSelection(app, previousSelectedRoadId === roadInfoId ? app.editRoadInfo() : previousSelectedRoadId);

  try {
    app.workerBusy.set(true);
    await app.runtime.dispatchWorker('REMOVE_ROAD_INFO', { roadInfoId });
    app.resourcesStatus.set(`Deleted road ${roadInfoId}.`);
    app.snackBar.open(`✓ Road ${roadInfoId} deleted`, 'OK', {
      duration: 3000,
      panelClass: 'snack-success',
    });
  } catch (error) {
    app.roadInfoDataMap.clear();
    for (const [id, roadInfo] of previousMap.entries()) app.roadInfoDataMap.set(id, roadInfo);
    refreshRoadInfoDerivedState(app);
    setSelectedRoadInfo(app, previousSelectedRoadId);
    app.editRoadInfoData.set(previousEditRoadInfo);
    const msg = error instanceof Error ? error.message : 'Failed to delete road';
    app.editorError.set(msg);
    app.snackBar.open(`✗ ${msg}`, 'Dismiss', { duration: 5000, panelClass: 'snack-error' });
  } finally {
    app.workerBusy.set(false);
  }
}

export function queueRoadInfoSync(app: App, syncPromises: Promise<unknown>[]): void {
  for (const [roadInfoId, roadInfo] of app.roadInfoDataMap.entries()) {
    syncPromises.push(
      app.runtime.dispatchWorker('APPLY_ROAD_INFO', {
        roadInfoId,
        roadInfo,
      }),
    );
  }
}

export function queuePackSync(app: App, syncPromises: Promise<unknown>[]): void {
  if (app.objectGroupsDirty()) {
    syncPromises.push(
      app.runtime.dispatchWorker('APPLY_OBJECT_GROUPS', {
        objectGroups: app.objectGroupDefinitions(),
      }),
    );
  }
  if (app.objectTypesDirty()) {
    syncPromises.push(
      app.runtime.dispatchWorker('APPLY_OBJECT_TYPES', {
        objectTypes: app.objectTypeDefinitions(),
      }),
    );
  }
}

export function schedulePropertiesAutoSave(app: App): void {
  if (app.propertiesSaveTimer !== null) clearTimeout(app.propertiesSaveTimer);
  app.propertiesSaveTimer = setTimeout(() => {
    app.propertiesSaveTimer = null;
    void app.saveLevelProperties();
  }, 300);
}

export function markPropertiesDirty(app: App): void {
  app.propertiesDirty.set(true);
  app.propertiesSaveLevelId = app.selectedLevelId();
  app.propertiesEditRevision += 1;
  schedulePropertiesAutoSave(app);
}

export function scheduleObjectGroupsAutoSave(app: App): void {
  if (app.objectGroupsSaveTimer !== null) clearTimeout(app.objectGroupsSaveTimer);
  app.objectGroupsSaveTimer = setTimeout(() => {
    app.objectGroupsSaveTimer = null;
    void app.saveObjectGroups();
  }, 300);
}

export function markObjectGroupsDirty(app: App): void {
  app.objectGroupsDirty.set(true);
  app.objectGroupsEditRevision += 1;
  scheduleObjectGroupsAutoSave(app);
}

export async function saveLevelProperties(app: App): Promise<void> {
  const id = app.selectedLevelId();
  if (id === null || !app.propertiesDirty()) return;
  if (app.propertiesSaveLevelId !== null && app.propertiesSaveLevelId !== id) return;
  const props: LevelProperties = {
    roadInfo: app.editRoadInfo(),
    time: app.editTime(),
    xStartPos: app.editXStartPos(),
    levelEnd: app.editLevelEnd(),
    objectGroups: app.editObjectGroups(),
  };
  const saveRevision = app.propertiesEditRevision;
  try {
    if (app.workerBusy()) {
      schedulePropertiesAutoSave(app);
      return;
    }
    app.workerBusy.set(true);
    const syncPromises: Promise<unknown>[] = [];
    queueRoadInfoSync(app, syncPromises);
    await Promise.all(syncPromises);
    const result: { levels: ParsedLevel[] } = await app.runtime.dispatchWorker('APPLY_PROPS', {
      resourceId: id,
      props,
    });
    app.applyLevelsResult(result.levels, {
      preserveCanvasView: true,
      refreshSelectedLevelState: false,
    });
    if (app.propertiesEditRevision === saveRevision) {
      app.propertiesDirty.set(false);
      app.propertiesSaveLevelId = null;
      app.resourcesStatus.set(`Saved properties for level ${id - 139}.`);
      app.snackBar.open(`✓ Level ${id - 139} properties saved`, 'OK', {
        duration: 3000,
        panelClass: 'snack-success',
      });
    } else {
      markPropertiesDirty(app);
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Save failed';
    app.editorError.set(msg);
    app.snackBar.open(`✗ ${msg}`, 'Dismiss', { duration: 5000, panelClass: 'snack-error' });
  } finally {
    app.workerBusy.set(false);
  }
}
