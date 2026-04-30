import { err, ok, type Result } from 'neverthrow';
import { App } from './app';
import { AppStateResources } from './app-state-resources';

type EventListenerLike = EventListenerOrEventListenerObject;

interface EmscriptenModuleLike {
  canvas?: HTMLCanvasElement;
  pauseMainLoop?: () => void;
  resumeMainLoop?: () => void;
  _set_wasm_master_volume?: (vol: number) => void;
  _rd_set_editor_launch_options?: (
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

let keyboardGateInstalled = false;
let xhrOpenPatched = false;
let activeTabGetter: (() => 'game' | 'editor') | null = null;
let pendingRestartOptions: PendingGameRestartOptions | null = null;

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  ) {
    return true;
  }
  return (
    target.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""]') !==
    null
  );
}

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

function buildPendingEditorTestDriveLaunch(app: App): PendingEditorTestDriveLaunch {
  const maxLevel = Math.max(1, app.parsedLevels().length || 10);
  return {
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

  const mod = window.Module as EmscriptenModuleLike | undefined;
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
  console.log('[Angular] Setting editor test drive launch options for level', launch.levelNumber);
  mod._rd_set_editor_launch_options(
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

function scheduleGameRestart(app: App, options: PendingGameRestartOptions): void {
  if (!savePendingRestartOptions(options)) {
    app.snackBar.open('Could not persist restart options.', 'Dismiss', {
      duration: 5000,
      panelClass: 'snack-error',
    });
    return;
  }
  app.gameRestarting.set(true);
  window.location.reload();
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
  const canvasEl = document.getElementById('canvas');
  if (!(canvasEl instanceof HTMLCanvasElement)) return;
  const canvas = canvasEl;
  activeTabGetter = () => app.activeTab();
  installKeyboardGate(canvas);
  patchXmlHttpRequestProgress(app);
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

  window.Module = {
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
        const mod = window.Module;
        if (!mod?.addRunDependency || typeof indexedDB === 'undefined') return;
        mod.addRunDependency('customResourcesDat');
        const shouldInjectCustomResources = pendingRestartOptions?.useCustomResources ?? true;
        if (!shouldInjectCustomResources) {
          window.Module?.removeRunDependency?.('customResourcesDat');
          return;
        }
        AppStateResources._loadCustomResourcesDb()
          .then((entry: { bytes: Uint8Array; name: string } | null) => {
            if (entry) {
              const FS = (window as unknown as Record<string, unknown>)['FS'] as
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
            window.Module?.removeRunDependency?.('customResourcesDat');
          });
      },
    ],
    postRun: [],
  };
}

function patchXmlHttpRequestProgress(app: App): void {
  if (xhrOpenPatched) return;
  const origOpen = XMLHttpRequest.prototype.open;
  const self = app;
  XMLHttpRequest.prototype.open = function (
    this: XMLHttpRequest,
    method: string,
    url: string,
    asyncFlag: boolean = true,
    user?: string,
    password?: string,
  ): void {
    if (url && url.indexOf('.data') !== -1) {
      this.addEventListener('progress', (e: ProgressEvent) => {
        if (e.lengthComputable) self.progressPct.set(Math.round((e.loaded / e.total) * 100));
      });
    }
    origOpen.call(this, method, url, asyncFlag, user, password);
  } as typeof XMLHttpRequest.prototype.open;
  xhrOpenPatched = true;
}

function installKeyboardGate(canvas: HTMLCanvasElement): void {
  if (keyboardGateInstalled || typeof EventTarget === 'undefined') return;
  const origAddEventListener = EventTarget.prototype.addEventListener;

  EventTarget.prototype.addEventListener = function (
    this: EventTarget,
    type: string,
    listener: EventListenerLike | null,
    options?: boolean | AddEventListenerOptions,
  ): void {
    const isKeyEvent = type === 'keydown' || type === 'keyup' || type === 'keypress';
    const targetIsGameSurface = this === document || this === window || this === canvas;
    if (isKeyEvent && targetIsGameSurface) {
      if (listener === null) {
        origAddEventListener.call(this, type, listener, options);
        return;
      }
      if (typeof listener === 'function') {
        const wrapped: EventListener = function (this: EventTarget, event: Event): unknown {
          if (activeTabGetter?.() !== 'game') return undefined;
          if (isEditableTarget(event.target)) return undefined;
          return listener.call(this, event);
        };
        origAddEventListener.call(this, type, wrapped, options);
        return;
      }
      const wrappedListener: EventListenerObject = {
        handleEvent(event: Event): void {
          if (activeTabGetter?.() !== 'game') return;
          if (isEditableTarget(event.target)) return;
          listener.handleEvent(event);
        },
      };
      origAddEventListener.call(this, type, wrappedListener, options);
      return;
    }
    origAddEventListener.call(this, type, listener, options);
  } as typeof EventTarget.prototype.addEventListener;

  keyboardGateInstalled = true;
}

export function loadWasmScript(app: App): void {
  if (app.wasmScript) return;
  app.wasmScript = document.createElement('script');
  app.wasmScript.src = assetUrl(app, 'reckless_drivin.js');
  app.wasmScript.async = true;
  app.wasmScript.onerror = () => {
    app.statusText.set(
      'WASM bundle missing. Build `build_wasm/` and rerun `npm start` (see dev-readme.md).',
    );
    console.error('[Angular] Failed to load WASM JS module');
  };
  document.body.appendChild(app.wasmScript);
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
  const mod = window.Module;
  if (mod && typeof mod._set_wasm_master_volume === 'function') {
    mod._set_wasm_master_volume(pct / 100.0);
  }
}

export function syncGameLoopWithActiveTab(app: App): void {
  const mod = window.Module as EmscriptenModuleLike | undefined;
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
    mountCustomResourcesFs(app, bytes);
  } catch (error) {
    app.editorError.set(error instanceof Error ? error.message : 'Failed to load file');
  }
}

export function restartGameWithCustomResources(app: App): void {
  scheduleGameRestart(app, {
    useCustomResources: true,
    launch: null,
  });
}

export function restartIntoEditorTestDrive(app: App): void {
  const launch = buildPendingEditorTestDriveLaunch(app);
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

export function restartWithStartupOptions(
  app: App,
  useCustomResources: boolean,
  useEditorTestDrive: boolean,
): void {
  const launch = useEditorTestDrive ? buildPendingEditorTestDriveLaunch(app) : null;
  if (launch && !savePendingEditorTestDriveLaunch(launch)) {
    app.snackBar.open('Could not persist test drive options for restart.', 'Dismiss', {
      duration: 5000,
      panelClass: 'snack-error',
    });
    return;
  }
  scheduleGameRestart(app, {
    useCustomResources,
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
    const FS = (window as unknown as Record<string, unknown>)['FS'] as
      | { writeFile: (path: string, data: Uint8Array) => void }
      | undefined;
    if (!FS) {
      console.warn(
        '[Angular] Emscripten FS not available yet – bytes will be injected on next page load via IndexedDB',
      );
      app._pendingCustomResources = bytes;
      return;
    }
    FS.writeFile('/resources.dat', bytes);
    console.log('[Angular] Custom resources.dat written to MEMFS at /resources.dat');
  } catch (e) {
    console.warn(
      '[Angular] Could not write custom resources.dat to live MEMFS (will take effect on page reload)',
      e,
    );
  }

  app.customResourcesLoaded.set(true);
  app.statusText.set(
    `Custom resources.dat loaded (${Math.round(bytes.length / 1024)} KB). ` +
      'Click "Restart Game" to reload the page with the new resources.',
  );
}

export function clearCustomResources(app: App): void {
  app.customResourcesLoaded.set(false);
  app.customResourcesName.set(null);
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
