import { App } from './app';
import { AppStateResources } from './app-state-resources';
import { failEditor, loadResourcesBytes } from './app-loaders';
import { resultFromPromise } from './result-helpers';

export function resetEditorData(app: App): void {
  app.hasEditorData.set(false);
  app.editorError.set('');
  app.resourcesStatus.set('No resources.dat loaded. Use the buttons above to load one.');
  app.parsedLevels.set([]);
  app.selectedLevelId.set(null);
  app.availableTypeIds.set([]);
  app.objectTypeDefinitionMap.clear();
  app.objectTypeDefinitions.set([]);
  app.selectedObjectTypeId.set(null);
  app.objectTypesDirty.set(false);
  if (app.objectTypesSaveTimer !== null) {
    clearTimeout(app.objectTypesSaveTimer);
    app.objectTypesSaveTimer = null;
  }
  app.objectTypesEditRevision = 0;
  app.spriteAssets.set([]);
  app.selectedSpriteId.set(null);
  app.packSpriteFrames.set([]);
  app.selectedPackSpriteId.set(null);
  app.tileTileEntries.set([]);
  app.selectedTileId.set(null);
  app.roadTextureCanvases.clear();
  app.roadInfoDataMap.clear();
  app.roadInfoOptions.set([]);
  app._roadInfoPreviewDataUrls.clear();
  app.roadTileGroups.set([]);
  app.audioEntries.set([]);
  app.selectedAudioId.set(null);
  app.iconEntries.set([]);
  app.selectedIconId.set(null);
  app.selectedIconType.set('ICN#');
  app.objects.set([]);
  app.selectedObjIndex.set(null);
  app._resetObjectHistory();
  app._draggingStartMarker = false;
  app._draggingFinishLine = false;
  app.selectedMarkIndex.set(null);
  app.marks.set([]);
  app.editRoadInfo.set(0);
  app.editRoadInfoData.set(null);
  app.editTime.set(0);
  app.editXStartPos.set(0);
  app.editLevelEnd.set(0);
  app.editObjectGroups.set([]);
  app.propertiesDirty.set(false);
  app.propertiesSaveLevelId = null;
  if (app.propertiesSaveTimer !== null) {
    clearTimeout(app.propertiesSaveTimer);
    app.propertiesSaveTimer = null;
  }
  app.objectGroupDefinitions.set([]);
  app.selectedObjectGroupId.set(null);
  app.objectGroupsDirty.set(false);
  if (app.objectGroupsSaveTimer !== null) {
    clearTimeout(app.objectGroupsSaveTimer);
    app.objectGroupsSaveTimer = null;
  }
  app.editTrackUp.set([]);
  app.editTrackDown.set([]);
  app.dragTrackWaypoint.set(null);
  app.hoverTrackWaypoint.set(null);
  app.hoverTrackMidpoint.set(null);
  app.markingPreview.set([]);
  app.markingRangePreview.set(null);
  app.objectGroupRangePreview.set(null);
  app.objectGroupSpawnPreviewObjects.set([]);
  app.media.stopAudio();
  app._lastAudioBuffer = null;
  app.audioCurrentTime.set(0);
  app.audioDuration.set(0);
  app.audioDecodeInProgress.set(false);
}

export async function loadDefaultResources(app: App): Promise<void> {
  app.editorError.set('');
  app.resourcesStatus.set('Loading default resources.dat…');
  const bytesResult = await app.runtime.readAssetBytes('resources.dat');
  await bytesResult.match(
    (bytes) => loadResourcesBytes(app, bytes, 'default resources.dat'),
    (error) => {
      failEditor(app, error, 'Failed to load resources.');
    },
  );
}

export async function onResourceFileSelected(app: App, event: Event): Promise<void> {
  const input = event.target as EventTarget & { files?: FileList };
  const file = input?.files?.[0];
  if (!file) return;
  app.editorError.set('');
  await resultFromPromise(file.arrayBuffer(), 'Failed to read file')
    .andThen((buf) =>
      resultFromPromise(
        loadResourcesBytes(app, new Uint8Array(buf), file.name),
        'Failed to parse file',
      ),
    )
    .match(
      () => {},
      (error) => {
        app.editorError.set(error);
        app.resourcesStatus.set('Failed to load uploaded file.');
        app.workerBusy.set(false);
      },
    );
}

export function clearEditorResources(app: App): void {
  resetEditorData(app);
  app.snackBar.open('Editor file cleared', 'OK', {
    duration: 2500,
    panelClass: 'snack-success',
  });
}

