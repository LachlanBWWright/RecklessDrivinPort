import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import type { EditorObjectGroupsSectionComponent } from './editor-object-groups-section.component';

@Component({
  selector: 'app-editor-object-groups-body',
  templateUrl: './editor-object-groups-body.component.html',
  host: {
    class: 'flex h-full min-h-0 min-w-0 flex-1',
  },
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditorObjectGroupsBodyComponent {
  @Input() groupsHelpTooltip = '';
  @Input() objectGroups: EditorObjectGroupsSectionComponent['objectGroups'] = [];
  @Input() selectedGroup!: EditorObjectGroupsSectionComponent['selectedGroup'];
  @Input() availableTypeIds: number[] = [];
  @Input()
  getObjTypeDimensionLabel!: EditorObjectGroupsSectionComponent['getObjTypeDimensionLabel'];
  @Input() getSpriteUrl!: EditorObjectGroupsSectionComponent['getSpriteUrl'];
  @Input() workerBusy = false;
  @Input() entryForms!: EditorObjectGroupsSectionComponent['entryForms'];
  @Input() objectGroupClass!: EditorObjectGroupsSectionComponent['objectGroupClass'];
  @Input() trackGroup!: EditorObjectGroupsSectionComponent['trackGroup'];
  @Input() trackEntry!: EditorObjectGroupsSectionComponent['trackEntry'];
  @Output() selectedObjectGroupIdChange = new EventEmitter<number>();
  @Output() addGroup = new EventEmitter<void>();
  @Output() deleteGroup = new EventEmitter<number>();
  @Output() addEntry = new EventEmitter<number>();
  @Output() deleteGroupEntry = new EventEmitter<{ groupId: number; entryIndex: number }>();
}
