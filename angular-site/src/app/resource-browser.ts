import type { DecodedSpriteFrame } from './level-editor.service';
import { App } from './app';

export async function loadResourceList(app: App): Promise<void> {
  try {
    const result: { entries: { type: string; id: number; size: number }[] } =
      await app.dispatchWorker('LIST_RESOURCES');
    app.allResourceEntries.set(result.entries);
  } catch (error) {
    console.warn('[App] loadResourceList failed:', error);
  }
}

export async function selectResource(app: App, type: string, id: number): Promise<void> {
  app.selectedResType.set(type);
  app.selectedResId.set(id);
  app.selectedResBytes.set(null);
  app.selectedResStrings.set(null);
  app.selectedResText.set(null);
  app.selectedPackEntries.set(null);
  app.selectedPackEntryId.set(null);
  app.selectedPackEntryBytes.set(null);
  app.resBrowserStatus.set('');
  app.stopAudio();
  app._lastAudioBuffer = null;
  app.audioCurrentTime.set(0);
  app.audioDuration.set(0);
  try {
    app.resBrowserBusy.set(true);
    if (type === 'Pack') {
      const r: { entries: { id: number; size: number }[] | null } = await app.dispatchWorker(
        'LIST_PACK_ENTRIES',
        { packId: id },
      );
      app.selectedPackEntries.set(r.entries);
    } else if (type === 'STR#') {
      const [strR, rawR] = await Promise.all([
        app.dispatchWorker<{ strings: string[] | null }>('GET_STR_LIST', { id }),
        app.dispatchWorker<{ bytes: ArrayBuffer | null }>('GET_RESOURCE_RAW', { type, id }),
      ]);
      app.selectedResStrings.set(strR.strings);
      if (rawR.bytes) app.selectedResBytes.set(new Uint8Array(rawR.bytes));
    } else if (type === 'TEXT' || type === 'STR ') {
      const r: { bytes: ArrayBuffer | null } = await app.dispatchWorker<{ bytes: ArrayBuffer | null }>(
        'GET_RESOURCE_RAW',
        {
        type,
        id,
        },
      );
      if (r.bytes) {
        const bytes = new Uint8Array(r.bytes);
        app.selectedResBytes.set(bytes);
        if (type === 'STR ') {
          const len = bytes[0] ?? 0;
          app.selectedResText.set(String.fromCharCode(...bytes.subarray(1, 1 + len)));
        } else {
          const chars: string[] = [];
          for (let i = 0; i < bytes.length; i++) chars.push(String.fromCharCode(bytes[i]));
          app.selectedResText.set(chars.join(''));
        }
      }
    } else {
      const r: { bytes: ArrayBuffer | null } = await app.dispatchWorker<{ bytes: ArrayBuffer | null }>(
        'GET_RESOURCE_RAW',
        {
        type,
        id,
        },
      );
      if (r.bytes) app.selectedResBytes.set(new Uint8Array(r.bytes));
    }
  } catch (error) {
    app.resBrowserStatus.set(`Error loading resource: ${error}`);
  } finally {
    app.resBrowserBusy.set(false);
  }
}

export async function selectPackEntry(app: App, packId: number, entryId: number): Promise<void> {
  app.selectedPackEntryId.set(entryId);
  app.selectedPackEntryBytes.set(null);
  try {
    app.resBrowserBusy.set(true);
    const r: { bytes: ArrayBuffer | null } = await app.dispatchWorker<{ bytes: ArrayBuffer | null }>(
      'GET_PACK_ENTRY_RAW',
      {
      packId,
      entryId,
      },
    );
    if (r.bytes) app.selectedPackEntryBytes.set(new Uint8Array(r.bytes));
  } catch (error) {
    app.resBrowserStatus.set(`Error loading pack entry: ${error}`);
  } finally {
    app.resBrowserBusy.set(false);
  }
}

