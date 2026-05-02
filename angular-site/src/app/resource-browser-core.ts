import { resultFromPromise } from './result-helpers';
import { triggerBytesDownload } from './resource-browser-utils';

import type { App } from './app';

const dispatchResult = <T>(
  app: App,
  cmd: string,
  payload?: unknown,
  transferables?: Transferable[],
  fallback = `Failed to run ${cmd}`,
) => resultFromPromise(app.runtime.dispatchWorker<T>(cmd, payload, transferables), fallback);

const setTextResourceSelection = (app: App, type: string, bytes: Uint8Array) => {
  app.selectedResBytes.set(bytes);
  if (type === 'STR ') {
    const len = bytes[0] ?? 0;
    app.selectedResText.set(String.fromCharCode(...bytes.subarray(1, 1 + len)));
    return;
  }
  const chars: string[] = [];
  for (let i = 0; i < bytes.length; i++) chars.push(String.fromCharCode(bytes[i]));
  app.selectedResText.set(chars.join(''));
};

const loadRawResource = async (app: App, type: string, id: number) => {
  const rawResult = await dispatchResult<{ bytes: ArrayBuffer | null }>(
    app,
    'GET_RESOURCE_RAW',
    { type, id },
    undefined,
    `Error loading resource ${type}#${id}`,
  );
  return rawResult.match(
    ({ bytes }) => (bytes ? new Uint8Array(bytes) : null),
    () => null,
  );
};

const finishBusy = (app: App) => {
  app.resBrowserBusy.set(false);
};

export async function loadResourceList(app: App) {
  const listResult = await dispatchResult<{
    entries: { type: string; id: number; size: number }[];
  }>(app, 'LIST_RESOURCES', undefined, undefined, 'Failed to list resources');
  listResult.match(
    (result) => app.allResourceEntries.set(result.entries),
    (error) => console.warn('[App] loadResourceList failed:', error),
  );
}

export async function selectResource(app: App, type: string, id: number) {
  app.selectedResType.set(type);
  app.selectedResId.set(id);
  app.selectedResBytes.set(null);
  app.selectedResStrings.set(null);
  app.selectedResText.set(null);
  app.selectedPackEntries.set(null);
  app.selectedPackEntryId.set(null);
  app.selectedPackEntryBytes.set(null);
  app.resBrowserStatus.set('');
  app.media.stopAudio();
  app._lastAudioBuffer = null;
  app.audioCurrentTime.set(0);
  app.audioDuration.set(0);
  app.resBrowserBusy.set(true);

  if (type === 'Pack') {
    const packResult = await dispatchResult<{ entries: { id: number; size: number }[] | null }>(
      app,
      'LIST_PACK_ENTRIES',
      { packId: id },
      undefined,
      `Error loading resource: Pack#${id}`,
    );
    packResult.match(
      ({ entries }) => app.selectedPackEntries.set(entries),
      (error) => app.resBrowserStatus.set(error),
    );
    finishBusy(app);
    return;
  }

  if (type === 'STR#') {
    const stringResults = await resultFromPromise(
      Promise.all([
        app.runtime.dispatchWorker<{ strings: string[] | null }>('GET_STR_LIST', { id }),
        app.runtime.dispatchWorker<{ bytes: ArrayBuffer | null }>('GET_RESOURCE_RAW', { type, id }),
      ]),
      `Error loading resource: STR#${id}`,
    );
    stringResults.match(
      ([strResult, rawResult]) => {
        app.selectedResStrings.set(strResult.strings);
        app.strListDirty.set(false);
        if (rawResult.bytes) app.selectedResBytes.set(new Uint8Array(rawResult.bytes));
      },
      (error) => app.resBrowserStatus.set(error),
    );
    finishBusy(app);
    return;
  }

  const bytes = await loadRawResource(app, type, id);
  if (!bytes) {
    app.resBrowserStatus.set(`Error loading resource: ${type}#${id}`);
    finishBusy(app);
    return;
  }
  if (type === 'TEXT' || type === 'STR ') {
    setTextResourceSelection(app, type, bytes);
  } else {
    app.selectedResBytes.set(bytes);
  }
  finishBusy(app);
}

export async function selectPackEntry(app: App, packId: number, entryId: number) {
  app.selectedPackEntryId.set(entryId);
  app.selectedPackEntryBytes.set(null);
  app.resBrowserBusy.set(true);

  const bytesResult = await dispatchResult<{ bytes: ArrayBuffer | null }>(
    app,
    'GET_PACK_ENTRY_RAW',
    { packId, entryId },
    undefined,
    `Error loading pack entry: Pack#${packId} entry #${entryId}`,
  );
  bytesResult.match(
    ({ bytes }) => {
      if (bytes) app.selectedPackEntryBytes.set(new Uint8Array(bytes));
    },
    (error) => app.resBrowserStatus.set(error),
  );
  finishBusy(app);
}

