import type { App } from './app';
import {
  BONUS_ROLL_COP,
  type CustomOptionsPresetId,
  type CustomResourcesPresetId,
  type CustomSettingsPresetId,
} from './game/game-customisation-presets';
import { resetTestDriveSettings } from './app-test-drive-settings';

export function updateBitmask(value: number, mask: number, enabled: boolean): number {
  return enabled ? value | mask : value & ~mask;
}

export async function launchSelectedLevelPreview(
  app: App,
  levelResourceId: number,
  stripScripts: boolean,
): Promise<void> {
  app.editorError.set('');
  await app.runtime.saveEditedResourcesToGame(stripScripts);
  if (app.editorError()) return;
  app.editorTestDriveLevelEnabled.set(true);
  app.editorTestDriveLevelNumberOverride.set(app.levelDisplayNum(levelResourceId));
  app.activeTab.set('game');
  app.runtime.syncGameLoopWithActiveTab();
  app.runtime.restartIntoEditorTestDrive();
}

export async function setCustomOptionsPreset(
  app: App,
  preset: CustomOptionsPresetId,
): Promise<void> {
  app.customOptionsPreset.set(preset);
  if (preset === 'manual') return;
  const concretePreset = preset === 'default' ? 'default' : 'terminator';
  await setCustomResourcesPreset(app, concretePreset, false);
  setCustomSettingsPreset(app, concretePreset, false);
  app.customOptionsPreset.set(preset);
}

export async function setCustomResourcesPreset(
  app: App,
  preset: CustomResourcesPresetId,
  updateOptionsPreset: boolean,
): Promise<void> {
  const load = app.runtime.applyCustomResourcesPreset(preset);
  app.customResourcesPresetLoad = load;
  try {
    await load;
    if (updateOptionsPreset) syncCustomOptionsPreset(app);
  } finally {
    if (app.customResourcesPresetLoad === load) app.customResourcesPresetLoad = null;
  }
}

export function setCustomSettingsPreset(
  app: App,
  preset: CustomSettingsPresetId,
  updateOptionsPreset: boolean,
): void {
  app.customSettingsPreset.set(preset);
  if (preset === 'default') resetTestDriveSettings(app, 0);
  if (preset === 'terminator') resetTestDriveSettings(app, BONUS_ROLL_COP);
  if (updateOptionsPreset) syncCustomOptionsPreset(app);
}

function syncCustomOptionsPreset(app: App): void {
  const resources = app.customResourcesPreset();
  const settings = app.customSettingsPreset();
  app.customOptionsPreset.set(
    resources === 'default' && settings === 'default'
      ? 'default'
      : resources === 'terminator' && settings === 'terminator'
        ? 'terminator'
        : 'manual',
  );
}
