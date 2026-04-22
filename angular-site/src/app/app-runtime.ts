import { effect } from '@angular/core';
import { App } from './app';
import { loadCustomResourcesDb } from './app-state-resources';
import type { EditorSection } from './layout/site-toolbar/site-toolbar.component';
import { resultFromThrowable } from './result-helpers';
import { registerKonvaEventHandlers } from './app-runtime-konva-events';

export const SECTION_ORDER: EditorSection[] = [
  'properties',
  'object-groups',
  'object-types',
  'objects',
  'sprites',
  'tiles',
  'audio',
  'screens',
];

export function setupAppLifecycle(app: App): void {
  effect(() => {
    const tab = app.activeTab();
    const section = app.editorSection();
    app.objects();
    app.selectedObjIndex();
    app.canvasZoom();
    app.canvasPanX();
    app.canvasPanY();
    app.visibleTypeFilter();
    app.spritePreviewsVersion();
    app.roadTexturesVersion();
    app.roadInfoVersion();
    app.roadSegsVersion();
    app.showTrackOverlay();
    app.showObjects();
    app.showMarks();
    app.showRoad();
    app.showBarriers();
    app.showTrackUp();
    app.showTrackDown();
    app.showGrid();
    app.editTrackUp();
    app.editTrackDown();
    app.hoverTrackWaypoint();
    app.hoverTrackMidpoint();
    app.marks();
    app.selectedMarkIndex();
    app.markCreateMode();
    app.pendingMarkPointCount();
    app.markingPreview();
    app.editXStartPos();
    app.editLevelEnd();
    app.selectedLevel();
    if (tab === 'editor' && section === 'objects') {
      app.runtime.scheduleCanvasRedraw();
    }
  });

  effect(() => {
    app.marks();
    app.selectedMarkIndex();
    app.markCreateMode();
    app.pendingMarkPointCount();
    if (typeof window !== 'undefined') {
      window.requestAnimationFrame(() => app.redrawMarkCanvas());
    }
  });

  effect(() => {
    const mode = app.drawMode();
    if (mode !== 'curve') {
      app._curveStartPoint = null;
      app._curveEndPoint = null;
      app.konva.clearBarrierDrawPreview();
    }
    if (typeof document === 'undefined') return;
    const kc = document.getElementById('konva-container');
    if (!kc) return;
    if (!app.spaceDown() && !app._isPanning) {
      kc.style.cursor = mode !== 'none' ? 'crosshair' : 'default';
    }
  });
}

export function initializeKonvaOverlay(app: App): void {
  if (typeof window === 'undefined') return;
  const canvas = document.getElementById('object-canvas') as HTMLCanvasElement | null;
  if (!canvas || app._konvaInitialized) return;
  const parent = canvas.parentElement;
  if (!parent) return;

  const rect = canvas.getBoundingClientRect();
  const cssW = Math.max(1, Math.round(rect.width));
  const cssH = Math.max(1, Math.round(rect.height));

  let konvaContainer = document.getElementById('konva-container');
  if (!konvaContainer) {
    konvaContainer = document.createElement('div');
    konvaContainer.id = 'konva-container';
    parent.style.position = 'relative';
    canvas.insertAdjacentElement('afterend', konvaContainer);

    konvaContainer.addEventListener('wheel', (e) => {
      const fwd = new WheelEvent('wheel', e);
      canvas.dispatchEvent(fwd);
    }, { passive: false });

    konvaContainer.tabIndex = 0;
    konvaContainer.addEventListener('keydown', (e) => {
      canvas.dispatchEvent(new KeyboardEvent('keydown', {
        key: e.key,
        code: e.code,
        keyCode: e.keyCode,
        which: e.which,
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
        shiftKey: e.shiftKey,
        altKey: e.altKey,
        repeat: e.repeat,
        bubbles: true,
        cancelable: true,
      }));
    });
    konvaContainer.addEventListener('keyup', (e) => {
      canvas.dispatchEvent(new KeyboardEvent('keyup', {
        key: e.key,
        code: e.code,
        keyCode: e.keyCode,
        which: e.which,
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
        shiftKey: e.shiftKey,
        altKey: e.altKey,
        repeat: e.repeat,
        bubbles: true,
        cancelable: true,
      }));
    });
    konvaContainer.addEventListener('mousedown', () => {
      const el = document.getElementById('konva-container');
      if (el) el.focus({ preventScroll: true });
    });
  }

  konvaContainer.style.cssText = `
      position:absolute; inset:0;
      overflow:hidden;
      pointer-events:all;
      outline:none;
      cursor:default;
    `;

  if (canvas.width !== cssW || canvas.height !== cssH) {
    canvas.width = cssW;
    canvas.height = cssH;
    app._roadOffscreenKey = '';
    app._roadOffscreen = null;
  }

  app.konva.init('konva-container', canvas.width, canvas.height, cssW, cssH);
  app._konvaInitialized = true;

  const resizeObserver = new ResizeObserver(() => {
    const r = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width));
    const h = Math.max(1, Math.round(r.height));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      app._roadOffscreenKey = '';
      app._roadOffscreen = null;
    }
    if (konvaContainer) {
      konvaContainer.style.width = `${w}px`;
      konvaContainer.style.height = `${h}px`;
    }
    app.konva.resize(w, h);
    app.runtime.scheduleCanvasRedraw();
  });
  resizeObserver.observe(canvas);

  registerKonvaEventHandlers(app);
}

export function destroyApp(app: App): void {
  const stopAudioResult = resultFromThrowable((host: App) => host.media.stopAudio(), 'Failed to stop audio')(app);
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
  if (typeof indexedDB !== 'undefined') {
        loadCustomResourcesDb()
      .then((entry) => {
        if (entry) {
          app.customResourcesLoaded.set(true);
          app.customResourcesName.set(entry.name);
        }
      })
      .catch(() => {
        /* ignore */
      });
  }
}

export function onAfterViewInit(app: App): void {
  app.runtime.setupEmscriptenModule();
  app.runtime.loadWasmScript();
}

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0:00';
  const s = Math.floor(seconds);
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${mm}:${ss.toString().padStart(2, '0')}`;
}

export function getEditorSectionIndex(app: App): number {
  return app.SECTION_ORDER.indexOf(app.editorSection());
}

export function setEditorSectionIndex(app: App, idx: number): void {
  const section = app.SECTION_ORDER[idx];
  if (section) app.runtime.setSection(section);
}

export function toggleFullscreen(): void {
  const canvas = document.getElementById('canvas') as HTMLCanvasElement;
  if (document.fullscreenElement) {
    document.exitFullscreen();
  } else {
    canvas.requestFullscreen().catch((err) => console.warn('Fullscreen error:', err));
  }
}

export function onVolumeChange(app: App, event: Event): void {
  const pct = Number.parseInt((event.target as HTMLInputElement).value, 10);
  app.masterVolume.set(pct);
  app.runtime.applyVolumeToWasm(pct);
}