export function downloadSelectedResource(app: App) {
  const bytes = app.selectedResBytes();
  const type = app.selectedResType();
  const id = app.selectedResId();
  if (!bytes || !type || id === null) return;
  triggerBytesDownload(bytes, `${type}_${id}.bin`);
}

export function downloadSelectedPackEntry(app: App) {
  const bytes = app.selectedPackEntryBytes();
  const id = app.selectedResId();
  const entryId = app.selectedPackEntryId();
  if (!bytes || id === null || entryId === null) return;
  triggerBytesDownload(bytes, `Pack_${id}_entry_${entryId}.bin`);
}

export function triggerUploadResource(app: App) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.bin,*/*';
  input.onchange = async () => {
    const file = input.files?.[0];
    const type = app.selectedResType();
    const id = app.selectedResId();
    if (!file || !type || id === null) return;

    app.resBrowserBusy.set(true);

    const fileBytesResult = await resultFromPromise(
      file.arrayBuffer(),
      `Upload failed for ${type}#${id}`,
    );
    const bytes = fileBytesResult.match(
      (buffer) => new Uint8Array(buffer),
      (error) => {
        app.snackBar.open(`✗ ${error}`, 'Dismiss', { duration: 5000 });
        return null;
      },
    );
    if (!bytes) {
      finishBusy(app);
      return;
    }

    const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const saveResult = await dispatchResult(
      app,
      'PUT_RESOURCE_RAW',
      { type, id, bytes: buf },
      [buf],
      `Upload failed for ${type}#${id}`,
    );
    const saveError = saveResult.match(
      () => null,
      (error) => error,
    );
    if (saveError) {
      app.snackBar.open(`✗ ${saveError}`, 'Dismiss', { duration: 5000 });
      finishBusy(app);
      return;
    }

    await loadResourceList(app);
    const updatedBytes = await loadRawResource(app, type, id);
    if (updatedBytes) app.selectedResBytes.set(updatedBytes);
    app.snackBar.open(`✓ Replaced ${type}#${id} (${bytes.length} bytes)`, 'OK', { duration: 3000 });
    finishBusy(app);
  };
  input.click();
}

export function triggerUploadPackEntry(app: App) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.bin,*/*';
  input.onchange = async () => {
    const file = input.files?.[0];
    const packId = app.selectedResId();
    const entryId = app.selectedPackEntryId();
    if (!file || packId === null || entryId === null) return;

    app.resBrowserBusy.set(true);

    const fileBytesResult = await resultFromPromise(
      file.arrayBuffer(),
      `Upload failed for Pack#${packId} entry #${entryId}`,
    );
    const bytes = fileBytesResult.match(
      (buffer) => new Uint8Array(buffer),
      (error) => {
        app.snackBar.open(`✗ ${error}`, 'Dismiss', { duration: 5000 });
        return null;
      },
    );
    if (!bytes) {
      finishBusy(app);
      return;
    }

    const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const saveResult = await dispatchResult(
      app,
      'PUT_PACK_ENTRY_RAW',
      { packId, entryId, bytes: buf },
      [buf],
      `Upload failed for Pack#${packId} entry #${entryId}`,
    );
    const saveError = saveResult.match(
      () => null,
      (error) => error,
    );
    if (saveError) {
      app.snackBar.open(`✗ ${saveError}`, 'Dismiss', { duration: 5000 });
      finishBusy(app);
      return;
    }

    const listResult = await dispatchResult<{ entries: { id: number; size: number }[] | null }>(
      app,
      'LIST_PACK_ENTRIES',
      { packId },
      undefined,
      `Failed to refresh Pack#${packId} entry list`,
    );
    listResult.match(
      ({ entries }) => app.selectedPackEntries.set(entries),
      () => undefined,
    );

    const entryBytesResult = await dispatchResult<{ bytes: ArrayBuffer | null }>(
      app,
      'GET_PACK_ENTRY_RAW',
      { packId, entryId },
      undefined,
      `Failed to refresh Pack#${packId} entry #${entryId}`,
    );
    entryBytesResult.match(
      ({ bytes: updatedBytes }) => {
        if (updatedBytes) app.selectedPackEntryBytes.set(new Uint8Array(updatedBytes));
      },
      () => undefined,
    );

    await loadResourceList(app);
    app.snackBar.open(`✓ Replaced Pack#${packId} entry #${entryId} (${bytes.length} bytes)`, 'OK', {
      duration: 3000,
    });
    finishBusy(app);
  };
  input.click();
}

