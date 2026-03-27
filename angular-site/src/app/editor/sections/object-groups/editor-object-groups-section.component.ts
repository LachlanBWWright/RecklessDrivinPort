import { Component, ChangeDetectionStrategy, EventEmitter, Input, Output } from '@angular/core';
import type { ObjectGroupDefinition, ObjectGroupEntryData } from '../../../level-editor.service';

@Component({
  selector: 'app-editor-object-groups-section',
  templateUrl: './editor-object-groups-section.component.html',
  styleUrl: './editor-object-groups-section.component.scss',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditorObjectGroupsSectionComponent {
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
    field: keyof ObjectGroupEntryData;
    event: Event;
  }>();
  @Output() saveObjectGroups = new EventEmitter<void>();

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

  onTypeResChange(groupId: number, entryIndex: number, typeRes: number): void {
    this.entryInput.emit({
      groupId,
      entryIndex,
      field: 'typeRes',
      event: { target: { value: String(typeRes) } } as unknown as Event,
    });
  }

  trackTypeOption(typeRes: number): number {
    return typeRes;
  }
}
