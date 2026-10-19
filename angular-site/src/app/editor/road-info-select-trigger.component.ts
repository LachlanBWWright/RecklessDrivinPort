import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import type { RoadInfoOption } from '../level-editor.service';

@Component({
  selector: 'app-road-info-select-trigger',
  templateUrl: './road-info-select-trigger.component.html',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RoadInfoSelectTriggerComponent {
  @Input() value = 0;
  @Input() selected: RoadInfoOption | undefined;
  waterBackground(water: boolean): string {
    return water
      ? 'linear-gradient(135deg,#0a7a1e,#354ab5)'
      : 'linear-gradient(135deg,#555,#2c2c2c)';
  }
}
