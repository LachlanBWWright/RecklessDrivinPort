import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import type { FormGroup } from '@angular/forms';

type CoreField = {
  name: string;
  label: string;
  inputMode: 'numeric' | 'decimal';
};

@Component({
  selector: 'app-editor-object-type-core-fields',
  templateUrl: './editor-object-type-core-fields.component.html',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditorObjectTypeCoreFieldsComponent {
  @Input({ required: true }) form!: FormGroup;
  @Input() tooltips: Record<string, string> = {};

  readonly fields: CoreField[] = [
    { name: 'numFrames', label: 'Frame Count', inputMode: 'numeric' },
    { name: 'frameDuration', label: 'Frame Duration', inputMode: 'decimal' },
    { name: 'mass', label: 'Mass', inputMode: 'decimal' },
    { name: 'maxEngineForce', label: 'Engine Force', inputMode: 'decimal' },
    { name: 'maxNegEngineForce', label: 'Reverse Force', inputMode: 'decimal' },
    { name: 'friction', label: 'Friction', inputMode: 'decimal' },
    { name: 'steering', label: 'Steering', inputMode: 'decimal' },
    { name: 'wheelWidth', label: 'Wheel Width', inputMode: 'decimal' },
    { name: 'wheelLength', label: 'Wheel Length', inputMode: 'decimal' },
    { name: 'width', label: 'Collision Width', inputMode: 'decimal' },
    { name: 'length', label: 'Collision Length', inputMode: 'decimal' },
    { name: 'score', label: 'Score', inputMode: 'numeric' },
    { name: 'maxDamage', label: 'Max Damage', inputMode: 'decimal' },
    { name: 'weaponInfo', label: 'Weapon Info', inputMode: 'numeric' },
  ];
}
