import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import type {
  EditorObjectsSectionComponent,
  VisibleObjectGroupSlot,
} from './editor-objects-section.component';

@Component({
  selector: 'app-editor-object-group-slot-detail',
  templateUrl: './editor-object-group-slot-detail.component.html',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditorObjectGroupSlotDetailComponent {
  @Input({ required: true }) slot!: VisibleObjectGroupSlot;
  @Input() selectedObjectGroupSlotIndex: number | null = null;
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
