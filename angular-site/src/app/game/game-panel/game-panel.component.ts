import { Component, ChangeDetectionStrategy, EventEmitter, Input, Output } from '@angular/core';
import {
  ADDON_COP,
  ADDON_LOCK,
  ADDON_SPIKES,
  ADDON_TURBO,
  BONUS_ROLL_COP,
  BONUS_ROLL_EXTRA_LIFE,
  BONUS_ROLL_LOCK,
  BONUS_ROLL_MINES,
  BONUS_ROLL_MISSILES,
  BONUS_ROLL_SCORE,
  BONUS_ROLL_SPIKES,
  BONUS_ROLL_TURBO,
  CUSTOM_OPTIONS_PRESETS,
  CUSTOM_RESOURCES_PRESETS,
  CUSTOM_SETTINGS_PRESETS,
  type CustomOptionsPresetId,
  type CustomResourcesPresetId,
  type CustomSettingsPresetId,
} from '../game-customisation-presets';

@Component({
  selector: 'app-game-panel',
  templateUrl: './game-panel.component.html',
  host: {
    class: 'flex min-h-0 flex-1 flex-col w-full',
  },
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GamePanelComponent {
  @Input() activeTab: 'game' | 'editor' = 'game';
  @Input() statusText = '';
  @Input() progressPct = 0;
  @Input() overlayVisible = true;
  @Input() masterVolume = 80;
  @Input() customResourcesLoaded = false;
  @Input() customResourcesName: string | null = null;
  @Input() customOptionsPreset: CustomOptionsPresetId = 'manual';
  @Input() customResourcesPreset: CustomResourcesPresetId = 'default';
  @Input() customSettingsPreset: CustomSettingsPresetId = 'manual';
  @Input() gameRestarting = false;
  @Input() editorTestDriveLevelEnabled = true;
  @Input() editorTestDriveLevelNumber = 1;
  @Input() editorTestDriveUseStartY = false;
  @Input() editorTestDriveStartY = 500;
  @Input() editorTestDriveUseObjectGroupStartY = false;
  @Input() editorTestDriveObjectGroupStartY = 500;
  @Input() editorTestDriveForcedAddOns = 0;
  @Input() editorTestDriveDisabledBonusRollMask = 0;

  @Output() toggleFullscreen = new EventEmitter<void>();
  @Output() volumeChange = new EventEmitter<number>();
  @Output() customResourcesFileSelected = new EventEmitter<Event>();
  @Output() customOptionsPresetChange = new EventEmitter<CustomOptionsPresetId>();
  @Output() customResourcesPresetChange = new EventEmitter<CustomResourcesPresetId>();
  @Output() customSettingsPresetChange = new EventEmitter<CustomSettingsPresetId>();
  @Output() restartWithStartupOptions = new EventEmitter<{
    useLevel: boolean;
  }>();
  @Output() clearCustomResources = new EventEmitter<void>();
  @Output() editorTestDriveLevelEnabledChange = new EventEmitter<boolean>();
  @Output() editorTestDriveLevelNumberInput = new EventEmitter<string>();
  @Output() editorTestDriveUseStartYChange = new EventEmitter<boolean>();
  @Output() editorTestDriveStartYInput = new EventEmitter<string>();
  @Output() editorTestDriveUseObjectGroupStartYChange = new EventEmitter<boolean>();
  @Output() editorTestDriveObjectGroupStartYInput = new EventEmitter<string>();
  @Output() editorTestDriveForcedAddonToggle = new EventEmitter<{
    mask: number;
    checked: boolean;
  }>();
  @Output() editorTestDriveDisabledBonusRollToggle = new EventEmitter<{
    mask: number;
    checked: boolean;
  }>();

  readonly customOptionsPresetOptions = CUSTOM_OPTIONS_PRESETS;
  readonly customResourcesPresetOptions = CUSTOM_RESOURCES_PRESETS;
  readonly customSettingsPresetOptions = CUSTOM_SETTINGS_PRESETS;

  readonly forcedAddonOptions = [
    { mask: ADDON_LOCK, label: 'Lock', description: 'Start with Addons Locked.' },
    { mask: ADDON_COP, label: 'Police jammer', description: 'Start with the cop jammer active.' },
    { mask: ADDON_TURBO, label: 'Turbo engine', description: 'Start with turbo active.' },
    { mask: ADDON_SPIKES, label: 'Spikes', description: 'Start with side spikes active.' },
  ];

  readonly disabledBonusRollOptions = [
    { mask: BONUS_ROLL_LOCK, label: 'Lock roll' },
    { mask: BONUS_ROLL_MINES, label: 'Mines roll' },
    { mask: BONUS_ROLL_MISSILES, label: 'Missiles roll' },
    { mask: BONUS_ROLL_SPIKES, label: 'Spikes roll' },
    { mask: BONUS_ROLL_COP, label: 'Police jammer roll' },
    { mask: BONUS_ROLL_TURBO, label: 'Turbo roll' },
    { mask: BONUS_ROLL_SCORE, label: 'Score award roll' },
    { mask: BONUS_ROLL_EXTRA_LIFE, label: 'Extra life roll' },
  ];

  hasMask(value: number, mask: number): boolean {
    return (value & mask) !== 0;
  }

  get customResourcesSummary(): string {
    if (this.customResourcesPreset === 'default') {
      return 'Built-in resources.dat';
    }
    return this.customResourcesName ?? 'Custom resources.dat ready';
  }
}
