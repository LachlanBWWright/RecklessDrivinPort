import type { App } from './app';
import { resultFromThrowable } from './result-helpers';

function disconnectKonvaResizeObserver(app: App): void {
  app._konvaResizeObserver?.disconnect();
  app._konvaResizeObserver = null;
}

export function destroyApp(app: App): void {
  const stopAudioResult = resultFromThrowable(
    (host: App) => host.media.stopAudio(),
    'Failed to stop audio',
  )(app);
  stopAudioResult.match(
    () => undefined,
    () => undefined,
  );
  if (app.wasmScript?.parentNode) {
    (app.wasmScript.parentNode as HTMLElement).removeChild(app.wasmScript);
  }
  app.wasmScript = null;
  app.packWorker?.terminate();
  app.packWorker = null;
  disconnectKonvaResizeObserver(app);
  app.konva.destroy();
  app._konvaInitialized = false;
}

export function scheduleCanvasRedraw(app: App): void {
  if (app.activeTab() !== 'editor') return;
  if (typeof window === 'undefined') {
    setTimeout(() => app.redrawObjectCanvas(), 0);
    return;
  }
  if (app._pendingRedrawRaf !== null) {
    window.cancelAnimationFrame(app._pendingRedrawRaf);
  }
  app._pendingRedrawRaf = window.requestAnimationFrame(() => {
    app._pendingRedrawRaf = null;
    app.redrawObjectCanvas();
  });
}

export function onInit(app: App): void {
  app.runtime.initPackWorker();
}

export function onAfterViewInit(app: App): void {
  app.runtime.restartWasmGame();
}
