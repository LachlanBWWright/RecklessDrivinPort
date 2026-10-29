import { resetTrackSaving } from './app-track-saving';
import type { App } from './app';
import type { LevelOperation } from './level-management';
import type { LevelScriptBinding, ParsedLevel } from './level-editor.service';
import { flushPendingEdits } from './app-session';
import { resultFromPromise } from './result-helpers';

export async function manageEditorLevels(app: App, operation: LevelOperation): Promise<void> {
  const resourceId = app.selectedLevelId();
  if (resourceId === null || app.workerBusy()) return;
  app.workerBusy.set(true);
  if (app.propertiesSaveTimer !== null) {
    clearTimeout(app.propertiesSaveTimer);
    app.propertiesSaveTimer = null;
  }
  if (app.objectTypesSaveTimer !== null) {
    clearTimeout(app.objectTypesSaveTimer);
    app.objectTypesSaveTimer = null;
  }
  if (app.objectGroupsSaveTimer !== null) {
    clearTimeout(app.objectGroupsSaveTimer);
    app.objectGroupsSaveTimer = null;
  }
  if (app._markAutoSaveTimer !== null) {
    clearTimeout(app._markAutoSaveTimer);
    app._markAutoSaveTimer = null;
  }
  const result = await resultFromPromise(
    (async () => {
      await flushPendingEdits(app);
      app.propertiesDirty.set(false);
      app.propertiesSaveLevelId = null;
      app.objectGroupsDirty.set(false);
      app.objectTypesDirty.set(false);
      return app.runtime.dispatchWorker<{
        levels: ParsedLevel[];
        levelScriptBindings: LevelScriptBinding[];
        selectedLevelId: number;
      }>('MANAGE_LEVELS', { resourceId, operation });
    })(),
    'Could not update levels',
  );
  result.match(
    (updated) => {
      // Structural changes replace slot identity: do not merge cached roads by old slot ID.
      resetTrackSaving(app);
      app.parsedLevels.set(updated.levels);
      app.levelScriptBindings.set(updated.levelScriptBindings);
      app.roadSegsVersion.update((version) => version + 1);
      app.selectLevel(updated.selectedLevelId, { captureTracks: false });
      app.editorError.set('');
    },
    (error) => app.editorError.set(error),
  );
  app.workerBusy.set(false);
}
