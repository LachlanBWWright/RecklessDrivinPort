import { MatDialog } from '@angular/material/dialog';
import { RearrangeLevelsDialogComponent } from './rearrange-levels-dialog.component';
import type { LevelOperation } from '../../level-management';
import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  inject,
  Input,
  Output,
} from '@angular/core';
import type { ParsedLevel } from '../../level-editor.service';

@Component({
  selector: 'app-site-toolbar-editor-actions',
  templateUrl: './site-toolbar-editor-actions.component.html',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SiteToolbarEditorActionsComponent {
  private readonly dialog = inject(MatDialog);

  rearrangeLevels(): void {
    this.dialog
      .open<RearrangeLevelsDialogComponent, number[], number[]>(RearrangeLevelsDialogComponent, {
        data: this.parsedLevels.map((level) => level.resourceId),
        width: '420px',
        maxWidth: 'calc(100vw - 32px)',
        autoFocus: 'first-tabbable',
      })
      .afterClosed()
      .subscribe((order) => {
        if (order) this.manageLevels.emit({ order });
      });
  }

  @Input() workerBusy = false;
  @Input() hasEditorData = false;
  @Input() hasUndownloadedChanges = false;
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
  @Output() manageLevels = new EventEmitter<LevelOperation>();
  get selectedLevelIndex(): number {
    return this.parsedLevels.findIndex((level) => level.resourceId === this.selectedLevelId);
  }
  @Output() selectLevel = new EventEmitter<number>();
}
