import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { FormControl, FormGroup } from '@angular/forms';

export type EntryForm = FormGroup<{
  typeRes: FormControl<number>;
  minOffs: FormControl<number>;
  maxOffs: FormControl<number>;
  probility: FormControl<number>;
  dir: FormControl<number>;
}>;

@Component({
  selector: 'app-editor-object-group-entry',
  templateUrl: './editor-object-group-entry.component.html',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditorObjectGroupEntryComponent {
  @Input() entryForm!: EntryForm;
  @Input() index = 0;
  @Input() groupId = 0;
  @Input() availableTypeIds: number[] = [];
  @Input() getObjTypeDimensionLabel: (typeRes: number) => string = () => '';
  @Input() getSpriteUrl: (typeRes: number) => string | null = () => null;
  @Input() workerBusy = false;
  @Output() deleteEntry = new EventEmitter<{ groupId: number; entryIndex: number }>();
  getTypeLabel(typeRes: number): string {
    const dims = this.getObjTypeDimensionLabel(typeRes);
    return dims ? `#${typeRes} · ${dims}` : `#${typeRes}`;
  }
  getDirArrowRotation(dir: number): string {
    const safeDir = Number.isFinite(dir) ? dir : 0;
    return `rotate(${(safeDir * 180) / Math.PI}deg)`;
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
  trackTypeOption(typeRes: number): number {
    return typeRes;
  }
}
