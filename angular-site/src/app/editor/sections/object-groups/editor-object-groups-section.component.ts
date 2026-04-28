import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
} from '@angular/core';
import { FormArray, FormControl, FormGroup } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import type { ObjectGroupDefinition, ObjectGroupEntryData } from '../../../level-editor.service';

type EntryField = keyof ObjectGroupEntryData;
type EntryForm = FormGroup<{
  typeRes: FormControl<number>;
  minOffs: FormControl<number>;
  maxOffs: FormControl<number>;
  probility: FormControl<number>;
  dir: FormControl<number>;
}>;

@Component({
  selector: 'app-editor-object-groups-section',
  templateUrl: './editor-object-groups-section.component.html',
  host: {
    class: 'flex min-h-0 w-full flex-1 flex-col',
  },
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditorObjectGroupsSectionComponent implements OnChanges {
  @Input() objectGroups: ObjectGroupDefinition[] = [];
  @Input() selectedObjectGroupId: number | null = null;
  @Input() availableTypeIds: number[] = [];
  @Input() getObjTypeDimensionLabel: (typeRes: number) => string = () => '';
  @Input() getSpriteUrl: (typeRes: number) => string | null = () => null;
  @Input() groupsDirty = false;
  @Input() workerBusy = false;

  @Output() selectedObjectGroupIdChange = new EventEmitter<number>();
  @Output() addGroup = new EventEmitter<void>();
  @Output() deleteGroup = new EventEmitter<number>();
  @Output() addEntry = new EventEmitter<number>();
  @Output() deleteEntry = new EventEmitter<{ groupId: number; entryIndex: number }>();
  @Output() entryInput = new EventEmitter<{
    groupId: number;
    entryIndex: number;
    field: EntryField;
    value: number;
  }>();
  @Output() saveObjectGroups = new EventEmitter<void>();

  readonly entryForms = new FormArray<EntryForm>([]);
  private syncedGroupId: number | null = null;

  get selectedGroup(): ObjectGroupDefinition | null {
    if (this.selectedObjectGroupId === null) return null;
    return this.objectGroups.find((group) => group.id === this.selectedObjectGroupId) ?? null;
  }

  getTypeLabel(typeRes: number): string {
    const dims = this.getObjTypeDimensionLabel(typeRes);
    return dims ? `#${typeRes} · ${dims}` : `#${typeRes}`;
  }

  getSpriteLabel(typeRes: number): string {
    return this.getTypeLabel(typeRes);
  }

  constructor() {
    this.entryForms.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      this.emitEntryChanges();
    });
  }

  getDirArrowRotation(dir: number): string {
    const safeDir = Number.isFinite(dir) ? dir : 0;
    const rotation = (safeDir * 180) / Math.PI;
    return `rotate(${rotation}deg)`;
  }

  isAutoDir(dir: number): boolean {
    return dir === -1;
  }

  getDirLabel(dir: number): string {
    return this.isAutoDir(dir) ? 'Auto / track-aligned' : `dir ${dir.toFixed(2)}`;
  }

  hasCustomType(typeRes: number): boolean {
    return !this.availableTypeIds.includes(typeRes);
  }

  trackGroup(_index: number, group: ObjectGroupDefinition): number {
    return group.id;
  }

  trackEntry(index: number): number {
    return index;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['objectGroups'] || changes['selectedObjectGroupId']) {
      this.syncEntryForms();
    }
    if (changes['workerBusy']) {
      if (this.workerBusy) {
        this.entryForms.disable({ emitEvent: false });
      } else {
        this.entryForms.enable({ emitEvent: false });
      }
    }
  }

  private createEntryForm(entry: ObjectGroupEntryData): EntryForm {
    return new FormGroup({
      typeRes: new FormControl(entry.typeRes, { nonNullable: true }),
      minOffs: new FormControl(entry.minOffs, { nonNullable: true }),
      maxOffs: new FormControl(entry.maxOffs, { nonNullable: true }),
      probility: new FormControl(entry.probility, { nonNullable: true }),
      dir: new FormControl(entry.dir, { nonNullable: true }),
    });
  }

  private syncEntryForms(): void {
    const group = this.selectedGroup;
    if (!group) {
      this.syncedGroupId = null;
      this.entryForms.clear({ emitEvent: false });
      return;
    }
    if (this.syncedGroupId !== group.id || this.entryForms.length !== group.entries.length) {
      this.syncedGroupId = group.id;
      this.entryForms.clear({ emitEvent: false });
      for (const entry of group.entries) {
        this.entryForms.push(this.createEntryForm(entry));
      }
      return;
    }
    group.entries.forEach((entry, idx) => {
      // Keep row controls stable while still reflecting external updates.
      this.entryForms.at(idx).patchValue(entry, { emitEvent: false });
    });
  }

  private emitEntryChanges(): void {
    const group = this.selectedGroup;
    if (!group) return;
    const forms = this.entryForms.controls;
    const entries = group.entries;
    const limit = Math.min(forms.length, entries.length);
    for (let entryIndex = 0; entryIndex < limit; entryIndex++) {
      const next = forms[entryIndex].getRawValue();
      const current = entries[entryIndex];
      const fields: EntryField[] = ['typeRes', 'minOffs', 'maxOffs', 'probility', 'dir'];
      for (const field of fields) {
        const value = next[field];
        if (value !== current[field]) {
          this.entryInput.emit({
            groupId: group.id,
            entryIndex,
            field,
            value: Number(value),
          });
        }
      }
    }
  }

  trackTypeOption(typeRes: number): number {
    return typeRes;
  }
}
