import { ok } from 'neverthrow';
import { packHandleDecompress } from './lzrw.service';
import { imageDataToIconHash, imageDataToIcl8, renderIconBytes, renderIcl8Bytes, renderIcs8Bytes, renderPictBytes } from './image-resource-codec';
import { parseSndHeader, sndToWav, tryPlaySndResource, wavToSnd } from './snd-codec';

import type { App } from './app';

function triggerBytesDownload(bytes: Uint8Array, filename: string): void {
  const blob = new Blob([new Uint8Array(bytes).buffer], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function loadAudioEntries(host: App): Promise<void> {
  try {
    type EntriesResult = { entries: { id: number; size: number }[] | null };
    const result: EntriesResult = await host.dispatchWorker<EntriesResult>('LIST_PACK_ENTRIES', {
      packId: 134,
    });
    const entries = result.entries ?? [];
    host.audioEntries.set(entries.map((e: { id: number; size: number }) => ({ id: e.id, sizeBytes: e.size })));
    if (entries.length > 0 && host.selectedAudioId() === null) {
      host.selectedAudioId.set(entries[0].id);
      await host.loadSelectedAudioBytes(entries[0].id);
    }
    void loadAudioDurations(host, entries.map((e) => e.id));
  } catch {
    /* non-fatal */
  }
}

async function loadAudioDurations(host: App, ids: number[]): Promise<void> {
  type RawResult = { bytes: ArrayBuffer | null };
  type AudioEntry = { id: number; sizeBytes: number; durationMs?: number };
  for (const id of ids) {
    try {
      const result: RawResult = await host.dispatchWorker<RawResult>('GET_PACK_ENTRY_RAW', {
        packId: 134,
        entryId: id,
      });
      if (!result.bytes) continue;
      const info = parseSndHeader(new Uint8Array(result.bytes));
      if (!info || info.sampleRate <= 0) continue;
      const durationMs = (info.numFrames / info.sampleRate) * 1000;
      host.audioEntries.update((prev: AudioEntry[]) =>
        prev.map((entry) => (entry.id === id ? { ...entry, durationMs } : entry)),
      );
    } catch {
      /* ignore individual failures */
    }
  }
}

export async function selectAudioEntry(host: App, id: number): Promise<void> {
  host.selectedAudioId.set(id);
  host.stopAudio();
  host._lastAudioBuffer = null;
  host.audioCurrentTime.set(0);
  host.audioDuration.set(0);
  await host.loadSelectedAudioBytes(id);
}

export async function loadSelectedAudioBytes(host: App, id: number): Promise<void> {
  try {
    type RawResult = { bytes: ArrayBuffer | null };
    const result: RawResult = await host.dispatchWorker<RawResult>('GET_PACK_ENTRY_RAW', {
      packId: 134,
      entryId: id,
    });
    host.selectedAudioBytes.set(result.bytes ? new Uint8Array(result.bytes) : null);
  } catch {
    host.selectedAudioBytes.set(null);
  }
}

export function exportAudioWav(host: App): void {
  const id = host.selectedAudioId();
  const bytes = host.selectedAudioBytes();
  if (id === null || !bytes) return;
  const wavBytes = sndToWav(bytes);
  const blob = new Blob([new Uint8Array(wavBytes).buffer], { type: 'audio/wav' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `sound-${id}.wav`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function playAudioEntry(host: App): Promise<void> {
  const bytes = host.selectedAudioBytes();
  if (!bytes) return;
  const ctx = host._ensureAudioCtx();
  if (ctx.state === 'suspended') {
    try {
      await ctx.resume();
    } catch {
      /* ignore */
    }
  }
  if (ctx.state === 'suspended') {
    host.snackBar.open('⚠ Click/interact with the page first to allow audio playback.', 'OK', {
      duration: 4000,
    });
    return;
  }
  try {
    const sndInfo = parseSndHeader(bytes);
    if (sndInfo) {
      const wavBytes = sndToWav(bytes);
      try {
        const ab = new Uint8Array(wavBytes).buffer;
        const audioBuf = await ctx.decodeAudioData(ab);
        host._lastAudioBuffer = audioBuf;
        host._startAudioBuffer(audioBuf, 0);
      } catch (err) {
        host._lastAudioBuffer = null;
        const played = tryPlaySndResource(bytes, ctx);
        if (!played) {
          host.snackBar.open(
            `⚠ Audio error: ${err instanceof Error ? err.message : String(err ?? 'Unsupported snd format')}`,
            'OK',
            { duration: 4000 },
          );
          return;
        }
        host.snackBar.open('Playing using legacy one-shot player — pause/seek unavailable.', 'OK', {
          duration: 4000,
        });
      }
    } else {
      const played = tryPlaySndResource(bytes, ctx);
      if (!played) {
        host.snackBar.open('⚠ Cannot play: compressed or unsupported snd format', 'OK', {
          duration: 4000,
        });
      }
    }
  } catch (e) {
    host.snackBar.open(`⚠ Audio error: ${e instanceof Error ? e.message : String(e)}`, 'OK', {
      duration: 4000,
    });
  }
}

export async function onAudioWavUpload(host: App, event: Event): Promise<void> {
  const input = event.target instanceof HTMLInputElement ? event.target : null;
  if (!input) return;
  const file = input.files?.[0];
  if (!file) return;
  input.value = '';
  const id = host.selectedAudioId();
  if (id === null) return;
  try {
    host.workerBusy.set(true);
    const arrBuf = await file.arrayBuffer();
    const sndBytesResult = wavToSnd(new Uint8Array(arrBuf));
    if (!sndBytesResult.isOk()) {
      host.failEditor(sndBytesResult.error);
      return;
    }
    const sndBytes = sndBytesResult.value;
    await host.dispatchWorker('PUT_PACK_ENTRY_RAW', {
      packId: 134,
      entryId: id,
      bytes: sndBytes.buffer,
    });
    await host.loadSelectedAudioBytes(id);
    host.resourcesStatus.set(`Sound #${id} replaced from WAV.`);
  } catch (err) {
    host.editorError.set(err instanceof Error ? err.message : 'WAV upload failed');
  } finally {
    host.workerBusy.set(false);
  }
}

export async function addAudioEntry(host: App): Promise<void> {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.wav,audio/*';
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      host.workerBusy.set(true);
      const arrBuf = await file.arrayBuffer();
      const sndBytesResult = wavToSnd(new Uint8Array(arrBuf));
      if (!sndBytesResult.isOk()) {
        host.failEditor(sndBytesResult.error);
        return;
      }
      const sndBytes = sndBytesResult.value;
      const existing = host.audioEntries().map((e) => e.id);
      const nextId = existing.length > 0 ? Math.max(...existing) + 1 : 128;
      if (nextId > 9999) {
        host.failEditor('Too many sound entries (max ID 9999)');
        return;
      }
      const buf = sndBytes.buffer.slice(sndBytes.byteOffset, sndBytes.byteOffset + sndBytes.byteLength);
      await host.dispatchWorker('PUT_PACK_ENTRY_RAW', { packId: 134, entryId: nextId, bytes: buf }, [buf]);
      await host.loadAudioEntries();
      await host.selectAudioEntry(nextId);
      host.resourcesStatus.set(`New sound #${nextId} created.`);
      host.snackBar.open(`✓ Sound #${nextId} added`, 'OK', { duration: 3000, panelClass: 'snack-success' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to add sound';
      host.editorError.set(msg);
      host.snackBar.open(`✗ ${msg}`, 'Dismiss', { duration: 5000, panelClass: 'snack-error' });
    } finally {
      host.workerBusy.set(false);
    }
  };
  input.click();
}

export async function loadIconEntries(host: App): Promise<void> {
  try {
    type ListResult = { entries: { type: string; id: number; size: number }[] };
    const result: ListResult = await host.dispatchWorker<ListResult>('LIST_RESOURCES');
    const SCREEN_TYPES = new Set(['ICN#', 'ics#', 'icl8', 'ics8', 'PICT', 'PPic']);
    const entries = result.entries
      .filter((e) => SCREEN_TYPES.has(e.type))
      .map((e) => ({
        type: e.type,
        id: e.id,
        label: iconLabel(e.type, e.id),
        sizeBytes: e.size,
      }));
    host.iconEntries.set(entries);
    if (entries.length > 0 && host.selectedIconId() === null) {
      host.selectIconEntry(entries[0].type, entries[0].id);
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
  if (type === 'PICT' || type === 'PPic') {
    try {
      type RawResult = { bytes: ArrayBuffer | null };
      const result: RawResult = await host.dispatchWorker<RawResult>('GET_RESOURCE_RAW', {
        type,
        id,
      });
      if (result.bytes) {
        const bytes = new Uint8Array(result.bytes);
        const pictResult = type === 'PPic' ? packHandleDecompress(bytes) : ok(bytes);
        if (!pictResult.isOk()) return;
        const canvas = renderPictBytes(pictResult.value);
        if (canvas) {
          host.iconPreviewCanvas.set(canvas);
          const cacheKey = `${type}:${id}`;
          host.iconCanvasMap.set(cacheKey, canvas);
          host._iconDataUrls.delete(cacheKey);
        }
      }
    } catch {
      /* non-fatal */
    }
    return;
  }
  try {
    type RawResult = { bytes: ArrayBuffer | null };
    const result: RawResult = await host.dispatchWorker<RawResult>('GET_RESOURCE_RAW', { type, id });
    if (result.bytes) {
      const bytes = new Uint8Array(result.bytes);
      let canvas: HTMLCanvasElement | null = null;
      if (type === 'ICN#' || type === 'ics#') {
        canvas = renderIconBytes(bytes);
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
      const result: RawResult = await host.dispatchWorker<RawResult>('GET_RESOURCE_RAW', { type, id });
      if (result.bytes) {
        triggerBytesDownload(new Uint8Array(result.bytes), `${type.trim()}-${id}.bin`);
      }
    } catch {
      /* ignore */
    }
  })();
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

    let iconBytes: Uint8Array;
    if (type === 'icl8') {
      const offscreen = document.createElement('canvas');
      offscreen.width = 32;
      offscreen.height = 32;
      const ctx = offscreen.getContext('2d');
      if (!ctx) {
        host.failEditor('Failed to get 2D context');
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
        host.failEditor('Failed to get 2D context');
        return;
      }
      ctx.drawImage(img, 0, 0, 16, 16);
      iconBytes = imageDataToIcl8(ctx.getImageData(0, 0, 16, 16).data);
    } else {
      const offscreen = document.createElement('canvas');
      offscreen.width = 32;
      offscreen.height = 32;
      const ctx = offscreen.getContext('2d');
      if (!ctx) {
        host.failEditor('Failed to get 2D context');
        return;
      }
      ctx.drawImage(img, 0, 0, 32, 32);
      iconBytes = imageDataToIconHash(ctx.getImageData(0, 0, 32, 32).data);
    }
    await host.dispatchWorker('PUT_RESOURCE_RAW', {
      type,
      id,
      bytes: iconBytes.buffer,
    });
    await host.selectIconEntry(type, id);
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
        host.failEditor('Failed to get 2D context');
        return;
      }
      ctx.drawImage(img, 0, 0, 32, 32);
      const iconBytes = imageDataToIconHash(ctx.getImageData(0, 0, 32, 32).data);
      const existing = host.iconEntries()
        .filter((e) => e.type === 'ICN#')
        .map((e) => e.id);
      const nextId = existing.length > 0 ? Math.max(...existing) + 1 : 200;
      if (nextId > 9999) {
        host.failEditor('Too many icon entries');
        return;
      }
      const buf = iconBytes.buffer.slice(iconBytes.byteOffset, iconBytes.byteOffset + iconBytes.byteLength);
      await host.dispatchWorker('PUT_RESOURCE_RAW', { type: 'ICN#', id: nextId, bytes: buf }, [buf]);
      await host.loadIconEntries();
      await host.selectIconEntry('ICN#', nextId);
      host.resourcesStatus.set(`New ICN# #${nextId} created.`);
      host.snackBar.open(`✓ Icon #${nextId} added`, 'OK', { duration: 3000, panelClass: 'snack-success' });
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
  if (type === 'PPic') return ppicLabels[id] ?? `PPic #${id}`;
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
      const result: RawResult = await host.dispatchWorker<RawResult>('GET_RESOURCE_RAW', {
        type: entry.type,
        id: entry.id,
      });
      if (!result.bytes) continue;
      const bytes = new Uint8Array(result.bytes);
      let canvas: HTMLCanvasElement | null = null;
      if (entry.type === 'PICT' || entry.type === 'PPic') {
        const pictResult = entry.type === 'PPic' ? packHandleDecompress(bytes) : ok(bytes);
        if (!pictResult.isOk()) continue;
        canvas = renderPictBytes(pictResult.value);
      } else if (entry.type === 'ICN#' || entry.type === 'ics#') {
        canvas = renderIconBytes(bytes);
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
