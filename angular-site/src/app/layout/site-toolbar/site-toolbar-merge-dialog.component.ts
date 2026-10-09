import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import type { ResourceMergeOptions } from '../../resource-merge';

@Component({
  selector: 'app-site-toolbar-merge-dialog',
  templateUrl: './site-toolbar-merge-dialog.component.html',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SiteToolbarMergeDialogComponent {
  @Input() pendingMergeFile: File | null = null;
  @Input() mergeOptions!: ResourceMergeOptions;
  @Output() optionsChange = new EventEmitter<ResourceMergeOptions>();
  @Output() levelIdsChange = new EventEmitter<readonly number[]>();
  @Output() close = new EventEmitter<void>();
  @Output() confirm = new EventEmitter<void>();
}
