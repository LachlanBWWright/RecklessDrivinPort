import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import type { RoadInfoOption } from '../level-editor.service';

@Component({
  selector: 'app-road-info-selector',
  templateUrl: './road-info-selector.component.html',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RoadInfoSelectorComponent {
  @Input() value = 0;
  @Input() options: RoadInfoOption[] = [];
  @Input() disabled = false;
  @Output() valueChange = new EventEmitter<number>();

  get selected(): RoadInfoOption | undefined {
    return this.options.find((option) => option.id === this.value);
  }
}
