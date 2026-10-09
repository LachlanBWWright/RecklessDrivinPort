import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import type { FormGroup } from '@angular/forms';
import type { ObjectTypeDefinition } from '../../../level-editor.service';

type ReferenceKind = 'object' | 'sound';
type ReferenceField = 'deathObj' | 'creationSound' | 'otherSound' | 'weaponObj';

type ReferenceOption = {
  field: ReferenceField;
  label: string;
  kind: ReferenceKind;
  emptyLabel: string;
};

@Component({
  selector: 'app-editor-object-type-references',
  templateUrl: './editor-object-type-references.component.html',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditorObjectTypeReferencesComponent {
  @Input({ required: true }) form!: FormGroup;
  @Input({ required: true }) type!: ObjectTypeDefinition;
  @Input() objectTypes: ObjectTypeDefinition[] = [];
  @Input() audioEntries: { id: number; sizeBytes: number; durationMs?: number }[] = [];
  @Input() fieldTooltips: Record<string, string> = {};
  @Input() getObjectTypeLabel: (typeRes: number) => string = (id) => '#' + id;
  @Input() getSoundLabel: (soundId: number) => string = (id) => '#' + id;

  readonly fields: ReferenceOption[] = [
    { field: 'deathObj', label: 'Death Object', kind: 'object', emptyLabel: 'None' },
    { field: 'creationSound', label: 'Creation Sound', kind: 'sound', emptyLabel: 'None' },
    { field: 'otherSound', label: 'Other Sound', kind: 'sound', emptyLabel: 'None' },
    { field: 'weaponObj', label: 'Weapon Object', kind: 'object', emptyLabel: 'None' },
  ];

  getValue(field: ReferenceField): number {
    return Number(this.form.get(field)?.value ?? this.type[field]);
  }

  options(field: ReferenceOption): { id: number; label: string }[] {
    if (field.kind === 'sound') {
      return this.audioEntries
        .filter((entry) => entry.id !== 0)
        .map((entry) => ({
          id: entry.id,
          label: this.getSoundLabel(entry.id),
        }));
    }
    return this.objectTypes
      .filter((type) => type.typeRes !== 0)
      .map((type) => ({ id: type.typeRes, label: this.getObjectTypeLabel(type.typeRes) }));
  }

  label(field: ReferenceOption, id: number): string {
    if (id === 0 || id === -1) return field.emptyLabel;
    return field.kind === 'sound' ? this.getSoundLabel(id) : this.getObjectTypeLabel(id);
  }

  hasCustom(field: ReferenceOption): boolean {
    const id = this.getValue(field.field);
    return id !== 0 && id !== -1 && !this.options(field).some((option) => option.id === id);
  }

  customLabel(field: ReferenceOption): string {
    return `${this.label(field, this.getValue(field.field))} (custom)`;
  }

  customOption(field: ReferenceOption): { value: number; text: string } {
    return { value: this.getValue(field.field), text: this.customLabel(field) };
  }
}
