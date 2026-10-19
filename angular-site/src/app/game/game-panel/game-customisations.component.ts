import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import type { GamePanelComponent } from './game-panel.component';

@Component({
  selector: 'app-game-customisations',
  templateUrl: './game-customisations.component.html',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GameCustomisationsComponent {
  @Input({ required: true }) state!: GamePanelComponent;

  get host(): GamePanelComponent {
    return this.state;
  }
  emitForcedAddon(mask: number, checked: boolean): void {
    this.host.editorTestDriveForcedAddonToggle.emit({ mask, checked });
  }
  emitDisabledBonusRoll(mask: number, checked: boolean): void {
    this.host.editorTestDriveDisabledBonusRollToggle.emit({ mask, checked });
  }
}
