import type { App } from './app';

export function parseOptionalInteger(rawValue: string, fallback: number): number | null {
  const trimmed = rawValue.trim();
  const parsed = trimmed === '' ? fallback : Number.parseInt(trimmed, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

export function clampTestDriveLevel(levelNumber: number, maxLevel: number): number {
  return Math.max(1, Math.min(Math.max(1, maxLevel), Math.round(levelNumber)));
}

export function clampTestDrivePosition(position: number): number {
  return Math.max(0, Math.round(position));
}

export function resetTestDriveSettings(app: App, disabledBonusRollMask: number): void {
  app.editorTestDriveUseStartY.set(false);
  app.editorTestDriveStartY.set(500);
  app.editorTestDriveUseObjectGroupStartY.set(false);
  app.editorTestDriveObjectGroupStartY.set(500);
  app.editorTestDriveForcedAddOns.set(0);
  app.editorTestDriveDisabledBonusRollMask.set(disabledBonusRollMask);
}