export function downloadSelectedResource(app: App): void {
  const bytes = app.selectedResBytes();
  const type = app.selectedResType();
  const id = app.selectedResId();
  if (!bytes || !type || id === null) return;
  triggerBytesDownload(bytes, `${type}_${id}.bin`);
}

export function downloadSelectedPackEntry(app: App): void {
  const bytes = app.selectedPackEntryBytes();
  const id = app.selectedResId();
  const entryId = app.selectedPackEntryId();
  if (!bytes || id === null || entryId === null) return;
  triggerBytesDownload(bytes, `Pack_${id}_entry_${entryId}.bin`);
}

export function triggerUploadResource(app: App): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.bin,*/*';
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    const type = app.selectedResType();
    const id = app.selectedResId();
    if (!type || id === null) return;
    try {
      app.resBrowserBusy.set(true);
      const bytes = new Uint8Array(await file.arrayBuffer());
      const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      await app.dispatchWorker('PUT_RESOURCE_RAW', { type, id, bytes: buf }, [buf]);
      await loadResourceList(app);
      const r: { bytes: ArrayBuffer | null } = await app.dispatchWorker('GET_RESOURCE_RAW', {
        type,
        id,
      });
      if (r.bytes) app.selectedResBytes.set(new Uint8Array(r.bytes));
      app.snackBar.open(`✓ Replaced ${type}#${id} (${bytes.length} bytes)`, 'OK', {
        duration: 3000,
      });
    } catch (error) {
      app.snackBar.open(`✗ Upload failed: ${error}`, 'Dismiss', { duration: 5000 });
    } finally {
      app.resBrowserBusy.set(false);
    }
  };
  input.click();
}

export function triggerUploadPackEntry(app: App): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.bin,*/*';
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    const packId = app.selectedResId();
    const entryId = app.selectedPackEntryId();
    if (packId === null || entryId === null) return;
    try {
      app.resBrowserBusy.set(true);
      const bytes = new Uint8Array(await file.arrayBuffer());
      const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      await app.dispatchWorker('PUT_PACK_ENTRY_RAW', { packId, entryId, bytes: buf }, [buf]);
      const listR: { entries: { id: number; size: number }[] | null } = await app.dispatchWorker(
        'LIST_PACK_ENTRIES',
        { packId },
      );
      app.selectedPackEntries.set(listR.entries);
      const r: { bytes: ArrayBuffer | null } = await app.dispatchWorker('GET_PACK_ENTRY_RAW', {
        packId,
        entryId,
      });
      if (r.bytes) app.selectedPackEntryBytes.set(new Uint8Array(r.bytes));
      await loadResourceList(app);
      app.snackBar.open(`✓ Replaced Pack#${packId} entry #${entryId} (${bytes.length} bytes)`, 'OK', {
        duration: 3000,
      });
    } catch (error) {
      app.snackBar.open(`✗ Upload failed: ${error}`, 'Dismiss', { duration: 5000 });
    } finally {
      app.resBrowserBusy.set(false);
    }
  };
  input.click();
}

export async function saveStrList(app: App): Promise<void> {
  const id = app.selectedResId();
  const strings = app.selectedResStrings();
  if (id === null || strings === null) return;
  try {
    app.resBrowserBusy.set(true);
    await app.dispatchWorker('PUT_STR_LIST', { id, strings });
    await loadResourceList(app);
    const rawR: { bytes: ArrayBuffer | null } = await app.dispatchWorker('GET_RESOURCE_RAW', {
      type: 'STR#',
      id,
    });
    if (rawR.bytes) app.selectedResBytes.set(new Uint8Array(rawR.bytes));
    app.snackBar.open(`✓ Saved STR#${id}`, 'OK', { duration: 3000 });
  } catch (error) {
    app.snackBar.open(`✗ Save failed: ${error}`, 'Dismiss', { duration: 5000 });
  } finally {
    app.resBrowserBusy.set(false);
  }
}

export function updateResString(app: App, index: number, value: string): void {
  const strings = app.selectedResStrings();
  if (!strings) return;
  const updated = strings.slice();
  updated[index] = value;
  app.selectedResStrings.set(updated);
}

