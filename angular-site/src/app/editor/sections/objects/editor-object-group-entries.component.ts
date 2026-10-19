import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import type {
  EditorObjectsSectionComponent,
  VisibleObjectGroupSlot,
} from './editor-objects-section.component';

@Component({
  selector: 'app-editor-object-group-entries',
  templateUrl: './editor-object-group-entries.component.html',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditorObjectGroupEntriesComponent {
  @Input({ required: true }) slot!: VisibleObjectGroupSlot;
  @Input() getPreviewEntries!: EditorObjectsSectionComponent['getPreviewEntries'];
  @Input() trackPreviewEntry!: EditorObjectsSectionComponent['trackPreviewEntry'];
  @Input() getTypeLabel!: EditorObjectsSectionComponent['getTypeLabel'];
  @Input() getRelativeOddsLabel!: EditorObjectsSectionComponent['getRelativeOddsLabel'];
  @Input() getSpriteUrl!: EditorObjectsSectionComponent['getSpriteUrl'];
  @Input() getOffsetSummary!: EditorObjectsSectionComponent['getOffsetSummary'];
  @Input() trackGroupEntry!: EditorObjectsSectionComponent['trackGroupEntry'];
}
