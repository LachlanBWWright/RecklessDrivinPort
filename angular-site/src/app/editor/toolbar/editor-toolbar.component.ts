import { Component, ChangeDetectionStrategy, EventEmitter, Input, Output } from '@angular/core';
import type { ParsedLevel } from '../../level-editor.service';

@Component({
  selector: 'app-editor-toolbar',
  templateUrl: './editor-toolbar.component.html',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditorToolbarComponent {
  @Input() parsedLevels: ParsedLevel[] = [];
  @Input() selectedLevelId: number | null = null;
  @Input() workerBusy = false;
  @Input() hasEditorData = false;
  @Input() editorError = '';

  @Output() loadDefaultResources = new EventEmitter<void>();
  @Output() resourceFileSelected = new EventEmitter<Event>();
  @Output() downloadEditedResources = new EventEmitter<void>();
  @Output() saveEditedResourcesToGame = new EventEmitter<void>();
  @Output() selectLevel = new EventEmitter<number>();

  levelDisplayNum(resourceId: number): number {
    return resourceId - 139;
  }
}
