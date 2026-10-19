import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import type { CustomOptionsPresetId, PresetOption } from '../game-customisation-presets';

@Component({
  selector: 'app-game-custom-options-select',
  templateUrl: './game-custom-options-select.component.html',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GameCustomOptionsSelectComponent {
  @Input() pendingPreset: CustomOptionsPresetId = 'manual';
  @Input() presets: readonly PresetOption<CustomOptionsPresetId>[] = [];
  @Output() pendingPresetChange = new EventEmitter<CustomOptionsPresetId>();
}