export function addResString(app: App): void {
  const strings = app.selectedResStrings();
  if (!strings) return;
  app.selectedResStrings.set([...strings, '']);
}

export function removeResString(app: App, index: number): void {
  const strings = app.selectedResStrings();
  if (!strings) return;
  app.selectedResStrings.set(strings.filter((_: string, i: number) => i !== index));
}

export async function saveResText(app: App): Promise<void> {
  const type = app.selectedResType();
  const id = app.selectedResId();
  const text = app.selectedResText();
  if (!type || id === null || text === null) return;
  try {
    app.resBrowserBusy.set(true);
    let bytes: Uint8Array;
    if (type === 'STR ') {
      const encoded = new Uint8Array(Math.min(255, text.length) + 1);
      encoded[0] = Math.min(255, text.length);
      for (let i = 0; i < encoded[0]; i++) encoded[i + 1] = text.charCodeAt(i) & 0xff;
      bytes = encoded;
    } else {
      bytes = new Uint8Array(text.length);
      for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i) & 0xff;
    }
    const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    await app.dispatchWorker('PUT_RESOURCE_RAW', { type, id, bytes: buf }, [buf]);
    app.selectedResBytes.set(bytes);
    await loadResourceList(app);
    app.snackBar.open(`✓ Saved ${type}#${id}`, 'OK', { duration: 3000 });
  } catch (error) {
    app.snackBar.open(`✗ Save failed: ${error}`, 'Dismiss', { duration: 5000 });
  } finally {
    app.resBrowserBusy.set(false);
  }
}

export async function savePackEntryFields(app: App): Promise<void> {
  const packId = app.selectedResId();
  const entryId = app.selectedPackEntryId();
  const bytes = app.selectedPackEntryBytes();
  if (packId === null || entryId === null || !bytes) return;
  app.resBrowserBusy.set(true);
  try {
    const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    await app.dispatchWorker('PUT_PACK_ENTRY_RAW', { packId, entryId, bytes: buf }, [buf]);
    type ListPackResult = { entries: { id: number; size: number }[] | null };
    const listR = await app.dispatchWorker<ListPackResult>('LIST_PACK_ENTRIES', { packId });
    app.selectedPackEntries.set(listR.entries);
    app.snackBar.open(`✓ Saved Pack#${packId} entry #${entryId}`, 'OK', { duration: 3000 });
  } catch (error) {
    app.snackBar.open(`✗ Save failed: ${error}`, 'Dismiss', { duration: 5000 });
  } finally {
    app.resBrowserBusy.set(false);
  }
}

export async function applyTilePixels(app: App, texId: number, pixels: Uint8ClampedArray): Promise<void> {
  try {
    app.workerBusy.set(true);
    await app.dispatchWorker<Record<string, never>>('APPLY_TILE16_PIXELS', { texId, pixels });
    await app.decodeRoadTexturesInBackground();
    app.resourcesStatus.set(`Tile #${texId} replaced.`);
  } catch (error) {
    app.editorError.set(error instanceof Error ? error.message : 'Tile save failed');
  } finally {
    app.workerBusy.set(false);
  }
}

export function renderIconResource(bytes: Uint8Array | null): HTMLCanvasElement | null {
  if (typeof document === 'undefined' || !bytes || bytes.length < 128) return null;
  const size = 32;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const imgData = ctx.createImageData(size, size);
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      const byteIdx = row * 4 + Math.floor(col / 8);
      const bit = (bytes[byteIdx] >> (7 - (col % 8))) & 1;
      const pixIdx = (row * size + col) * 4;
      imgData.data[pixIdx] = bit ? 0 : 255;
      imgData.data[pixIdx + 1] = bit ? 0 : 255;
      imgData.data[pixIdx + 2] = bit ? 0 : 255;
      imgData.data[pixIdx + 3] = 255;
    }
  }
  ctx.putImageData(imgData, 0, 0);
  return canvas;
}

