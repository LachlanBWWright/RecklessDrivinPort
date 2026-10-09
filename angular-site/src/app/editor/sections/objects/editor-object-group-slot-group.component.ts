import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import type {
  EditorObjectsSectionComponent,
  VisibleObjectGroupSlot,
} from './editor-objects-section.component';

@Component({
  selector: 'app-editor-object-group-slot-group',
  templateUrl: './editor-object-group-slot-group.component.html',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditorObjectGroupSlotGroupComponent {
  @Input({ required: true }) slot!: VisibleObjectGroupSlot;
  @Input() getObjectGroupLabel!: EditorObjectsSectionComponent['getObjectGroupLabel'];
  @Input() canPreviewObjectGroupSlot!: EditorObjectsSectionComponent['canPreviewObjectGroupSlot'];
  @Input()
  isGeneratedObjectGroupPreviewEnabled!: EditorObjectsSectionComponent['isGeneratedObjectGroupPreviewEnabled'];
  @Input()
  getGeneratedObjectGroupPreviewCount!: EditorObjectsSectionComponent['getGeneratedObjectGroupPreviewCount'];
  @Input()
  toggleGeneratedPreviewForSlot!: EditorObjectsSectionComponent['toggleGeneratedPreviewForSlot'];
  @Input() getPreviewEntries!: EditorObjectsSectionComponent['getPreviewEntries'];
  @Input() trackPreviewEntry!: EditorObjectsSectionComponent['trackPreviewEntry'];
  @Input() getTypeLabel!: EditorObjectsSectionComponent['getTypeLabel'];
  @Input() getRelativeOddsLabel!: EditorObjectsSectionComponent['getRelativeOddsLabel'];
  @Input() getPreviewRotationDegrees!: EditorObjectsSectionComponent['getPreviewRotationDegrees'];
  @Input()
  getPreviewSpriteRotationDegrees!: EditorObjectsSectionComponent['getPreviewSpriteRotationDegrees'];
  @Input() getSpriteUrl!: EditorObjectsSectionComponent['getSpriteUrl'];
  @Input() getPreviewOverflowCount!: EditorObjectsSectionComponent['getPreviewOverflowCount'];
  @Input() getOffsetSummary!: EditorObjectsSectionComponent['getOffsetSummary'];
  @Input() trackGroupEntry!: EditorObjectsSectionComponent['trackGroupEntry'];
}
