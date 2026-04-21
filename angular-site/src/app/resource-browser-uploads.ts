/**
 * Raw file upload handlers for the resource browser.
 *
 * Handles replacing individual resources and pack entries by prompting
 * the user to select a local file and dispatching the bytes to the worker.
 */
import { resultFromPromise } from './result-helpers';
import type { App } from './app';
import {
  _dispatchResult,
  _loadRawResource,
  _finishBusy,
  loadResourceList,
} from './resource-browser-core';

export function triggerUploadResource(app: App): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.bin,*/*';
  input.onchange = async () => {
    const file = input.files?.[0];
    const type = app.selectedResType();
    const id = app.selectedResId();
    if (!file || !type || id === null) return;
    app.resBrowserBusy.set(true);

    const fileBytesResult = await resultFromPromise(file.arrayBuffer(), `Upload failed for ${type}#${id}`);
    const bytes = fileBytesResult.match(
      (buffer) => new Uint8Array(buffer),
      (error) => { app.snackBar.open(`✗ ${error}`, 'Dismiss', { duration: 5000 }); return null; },
    );
    if (!bytes) { _finishBusy(app); return; }

    const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const saveResult = await _dispatchResult(app, 'PUT_RESOURCE_RAW', { type, id, bytes: buf }, [buf], `Upload failed for ${type}#${id}`);
    const saveError = saveResult.match(() => null, (e) => e);
    if (saveError) {
      app.snackBar.open(`✗ ${saveError}`, 'Dismiss', { duration: 5000 });
      _finishBusy(app);
      return;
    }

    await loadResourceList(app);
    const updatedBytes = await _loadRawResource(app, type, id);
    if (updatedBytes) app.selectedResBytes.set(updatedBytes);
    app.snackBar.open(`✓ Replaced ${type}#${id} (${bytes.length} bytes)`, 'OK', { duration: 3000 });
    _finishBusy(app);
  };
  input.click();
}

export function triggerUploadPackEntry(app: App): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.bin,*/*';
  input.onchange = async () => {
    const file = input.files?.[0];
    const packId = app.selectedResId();
    const entryId = app.selectedPackEntryId();
    if (!file || packId === null || entryId === null) return;
    app.resBrowserBusy.set(true);

    const fileBytesResult = await resultFromPromise(file.arrayBuffer(), `Upload failed for Pack#${packId} entry #${entryId}`);
    const bytes = fileBytesResult.match(
      (buffer) => new Uint8Array(buffer),
      (error) => { app.snackBar.open(`✗ ${error}`, 'Dismiss', { duration: 5000 }); return null; },
    );
    if (!bytes) { _finishBusy(app); return; }

    const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const saveResult = await _dispatchResult(
      app, 'PUT_PACK_ENTRY_RAW', { packId, entryId, bytes: buf }, [buf], `Upload failed for Pack#${packId} entry #${entryId}`,
    );
    const saveError = saveResult.match(() => null, (e) => e);
    if (saveError) {
      app.snackBar.open(`✗ ${saveError}`, 'Dismiss', { duration: 5000 });
      _finishBusy(app);
      return;
    }

    const listResult = await _dispatchResult<{ entries: { id: number; size: number }[] | null }>(
      app, 'LIST_PACK_ENTRIES', { packId }, undefined, `Failed to refresh Pack#${packId} entry list`,
    );
    listResult.match(({ entries }) => app.selectedPackEntries.set(entries), () => undefined);

    const entryBytesResult = await _dispatchResult<{ bytes: ArrayBuffer | null }>(
      app, 'GET_PACK_ENTRY_RAW', { packId, entryId }, undefined, `Failed to refresh Pack#${packId} entry #${entryId}`,
    );
    entryBytesResult.match(
      ({ bytes: updatedBytes }) => { if (updatedBytes) app.selectedPackEntryBytes.set(new Uint8Array(updatedBytes)); },
      () => undefined,
    );

    await loadResourceList(app);
    app.snackBar.open(`✓ Replaced Pack#${packId} entry #${entryId} (${bytes.length} bytes)`, 'OK', { duration: 3000 });
    _finishBusy(app);
  };
  input.click();
}
