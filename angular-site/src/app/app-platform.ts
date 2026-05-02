import { err, ok, type Result } from 'neverthrow';
import { App } from './app';
import { AppStateResources } from './app-state-resources';
import {
  TERMINATOR_RESOURCE_ASSET_PATH,
  TERMINATOR_RESOURCE_NAME,
  type CustomResourcesPresetId,
} from './game/game-customisation-presets';

interface EmscriptenModuleLike {
  canvas?: HTMLCanvasElement;
  pauseMainLoop?: () => void;
  resumeMainLoop?: () => void;
  _set_wasm_master_volume?: (vol: number) => void;
  _rd_set_editor_launch_options?: (
    enabled: number,
    autoStart: number,
    levelID: number,
    hasStartY: number,
    startY: number,
    hasObjectGroupStartY: number,
    objectGroupStartY: number,
    forcedAddOns: number,
    disabledBonusRollMask: number,
  ) => void;
  _rd_start_editor_test_drive?: () => void;
}

interface PendingEditorTestDriveLaunch {
  enabled: boolean;
  autoStart: boolean;
  levelNumber: number;
  hasStartY: boolean;
  startY: number;
  hasObjectGroupStartY: boolean;
  objectGroupStartY: number;
  forcedAddOns: number;
  disabledBonusRollMask: number;
}

interface PendingGameRestartOptions {
  useCustomResources: boolean;
  launch: PendingEditorTestDriveLaunch | null;
}

const EDITOR_TEST_DRIVE_STORAGE_KEY = 'reckless-drivin-editor-test-drive';
const RESTART_OPTIONS_STORAGE_KEY = 'reckless-drivin-restart-options';
const GAME_FRAME_ID = 'game-frame';
const GAME_FRAME_SRCDOC = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    html, body {
      margin: 0;
      width: 100%;
      height: 100%;
      background: #000;
      overflow: hidden;
    }
    #canvas {
      display: block;
      width: 100%;
      height: 100%;
      image-rendering: pixelated;
      outline: none;
    }
  </style>
</head>
<body>
  <canvas id="canvas" width="640" height="480"></canvas>
