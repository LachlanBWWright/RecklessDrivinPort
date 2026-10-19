import type { App } from './app';

import type { PendingEditorTestDriveLaunch, PendingGameRestartOptions } from './app-platform';

export const EDITOR_TEST_DRIVE_STORAGE_KEY = 'reckless-drivin-editor-test-drive';
export const RESTART_OPTIONS_STORAGE_KEY = 'reckless-drivin-restart-options';

function restoreLaunchOptions(
  launch: Partial<PendingEditorTestDriveLaunch> & { levelNumber?: unknown },
): PendingEditorTestDriveLaunch | null {
  if (typeof launch.levelNumber !== 'number') return null;
  return {
    enabled: launch.enabled !== false,
    autoStart: launch.autoStart === true,
    levelNumber: launch.levelNumber,
    hasStartY: launch.hasStartY === true,
    startY: clampNonNegativeInteger(launch.startY ?? 500, 500),
    hasObjectGroupStartY: launch.hasObjectGroupStartY === true,
    objectGroupStartY: clampNonNegativeInteger(launch.objectGroupStartY ?? 500, 500),
    forcedAddOns: clampNonNegativeInteger(launch.forcedAddOns ?? 0, 0),
    disabledBonusRollMask: clampNonNegativeInteger(launch.disabledBonusRollMask ?? 0, 0),
  };
}

export function clampNonNegativeInteger(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.round(value));
}

function clampLevelNumber(value: number, maxLevel: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.min(maxLevel, Math.round(value)));
}

export function buildPendingEditorTestDriveLaunch(
  app: App,
  autoStart: boolean,
): PendingEditorTestDriveLaunch | null {
  const maxLevel = Math.max(1, app.parsedLevels().length || 10);
  const hasSettings =
    app.editorTestDriveUseStartY() ||
    app.editorTestDriveUseObjectGroupStartY() ||
    app.editorTestDriveForcedAddOns() !== 0 ||
    app.editorTestDriveDisabledBonusRollMask() !== 0;
  if (!autoStart && !hasSettings) return null;
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

export function savePendingEditorTestDriveLaunch(launch: PendingEditorTestDriveLaunch): boolean {
  try {
    sessionStorage.setItem(EDITOR_TEST_DRIVE_STORAGE_KEY, JSON.stringify(launch));
    return true;
  } catch (error) {
    console.warn('[Angular] Failed to persist pending editor test drive launch', error);
    return false;
  }
}

export function clearPendingEditorTestDriveLaunch(): void {
  try {
    sessionStorage.removeItem(EDITOR_TEST_DRIVE_STORAGE_KEY);
  } catch (error) {
    console.warn('[Angular] Failed to clear pending editor test drive launch', error);
  }
}

export function consumePendingEditorTestDriveLaunch(): PendingEditorTestDriveLaunch | null {
  try {
    const raw = sessionStorage.getItem(EDITOR_TEST_DRIVE_STORAGE_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(EDITOR_TEST_DRIVE_STORAGE_KEY);
    const parsed = JSON.parse(raw) as Partial<PendingEditorTestDriveLaunch>;
    return restoreLaunchOptions(parsed);
  } catch (error) {
    console.warn('[Angular] Failed to restore pending editor test drive launch', error);
    return null;
  }
}

export function savePendingRestartOptions(options: PendingGameRestartOptions): boolean {
  try {
    sessionStorage.setItem(RESTART_OPTIONS_STORAGE_KEY, JSON.stringify(options));
    return true;
  } catch (error) {
    console.warn('[Angular] Failed to persist restart options', error);
    return false;
  }
}

export function consumePendingRestartOptions(): PendingGameRestartOptions | null {
  try {
    const raw = sessionStorage.getItem(RESTART_OPTIONS_STORAGE_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(RESTART_OPTIONS_STORAGE_KEY);
    const parsed = JSON.parse(raw) as Partial<PendingGameRestartOptions>;
    const launch = parsed.launch;
    return {
      useCustomResources: parsed.useCustomResources !== false,
      launch: launch ? restoreLaunchOptions(launch) : null,
    };
  } catch (error) {
    console.warn('[Angular] Failed to restore restart options', error);
    return null;
  }
}
