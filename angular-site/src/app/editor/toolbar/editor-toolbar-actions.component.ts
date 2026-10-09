import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import type { ParsedLevel } from '../../level-editor.service';

@Component({
  selector: 'app-editor-toolbar-actions',
  templateUrl: './editor-toolbar-actions.component.html',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditorToolbarActionsComponent {
  @Input() workerBusy = false;
  @Input() hasEditorData = false;
  @Input() editorError = '';
  @Output() loadDefaultResources = new EventEmitter<void>();
  @Output() resourceFileSelected = new EventEmitter<Event>();
  @Output() downloadEditedResources = new EventEmitter<void>();
  @Output() saveEditedResourcesToGame = new EventEmitter<void>();
  @Input() parsedLevels: ParsedLevel[] = [];
  @Input() selectedLevelId: number | null = null;
  @Output() selectLevel = new EventEmitter<number>();
}