</body>
</html>`;

let pendingRestartOptions: PendingGameRestartOptions | null = null;

function clampNonNegativeInteger(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.round(value));
}

function clampLevelNumber(value: number, maxLevel: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.min(maxLevel, Math.round(value)));
}

function validateLevelNumber(value: number, maxLevel: number): number | null {
  if (!Number.isFinite(value)) return null;
  const rounded = Math.round(value);
  if (rounded < 1 || rounded > maxLevel) return null;
  return rounded;
}

function buildPendingEditorTestDriveLaunch(
  app: App,
  autoStart: boolean,
): PendingEditorTestDriveLaunch | null {
  const maxLevel = Math.max(1, app.parsedLevels().length || 10);
  const hasSettings =
    app.editorTestDriveUseStartY() ||
    app.editorTestDriveUseObjectGroupStartY() ||
    app.editorTestDriveForcedAddOns() !== 0 ||
    app.editorTestDriveDisabledBonusRollMask() !== 0;
  if (!autoStart && !hasSettings) {
    return null;
  }
  return {
    enabled: autoStart || hasSettings,
    autoStart,
    levelNumber: clampLevelNumber(app.editorTestDriveLevelNumber(), maxLevel),
    hasStartY: app.editorTestDriveUseStartY(),
    startY: clampNonNegativeInteger(app.editorTestDriveStartY(), 500),
    hasObjectGroupStartY: app.editorTestDriveUseObjectGroupStartY(),
    objectGroupStartY: clampNonNegativeInteger(app.editorTestDriveObjectGroupStartY(), 500),
    forcedAddOns: app.editorTestDriveForcedAddOns() >>> 0,
    disabledBonusRollMask: app.editorTestDriveDisabledBonusRollMask() >>> 0,
  };
}

function savePendingEditorTestDriveLaunch(launch: PendingEditorTestDriveLaunch): boolean {
  try {
    sessionStorage.setItem(EDITOR_TEST_DRIVE_STORAGE_KEY, JSON.stringify(launch));
    return true;
  } catch (error) {
    console.warn('[Angular] Failed to persist pending editor test drive launch', error);
    return false;
  }
}

function clearPendingEditorTestDriveLaunch(): void {
  try {
    sessionStorage.removeItem(EDITOR_TEST_DRIVE_STORAGE_KEY);
  } catch (error) {
    console.warn('[Angular] Failed to clear pending editor test drive launch', error);
  }
}

function consumePendingEditorTestDriveLaunch(): PendingEditorTestDriveLaunch | null {
  try {
    const raw = sessionStorage.getItem(EDITOR_TEST_DRIVE_STORAGE_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(EDITOR_TEST_DRIVE_STORAGE_KEY);
    const parsed = JSON.parse(raw) as Partial<PendingEditorTestDriveLaunch>;
    if (typeof parsed.levelNumber !== 'number') {
      return null;
    }
    return {
      enabled: parsed.enabled !== false,
      autoStart: parsed.autoStart === true,
      levelNumber: parsed.levelNumber,
      hasStartY: parsed.hasStartY === true,
      startY: clampNonNegativeInteger(parsed.startY ?? 500, 500),
      hasObjectGroupStartY: parsed.hasObjectGroupStartY === true,
      objectGroupStartY: clampNonNegativeInteger(parsed.objectGroupStartY ?? 500, 500),
      forcedAddOns: clampNonNegativeInteger(parsed.forcedAddOns ?? 0, 0),
      disabledBonusRollMask: clampNonNegativeInteger(parsed.disabledBonusRollMask ?? 0, 0),
    };
  } catch (error) {
    console.warn('[Angular] Failed to restore pending editor test drive launch', error);
    return null;
  }
}

function tryStartPendingEditorTestDrive(
  app: App,
  pendingLaunch: PendingEditorTestDriveLaunch | null,
): void {
  const launch = pendingLaunch ?? consumePendingEditorTestDriveLaunch();
  if (!launch) return;

  const mod = getGameModule(app);
  if (!mod || typeof mod._rd_set_editor_launch_options !== 'function') {
    console.warn('[Angular] Editor test drive launch requested but WASM export is unavailable');
    return;
  }

  // Set the launch options immediately in onRuntimeInitialized.
  // The C emscripten_main_loop checks gEditorLaunchOptions.enabled on its
  // first tick (after Init() completes) and calls StartGame(1) itself.
  // This avoids the timing race where a JS setTimeout(0) fires before
  // main()/Init() has finished setting up the game state.
  const maxLevel = Math.max(1, app.parsedLevels().length || 10);
  const launchLevel = validateLevelNumber(launch.levelNumber, maxLevel);
  if (launchLevel === null) {
    console.warn(
      '[Angular] Ignoring editor test drive launch with invalid level',
      launch.levelNumber,
      `(expected 1..${maxLevel})`,
    );
    return;
  }
  console.log('[Angular] Setting editor launch options', {
    enabled: launch.enabled,
    autoStart: launch.autoStart,
    level: launch.levelNumber,
  });
  const setLaunchOptions = mod._rd_set_editor_launch_options;
  setLaunchOptions(
    launch.enabled ? 1 : 0,
    launch.autoStart ? 1 : 0,
    launchLevel - 1,
    launch.hasStartY ? 1 : 0,
    launch.startY,
    launch.hasObjectGroupStartY ? 1 : 0,
    launch.objectGroupStartY,
    launch.forcedAddOns >>> 0,
    launch.disabledBonusRollMask >>> 0,
  );
}

function savePendingRestartOptions(options: PendingGameRestartOptions): boolean {
  try {
    sessionStorage.setItem(RESTART_OPTIONS_STORAGE_KEY, JSON.stringify(options));
    return true;
  } catch (error) {
    console.warn('[Angular] Failed to persist restart options', error);
    return false;
  }
}

function consumePendingRestartOptions(): PendingGameRestartOptions | null {
  try {
    const raw = sessionStorage.getItem(RESTART_OPTIONS_STORAGE_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(RESTART_OPTIONS_STORAGE_KEY);
    const parsed = JSON.parse(raw) as Partial<PendingGameRestartOptions>;
    return {
      useCustomResources: parsed.useCustomResources !== false,
      launch:
        parsed.launch && typeof parsed.launch.levelNumber === 'number'
          ? {
              enabled: parsed.launch.enabled !== false,
              autoStart: parsed.launch.autoStart === true,
              levelNumber: parsed.launch.levelNumber,
              hasStartY: parsed.launch.hasStartY === true,
              startY: clampNonNegativeInteger(parsed.launch.startY ?? 500, 500),
              hasObjectGroupStartY: parsed.launch.hasObjectGroupStartY === true,
              objectGroupStartY: clampNonNegativeInteger(
                parsed.launch.objectGroupStartY ?? 500,
                500,
              ),
              forcedAddOns: clampNonNegativeInteger(parsed.launch.forcedAddOns ?? 0, 0),
              disabledBonusRollMask: clampNonNegativeInteger(
                parsed.launch.disabledBonusRollMask ?? 0,
                0,
              ),
            }
          : null,
    };
  } catch (error) {
    console.warn('[Angular] Failed to restore restart options', error);
    return null;
  }
}

function getGameFrameElement(app: App): HTMLIFrameElement | null {
  const frame = document.getElementById(GAME_FRAME_ID);
  if (!(frame instanceof HTMLIFrameElement)) {
    app.gameFrame = null;
    return null;
  }
  app.gameFrame = frame;
  return frame;
}

function getGameWindow(app: App): Window | null {
  const frame = getGameFrameElement(app);
  if (!(frame instanceof HTMLIFrameElement)) {
    return null;
  }
  return frame.contentWindow;
}

function getGameModule(app: App): EmscriptenModuleLike | null {
  const gameWindow = getGameWindow(app);
  if (!gameWindow) {
    return null;
  }
  const module = gameWindow.Module;
  if (!module) {
    return null;
  }
  return module;
}

export function restartWasmGame(app: App): void {
  const frame = getGameFrameElement(app);
  if (!(frame instanceof HTMLIFrameElement)) {
    app.statusText.set('Game host frame not found. Refresh the page to recover.');
    return;
  }

  if (app.wasmScript?.parentNode) {
    app.wasmScript.parentNode.removeChild(app.wasmScript);
  }
  app.wasmScript = null;
  app.overlayVisible.set(true);
  app.progressPct.set(0);

  frame.onload = () => {
    setupEmscriptenModule(app);
    loadWasmScript(app);
  };
  frame.srcdoc = GAME_FRAME_SRCDOC;
}

function scheduleGameRestart(app: App, options: PendingGameRestartOptions): void {
  if (!savePendingRestartOptions(options)) {
    app.snackBar.open('Could not persist restart options.', 'Dismiss', {
      duration: 5000,
      panelClass: 'snack-error',
    });
    return;
  }
  app.gameRestarting.set(true);
  app.statusText.set('Restarting game runtime…');
  restartWasmGame(app);
}

export function initPackWorker(app: App): void {
  if (typeof Worker === 'undefined') {
    console.warn('[App] Web Worker not available; pack operations will not work.');
    return;
  }
  try {
    app.packWorker = new Worker(new URL('./pack.worker', import.meta.url), { type: 'module' });
    app.packWorker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const { id, ok, result, error } = event.data;
      const callback = app.pendingCallbacks.get(id);
      if (callback) {
        app.pendingCallbacks.delete(id);
        callback({ id, ok, cmd: event.data.cmd, result, error });
      }
    };
    app.packWorker.onerror = (err: ErrorEvent) => {
      console.error('[PackWorker] Error:', err.message);
      app.editorError.set(`Worker error: ${err.message}`);
      app.workerBusy.set(false);
      for (const cb of app.pendingCallbacks.values()) {
        cb({ id: -1, ok: false, cmd: '', error: err.message });
      }
      app.pendingCallbacks.clear();
    };
  } catch (err) {
    console.error('[App] Failed to create pack worker:', err);
  }
}

export function dispatchWorker<T>(
  app: App,
  cmd: string,
  payload?: unknown,
  transferables?: Transferable[],
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (!app.packWorker) {
      reject(new Error('Pack worker not available'));
      return;
    }
    const id = app.nextMsgId++;
    app.pendingCallbacks.set(id, (resp: WorkerResponse) => {
      if (resp.ok) resolve(resp.result as T);
      else reject(new Error(resp.error ?? 'Worker error'));
    });
    if (transferables?.length) {
      app.packWorker.postMessage({ id, cmd, payload }, transferables);
    } else {
      app.packWorker.postMessage({ id, cmd, payload });
    }
  });
}

export function setupEmscriptenModule(app: App): void {
  const gameWindow = getGameWindow(app);
  if (!gameWindow) {
    return;
  }

  const canvas = gameWindow.document.querySelector<HTMLCanvasElement>('#canvas');
  if (!canvas) return;
  pendingRestartOptions = consumePendingRestartOptions();

  if (typeof window.crossOriginIsolated !== 'undefined' && !window.crossOriginIsolated) {
    // Log a developer hint to the console only – do not pollute the game status
    // text with a technical server-config message that end users cannot act on.
    console.warn(
      '[RecklessDrivin] Cross-origin isolation unavailable – WASM with SharedArrayBuffer ' +
        'will fail. The server must send Cross-Origin-Opener-Policy: same-origin and ' +
        'Cross-Origin-Embedder-Policy: require-corp headers. ' +
        'Run `npm start` (ng serve) to enable these headers automatically. ' +
        'The level editor will still work without the game.',
    );
  }

  gameWindow.Module = {
    locateFile: (path: string) => assetUrl(app, path),
    canvas,
    print: (t: string) => console.log('[WASM]', t),
    printErr: (t: string) => console.warn('[WASM ERR]', t),
    setStatus: (t: string) => {
      if (t) {
        app.statusText.set(t);
        const m = t.match(/(\d+(?:\.\d+)?)\/(\d+)/);
        if (m) app.progressPct.set(Math.round((parseFloat(m[1]) / parseFloat(m[2])) * 100));
      } else {
        app.statusText.set('Running');
        app.progressPct.set(100);
        app.overlayVisible.set(false);
      }
    },
    monitorRunDependencies: (left: number) => {
      if (left === 0) app.progressPct.set(100);
    },
    onRuntimeInitialized: () => {
      app.statusText.set('Running');
      app.overlayVisible.set(false);
      app.gameRestarting.set(false);
      console.log('[Angular] WASM runtime initialized');
      applyVolumeToWasm(app, app.masterVolume());
      syncGameLoopWithActiveTab(app);
      if (app._pendingCustomResources) {
        mountCustomResourcesFs(app, app._pendingCustomResources);
        app._pendingCustomResources = null;
      }
      tryStartPendingEditorTestDrive(app, pendingRestartOptions?.launch ?? null);
      pendingRestartOptions = null;
    },
    preRun: [
      () => {
        const mod = gameWindow.Module;
        if (!mod?.addRunDependency || typeof indexedDB === 'undefined') return;
        mod.addRunDependency('customResourcesDat');
        const shouldInjectCustomResources = pendingRestartOptions?.useCustomResources ?? false;
        if (!shouldInjectCustomResources) {
          gameWindow.Module?.removeRunDependency?.('customResourcesDat');
          return;
        }
        AppStateResources._loadCustomResourcesDb()
          .then((entry: { bytes: Uint8Array; name: string } | null) => {
            if (entry) {
              const FS = (gameWindow as unknown as Record<string, unknown>)['FS'] as
                | { writeFile: (path: string, data: Uint8Array) => void }
                | undefined;
              if (FS) {
                try {
                  FS.writeFile('/resources.dat', entry.bytes);
                  console.log(
                    `[Angular] Injected custom resources.dat (${Math.round(entry.bytes.length / 1024)} KB) from IndexedDB`,
                  );
                } catch (err) {
                  console.warn('[Angular] Failed to inject custom resources.dat into MEMFS', err);
                }
              }
            }
          })
          .catch((err: unknown) => {
            console.warn('[Angular] Failed to read custom resources.dat from IndexedDB', err);
          })
          .finally(() => {
            gameWindow.Module?.removeRunDependency?.('customResourcesDat');
          });
      },
    ],
    postRun: [],
  };
}

export function loadWasmScript(app: App): void {
  if (app.wasmScript) return;
  const gameWindow = getGameWindow(app);
  const gameDocument = gameWindow?.document;
  if (!gameDocument?.body) {
    return;
  }
  app.wasmScript = gameDocument.createElement('script');
  app.wasmScript.src = assetUrl(app, 'reckless_drivin.js');
  app.wasmScript.async = true;
  app.wasmScript.onerror = () => {
    app.gameRestarting.set(false);
    app.statusText.set(
      'WASM bundle missing. Build `build_wasm/` and rerun `npm start` (see dev-readme.md).',
    );
    console.error('[Angular] Failed to load WASM JS module');
  };
  gameDocument.body.appendChild(app.wasmScript);
}

export function assetUrl(app: App, path: string): string {
  return new URL(path, document.baseURI).toString();
}

export async function readAssetBytes(app: App, path: string): Promise<Result<Uint8Array, string>> {
  const response = await fetch(assetUrl(app, path));
  if (!response.ok) {
    return err(
      `Could not fetch ${path} (HTTP ${response.status}). Run \`npm start\` again so dev assets are synced.`,
    );
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('text/html') || looksLikeHtml(bytes)) {
    return err(
      `${path} is not being served as a binary asset. Run \`cd angular-site && npm start\` again; it now auto-syncs default assets before launching the dev server.`,
    );
  }
  return ok(bytes);
}

