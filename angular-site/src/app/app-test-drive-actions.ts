import type { App } from './app';
import {
  clampTestDriveLevel,
  clampTestDrivePosition,
  parseOptionalInteger,
} from './app-test-drive-settings';
import { updateBitmask } from './app-customisation-actions';

export function setLevelNumber(app: App, rawValue: string): void {
  const trimmed = rawValue.trim();
  if (trimmed === '') {
    app.editorTestDriveLevelNumberOverride.set(null);
    return;
  }
  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isNaN(parsed)) {
    app.editorTestDriveLevelNumberOverride.set(
      clampTestDriveLevel(parsed, app.parsedLevels().length || 10),
    );
  }
}

export function setLevelEnabled(app: App, enabled: boolean): void {
  app.editorTestDriveLevelEnabled.set(enabled);
}
export function setUseStartY(app: App, enabled: boolean): void {
  app.editorTestDriveUseStartY.set(enabled);
}
export function setStartY(app: App, rawValue: string): void {
  const parsed = parseOptionalInteger(rawValue, 500);
  if (parsed !== null) app.editorTestDriveStartY.set(clampTestDrivePosition(parsed));
}
export function setUseObjectGroupStartY(app: App, enabled: boolean): void {
  app.editorTestDriveUseObjectGroupStartY.set(enabled);
}
export function setObjectGroupStartY(app: App, rawValue: string): void {
  const parsed = parseOptionalInteger(rawValue, 500);
  if (parsed !== null) app.editorTestDriveObjectGroupStartY.set(clampTestDrivePosition(parsed));
}
export function toggleForcedAddon(app: App, mask: number, checked: boolean): void {
  app.editorTestDriveForcedAddOns.set(
    updateBitmask(app.editorTestDriveForcedAddOns(), mask, checked),
  );
}
export function toggleDisabledBonusRoll(app: App, mask: number, checked: boolean): void {
  app.editorTestDriveDisabledBonusRollMask.set(
    updateBitmask(app.editorTestDriveDisabledBonusRollMask(), mask, checked),
  );
}
