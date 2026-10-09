import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import type { EditorObjectGroupsSectionComponent } from './editor-object-groups-section.component';

@Component({
  selector: 'app-editor-object-group-entries-list',
  template: `<div class="flex flex-col gap-3">
    @for (entryForm of entryForms.controls; track $index) {
      <app-editor-object-group-entry
        [entryForm]="entryForm"
        [index]="$index"
        [groupId]="groupId"
        [availableTypeIds]="availableTypeIds"
        [getObjTypeDimensionLabel]="getObjTypeDimensionLabel"
        [getSpriteUrl]="getSpriteUrl"
        [workerBusy]="workerBusy"
        (deleteEntry)="deleteEntry.emit($event)"
      />
    }
  </div>`,
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditorObjectGroupEntriesListComponent {
  @Input({ required: true }) groupId = 0;
  @Input() entryForms!: EditorObjectGroupsSectionComponent['entryForms'];
  @Input() availableTypeIds: number[] = [];
  @Input()
  getObjTypeDimensionLabel!: EditorObjectGroupsSectionComponent['getObjTypeDimensionLabel'];
  @Input() getSpriteUrl!: EditorObjectGroupsSectionComponent['getSpriteUrl'];
  @Input() workerBusy = false;
  @Input() trackEntry!: EditorObjectGroupsSectionComponent['trackEntry'];
  @Output() deleteEntry = new EventEmitter<{ groupId: number; entryIndex: number }>();
}
