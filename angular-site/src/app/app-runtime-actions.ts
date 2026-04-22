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
import { bindAppAction } from './bind-app-action';

export function createRuntimeActions(app: App): {
  scheduleCanvasRedraw(): void;
  setTab(tab: 'game' | 'editor'): void;
  setSection(section: import('./layout/site-toolbar/site-toolbar.component').EditorSection): void;
  toggleFullscreen(): void;
  onVolumeSliderChange(pct: number): void;
  applyVolume(): void;
  loadDefaultResources(): Promise<void>;
  onResourceFileSelected(file: File | null): Promise<void>;
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
  onCustomResourcesFileSelected(file: File | null): Promise<void>;
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
    toggleFullscreen: toggleFullscreenHelper,
    onVolumeSliderChange: (pct) => {
      app.masterVolume.set(pct);
      applyVolumeToWasmHelper(app, pct);
    },
    applyVolume: () => {
      applyVolumeToWasmHelper(app, app.masterVolume());
    },
    loadDefaultResources: bindAppAction(app, loadDefaultResourcesHelper),
    onResourceFileSelected: bindAppAction(app, onResourceFileSelectedHelper),
    clearEditorResources: bindAppAction(app, clearEditorResourcesHelper),
    downloadEditedResources: bindAppAction(app, downloadEditedResourcesHelper),
    saveEditedResourcesToGame: bindAppAction(app, saveEditedResourcesToGameHelper),
    initPackWorker: bindAppAction(app, initPackWorkerHelper),
    dispatchWorker: <T>(cmd: string, payload?: unknown, transferables?: Transferable[]) =>
      dispatchWorkerHelper<T>(app, cmd, payload, transferables),
    setupEmscriptenModule: bindAppAction(app, setupEmscriptenModuleHelper),
    loadWasmScript: bindAppAction(app, loadWasmScriptHelper),
    assetUrl: bindAppAction(app, assetUrlHelper),
    readAssetBytes: bindAppAction(app, readAssetBytesHelper),
    applyVolumeToWasm: bindAppAction(app, applyVolumeToWasmHelper),
    syncGameLoopWithActiveTab: bindAppAction(app, syncGameLoopWithActiveTabHelper),
    onCustomResourcesFileSelected: bindAppAction(app, onCustomResourcesFileSelectedHelper),
    restartGameWithCustomResources: bindAppAction(app, restartGameWithCustomResourcesHelper),
    clearCustomResources: bindAppAction(app, clearCustomResourcesHelper),
    mountCustomResourcesFs: bindAppAction(app, mountCustomResourcesFsHelper),
  };
}
