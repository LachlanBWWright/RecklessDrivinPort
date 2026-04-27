import { effect } from '@angular/core';
import { App } from './app';
import { AppStateResources } from './app-state-resources';
import type { EditorSection } from './layout/site-toolbar/site-toolbar.component';
import { MAX_TIME_VALUE } from './app-level';
import { dist2d, MIN_START_MARKER_HIT_RADIUS, BASE_START_MARKER_HIT_RADIUS } from './object-canvas';
import { resultFromThrowable } from './result-helpers';

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

  app.konva.onObjectDragEnd = (e) => {
    const objs = [...app.objects()];
    if (e.index < objs.length) {
      app._pushUndo('objects');
      objs[e.index] = { ...objs[e.index], x: e.worldX, y: e.worldY };
      app.objects.set(objs);
      if (app.selectedObjIndex() === e.index) {
        app.editObjX.set(e.worldX);
        app.editObjY.set(e.worldY);
      }
    }
  };
  app.konva.onObjectClick = (index) => app.selectObject(index);
  app.konva.onObjectRotateMove = (e) => {
    if (app.selectedObjIndex() === e.index) {
      app.editObjDir.set(e.worldDir);
    }
  };
  app.konva.onObjectRotateEnd = (e) => {
    const objs = [...app.objects()];
    if (e.index >= objs.length) return;
    if (objs[e.index].dir === e.worldDir) {
      if (app.selectedObjIndex() === e.index) {
        app.editObjDir.set(e.worldDir);
      }
      return;
    }
    app._pushUndo('objects');
    objs[e.index] = { ...objs[e.index], dir: e.worldDir };
    app.objects.set(objs);
    if (app.selectedObjIndex() === e.index) {
      app.editObjDir.set(e.worldDir);
    }
  };
  app.konva.onStageDblClick = (wx, wy) => {
    if (app.markCreateMode() || app.drawMode() !== 'none') return;
    const objs = [...app.objects()];
    const selIdx = app.selectedObjIndex();
    const typeRes = selIdx !== null && selIdx < objs.length ? objs[selIdx].typeRes : 128;
    app._pushUndo('objects');
    objs.push({ x: Math.round(wx), y: Math.round(wy), dir: 0, typeRes });
    app.objects.set(objs);
    app.selectObject(objs.length - 1);
  };
  app.konva.onStageRightClick = (wx, wy) => {
    if (!app.showTrackOverlay()) return;
    app._handleTrackContextMenuAtWorld(wx, wy);
  };
  app.konva.onWaypointDragEnd = (e) => {
    app.selectedObjIndex.set(null);
    app._pushUndo('tracks');
    if (e.track === 'up') {
      const arr = [...app.editTrackUp()];
      if (e.segIdx < arr.length) {
        arr[e.segIdx] = { ...arr[e.segIdx], x: e.worldX, y: e.worldY };
        app.editTrackUp.set(arr);
      }
    } else {
      const arr = [...app.editTrackDown()];
      if (e.segIdx < arr.length) {
        arr[e.segIdx] = { ...arr[e.segIdx], x: e.worldX, y: e.worldY };
        app.editTrackDown.set(arr);
      }
    }
  };
  app.konva.onWaypointDoubleClick = (track, segIdx) => {
    app._insertWaypointAfter(track, segIdx);
  };
  app.konva.onWaypointRightClick = (track, segIdx) => {
    app._pushUndo('tracks');
    if (track === 'up') {
      const arr = [...app.editTrackUp()];
      arr.splice(segIdx, 1);
      app.editTrackUp.set(arr);
    } else {
      const arr = [...app.editTrackDown()];
      arr.splice(segIdx, 1);
      app.editTrackDown.set(arr);
    }
  };
  app.konva.onMarkEndpointDragEnd = (e) => {
    app.selectedObjIndex.set(null);
    app._pushUndo('marks');
    const ms = [...app.marks()];
    if (e.markIdx >= ms.length) return;
    const m = ms[e.markIdx];
    const oldX = e.endpoint === 'p1' ? m.x1 : m.x2;
    const oldY = e.endpoint === 'p1' ? m.y1 : m.y2;
    ms[e.markIdx] =
      e.endpoint === 'p1'
        ? { ...m, x1: e.worldX, y1: e.worldY }
        : { ...m, x2: e.worldX, y2: e.worldY };
    for (let i = 0; i < ms.length; i++) {
      if (i === e.markIdx) continue;
      const other = ms[i];
      if (other.x1 === oldX && other.y1 === oldY) {
        ms[i] = { ...other, x1: e.worldX, y1: e.worldY };
      }
      if (other.x2 === oldX && other.y2 === oldY) {
        ms[i] = { ...ms[i], x2: e.worldX, y2: e.worldY };
      }
    }
    app._lastDraggedNubKey = { markIdx: e.markIdx, endpoint: e.endpoint };
    app.marks.set(ms);
    app.scheduleMarkAutoSave();
  };
  app.konva.onMarkClick = (markIdx) => app.selectedMarkIndex.set(markIdx);
  app.konva.onFinishLineDragStart = (e) => {
    app._draggingFinishLine = true;
    if (!app._finishLineDragUndoCaptured) {
      app._pushUndo('props');
      app._finishLineDragUndoCaptured = true;
    }
    app.editLevelEnd.set(Math.max(0, Math.min(MAX_TIME_VALUE, Math.round(e.worldY))));
    app.markPropertiesDirty();
  };
  app.konva.onFinishLineDragMove = (e) => {
    app.editLevelEnd.set(Math.max(0, Math.min(MAX_TIME_VALUE, Math.round(e.worldY))));
    app.markPropertiesDirty();
  };
  app.konva.onFinishLineDragEnd = (e) => {
    app.editLevelEnd.set(Math.max(0, Math.min(MAX_TIME_VALUE, Math.round(e.worldY))));
    app.markPropertiesDirty();
    app._draggingFinishLine = false;
    app._finishLineDragUndoCaptured = false;
  };
  app.konva.onStageMouseDown = (cssX, cssY, button, targetIsStage) => {
    const isPanGesture = button === 1 || (button === 0 && app.spaceDown());
    if (isPanGesture) {
      app._isPanning = true;
      app.isPanning.set(true);
      app._prevPanMouseX = cssX;
      app._prevPanMouseY = cssY;
      const kc = document.getElementById('konva-container');
      if (kc) kc.style.cursor = 'grabbing';
      return;
    }
    if (button === 0 && app.markCreateMode() && targetIsStage) {
      const [wx, wy] = app.canvasToWorld(cssX, cssY);
      app._addMarkCreatePoint(Math.round(wx), Math.round(wy));
      return;
    }
    if (button === 0 && app.showBarriers() && app.drawMode() !== 'none' && targetIsStage) {
      const [wx, wy] = app.canvasToWorld(cssX, cssY);
      if (app.drawMode() === 'curve') {
        app._handleCurveDrawClick(wx, wy);
        return;
      }
      app._barrierDrawing = true;
      if (app.drawMode() === 'straight') {
        app._barrierDrawStart = { wx, wy };
        app._barrierDrawPath = [{ wx, wy }];
      } else {
        app._barrierDrawStart = null;
        app._barrierDrawPath = [{ wx, wy }];
      }
      const kc = document.getElementById('konva-container');
      if (kc) kc.style.cursor = 'crosshair';
      return;
    }
    if (button === 0) {
      const [wx, wy] = app.canvasToWorld(cssX, cssY);
      const startHitR = Math.max(
        MIN_START_MARKER_HIT_RADIUS,
        BASE_START_MARKER_HIT_RADIUS / app.canvasZoom(),
      );
      if (dist2d(app.editXStartPos(), 0, wx, wy) < startHitR) {
        app._beginStartMarkerDrag(null);
        return;
      }
    }
  };
  app.konva.onStageMouseMove = (cssX, cssY) => {
    if (app._isPanning) {
      const zoom = app.canvasZoom();
      const dx = cssX - app._prevPanMouseX;
      const dy = cssY - app._prevPanMouseY;
      app._prevPanMouseX = cssX;
      app._prevPanMouseY = cssY;
      app.canvasPanX.update((x) => x - dx / zoom);
      app.canvasPanY.update((y) => y - dy / zoom);
      return;
    }
    if (app.markCreateMode() && app._pendingMarkPoints.length > 0) {
      const [wx, wy] = app.canvasToWorld(cssX, cssY);
      app._markCreateHoverPoint = { x: Math.round(wx), y: Math.round(wy) };
      app.runtime.scheduleCanvasRedraw();
      return;
    }
    if (app.drawMode() === 'curve') {
      const [wx, wy] = app.canvasToWorld(cssX, cssY);
      app._updateCurvePreview(wx, wy);
      return;
    }
    if (app._barrierDrawing) {
      const [wx, wy] = app.canvasToWorld(cssX, cssY);
      if (app.drawMode() === 'straight' && app._barrierDrawStart) {
        app._barrierDrawPath = [app._barrierDrawStart, { wx, wy }];
        const start = app._barrierDrawStart;
        app.konva.setBarrierDrawPreview([start.wx, -start.wy, wx, -wy]);
        app.konva.flush();
      } else {
        app._barrierDrawPath.push({ wx, wy });
        if (app._barrierDrawPath.length % 3 === 0) {
          const pts: number[] = [];
          for (const p of app._barrierDrawPath) pts.push(p.wx, -p.wy);
          app.konva.setBarrierDrawPreview(pts);
          app.konva.flush();
        }
      }
      return;
    }
    if (app._draggingStartMarker) {
      const [wx] = app.canvasToWorld(cssX, cssY);
      app.editXStartPos.set(Math.round(wx));
      app.markPropertiesDirty();
    }
  };
  app.konva.onStageMouseUp = (button) => {
    if (button === 0 || button === 1) {
      if (app._isPanning) {
        app._isPanning = false;
        app.isPanning.set(false);
        const kc = document.getElementById('konva-container');
        if (kc) kc.style.cursor = app.spaceDown() ? 'grab' : app.drawMode() !== 'none' ? 'crosshair' : 'default';
      }
      if (app._barrierDrawing) {
        app._barrierDrawing = false;
        app.konva.clearBarrierDrawPreview();
        if (app.drawMode() === 'straight') {
          app._barrierDrawStart = null;
          app._applyBarrierDrawPath();
        } else {
          app._applyBarrierDrawPath();
        }
        const kc = document.getElementById('konva-container');
        if (kc) kc.style.cursor = app.spaceDown() ? 'grab' : app.drawMode() !== 'none' ? 'crosshair' : 'default';
      }
      if (app._draggingStartMarker || app._draggingFinishLine) {
        app._draggingStartMarker = false;
        app._draggingFinishLine = false;
        app._startMarkerDragUndoCaptured = false;
        app._finishLineDragUndoCaptured = false;
      }
    }
  };
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
        AppStateResources._loadCustomResourcesDb()
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