/**
 * Flushes all in-memory edits (objects, tracks, marks, road segs, properties,
 * object groups, road info) to the pack worker so a subsequent SERIALIZE call
 * will include them.
 */
async function flushPendingEdits(app: App): Promise<void> {
  const syncPromises: Promise<unknown>[] = [];
  for (const level of app.parsedLevels()) {
    syncPromises.push(
      app.runtime.dispatchWorker<void>('APPLY_ROAD_SEGS', {
        resourceId: level.resourceId,
        roadSegs: level.roadSegs,
      }),
    );
  }
  const selId = app.selectedLevelId();
  if (selId !== null) {
    syncPromises.push(
      app.runtime.dispatchWorker<void>('APPLY_MARKS', { resourceId: selId, marks: app.marks() }),
    );
    syncPromises.push(
      app.runtime.dispatchWorker<void>('APPLY_TRACK', {
        resourceId: selId,
        trackUp: app.editTrackUp(),
        trackDown: app.editTrackDown(),
      }),
    );
    syncPromises.push(
      app.runtime.dispatchWorker<void>('APPLY_OBJECTS', {
        resourceId: selId,
        objects: app.objects(),
      }),
    );
    if (app.propertiesDirty()) {
      syncPromises.push(
        app.runtime.dispatchWorker<void>('APPLY_PROPS', {
          resourceId: selId,
          props: {
            roadInfo: app.editRoadInfo(),
            time: app.editTime(),
            xStartPos: app.editXStartPos(),
            levelEnd: app.editLevelEnd(),
            objectGroups: app.editObjectGroups(),
          },
        }),
      );
    }
  }
  app.queuePackSync(syncPromises);
  app.queueRoadInfoSync(syncPromises);
  await Promise.all(syncPromises);
}

export async function downloadEditedResources(app: App): Promise<void> {
  if (!app.hasEditorData()) return;
  app.workerBusy.set(true);
  app.resourcesStatus.set('Saving pending edits before download…');

  await resultFromPromise(flushPendingEdits(app), 'Failed to flush pending edits')
    .andThen(() => {
      app.resourcesStatus.set('Serializing resources…');
      return resultFromPromise(
        app.runtime.dispatchWorker<ArrayBuffer>('SERIALIZE'),
        'Failed to serialize resources',
      );
    })
    .match(
      (buf) => {
        const blob = new Blob([buf], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'resources.dat';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        app.resourcesStatus.set('Downloaded updated resources.dat.');
        app.snackBar.open('✓ Downloaded resources.dat', 'OK', {
          duration: 3000,
          panelClass: 'snack-success',
        });
      },
      (msg) => {
        app.editorError.set(msg);
        app.snackBar.open(`✗ ${msg}`, 'Dismiss', { duration: 5000, panelClass: 'snack-error' });
      },
    );

  app.workerBusy.set(false);
}

export async function saveEditedResourcesToGame(app: App): Promise<void> {
  if (!app.hasEditorData()) return;
  app.workerBusy.set(true);
  app.resourcesStatus.set('Flushing pending edits…');

  await resultFromPromise(flushPendingEdits(app), 'Failed to flush pending edits')
    .andThen(() => {
      app.resourcesStatus.set('Serializing…');
      return resultFromPromise(
        app.runtime.dispatchWorker<ArrayBuffer>('SERIALIZE'),
        'Failed to save resources',
      );
    })
    .andThen((buf) => {
      const name = app.customResourcesName() ?? 'resources.dat';
      return resultFromPromise(
        AppStateResources._saveCustomResourcesDb(new Uint8Array(buf), name),
        'Failed to persist resources to game storage',
      ).map(() => name);
    })
      .match(
      (name) => {
        app.customResourcesName.set(name);
        app.customResourcesLoaded.set(true);
        app.customResourcesPreset.set('uploaded');
        app.customOptionsPreset.set('manual');
        app.resourcesStatus.set('Saved to game. Restart the game to apply changes.');
        app.snackBar
          .open('✓ Saved to game – click Restart Game to apply', 'Restart', {
            duration: 8000,
            panelClass: 'snack-success',
          })
          .onAction()
          .subscribe(() => app.runtime.restartGameWithCustomResources());
      },
      (msg) => {
        app.editorError.set(msg);
        app.snackBar.open(`✗ ${msg}`, 'Dismiss', { duration: 5000, panelClass: 'snack-error' });
      },
    );

  app.workerBusy.set(false);
}