export function looksLikeHtml(bytes: Uint8Array): boolean {
  const prefix = new TextDecoder().decode(bytes.slice(0, 32)).toLowerCase();
  return prefix.includes('<!doctype html') || prefix.includes('<html');
}

export function applyVolumeToWasm(app: App, pct: number): void {
  const mod = getGameModule(app);
  if (mod && typeof mod._set_wasm_master_volume === 'function') {
    mod._set_wasm_master_volume(pct / 100.0);
  }
}

export function syncGameLoopWithActiveTab(app: App): void {
  const mod = getGameModule(app);
  if (!mod) return;
  try {
    if (app.activeTab() === 'editor') mod.pauseMainLoop?.();
    else mod.resumeMainLoop?.();
    if (app.activeTab() === 'editor') mod.canvas?.blur();
  } catch {
    /* ignore */
  }
}

export async function onCustomResourcesFileSelected(app: App, event: Event): Promise<void> {
  const input = event.target as HTMLInputElement | null;
  const file = input?.files?.[0];
  if (!file) return;
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    app.customResourcesName.set(file.name);
    mountCustomResourcesFs(app, bytes);
    app.customResourcesPreset.set('uploaded');
    app.customOptionsPreset.set('manual');
  } catch (error) {
    app.editorError.set(error instanceof Error ? error.message : 'Failed to load file');
  }
}

