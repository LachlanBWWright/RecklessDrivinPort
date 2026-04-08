import type { DecodedSpriteFrame } from './level-editor.service';
import type { App } from './app';

export async function selectSprite(app: App, spriteId: number): Promise<void> {
  app.selectedSpriteId.set(spriteId);
  app.currentSpriteBytes.set(null);
  try {
    const result = await app.dispatchWorker<{ bytes: Uint8Array }>('GET_SPRITE_BYTES', { spriteId });
    app.currentSpriteBytes.set(result.bytes);
  } catch {
    // non-fatal: pixel canvas just stays empty
  }
}

export function redrawSpriteCanvas(app: App): void {
  const canvas = document.getElementById('sprite-pixel-canvas');
  if (!(canvas instanceof HTMLCanvasElement)) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const id = app.selectedSpriteId();
  if (id === null) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    return;
  }
  const bytes: Uint8Array | null = app.currentSpriteBytes();
  if (!bytes || bytes.length === 0) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    return;
  }

  const cols = 16;
  const rows = Math.ceil(bytes.length / cols);
  const cellW = Math.floor(canvas.width / cols);
  const cellH = Math.max(1, Math.floor(canvas.height / Math.max(rows, 1)));

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#111';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let i = 0; i < bytes.length; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const v = bytes[i];
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.fillRect(col * cellW, row * cellH, cellW, cellH);
  }
}

export function exportSpritePng(app: App): void {
  const id = app.selectedPackSpriteId();
  if (id === null) return;
  const canvas = app.packSpriteCanvases.get(id);
  if (!canvas) return;
  try {
    const url = canvas.toDataURL('image/png');
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `sprite-${id}.png`;
    anchor.click();
  } catch {
    // security error on cross-origin canvas
  }
}

export function getSpriteFormatLabel(bitDepth: 8 | 16 | undefined): string {
  if (bitDepth === 16) return 'RGB555';
  if (bitDepth === 8) return '8-bit';
  return '?';
}

export function openSpriteEditor(app: App, frameId: number): void {
  const frame: DecodedSpriteFrame | null = app.packSpriteDecodedFrames.get(frameId) ?? null;
  if (!frame) return;
  app._editingTileId = null;
  app.spriteEditorFrame.set({ ...frame, pixels: frame.pixels.slice() });
  app.spriteEditorOpen.set(true);
}

export async function onSpritePngUpload(app: App, event: Event, frameId: number): Promise<void> {
  const input = event.target;
  if (!(input instanceof HTMLInputElement)) return;
  const file = input.files?.[0];
  if (!file) return;
  input.value = '';

  const frame: DecodedSpriteFrame | null = app.packSpriteDecodedFrames.get(frameId) ?? null;
  if (!frame) {
    app.failEditor('Sprite frame not found');
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

    const canvas = document.createElement('canvas');
    canvas.width = frame.width;
    canvas.height = frame.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      app.failEditor('Failed to get 2D context');
      return;
    }
    ctx.drawImage(img, 0, 0, frame.width, frame.height);
    const imageData = ctx.getImageData(0, 0, frame.width, frame.height);

    app.workerBusy.set(true);
    const result = await app.dispatchWorker<{ levels: import('./level-editor.service').ParsedLevel[] }>(
      'APPLY_SPRITE_PACK_PIXELS',
      {
      frameId,
      bitDepth: frame.bitDepth,
      pixels: imageData.data,
      },
    );
    app.applyLevelsResult(result.levels, {
      preserveCanvasView: true,
      refreshSelectedLevelState: false,
    });
    app.decodePackSpritesInBackground();
    app.resourcesStatus.set(`Sprite frame #${frameId} replaced from PNG.`);
  } catch (err) {
    app.editorError.set(err instanceof Error ? err.message : 'PNG upload failed');
  } finally {
    app.workerBusy.set(false);
  }
}

export async function addSpriteFrame(app: App): Promise<void> {
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
      const width = Math.min(img.naturalWidth, 512);
      const height = Math.min(img.naturalHeight, 512);
      if (width <= 0 || height <= 0) {
        app.failEditor('Invalid image dimensions');
        return;
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        app.failEditor('Failed to get 2D context');
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      const imageData = ctx.getImageData(0, 0, width, height);
      const rgba = imageData.data;
      const log2xSize = Math.ceil(Math.log2(Math.max(width, 1)));
      const stride = 1 << log2xSize;
      const maskColour = 0x7c1f;
      const headerSize = 8;
      const dataSize = headerSize + height * stride * 2;
      const data = new Uint8Array(dataSize);
      const view = new DataView(data.buffer);
      view.setUint16(0, width, false);
      view.setUint16(2, height, false);
      data[4] = log2xSize;
      view.setUint16(headerSize, maskColour, false);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const srcIdx = (y * width + x) * 4;
          const alpha = rgba[srcIdx + 3];
          const off = headerSize + (y * stride + x) * 2;
          if (off + 2 > data.length) continue;
          if (alpha === 0) {
            view.setUint16(off, maskColour, false);
          } else {
            const r = rgba[srcIdx];
            const g = rgba[srcIdx + 1];
            const b = rgba[srcIdx + 2];
            const rgb = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
            view.setUint16(off, rgb === maskColour ? rgb ^ 1 : rgb, false);
          }
        }
      }
      const existing = app.packSpriteFrames().map((frameInfo: { id: number }) => frameInfo.id);
      const nextId = existing.length > 0 ? Math.max(...existing) + 1 : 128;
      if (nextId > 9999) {
        app.failEditor('Too many sprite frames (max ID 9999)');
        return;
      }
      const buf = data.buffer.slice(0);
      await app.dispatchWorker('PUT_PACK_ENTRY_RAW', { packId: 137, entryId: nextId, bytes: buf }, [buf]);
      await app.decodePackSpritesInBackground();
      app.selectedPackSpriteId.set(nextId);
      app.resourcesStatus.set(`New sprite frame #${nextId} created.`);
      app.snackBar.open(`✓ Sprite #${nextId} added`, 'OK', { duration: 3000, panelClass: 'snack-success' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to add sprite';
      app.editorError.set(msg);
      app.snackBar.open(`✗ ${msg}`, 'Dismiss', { duration: 5000, panelClass: 'snack-error' });
    } finally {
      app.workerBusy.set(false);
    }
  };
  input.click();
}

export async function onSpriteEditorSaved(
  app: App,
  event: { frameId: number; pixels: Uint8ClampedArray },
): Promise<void> {
  app.spriteEditorOpen.set(false);
  const tileId = app._editingTileId;
  app._editingTileId = null;
  if (tileId !== null) {
    await app.onTileEditorSaved(event);
    return;
  }
  try {
    app.workerBusy.set(true);
    const bitDepth = app.spriteEditorFrame()?.bitDepth ?? 16;
    const result = await app.dispatchWorker<{ levels: import('./level-editor.service').ParsedLevel[] }>(
      'APPLY_SPRITE_PACK_PIXELS',
      {
      frameId: event.frameId,
      bitDepth,
      pixels: event.pixels,
      },
    );
    app.applyLevelsResult(result.levels, {
      preserveCanvasView: true,
      refreshSelectedLevelState: false,
    });
    app.decodePackSpritesInBackground();
    app.resourcesStatus.set(`Sprite frame #${event.frameId} saved.`);
  } catch (err) {
    app.editorError.set(err instanceof Error ? err.message : 'Sprite save failed');
  } finally {
    app.workerBusy.set(false);
  }
}
