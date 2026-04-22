import { clearCustomResourcesDb } from './app-state-resources';
import { decodeRoadTexturesInBackground, failEditor } from './app-loaders';
import { resultFromPromise, resultFromThrowable } from './result-helpers';

import type { DecodedSpriteFrame } from './level-editor.service';
import type { App } from './app';

const canvasToPngUrl = resultFromThrowable((canvas: HTMLCanvasElement) => canvas.toDataURL('image/png'), 'Failed to encode PNG');

const loadImageFromUrl = (url: string) =>
  resultFromPromise(
    new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = url;
    }),
    'Failed to decode image',
  );

const loadImageFromFile = async (file: File) => {
  const url = URL.createObjectURL(file);
  const imageResult = await loadImageFromUrl(url);
  URL.revokeObjectURL(url);
  return imageResult;
};

const finishWorkerBusy = (app: App) => {
  app.workerBusy.set(false);
};

export async function applyTilePixels(app: App, texId: number, pixels: Uint8ClampedArray) {
  app.workerBusy.set(true);
  const saveResult = await resultFromPromise(
    app.runtime.dispatchWorker<Record<string, never>>('APPLY_TILE16_PIXELS', { texId, pixels }),
    'Tile save failed',
  );
  saveResult.match(
    () => {
      void decodeRoadTexturesInBackground(app);
      app.resourcesStatus.set(`Tile #${texId} replaced.`);
    },
    (error) => app.editorError.set(error),
  );
  finishWorkerBusy(app);
}

export function openTileEditor(app: App, texId: number) {
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

export function exportTilePng(app: App, texId: number) {
  const canvas = app.roadTextureCanvases.get(texId);
  if (!canvas) return;
  const pngUrl = canvasToPngUrl(canvas).match(
    (url) => url,
    () => null,
  );
  if (!pngUrl) return;
  const anchor = document.createElement('a');
  anchor.href = pngUrl;
  anchor.download = `tile-${texId}.png`;
  anchor.click();
}

export async function onTilePngUpload(app: App, file: File | null, texId: number) {
  if (!file) return;
  const entry = app.tileTileEntries().find((tile: { texId: number }) => tile.texId === texId);
  if (!entry) {
    app.editorError.set('Tile not found');
    return;
  }

  const imageResult = await loadImageFromFile(file);
  const image = imageResult.match(
    (value) => value,
    (error) => {
      app.editorError.set(error);
      return null;
    },
  );
  if (!image) return;

  const offscreen = document.createElement('canvas');
  offscreen.width = entry.width;
  offscreen.height = entry.height;
  const ctx = offscreen.getContext('2d');
  if (!ctx) {
    failEditor(app, 'Failed to get 2D context');
    return;
  }
  ctx.drawImage(image, 0, 0, entry.width, entry.height);
  const imageData = ctx.getImageData(0, 0, entry.width, entry.height);
  await applyTilePixels(app, texId, new Uint8ClampedArray(imageData.data));
}

export async function onTileEditorSaved(app: App, event: { frameId: number; pixels: Uint8ClampedArray }) {
  app.spriteEditorOpen.set(false);
  await applyTilePixels(app, event.frameId, event.pixels);
}

export async function addTileImage(app: App) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/png,image/*';
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;

    app.workerBusy.set(true);
    const imageResult = await loadImageFromFile(file);
    const image = imageResult.match(
      (value) => value,
      (error) => {
        app.editorError.set(error);
        app.snackBar.open(`✗ ${error}`, 'Dismiss', { duration: 5000, panelClass: 'snack-error' });
        return null;
      },
    );
    if (!image) {
      finishWorkerBusy(app);
      return;
    }

    const width = 128;
    const height = 128;
    const offscreen = document.createElement('canvas');
    offscreen.width = width;
    offscreen.height = height;
    const ctx = offscreen.getContext('2d');
    if (!ctx) {
      failEditor(app, 'Failed to get 2D context');
      finishWorkerBusy(app);
      return;
    }

    ctx.drawImage(image, 0, 0, width, height);
    const imageData = ctx.getImageData(0, 0, width, height);
    const pixels = new Uint8ClampedArray(imageData.data);
    const existing = app.tileTileEntries().map((tile: { texId: number }) => tile.texId);
    const nextId = existing.length > 0 ? Math.max(...existing) + 1 : 200;
    if (nextId > 9999) {
      failEditor(app, 'Too many tile images (max ID 9999)');
      finishWorkerBusy(app);
      return;
    }

    const saveResult = await resultFromPromise(
      app.runtime.dispatchWorker('APPLY_TILE16_PIXELS', { texId: nextId, pixels }),
      `Failed to add tile #${nextId}`,
    );
    const saveError = saveResult.match(
      () => null,
      (error) => error,
    );
    if (saveError) {
      app.editorError.set(saveError);
      app.snackBar.open(`✗ ${saveError}`, 'Dismiss', { duration: 5000, panelClass: 'snack-error' });
      finishWorkerBusy(app);
      return;
    }

    await decodeRoadTexturesInBackground(app);
    app.selectedTileId.set(nextId);
    app.resourcesStatus.set(`New tile #${nextId} created.`);
    app.snackBar.open(`✓ Tile #${nextId} added`, 'OK', { duration: 3000, panelClass: 'snack-success' });
    finishWorkerBusy(app);
  };
  input.click();
}

export async function deleteTileImage(app: App, texId: number) {
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
  app.workerBusy.set(true);
  const deleteResult = await resultFromPromise(
    app.runtime.dispatchWorker('REMOVE_TILE16_TEXTURE', { texId }),
    `Failed to delete tile #${texId}`,
  );
  const deleteError = deleteResult.match(
    () => null,
    (error) => error,
  );
  if (deleteError) {
    app.editorError.set(deleteError);
    app.snackBar.open(`✗ ${deleteError}`, 'Dismiss', { duration: 5000, panelClass: 'snack-error' });
    finishWorkerBusy(app);
    return;
  }

  await decodeRoadTexturesInBackground(app);
  if (previousSelectedTileId === texId) {
    app.selectedTileId.set(app.tileTileEntries()[0]?.texId ?? null);
  }
  app.resourcesStatus.set(`Deleted tile #${texId}.`);
  app.snackBar.open(`✓ Tile #${texId} deleted`, 'OK', { duration: 3000, panelClass: 'snack-success' });
  finishWorkerBusy(app);
}

export async function onCustomResourcesFileSelected(app: App, file: File | null) {
  if (!file) return;

  const bytesResult = await resultFromPromise(file.arrayBuffer(), 'Failed to read custom resources.dat');
  bytesResult.match(
    (buffer) => {
      const bytes = new Uint8Array(buffer);
      app.customResourcesName.set(file.name);
      const mod = window.Module;
      if (!mod) {
        app._pendingCustomResources = bytes;
        app.statusText.set('Custom resources.dat queued – waiting for WASM to initialize…');
        return;
      }
      app.runtime.mountCustomResourcesFs(bytes);
    },
    (error) => console.error('[Angular] Failed to read custom resources.dat', error),
  );
}

export function restartGameWithCustomResources(app: App) {
  app.gameRestarting.set(true);
  app.statusText.set('Reloading page to apply custom resources.dat…');
  setTimeout(() => window.location.reload(), 150);
}

export function clearCustomResources(app: App) {
  clearCustomResourcesDb()
    .then(() => undefined)
    .catch(() => undefined);
  app.customResourcesLoaded.set(false);
  app.customResourcesName.set(null);
  app.statusText.set('Custom resources.dat cleared — game will use default resources on next reload.');
}
