import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { FormGroup } from '@angular/forms';
import type { RoadField, RoadInfoFormModel } from './road-info-form.component';

@Component({
  selector: 'app-road-info-field',
  templateUrl: './road-info-field.component.html',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RoadInfoFieldComponent {
  @Input({ required: true }) form!: FormGroup<RoadInfoFormModel>;
  @Input({ required: true }) field!: RoadField;
  @Input() tooltip = '';
  @Input() step: string | null = 'any';

  get isWater(): boolean {
    return this.field === 'water';
  }
}
