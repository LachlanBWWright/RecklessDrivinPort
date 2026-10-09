import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import type { EditorObjectsSectionComponent } from './editor-objects-section.component';
import type { VisibleObjectGroupSlot } from './editor-objects-section.component';

@Component({
  selector: 'app-editor-object-group-slot',
  templateUrl: './editor-object-group-slot.component.html',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditorObjectGroupSlotComponent {
  @Input({ required: true }) slot!: VisibleObjectGroupSlot;
  @Input() selectedObjectGroupSlotIndex: number | null = null;
  @Input() getObjectGroupLabel!: EditorObjectsSectionComponent['getObjectGroupLabel'];
  @Input() canPreviewObjectGroupSlot!: EditorObjectsSectionComponent['canPreviewObjectGroupSlot'];
  @Input() previewStartY = 0;
  @Input() levelEnd = 0;
  @Input() showGeneratedObjectGroupPreviews = false;
  @Input()
  isGeneratedObjectGroupPreviewEnabled!: EditorObjectsSectionComponent['isGeneratedObjectGroupPreviewEnabled'];
  @Input() regeneratePreviewForSlot!: EditorObjectsSectionComponent['regeneratePreviewForSlot'];
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
  @Output() selectSlot = new EventEmitter<number>();
}
