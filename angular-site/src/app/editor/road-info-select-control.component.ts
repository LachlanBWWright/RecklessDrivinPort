import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import type { RoadInfoOption } from '../level-editor.service';

@Component({
  selector: 'app-road-info-select-control',
  templateUrl: './road-info-select-control.component.html',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RoadInfoSelectControlComponent {
  @Input() value = 0;
  @Input() options: RoadInfoOption[] = [];
  @Input() disabled = false;
  @Input() selected: RoadInfoOption | undefined;
  @Output() valueChange = new EventEmitter<number>();
}