export async function saveStrList(app: App) {
  const id = app.selectedResId();
  const strings = app.selectedResStrings();
  if (id === null || strings === null) return;

  app.resBrowserBusy.set(true);
  const saveResult = await dispatchResult(
    app,
    'PUT_STR_LIST',
    { id, strings },
    undefined,
    `Save failed for STR#${id}`,
  );
  const saveError = saveResult.match(
    () => null,
    (error) => error,
  );
  if (saveError) {
    app.snackBar.open(`✗ ${saveError}`, 'Dismiss', { duration: 5000 });
    finishBusy(app);
    return;
  }

  await loadResourceList(app);
  const updatedBytes = await loadRawResource(app, 'STR#', id);
  if (updatedBytes) app.selectedResBytes.set(updatedBytes);
  app.strListDirty.set(false);
  app.snackBar.open(`✓ Saved STR#${id}`, 'OK', { duration: 3000 });
  finishBusy(app);
}

export function updateResString(app: App, index: number, value: string) {
  const strings = app.selectedResStrings();
  if (!strings) return;
  const updated = strings.slice();
  updated[index] = value;
  app.selectedResStrings.set(updated);
  app.strListDirty.set(true);
}

export function addResString(app: App) {
  const strings = app.selectedResStrings();
  if (!strings) return;
  app.selectedResStrings.set([...strings, '']);
  app.strListDirty.set(true);
}

export function removeResString(app: App, index: number) {
  const strings = app.selectedResStrings();
  if (!strings) return;
  app.selectedResStrings.set(strings.filter((_: string, i: number) => i !== index));
  app.strListDirty.set(true);
}

export async function saveResText(app: App) {
  const type = app.selectedResType();
  const id = app.selectedResId();
  const text = app.selectedResText();
  if (!type || id === null || text === null) return;

  app.resBrowserBusy.set(true);
  const bytes =
    type === 'STR '
      ? (() => {
          const encoded = new Uint8Array(Math.min(255, text.length) + 1);
          encoded[0] = Math.min(255, text.length);
          for (let i = 0; i < encoded[0]; i++) encoded[i + 1] = text.charCodeAt(i) & 0xff;
          return encoded;
        })()
      : (() => {
          const encoded = new Uint8Array(text.length);
          for (let i = 0; i < text.length; i++) encoded[i] = text.charCodeAt(i) & 0xff;
          return encoded;
        })();

  const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const saveResult = await dispatchResult(
    app,
    'PUT_RESOURCE_RAW',
    { type, id, bytes: buf },
    [buf],
    `Save failed for ${type}#${id}`,
  );
  const saveError = saveResult.match(
    () => null,
    (error) => error,
  );
  if (saveError) {
    app.snackBar.open(`✗ ${saveError}`, 'Dismiss', { duration: 5000 });
    finishBusy(app);
    return;
  }

  app.selectedResBytes.set(bytes);
  await loadResourceList(app);
  app.snackBar.open(`✓ Saved ${type}#${id}`, 'OK', { duration: 3000 });
  finishBusy(app);
}

export async function savePackEntryFields(app: App) {
  const packId = app.selectedResId();
  const entryId = app.selectedPackEntryId();
  const bytes = app.selectedPackEntryBytes();
  if (packId === null || entryId === null || !bytes) return;

  app.resBrowserBusy.set(true);
  const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const saveResult = await dispatchResult(
    app,
    'PUT_PACK_ENTRY_RAW',
    { packId, entryId, bytes: buf },
    [buf],
    `Save failed for Pack#${packId} entry #${entryId}`,
  );
  const saveError = saveResult.match(
    () => null,
    (error) => error,
  );
  if (saveError) {
    app.snackBar.open(`✗ ${saveError}`, 'Dismiss', { duration: 5000 });
    finishBusy(app);
    return;
  }

  const listResult = await dispatchResult<{ entries: { id: number; size: number }[] | null }>(
    app,
    'LIST_PACK_ENTRIES',
    { packId },
    undefined,
    `Failed to refresh Pack#${packId} entry list`,
  );
  listResult.match(
    ({ entries }) => app.selectedPackEntries.set(entries),
    () => undefined,
  );
  app.snackBar.open(`✓ Saved Pack#${packId} entry #${entryId}`, 'OK', { duration: 3000 });
  finishBusy(app);
}
