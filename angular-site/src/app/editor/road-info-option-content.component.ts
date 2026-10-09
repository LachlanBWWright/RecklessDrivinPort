import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import type { RoadInfoOption } from '../level-editor.service';

@Component({
  selector: 'app-road-info-option-content',
  templateUrl: './road-info-option-content.component.html',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RoadInfoOptionContentComponent {
  @Input({ required: true }) option!: RoadInfoOption;
}
