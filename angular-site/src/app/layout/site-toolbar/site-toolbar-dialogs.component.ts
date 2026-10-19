import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import type { ResourceMergeOptions } from '../../resource-merge';
import type { SiteToolbarComponent } from './site-toolbar.component';

@Component({
  selector: 'app-site-toolbar-dialogs',
  templateUrl: './site-toolbar-dialogs.component.html',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SiteToolbarDialogsComponent {
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
