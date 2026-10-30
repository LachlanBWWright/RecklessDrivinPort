import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
  ViewChild,
  TemplateRef,
  inject,
  type AfterViewInit,
  type OnChanges,
  type OnDestroy,
} from '@angular/core';
import { MatDialog, type MatDialogRef } from '@angular/material/dialog';
import type { ResourceMergeOptions } from '../../resource-merge';
import type { SiteToolbarComponent } from './site-toolbar.component';

type DialogKind = 'merge' | 'preview' | 'download' | 'delete';

@Component({
  selector: 'app-site-toolbar-dialogs',
  templateUrl: './site-toolbar-dialogs.component.html',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SiteToolbarDialogsComponent implements AfterViewInit, OnChanges, OnDestroy {
  @ViewChild('mergeTemplate', { static: true }) private mergeTemplate!: TemplateRef<unknown>;
  @ViewChild('previewTemplate', { static: true }) private previewTemplate!: TemplateRef<unknown>;
  @ViewChild('downloadTemplate', { static: true }) private downloadTemplate!: TemplateRef<unknown>;
  @ViewChild('deleteTemplate', { static: true }) private deleteTemplate!: TemplateRef<unknown>;
  @Input() deleteLevelId: number | null = null;
  @Input() canDeleteLevel = false;
  @Output() closeDelete = new EventEmitter<void>();
  @Output() confirmDelete = new EventEmitter<void>();
  private readonly dialogs = inject(MatDialog);
  private readonly opened = new Map<DialogKind, MatDialogRef<unknown, void>>();
  private ready = false;
  private destroyed = false;

  ngAfterViewInit(): void {
    this.ready = true;
    this.syncDialogs();
  }

  ngOnChanges(): void {
    if (this.ready) this.syncDialogs();
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.opened.forEach((dialog) => dialog.close());
    this.opened.clear();
  }

  private syncDialogs(): void {
    this.syncDialog(
      'delete',
      this.deleteLevelId !== null,
      this.deleteTemplate,
      '380px',
      this.closeDelete,
    );
    this.syncDialog('merge', this.mergeDialogOpen, this.mergeTemplate, '680px', this.closeMerge);
    this.syncDialog(
      'preview',
      this.previewDialogOpen,
      this.previewTemplate,
      '620px',
      this.closePreview,
    );
    this.syncDialog(
      'download',
      this.downloadDialogOpen,
      this.downloadTemplate,
      '560px',
      this.closeDownload,
    );
  }

  private syncDialog(
    kind: DialogKind,
    visible: boolean,
    template: TemplateRef<unknown>,
    width: string,
    closed: EventEmitter<void>,
  ): void {
    const current = this.opened.get(kind);
    if (!visible) {
      current?.close();
      return;
    }
    if (current) return;
    const dialog = this.dialogs.open<unknown, undefined, void>(template, {
      width,
      maxWidth: 'calc(100vw - 32px)',
      maxHeight: 'calc(100dvh - 32px)',
      autoFocus: kind === 'delete' ? '[data-delete-cancel]' : 'first-heading',
      restoreFocus: true,
      ariaLabelledBy: `${kind}-dialog-title`,
    });
    this.opened.set(kind, dialog);
    dialog.afterClosed().subscribe(() => {
      this.opened.delete(kind);
      if (!this.destroyed) closed.emit();
    });
  }

  @Input() mergeDialogOpen = false;
  @Input() previewDialogOpen = false;
  @Input() downloadDialogOpen = false;
  @Input() pendingMergeFile: File | null = null;
  @Input() mergeOptions!: ResourceMergeOptions;
  @Input() selectedLevelId: number | null = null;
  @Input() levelDisplayNum!: SiteToolbarComponent['levelDisplayNum'];
  @Input() stripScriptsForPreview = false;
  @Input() stripScriptsForDownload = false;
  @Output() mergeOptionsChange = new EventEmitter<ResourceMergeOptions>();
  @Output() mergeLevelIdsChange = new EventEmitter<readonly number[]>();
  @Output() stripScriptsForPreviewChange = new EventEmitter<boolean>();
  @Output() stripScriptsForDownloadChange = new EventEmitter<boolean>();
  @Output() closeMerge = new EventEmitter<void>();
  @Output() confirmMerge = new EventEmitter<void>();
  @Output() closePreview = new EventEmitter<void>();
  @Output() confirmPreview = new EventEmitter<void>();
  @Output() closeDownload = new EventEmitter<void>();
  @Output() confirmDownload = new EventEmitter<void>();
}
