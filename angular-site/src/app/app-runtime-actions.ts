import type { App } from './app';
import {
  scheduleCanvasRedraw as scheduleCanvasRedrawHelper,
  toggleFullscreen as toggleFullscreenHelper,
} from './app-runtime';
import {
  clearEditorResources as clearEditorResourcesHelper,
  downloadEditedResources as downloadEditedResourcesHelper,
  loadDefaultResources as loadDefaultResourcesHelper,
  onResourceFileSelected as onResourceFileSelectedHelper,
  saveEditedResourcesToGame as saveEditedResourcesToGameHelper,
} from './app-session';
import {
  applyVolumeToWasm as applyVolumeToWasmHelper,
  applyCustomResourcesPreset as applyCustomResourcesPresetHelper,
  assetUrl as assetUrlHelper,
  dispatchWorker as dispatchWorkerHelper,
  clearCustomResources as clearCustomResourcesHelper,
  initPackWorker as initPackWorkerHelper,
  loadWasmScript as loadWasmScriptHelper,
  onCustomResourcesFileSelected as onCustomResourcesFileSelectedHelper,
  mountCustomResourcesFs as mountCustomResourcesFsHelper,
  readAssetBytes as readAssetBytesHelper,
  restartWasmGame as restartWasmGameHelper,
  restartGameWithCustomResources as restartGameWithCustomResourcesHelper,
  setupEmscriptenModule as setupEmscriptenModuleHelper,
  syncGameLoopWithActiveTab as syncGameLoopWithActiveTabHelper,
  restartIntoEditorTestDrive as restartIntoEditorTestDriveHelper,
  restartWithStartupOptions as restartWithStartupOptionsHelper,
} from './app-platform';
import type { CustomResourcesPresetId } from './game/game-customisation-presets';
import { bindAppAction } from './bind-app-action';

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
  applyCustomResourcesPreset(preset: CustomResourcesPresetId): Promise<void>;
  restartWasmGame(): void;
  restartGameWithCustomResources(): void;
  restartIntoEditorTestDrive(): void;
  restartWithStartupOptions(useLevel: boolean): void;
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
    applyCustomResourcesPreset: (preset: CustomResourcesPresetId) =>
      applyCustomResourcesPresetHelper(app, preset),
    restartWasmGame: bindAppAction(app, restartWasmGameHelper),
    restartGameWithCustomResources: bindAppAction(app, restartGameWithCustomResourcesHelper),
    restartIntoEditorTestDrive: bindAppAction(app, restartIntoEditorTestDriveHelper),
    restartWithStartupOptions: (useLevel: boolean) =>
      restartWithStartupOptionsHelper(app, useLevel),
    clearCustomResources: bindAppAction(app, clearCustomResourcesHelper),
    mountCustomResourcesFs: bindAppAction(app, mountCustomResourcesFsHelper),
  };
}
