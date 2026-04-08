import type {
  MarkSeg,
  ObjectPos,
  RoadInfoData,
  RoadSeg,
  TrackMidpointRef,
  TrackWaypointRef,
} from './level-editor.service';
import type { App } from './app';

export type EditorUndoKind = 'objects' | 'marks' | 'tracks' | 'props' | 'road';

export type EditorUndoSnapshot =
  | {
      kind: 'objects';
      levelId: number | null;
      objects: ObjectPos[];
      selectedObjIndex: number | null;
      editObjX: number;
      editObjY: number;
      editObjDir: number;
      editObjTypeRes: number;
    }
  | {
      kind: 'marks';
      levelId: number | null;
      marks: MarkSeg[];
      selectedMarkIndex: number | null;
      markingPreview: MarkSeg[];
      markCreateMode: boolean;
      pendingMarkPointCount: number;
    }
  | {
      kind: 'tracks';
      levelId: number | null;
      editTrackUp: { x: number; y: number; flags: number; velo: number }[];
      editTrackDown: { x: number; y: number; flags: number; velo: number }[];
      dragTrackWaypoint: TrackWaypointRef | null;
      hoverTrackWaypoint: TrackWaypointRef | null;
      hoverTrackMidpoint: TrackMidpointRef | null;
    }
  | {
      kind: 'props';
      levelId: number | null;
      editRoadInfo: number;
      editRoadInfoData: RoadInfoData | null;
      selectedRoadInfoId: number | null;
      selectedRoadInfoData: RoadInfoData | null;
      editTime: number;
      editXStartPos: number;
      editLevelEnd: number;
      editObjectGroups: { resID: number; numObjs: number }[];
      propertiesDirty: boolean;
    }
  | {
      kind: 'road';
      levelId: number | null;
      roadSegs: RoadSeg[];
    };

export function captureUndoSnapshot(app: App, kind: EditorUndoKind): EditorUndoSnapshot {
  const level = app.selectedLevel();
  switch (kind) {
    case 'objects':
      return {
        kind,
        levelId: app.selectedLevelId(),
        objects: app.objects().map((o) => ({ ...o })),
        selectedObjIndex: app.selectedObjIndex(),
        editObjX: app.editObjX(),
        editObjY: app.editObjY(),
        editObjDir: app.editObjDir(),
        editObjTypeRes: app.editObjTypeRes(),
      };
    case 'marks':
      return {
        kind,
        levelId: app.selectedLevelId(),
        marks: app.marks().map((m) => ({ ...m })),
        selectedMarkIndex: app.selectedMarkIndex(),
        markingPreview: app.markingPreview().map((m) => ({ ...m })),
        markCreateMode: app.markCreateMode(),
        pendingMarkPointCount: app.pendingMarkPointCount(),
      };
    case 'tracks':
      return {
        kind,
        levelId: app.selectedLevelId(),
        editTrackUp: app.editTrackUp().map((s) => ({ ...s })),
        editTrackDown: app.editTrackDown().map((s) => ({ ...s })),
        dragTrackWaypoint: app.dragTrackWaypoint(),
        hoverTrackWaypoint: app.hoverTrackWaypoint(),
        hoverTrackMidpoint: app.hoverTrackMidpoint(),
      };
    case 'props': {
      const editRoadInfoData = app.editRoadInfoData();
      const selectedRoadInfoData = app.selectedRoadInfoData();
      return {
        kind,
        levelId: app.selectedLevelId(),
        editRoadInfo: app.editRoadInfo(),
        editRoadInfoData: editRoadInfoData ? { ...editRoadInfoData } : null,
        selectedRoadInfoId: app.selectedRoadInfoId(),
        selectedRoadInfoData: selectedRoadInfoData ? { ...selectedRoadInfoData } : null,
        editTime: app.editTime(),
        editXStartPos: app.editXStartPos(),
        editLevelEnd: app.editLevelEnd(),
        editObjectGroups: app.editObjectGroups().map((g) => ({ ...g })),
        propertiesDirty: app.propertiesDirty(),
      };
    }
    case 'road':
      return {
        kind,
        levelId: app.selectedLevelId(),
        roadSegs: level ? level.roadSegs.map((seg) => ({ ...seg })) : [],
      };
  }
}

