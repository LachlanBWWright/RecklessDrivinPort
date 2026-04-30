import { Component, ChangeDetectionStrategy, EventEmitter, Input, Output } from '@angular/core';

const ADDON_LOCK = 1 << 3;
const ADDON_COP = 1 << 4;
const ADDON_TURBO = 1 << 5;
const ADDON_SPIKES = 1 << 6;

const BONUS_ROLL_LOCK = 1 << 0;
const BONUS_ROLL_MINES = 1 << 1;
const BONUS_ROLL_MISSILES = 1 << 2;
const BONUS_ROLL_SPIKES = 1 << 3;
const BONUS_ROLL_COP = 1 << 4;
const BONUS_ROLL_TURBO = 1 << 5;
const BONUS_ROLL_SCORE = 1 << 6;
const BONUS_ROLL_EXTRA_LIFE = 1 << 7;

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
  @Input() gameRestarting = false;
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
  @Output() restartGameWithCustomResources = new EventEmitter<void>();
  @Output() restartIntoEditorTestDrive = new EventEmitter<void>();
  @Output() clearCustomResources = new EventEmitter<void>();
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
}
