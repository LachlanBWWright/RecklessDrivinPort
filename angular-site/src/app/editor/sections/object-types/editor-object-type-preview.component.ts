import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import type { ObjectTypeDefinition } from '../../../level-editor.service';

@Component({
  selector: 'app-editor-object-type-preview',
  templateUrl: './editor-object-type-preview.component.html',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditorObjectTypePreviewComponent {
  @Input({ required: true }) type!: ObjectTypeDefinition;
  @Input() spriteUrl: string | null = null;
  @Input() frameLabel: (frame: number) => string = (frame) => '#' + frame;
  @Input() previewFrame = 0;
  @Input() hasFrameControls = false;
  @Input() workerBusy = false;
  @Output() frameStep = new EventEmitter<number>();
}