export function applyUndoSnapshot(app: App, snapshot: EditorUndoSnapshot): void {
  if (snapshot.levelId !== app.selectedLevelId()) return;
  switch (snapshot.kind) {
    case 'objects':
      app.objects.set(snapshot.objects.map((o) => ({ ...o })));
      app.selectedObjIndex.set(snapshot.selectedObjIndex);
      app.editObjX.set(snapshot.editObjX);
      app.editObjY.set(snapshot.editObjY);
      app.editObjDir.set(snapshot.editObjDir);
      app.editObjTypeRes.set(snapshot.editObjTypeRes);
      break;
    case 'marks':
      app.marks.set(snapshot.marks.map((m) => ({ ...m })));
      app.selectedMarkIndex.set(snapshot.selectedMarkIndex);
      app.markingPreview.set(snapshot.markingPreview.map((m) => ({ ...m })));
      app.markCreateMode.set(snapshot.markCreateMode);
      app.pendingMarkPointCount.set(snapshot.pendingMarkPointCount);
      break;
    case 'tracks':
      app.editTrackUp.set(snapshot.editTrackUp.map((s) => ({ ...s })));
      app.editTrackDown.set(snapshot.editTrackDown.map((s) => ({ ...s })));
      app.dragTrackWaypoint.set(snapshot.dragTrackWaypoint);
      app.hoverTrackWaypoint.set(snapshot.hoverTrackWaypoint);
      app.hoverTrackMidpoint.set(snapshot.hoverTrackMidpoint);
      break;
    case 'props':
      app.editRoadInfo.set(snapshot.editRoadInfo);
      app.editRoadInfoData.set(snapshot.editRoadInfoData ? { ...snapshot.editRoadInfoData } : null);
      app.selectedRoadInfoId.set(snapshot.selectedRoadInfoId);
      app.selectedRoadInfoData.set(snapshot.selectedRoadInfoData ? { ...snapshot.selectedRoadInfoData } : null);
      if (snapshot.editRoadInfoData) {
        app.roadInfoDataMap.set(snapshot.editRoadInfo, { ...snapshot.editRoadInfoData });
        app.refreshRoadInfoDerivedState();
        void app.runtime.dispatchWorker('APPLY_ROAD_INFO', {
          roadInfoId: snapshot.editRoadInfo,
          roadInfo: snapshot.editRoadInfoData,
        });
      }
      app.editTime.set(snapshot.editTime);
      app.editXStartPos.set(snapshot.editXStartPos);
      app.editLevelEnd.set(snapshot.editLevelEnd);
      app.editObjectGroups.set(snapshot.editObjectGroups.map((g) => ({ ...g })));
      app.propertiesDirty.set(snapshot.propertiesDirty);
      break;
    case 'road': {
      const roadSegs = snapshot.roadSegs.map((seg) => ({ ...seg }));
      app.parsedLevels.update((levels) =>
        levels.map((level) => (level.resourceId === snapshot.levelId ? { ...level, roadSegs } : level)),
      );
      app._roadOffscreenKey = '';
      app.roadSegsVersion.update((v) => v + 1);
      break;
    }
  }
  app.runtime.scheduleCanvasRedraw();
  app._objectDragUndoCaptured = false;
  app._startMarkerDragUndoCaptured = false;
}

export function pushUndo(app: App, kind: EditorUndoKind): void {
  app._undoStack.push(captureUndoSnapshot(app, kind));
  if (app._undoStack.length > 50) app._undoStack.shift();
  app._redoStack = [];
  app.canUndo.set(true);
  app.canRedo.set(false);
}

export function resetObjectHistory(app: App): void {
  app._undoStack = [];
  app._redoStack = [];
  app.canUndo.set(false);
  app.canRedo.set(false);
  app._objectDragUndoCaptured = false;
  app._startMarkerDragUndoCaptured = false;
  app._finishLineDragUndoCaptured = false;
}

export function undo(app: App): void {
  if (app._undoStack.length === 0) return;
  const current = app._undoStack[app._undoStack.length - 1];
  app._redoStack.push(captureUndoSnapshot(app, current.kind));
  const snapshot = app._undoStack.pop();
  if (snapshot) applyUndoSnapshot(app, snapshot);
  app.canUndo.set(app._undoStack.length > 0);
  app.canRedo.set(true);
}

export function redo(app: App): void {
  if (app._redoStack.length === 0) return;
  const current = app._redoStack[app._redoStack.length - 1];
  app._undoStack.push(captureUndoSnapshot(app, current.kind));
  const snapshot = app._redoStack.pop();
  if (snapshot) applyUndoSnapshot(app, snapshot);
  app.canUndo.set(true);
  app.canRedo.set(app._redoStack.length > 0);
}