export async function applyCustomResourcesPreset(
  app: App,
  preset: CustomResourcesPresetId,
): Promise<void> {
  if (preset === 'default') {
    clearCustomResources(app);
    app.customResourcesPreset.set('default');
    return;
  }

  if (preset === 'uploaded') {
    if (!app.customResourcesLoaded()) {
      app.snackBar.open('Load a custom resources.dat first.', 'Dismiss', {
        duration: 4000,
      });
      app.customResourcesPreset.set('default');
      return;
    }
    app.customResourcesPreset.set('uploaded');
    return;
  }

  const bytesResult = await readAssetBytes(app, TERMINATOR_RESOURCE_ASSET_PATH);
  bytesResult.match(
    (bytes) => {
      app.customResourcesName.set(TERMINATOR_RESOURCE_NAME);
      mountCustomResourcesFs(app, bytes);
      app.customResourcesPreset.set('terminator');
    },
    (error) => {
      app.editorError.set(error);
      app.snackBar.open('Could not load the Terminator preset resources.dat.', 'Dismiss', {
        duration: 5000,
        panelClass: 'snack-error',
      });
    },
  );
}

export function restartGameWithCustomResources(app: App): void {
  clearPendingEditorTestDriveLaunch();
  scheduleGameRestart(app, {
    useCustomResources: true,
    launch: null,
  });
}

