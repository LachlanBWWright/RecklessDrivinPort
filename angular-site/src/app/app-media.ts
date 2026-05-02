import { ok } from 'neverthrow';
import { packHandleCompress, packHandleDecompress } from './lzrw.service';
import {
  encodeRgbaToPictV2,
  imageDataToIconHash,
  imageDataToIcl8,
  renderIconBytes,
  renderIcl8Bytes,
  renderIcs8Bytes,
  renderPictBytes,
} from './image-resource-codec';
import { failEditor } from './app-loaders';

import type { App } from './app';

export {
  addAudioEntry,
  exportAudioWav,
  loadAudioEntries,
  loadSelectedAudioBytes,
  onAudioWavUpload,
  playAudioEntry,
  selectAudioEntry,
} from './app-media-audio';

function normalizeResourceType(type: string): string {
  return type.trim().toUpperCase();
}

function isPictType(type: string): boolean {
  const normalized = normalizeResourceType(type);
  return normalized === 'PICT' || normalized === 'PPIC';
}

function isPackedPictType(type: string): boolean {
  return normalizeResourceType(type) === 'PPIC';
}

function triggerBytesDownload(bytes: Uint8Array, filename: string): void {
  const blob = new Blob([new Uint8Array(bytes).buffer], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function loadIconEntries(host: App): Promise<void> {
  try {
    type ListResult = { entries: { type: string; id: number; size: number }[] };
    const result: ListResult = await host.runtime.dispatchWorker<ListResult>('LIST_RESOURCES');
    const SCREEN_TYPES = new Set(['ICN#', 'ICS#', 'ICL8', 'ICS8', 'PICT', 'PPIC']);
    const entries = result.entries
      .filter((e) => SCREEN_TYPES.has(normalizeResourceType(e.type)))
      .map((e) => ({
        type: e.type,
        id: e.id,
        label: iconLabel(e.type, e.id),
        sizeBytes: e.size,
      }));
    host.iconEntries.set(entries);
    if (entries.length > 0 && host.selectedIconId() === null) {
      void selectIconEntry(host, entries[0].type, entries[0].id);
    }
    void loadAllIconThumbnails(host);
  } catch {
    /* non-fatal */
  }
}

export async function selectIconEntry(host: App, type: string, id: number): Promise<void> {
  host.selectedIconId.set(id);
  host.selectedIconType.set(type);
  host.iconPreviewCanvas.set(null);
  if (isPictType(type)) {
    try {
      type RawResult = { bytes: ArrayBuffer | null };
      const result: RawResult = await host.runtime.dispatchWorker<RawResult>('GET_RESOURCE_RAW', {
        type,
        id,
      });
      if (result.bytes) {
        const bytes = new Uint8Array(result.bytes);
        const packedDecodeResult = isPackedPictType(type) ? packHandleDecompress(bytes) : ok(bytes);
        const pictBytes = packedDecodeResult.match(
          (value) => value,
          () => bytes,
        );
        if (!pictBytes) return;
        const canvas = renderPictBytes(pictBytes);
        if (canvas) {
          host.iconPreviewCanvas.set(canvas);
          const cacheKey = `${type}:${id}`;
          host.iconCanvasMap.set(cacheKey, canvas);
          host._iconDataUrls.delete(cacheKey);
        } else {
          host.editorError.set(`Failed to decode ${type} #${id}`);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : `Failed to decode ${type} #${id}`;
      host.editorError.set(msg);
      console.error('[screens] picture decode failed', { type, id, error: msg });
    }
    return;
  }
  try {
    type RawResult = { bytes: ArrayBuffer | null };
    const result: RawResult = await host.runtime.dispatchWorker<RawResult>('GET_RESOURCE_RAW', {
      type,
      id,
    });
    if (result.bytes) {
      const bytes = new Uint8Array(result.bytes);
      let canvas: HTMLCanvasElement | null = null;
      if (type === 'ICN#' || type === 'ics#') {
        canvas = renderIconBytes(bytes, type);
      } else if (type === 'icl8') {
        canvas = renderIcl8Bytes(bytes);
      } else if (type === 'ics8') {
        canvas = renderIcs8Bytes(bytes);
      }
      host.iconPreviewCanvas.set(canvas);
      if (canvas) {
        const cacheKey = `${type}:${id}`;
        host.iconCanvasMap.set(cacheKey, canvas);
        host._iconDataUrls.delete(cacheKey);
      }
    }
  } catch {
    host.iconPreviewCanvas.set(null);
  }
}

export function exportIconPng(host: App): void {
  const canvas = host.iconPreviewCanvas();
  const id = host.selectedIconId();
  const type = host.selectedIconType();
  if (!canvas || id === null) return;
  try {
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `${type.trim()}-${id}.png`;
    a.click();
  } catch {
    /* security */
  }
}

export function exportIconRaw(host: App): void {
  const id = host.selectedIconId();
  const type = host.selectedIconType();
  if (id === null) return;
  void (async () => {
    try {
      type RawResult = { bytes: ArrayBuffer | null };
      const result: RawResult = await host.runtime.dispatchWorker<RawResult>('GET_RESOURCE_RAW', {
        type,
        id,
      });
      if (result.bytes) {
        triggerBytesDownload(new Uint8Array(result.bytes), `${type.trim()}-${id}.bin`);
      }
    } catch {
      /* ignore */
    }
  })();
}

export async function onIconRawUpload(host: App, event: Event): Promise<void> {
  const input = event.target instanceof HTMLInputElement ? event.target : null;
  if (!input) return;
  const file = input.files?.[0];
  if (!file) return;
  input.value = '';

  const id = host.selectedIconId();
  const type = host.selectedIconType();
  if (id === null || !isPictType(type)) return;

  try {
    host.workerBusy.set(true);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const uploadBytes = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    await host.runtime.dispatchWorker('PUT_RESOURCE_RAW', {
      type,
      id,
      bytes: uploadBytes,
    });
    await selectIconEntry(host, type, id);
    host.resourcesStatus.set(`${type} #${id} replaced.`);
    host.snackBar.open(`\u2713 ${type} #${id} replaced`, 'OK', {
      duration: 3000,
      panelClass: 'snack-success',
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Raw resource upload failed';
    host.editorError.set(msg);
    host.snackBar.open(`\u2717 ${msg}`, 'Dismiss', { duration: 5000, panelClass: 'snack-error' });
  } finally {
    host.workerBusy.set(false);
  }
}

export async function onIconPngUpload(host: App, event: Event): Promise<void> {
  const input = event.target instanceof HTMLInputElement ? event.target : null;
  if (!input) return;
  const file = input.files?.[0];
  if (!file) return;
  input.value = '';
  const id = host.selectedIconId();
  const type = host.selectedIconType();
  if (id === null) return;
  try {
    host.workerBusy.set(true);
    const url = URL.createObjectURL(file);
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = url;
    });
    URL.revokeObjectURL(url);

    if (isPictType(type)) {
      const existingPreview = host.iconPreviewCanvas();
      const targetW = Math.max(1, existingPreview?.width ?? img.naturalWidth ?? 640);
      const targetH = Math.max(1, existingPreview?.height ?? img.naturalHeight ?? 480);

      const offscreen = document.createElement('canvas');
      offscreen.width = targetW;
      offscreen.height = targetH;
      const ctx = offscreen.getContext('2d');
      if (!ctx) {
        failEditor(host, 'Failed to get 2D context');
        return;
      }
      ctx.clearRect(0, 0, targetW, targetH);
      ctx.drawImage(img, 0, 0, targetW, targetH);

      const pictBytes = encodeRgbaToPictV2(
        ctx.getImageData(0, 0, targetW, targetH).data,
        targetW,
        targetH,
      );
      const storageBytes = isPackedPictType(type) ? packHandleCompress(pictBytes) : pictBytes;
      const writeBytes = storageBytes.buffer.slice(
        storageBytes.byteOffset,
        storageBytes.byteOffset + storageBytes.byteLength,
      );
      await host.runtime.dispatchWorker('PUT_RESOURCE_RAW', {
        type,
        id,
        bytes: writeBytes,
      });
      await selectIconEntry(host, type, id);
      host.resourcesStatus.set(`${type} #${id} replaced from image.`);
      host.snackBar.open(`\u2713 ${type} #${id} replaced`, 'OK', {
        duration: 3000,
        panelClass: 'snack-success',
      });
      return;
    }

    let iconBytes: Uint8Array;
    if (type === 'icl8') {
      const offscreen = document.createElement('canvas');
      offscreen.width = 32;
      offscreen.height = 32;
      const ctx = offscreen.getContext('2d');
      if (!ctx) {
        failEditor(host, 'Failed to get 2D context');
        return;
      }
      ctx.drawImage(img, 0, 0, 32, 32);
      iconBytes = imageDataToIcl8(ctx.getImageData(0, 0, 32, 32).data);
    } else if (type === 'ics8') {
      const offscreen = document.createElement('canvas');
      offscreen.width = 16;
      offscreen.height = 16;
      const ctx = offscreen.getContext('2d');
      if (!ctx) {
        failEditor(host, 'Failed to get 2D context');
        return;
      }
      ctx.drawImage(img, 0, 0, 16, 16);
      iconBytes = imageDataToIcl8(ctx.getImageData(0, 0, 16, 16).data);
    } else {
      const offscreen = document.createElement('canvas');
      const monoSize = type === 'ics#' ? 16 : 32;
      offscreen.width = monoSize;
      offscreen.height = monoSize;
      const ctx = offscreen.getContext('2d');
      if (!ctx) {
        failEditor(host, 'Failed to get 2D context');
        return;
      }
      ctx.drawImage(img, 0, 0, monoSize, monoSize);
      iconBytes = imageDataToIconHash(
        ctx.getImageData(0, 0, monoSize, monoSize).data,
        monoSize,
        monoSize,
      );
    }
    await host.runtime.dispatchWorker('PUT_RESOURCE_RAW', {
      type,
      id,
      bytes: iconBytes.buffer,
    });
    await selectIconEntry(host, type, id);
    host.resourcesStatus.set(`${type} #${id} replaced.`);
  } catch (err) {
    host.editorError.set(err instanceof Error ? err.message : 'Image upload failed');
  } finally {
    host.workerBusy.set(false);
  }
}

export async function addIconEntry(host: App): Promise<void> {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/png,image/*';
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      host.workerBusy.set(true);
      const url = URL.createObjectURL(file);
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = reject;
        i.src = url;
      });
      URL.revokeObjectURL(url);
      const offscreen = document.createElement('canvas');
      offscreen.width = 32;
      offscreen.height = 32;
      const ctx = offscreen.getContext('2d');
      if (!ctx) {
        failEditor(host, 'Failed to get 2D context');
        return;
      }
      ctx.drawImage(img, 0, 0, 32, 32);
      const iconBytes = imageDataToIconHash(ctx.getImageData(0, 0, 32, 32).data);
      const existing = host
        .iconEntries()
        .filter((e) => e.type === 'ICN#')
        .map((e) => e.id);
      const nextId = existing.length > 0 ? Math.max(...existing) + 1 : 200;
      if (nextId > 9999) {
        failEditor(host, 'Too many icon entries');
        return;
      }
      const buf = iconBytes.buffer.slice(
        iconBytes.byteOffset,
        iconBytes.byteOffset + iconBytes.byteLength,
      );
      await host.runtime.dispatchWorker(
        'PUT_RESOURCE_RAW',
        { type: 'ICN#', id: nextId, bytes: buf },
        [buf],
      );
      await loadIconEntries(host);
      await selectIconEntry(host, 'ICN#', nextId);
      host.resourcesStatus.set(`New ICN# #${nextId} created.`);
      host.snackBar.open(`✓ Icon #${nextId} added`, 'OK', {
        duration: 3000,
        panelClass: 'snack-success',
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to add icon';
      host.editorError.set(msg);
      host.snackBar.open(`✗ ${msg}`, 'Dismiss', { duration: 5000, panelClass: 'snack-error' });
    } finally {
      host.workerBusy.set(false);
    }
  };
  input.click();
}

export function iconLabel(type: string, id: number): string {
  const iconLabels: Record<number, string> = {
    128: 'Application Icon',
    129: 'Main Menu / Home Screen',
    130: 'Game Over',
    131: 'HUD',
    132: 'Level Complete',
  };
  const pictLabels: Record<number, string> = {
    128: 'Title Screen',
    129: 'Game Over Screen',
    130: 'About Box',
  };
  const ppicLabels: Record<number, string> = {
    128: 'Main Menu Background',
    129: 'In-Game HUD',
    130: 'Level Complete Screen',
  };
  if (normalizeResourceType(type) === 'PPIC') return ppicLabels[id] ?? `PPic #${id}`;
  if (type === 'ICN#' || type === 'ics#') return iconLabels[id] ?? `ICN# #${id}`;
  if (type === 'icl8') return iconLabels[id] ?? `icl8 #${id} (32×32 color)`;
  if (type === 'ics8') return iconLabels[id] ?? `ics8 #${id} (16×16 color)`;
  if (type === 'PICT') return pictLabels[id] ?? `PICT #${id}`;
  return `${type} #${id}`;
}

export async function loadAllIconThumbnails(host: App): Promise<void> {
  for (const entry of host.iconEntries()) {
    const key = `${entry.type}:${entry.id}`;
    if (host.iconCanvasMap.has(key)) continue;
    try {
      type RawResult = { bytes: ArrayBuffer | null };
      const result: RawResult = await host.runtime.dispatchWorker<RawResult>('GET_RESOURCE_RAW', {
        type: entry.type,
        id: entry.id,
      });
      if (!result.bytes) continue;
      const bytes = new Uint8Array(result.bytes);
      let canvas: HTMLCanvasElement | null = null;
      if (isPictType(entry.type)) {
        const packedDecodeResult = isPackedPictType(entry.type)
          ? packHandleDecompress(bytes)
          : ok(bytes);
        const pictBytes = packedDecodeResult.match(
          (value) => value,
          () => bytes,
        );
        if (!pictBytes) continue;
        canvas = renderPictBytes(pictBytes);
      } else if (entry.type === 'ICN#' || entry.type === 'ics#') {
        canvas = renderIconBytes(bytes, entry.type);
      } else if (entry.type === 'icl8') {
        canvas = renderIcl8Bytes(bytes);
      } else if (entry.type === 'ics8') {
        canvas = renderIcs8Bytes(bytes);
      }
      if (canvas) {
        host.iconCanvasMap.set(key, canvas);
        host._iconDataUrls.delete(key);
      }
    } catch {
      /* ignore */
    }
    await new Promise<void>((r) => setTimeout(r, 0));
  }
}
