export const ADDON_LOCK = 1 << 3;
export const ADDON_COP = 1 << 4;
export const ADDON_TURBO = 1 << 5;
export const ADDON_SPIKES = 1 << 6;

export const BONUS_ROLL_LOCK = 1 << 0;
export const BONUS_ROLL_MINES = 1 << 1;
export const BONUS_ROLL_MISSILES = 1 << 2;
export const BONUS_ROLL_SPIKES = 1 << 3;
export const BONUS_ROLL_COP = 1 << 4;
export const BONUS_ROLL_TURBO = 1 << 5;
export const BONUS_ROLL_SCORE = 1 << 6;
export const BONUS_ROLL_EXTRA_LIFE = 1 << 7;

export type CustomOptionsPresetId = 'manual' | 'default' | 'terminator';
export type CustomResourcesPresetId = 'default' | 'uploaded' | 'terminator';
export type CustomSettingsPresetId = 'manual' | 'default' | 'terminator';

export interface PresetOption<T extends string> {
  id: T;
  label: string;
  description: string;
}

export const CUSTOM_OPTIONS_PRESETS: PresetOption<CustomOptionsPresetId>[] = [
  {
    id: 'manual',
    label: 'Custom',
    description: 'Use the resource and settings dropdowns below as-is.',
  },
  {
    id: 'default',
    label: 'Default',
    description: 'Use the built-in resources.dat and default startup settings.',
  },
  {
    id: 'terminator',
    label: 'Terminator',
    description: 'Use the cop trucks resources preset and Terminator startup settings.',
  },
];

export const CUSTOM_RESOURCES_PRESETS: PresetOption<CustomResourcesPresetId>[] = [
  {
    id: 'default',
    label: 'Default resources.dat',
    description: 'Launch with the built-in game resources.',
  },
  {
    id: 'uploaded',
    label: 'Uploaded custom resources.dat',
    description: 'Launch with the custom resources.dat currently loaded in the browser.',
  },
  {
    id: 'terminator',
    label: 'Terminator cop trucks',
    description: 'Launch with the Terminator cop trucks resources.dat preset.',
  },
];

export const CUSTOM_SETTINGS_PRESETS: PresetOption<CustomSettingsPresetId>[] = [
  {
    id: 'manual',
    label: 'Custom',
    description: 'Keep the custom startup settings configured below.',
  },
  {
    id: 'default',
    label: 'Default',
    description: 'Reset custom startup settings to the standard defaults.',
  },
  {
    id: 'terminator',
    label: 'Terminator',
    description: 'Disable only the police jammer roll.',
  },
];

export const TERMINATOR_RESOURCE_ASSET_PATH = 'presets/resources_cop_trucks_terminator.dat';
export const TERMINATOR_RESOURCE_NAME = 'resources_cop_trucks_terminator.dat';