export function restartIntoEditorTestDrive(app: App): void {
  const launch = buildPendingEditorTestDriveLaunch(app, true);
  if (!launch) {
    return;
  }
  if (!savePendingEditorTestDriveLaunch(launch)) {
    app.snackBar.open('Could not persist test drive options for restart.', 'Dismiss', {
      duration: 5000,
      panelClass: 'snack-error',
    });
    return;
  }
  scheduleGameRestart(app, {
    useCustomResources: true,
    launch,
  });
}

export function restartWithStartupOptions(app: App, useLevel: boolean): void {
  const launch = buildPendingEditorTestDriveLaunch(app, useLevel);
  if (!launch) {
    clearPendingEditorTestDriveLaunch();
  }
  if (launch && !savePendingEditorTestDriveLaunch(launch)) {
    app.snackBar.open('Could not persist test drive options for restart.', 'Dismiss', {
      duration: 5000,
      panelClass: 'snack-error',
    });
    return;
  }
  scheduleGameRestart(app, {
    useCustomResources: app.customResourcesPreset() !== 'default',
    launch,
  });
}

export function mountCustomResourcesFs(app: App, bytes: Uint8Array): void {
  const name = app.customResourcesName() ?? 'resources.dat';
  if (typeof indexedDB !== 'undefined') {
    AppStateResources._saveCustomResourcesDb(bytes, name).catch((err: unknown) => {
      console.warn('[Angular] Failed to save custom resources.dat to IndexedDB', err);
    });
  }

  try {
    const gameWindow = getGameWindow(app);
    const FS = (gameWindow as unknown as Record<string, unknown> | null)?.['FS'] as
      | { writeFile: (path: string, data: Uint8Array) => void }
      | undefined;
    if (!FS) {
      console.warn(
        '[Angular] Emscripten FS not available yet – bytes will be injected on next game runtime restart via IndexedDB',
      );
      app._pendingCustomResources = bytes;
      return;
    }
    FS.writeFile('/resources.dat', bytes);
    console.log('[Angular] Custom resources.dat written to MEMFS at /resources.dat');
  } catch (e) {
    console.warn(
      '[Angular] Could not write custom resources.dat to live MEMFS (will take effect on next game runtime restart)',
      e,
    );
  }

  app.customResourcesLoaded.set(true);
  app.statusText.set(
    `Custom resources.dat loaded (${Math.round(bytes.length / 1024)} KB). ` +
      'Click "Restart With Customisations" to restart the game runtime with the new resources.',
  );
}

export function clearCustomResources(app: App): void {
  app.customResourcesLoaded.set(false);
  app.customResourcesName.set(null);
  app.customResourcesPreset.set('default');
  app.customOptionsPreset.set(app.customSettingsPreset() === 'default' ? 'default' : 'manual');
  if (typeof indexedDB !== 'undefined') {
    AppStateResources._clearCustomResourcesDb().catch((err: unknown) => {
      console.warn('[Angular] Failed to clear custom resources.dat from IndexedDB', err);
    });
  }
  app._pendingCustomResources = null;
}

interface WorkerResponse {
  id: number;
  ok: boolean;
  cmd: string;
  result?: unknown;
  error?: string;
}
