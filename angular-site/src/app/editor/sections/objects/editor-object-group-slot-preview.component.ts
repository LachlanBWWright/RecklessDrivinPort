import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import type {
  EditorObjectsSectionComponent,
  VisibleObjectGroupSlot,
} from './editor-objects-section.component';

@Component({
  selector: 'app-editor-object-group-slot-preview',
  templateUrl: './editor-object-group-slot-preview.component.html',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditorObjectGroupSlotPreviewComponent {
  @Input({ required: true }) slot!: VisibleObjectGroupSlot;
  @Input() getPreviewEntries!: EditorObjectsSectionComponent['getPreviewEntries'];
  @Input() trackPreviewEntry!: EditorObjectsSectionComponent['trackPreviewEntry'];
  @Input() getTypeLabel!: EditorObjectsSectionComponent['getTypeLabel'];
  @Input() getRelativeOddsLabel!: EditorObjectsSectionComponent['getRelativeOddsLabel'];
  @Input() getPreviewRotationDegrees!: EditorObjectsSectionComponent['getPreviewRotationDegrees'];
  @Input()
  getPreviewSpriteRotationDegrees!: EditorObjectsSectionComponent['getPreviewSpriteRotationDegrees'];
  @Input() getSpriteUrl!: EditorObjectsSectionComponent['getSpriteUrl'];
  @Input() getPreviewOverflowCount!: EditorObjectsSectionComponent['getPreviewOverflowCount'];
}
