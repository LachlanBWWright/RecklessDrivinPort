import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import type { EditorObjectsSectionComponent } from './editor-objects-section.component';

@Component({
  selector: 'app-editor-objects-groups-panel',
  templateUrl: './editor-objects-groups-panel.component.html',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditorObjectsGroupsPanelComponent {
  @Input() groupsTabHelpTooltip = '';
  @Input() visibleObjectGroupSlots: EditorObjectsSectionComponent['visibleObjectGroupSlots'] = [];
  @Input() selectedObjectGroupSlotIndex: number | null = null;
  @Input() previewStartY = 0;
  @Input() levelEnd = 0;
  @Input() showGeneratedObjectGroupPreviews = false;
  @Input() enabledGeneratedObjectGroupPreviewCount = 0;
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
  @Input()
  trackVisibleObjectGroupSlot!: EditorObjectsSectionComponent['trackVisibleObjectGroupSlot'];
  @Output() previewStartYChange = new EventEmitter<string>();
  @Output() showGeneratedPreviewsChange = new EventEmitter<boolean>();
  @Output() enableAllPreviews = new EventEmitter<void>();
  @Output() disableAllPreviews = new EventEmitter<void>();
  @Output() regenerateEnabledPreviews = new EventEmitter<void>();
  @Output() selectSlot = new EventEmitter<number>();
  @Output() regenerateSlot = new EventEmitter<number>();

  regeneratePreviewForSlot(slotIndex: number): void {
    this.regenerateSlot.emit(slotIndex);
  }
}
