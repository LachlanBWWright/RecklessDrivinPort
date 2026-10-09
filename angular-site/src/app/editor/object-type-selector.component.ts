import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { FormControl, FormGroup } from '@angular/forms';

type InspectorForm = FormGroup<{
  dirDegText: FormControl<string>;
  typeRes: FormControl<number | null>;
}>;

@Component({
  selector: 'app-object-type-selector',
  templateUrl: './object-type-selector.component.html',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ObjectTypeSelectorComponent {
  @Input({ required: true }) form!: InspectorForm;
  @Input() editTypeRes = 128;
  @Input() availableTypeIds: number[] = [];
  @Input() getSpriteUrl: (typeRes: number) => string | null = () => null;
  @Input() getFallbackColor: (typeRes: number) => string = () => '#888';
  @Output() typeResChange = new EventEmitter<number>();

  get currentType(): number {
    return this.form.controls.typeRes.value ?? this.editTypeRes;
  }

  get hasCustomType(): boolean {
    return !this.availableTypeIds.includes(this.currentType);
  }
}