export function getIconResourceDataUrl(bytes: Uint8Array | null): string | null {
  const canvas = renderIconResource(bytes);
  if (!canvas) return null;
  try {
    return canvas.toDataURL();
  } catch {
    return null;
  }
}

export function getResHexDump(bytes: Uint8Array, maxBytes = 512): string {
  const limit = Math.min(bytes.length, maxBytes);
  const lines: string[] = [];
  for (let i = 0; i < limit; i += 16) {
    const row = bytes.subarray(i, Math.min(i + 16, limit));
    const hex = Array.from(row)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join(' ')
      .padEnd(47, ' ');
    const ascii = Array.from(row)
      .map((b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : '.'))
      .join('');
    lines.push(`${i.toString(16).padStart(4, '0')}  ${hex}  ${ascii}`);
  }
  if (bytes.length > maxBytes) {
    lines.push(`… (${bytes.length - maxBytes} more bytes)`);
  }
  return lines.join('\n');
}

function triggerBytesDownload(bytes: Uint8Array, filename: string): void {
  const plain = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(plain).set(bytes);
  const blob = new Blob([plain], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export function openTileEditor(app: App, texId: number): void {
  const canvas = app.roadTextureCanvases.get(texId);
  const entry = app.tileTileEntries().find((tile: { texId: number }) => tile.texId === texId);
  if (!canvas || !entry) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const imageData = ctx.getImageData(0, 0, entry.width, entry.height);
  const pixels = new Uint8ClampedArray(imageData.data);
  const frame: DecodedSpriteFrame = {
    frameId: texId,
    width: entry.width,
    height: entry.height,
    pixels,
    bitDepth: 16,
  };
  app._editingTileId = texId;
  app.spriteEditorFrame.set({ ...frame, pixels: pixels.slice() });
  app.spriteEditorOpen.set(true);
}

export function exportTilePng(app: App, texId: number): void {
  const canvas = app.roadTextureCanvases.get(texId);
  if (!canvas) return;
  try {
    const url = canvas.toDataURL('image/png');
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `tile-${texId}.png`;
    anchor.click();
  } catch {
    /* security error */
  }
}

export async function onTilePngUpload(app: App, event: Event, texId: number): Promise<void> {
  const input = event.target;
  if (!(input instanceof HTMLInputElement)) return;
  const file = input.files?.[0];
  if (!file) return;
  input.value = '';
  const entry = app.tileTileEntries().find((tile: { texId: number }) => tile.texId === texId);
  if (!entry) {
    app.editorError.set('Tile not found');
    return;
  }
  try {
    const url = URL.createObjectURL(file);
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = url;
    });
    URL.revokeObjectURL(url);
    const offscreen = document.createElement('canvas');
    offscreen.width = entry.width;
    offscreen.height = entry.height;
    const ctx = offscreen.getContext('2d');
    if (!ctx) {
      app.failEditor('Failed to get 2D context');
      return;
    }
    ctx.drawImage(img, 0, 0, entry.width, entry.height);
    const imageData = ctx.getImageData(0, 0, entry.width, entry.height);
    await app._applyTilePixels(texId, new Uint8ClampedArray(imageData.data));
  } catch (error) {
    app.editorError.set(error instanceof Error ? error.message : 'Tile PNG upload failed');
  }
}

export async function onTileEditorSaved(app: App, event: { frameId: number; pixels: Uint8ClampedArray }): Promise<void> {
  app.spriteEditorOpen.set(false);
  await app._applyTilePixels(event.frameId, event.pixels);
}

