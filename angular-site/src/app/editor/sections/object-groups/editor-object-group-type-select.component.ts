import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import type { FormGroup } from '@angular/forms';

@Component({
  selector: 'app-editor-object-group-type-select',
  templateUrl: './editor-object-group-type-select.component.html',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditorObjectGroupTypeSelectComponent {
  @Input({ required: true }) form!: FormGroup;
  @Input() availableTypeIds: number[] = [];
  @Input() getSpriteUrl: (typeRes: number) => string | null = () => null;
  @Input() getObjTypeDimensionLabel: (typeRes: number) => string = () => '';

  get typeRes(): number {
    return Number(this.form.get('typeRes')?.value ?? 0);
  }

  get direction(): number {
    return Number(this.form.get('dir')?.value ?? 0);
  }

  getTypeLabel(typeRes: number): string {
    const dims = this.getObjTypeDimensionLabel(typeRes);
    return dims ? '#' + typeRes + ' · ' + dims : '#' + typeRes;
  }

  getDirectionLabel(): string {
    return this.direction === -1 ? 'Auto / track-aligned' : 'dir ' + this.direction.toFixed(2);
  }

  hasCustomType(): boolean {
    return !this.availableTypeIds.includes(this.typeRes);
  }
}
