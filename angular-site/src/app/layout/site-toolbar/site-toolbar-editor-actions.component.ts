import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import type { ParsedLevel } from '../../level-editor.service';

@Component({
  selector: 'app-site-toolbar-editor-actions',
  templateUrl: './site-toolbar-editor-actions.component.html',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SiteToolbarEditorActionsComponent {
  @Input() workerBusy = false;
  @Input() hasEditorData = false;
  @Input() editorError = '';
  @Input() parsedLevels: ParsedLevel[] = [];
  @Input() selectedLevelId: number | null = null;
  @Output() tabChange = new EventEmitter<void>();
  @Output() loadDefaultResources = new EventEmitter<void>();
  @Output() resourceFileSelected = new EventEmitter<Event>();
  @Output() clearEditorFile = new EventEmitter<void>();
  @Output() previewSelectedLevel = new EventEmitter<void>();
  @Output() launchDownload = new EventEmitter<void>();
  @Output() openLuaEditor = new EventEmitter<void>();
  @Output() exportLuaProject = new EventEmitter<void>();
  @Output() importLuaProject = new EventEmitter<Event>();
  @Output() selectLevel = new EventEmitter<number>();
}
