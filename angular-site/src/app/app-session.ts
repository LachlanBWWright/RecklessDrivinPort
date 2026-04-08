import { App } from './app';

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
  app.stopAudio();
  app._lastAudioBuffer = null;
  app.audioCurrentTime.set(0);
  app.audioDuration.set(0);
  app.audioDecodeInProgress.set(false);
}

export async function loadDefaultResources(app: App): Promise<void> {
  try {
    app.editorError.set('');
    app.resourcesStatus.set('Loading default resources.dat…');
    const bytesResult = await app.readAssetBytes('resources.dat');
    if (!bytesResult.isOk()) {
      app.failEditor(bytesResult.error, 'Failed to load resources.');
      return;
    }
    await app.loadResourcesBytes(bytesResult.value, 'default resources.dat');
  } catch (error) {
    app.editorError.set(error instanceof Error ? error.message : 'Failed to load resources.dat');
    app.resourcesStatus.set('Failed to load resources.');
    app.workerBusy.set(false);
  }
}

export async function onResourceFileSelected(app: App, event: Event): Promise<void> {
  const input = event.target as EventTarget & { files?: FileList };
  const file = input?.files?.[0];
  if (!file) return;
  app.editorError.set('');
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    await app.loadResourcesBytes(bytes, file.name);
  } catch (error) {
    app.editorError.set(error instanceof Error ? error.message : 'Failed to load file');
    app.resourcesStatus.set('Failed to load uploaded file.');
    app.workerBusy.set(false);
  }
}

export function clearEditorResources(app: App): void {
  app.resetEditorData();
  app.snackBar.open('Editor file cleared', 'OK', {
    duration: 2500,
    panelClass: 'snack-success',
  });
}

export async function downloadEditedResources(app: App): Promise<void> {
  if (!app.hasEditorData()) return;
  try {
    app.workerBusy.set(true);
    app.resourcesStatus.set('Saving pending edits before download…');
    const syncPromises: Promise<unknown>[] = [];
    for (const level of app.parsedLevels()) {
      syncPromises.push(
      app.dispatchWorker<void>('APPLY_ROAD_SEGS', {
          resourceId: level.resourceId,
          roadSegs: level.roadSegs,
        }),
      );
    }
    const selId = app.selectedLevelId();
    if (selId !== null) {
      syncPromises.push(app.dispatchWorker<void>('APPLY_MARKS', { resourceId: selId, marks: app.marks() }));
      syncPromises.push(
        app.dispatchWorker<void>('APPLY_TRACK', {
          resourceId: selId,
          trackUp: app.editTrackUp(),
          trackDown: app.editTrackDown(),
        }),
      );
      syncPromises.push(app.dispatchWorker<void>('APPLY_OBJECTS', { resourceId: selId, objects: app.objects() }));
      if (app.propertiesDirty()) {
        syncPromises.push(
          app.dispatchWorker<void>('APPLY_PROPS', {
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
    app.resourcesStatus.set('Serializing resources…');
    const buf = await app.dispatchWorker<ArrayBuffer>('SERIALIZE');
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
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Failed to serialize resources';
    app.editorError.set(msg);
    app.snackBar.open(`✗ ${msg}`, 'Dismiss', { duration: 5000, panelClass: 'snack-error' });
  } finally {
    app.workerBusy.set(false);
  }
}

export async function saveEditedResourcesToGame(app: App): Promise<void> {
  if (!app.hasEditorData()) return;
  try {
    app.workerBusy.set(true);
    app.resourcesStatus.set('Flushing pending edits…');
    const syncPromises: Promise<unknown>[] = [];
    for (const level of app.parsedLevels()) {
      syncPromises.push(
      app.dispatchWorker<void>('APPLY_ROAD_SEGS', {
          resourceId: level.resourceId,
          roadSegs: level.roadSegs,
        }),
      );
    }
    const selId = app.selectedLevelId();
    if (selId !== null) {
      syncPromises.push(app.dispatchWorker<void>('APPLY_MARKS', { resourceId: selId, marks: app.marks() }));
      syncPromises.push(
        app.dispatchWorker<void>('APPLY_TRACK', {
          resourceId: selId,
          trackUp: app.editTrackUp(),
          trackDown: app.editTrackDown(),
        }),
      );
      syncPromises.push(app.dispatchWorker<void>('APPLY_OBJECTS', { resourceId: selId, objects: app.objects() }));
      if (app.propertiesDirty()) {
        syncPromises.push(
          app.dispatchWorker<void>('APPLY_PROPS', {
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
    app.resourcesStatus.set('Serializing…');
    const buf = await app.dispatchWorker<ArrayBuffer>('SERIALIZE');
    const bytes = new Uint8Array(buf);
    const name = app.customResourcesName() ?? 'resources.dat';
    await App._saveCustomResourcesDb(bytes, name);
    app.customResourcesName.set(name);
    app.customResourcesLoaded.set(true);
    app.resourcesStatus.set('Saved to game. Restart the game to apply changes.');
    app.snackBar
      .open('✓ Saved to game – click Restart Game to apply', 'Restart', {
        duration: 8000,
        panelClass: 'snack-success',
      })
      .onAction()
      .subscribe(() => app.restartGameWithCustomResources());
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Failed to save resources';
    app.editorError.set(msg);
    app.snackBar.open(`✗ ${msg}`, 'Dismiss', { duration: 5000, panelClass: 'snack-error' });
  } finally {
    app.workerBusy.set(false);
  }
}