export async function addTileImage(app: App): Promise<void> {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/png,image/*';
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      app.workerBusy.set(true);
      const url = URL.createObjectURL(file);
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = reject;
        image.src = url;
      });
      URL.revokeObjectURL(url);
      const width = 128;
      const height = 128;
      const offscreen = document.createElement('canvas');
      offscreen.width = width;
      offscreen.height = height;
      const ctx = offscreen.getContext('2d');
      if (!ctx) {
        app.failEditor('Failed to get 2D context');
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      const imageData = ctx.getImageData(0, 0, width, height);
      const pixels = new Uint8ClampedArray(imageData.data);
      const existing = app.tileTileEntries().map((tile: { texId: number }) => tile.texId);
      const nextId = existing.length > 0 ? Math.max(...existing) + 1 : 200;
      if (nextId > 9999) {
        app.failEditor('Too many tile images (max ID 9999)');
        return;
      }
      await app.dispatchWorker('APPLY_TILE16_PIXELS', { texId: nextId, pixels });
      await app.decodeRoadTexturesInBackground();
      app.selectedTileId.set(nextId);
      app.resourcesStatus.set(`New tile #${nextId} created.`);
      app.snackBar.open(`✓ Tile #${nextId} added`, 'OK', { duration: 3000, panelClass: 'snack-success' });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to add tile';
      app.editorError.set(msg);
      app.snackBar.open(`✗ ${msg}`, 'Dismiss', { duration: 5000, panelClass: 'snack-error' });
    } finally {
      app.workerBusy.set(false);
    }
  };
  input.click();
}

export async function deleteTileImage(app: App, texId: number): Promise<void> {
  const refs = app.getTileReferenceRoadInfoIds(texId);
  if (refs.length > 0) {
    const msg = `Tile ${texId} is still used by road${refs.length > 1 ? 's' : ''} ${refs.join(', ')}. Reassign those road textures first.`;
    app.editorError.set(msg);
    app.snackBar.open(`✗ ${msg}`, 'Dismiss', { duration: 6000, panelClass: 'snack-error' });
    return;
  }
  if (!app.tileTileEntries().some((entry: { texId: number }) => entry.texId === texId)) {
    const msg = `Tile ${texId} was not found.`;
    app.editorError.set(msg);
    app.snackBar.open(`✗ ${msg}`, 'Dismiss', { duration: 5000, panelClass: 'snack-error' });
    return;
  }
  const previousSelectedTileId = app.selectedTileId();
  try {
    app.workerBusy.set(true);
    await app.dispatchWorker('REMOVE_TILE16_TEXTURE', { texId });
    await app.decodeRoadTexturesInBackground();
    if (previousSelectedTileId === texId) {
      app.selectedTileId.set(app.tileTileEntries()[0]?.texId ?? null);
    }
    app.resourcesStatus.set(`Deleted tile #${texId}.`);
    app.snackBar.open(`✓ Tile #${texId} deleted`, 'OK', { duration: 3000, panelClass: 'snack-success' });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Failed to delete tile';
    app.editorError.set(msg);
    app.snackBar.open(`✗ ${msg}`, 'Dismiss', { duration: 5000, panelClass: 'snack-error' });
  } finally {
    app.workerBusy.set(false);
  }
}

export async function onCustomResourcesFileSelected(app: App, event: Event): Promise<void> {
  const input = event.target;
  if (!(input instanceof HTMLInputElement)) return;
  const file = input.files?.[0];
  if (!file) return;
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    app.customResourcesName.set(file.name);
    const mod = window.Module;
    if (!mod) {
      app._pendingCustomResources = bytes;
      app.statusText.set('Custom resources.dat queued – waiting for WASM to initialize…');
    } else {
      app._mountCustomResourcesFs(bytes);
    }
  } catch (error) {
    console.error('[Angular] Failed to read custom resources.dat', error);
  }
  input.value = '';
}

export function restartGameWithCustomResources(app: App): void {
  app.gameRestarting.set(true);
  app.statusText.set('Reloading page to apply custom resources.dat…');
  setTimeout(() => window.location.reload(), 150);
}

export function clearCustomResources(app: App): void {
  App._clearCustomResourcesDb().catch(() => {
    /* ignore */
  });
  app.customResourcesLoaded.set(false);
  app.customResourcesName.set(null);
  app.statusText.set('Custom resources.dat cleared — game will use default resources on next reload.');
}
