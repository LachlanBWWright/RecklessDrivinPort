import type { App } from './app';
import { scheduleCanvasRedraw as scheduleCanvasRedrawHelper, toggleFullscreen as toggleFullscreenHelper } from './app-runtime';
import {
  clearEditorResources as clearEditorResourcesHelper,
  downloadEditedResources as downloadEditedResourcesHelper,
  loadDefaultResources as loadDefaultResourcesHelper,
  onResourceFileSelected as onResourceFileSelectedHelper,
  saveEditedResourcesToGame as saveEditedResourcesToGameHelper,
} from './app-session';
import {
  applyVolumeToWasm as applyVolumeToWasmHelper,
  assetUrl as assetUrlHelper,
  dispatchWorker as dispatchWorkerHelper,
  clearCustomResources as clearCustomResourcesHelper,
  initPackWorker as initPackWorkerHelper,
  loadWasmScript as loadWasmScriptHelper,
  onCustomResourcesFileSelected as onCustomResourcesFileSelectedHelper,
  mountCustomResourcesFs as mountCustomResourcesFsHelper,
  readAssetBytes as readAssetBytesHelper,
  restartGameWithCustomResources as restartGameWithCustomResourcesHelper,
  setupEmscriptenModule as setupEmscriptenModuleHelper,
  syncGameLoopWithActiveTab as syncGameLoopWithActiveTabHelper,
} from './app-platform';

export function createRuntimeActions(app: App): {
  scheduleCanvasRedraw(): void;
  setTab(tab: 'game' | 'editor'): void;
  setSection(section: import('./layout/site-toolbar/site-toolbar.component').EditorSection): void;
  toggleFullscreen(): void;
  onVolumeChange(event: Event): void;
  onVolumeSliderChange(pct: number): void;
  applyVolume(): void;
  loadDefaultResources(): Promise<void>;
  onResourceFileSelected(event: Event): Promise<void>;
  clearEditorResources(): void;
  downloadEditedResources(): Promise<void>;
  saveEditedResourcesToGame(): Promise<void>;
  initPackWorker(): void;
  dispatchWorker<T>(cmd: string, payload?: unknown, transferables?: Transferable[]): Promise<T>;
  setupEmscriptenModule(): void;
  loadWasmScript(): void;
  assetUrl(path: string): string;
  readAssetBytes(path: string): ReturnType<typeof readAssetBytesHelper>;
  applyVolumeToWasm(pct: number): void;
  syncGameLoopWithActiveTab(): void;
  onCustomResourcesFileSelected(event: Event): Promise<void>;
  restartGameWithCustomResources(): void;
  clearCustomResources(): void;
  mountCustomResourcesFs(bytes: Uint8Array): void;
} {
  return {
    scheduleCanvasRedraw: () => scheduleCanvasRedrawHelper(app),
    setTab: (tab) => {
      app.activeTab.set(tab);
      syncGameLoopWithActiveTabHelper(app);
      if (tab === 'editor') {
        window.requestAnimationFrame(() => scheduleCanvasRedrawHelper(app));
      }
    },
    setSection: (section) => {
      app.editorSection.set(section);
    },
    toggleFullscreen: () => toggleFullscreenHelper(),
    onVolumeChange: (event) => {
      const target = event.target;
      const value = target instanceof HTMLInputElement ? Number.parseInt(target.value, 10) : NaN;
      if (!Number.isNaN(value)) {
        app.masterVolume.set(value);
        applyVolumeToWasmHelper(app, value);
      }
    },
    onVolumeSliderChange: (pct) => {
      app.masterVolume.set(pct);
      applyVolumeToWasmHelper(app, pct);
    },
    applyVolume: () => {
      applyVolumeToWasmHelper(app, app.masterVolume());
    },
    loadDefaultResources: () => loadDefaultResourcesHelper(app),
    onResourceFileSelected: (event) => onResourceFileSelectedHelper(app, event),
    clearEditorResources: () => clearEditorResourcesHelper(app),
    downloadEditedResources: () => downloadEditedResourcesHelper(app),
    saveEditedResourcesToGame: () => saveEditedResourcesToGameHelper(app),
    initPackWorker: () => initPackWorkerHelper(app),
    dispatchWorker: (cmd, payload, transferables) => dispatchWorkerHelper(app, cmd, payload, transferables),
    setupEmscriptenModule: () => setupEmscriptenModuleHelper(app),
    loadWasmScript: () => loadWasmScriptHelper(app),
    assetUrl: (path) => assetUrlHelper(app, path),
    readAssetBytes: (path) => readAssetBytesHelper(app, path),
    applyVolumeToWasm: (pct) => applyVolumeToWasmHelper(app, pct),
    syncGameLoopWithActiveTab: () => syncGameLoopWithActiveTabHelper(app),
    onCustomResourcesFileSelected: (event) => onCustomResourcesFileSelectedHelper(app, event),
    restartGameWithCustomResources: () => restartGameWithCustomResourcesHelper(app),
    clearCustomResources: () => clearCustomResourcesHelper(app),
    mountCustomResourcesFs: (bytes) => mountCustomResourcesFsHelper(app, bytes),
  };
}
