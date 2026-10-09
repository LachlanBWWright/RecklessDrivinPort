import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-site-toolbar-preview-dialog',
  templateUrl: './site-toolbar-preview-dialog.component.html',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SiteToolbarPreviewDialogComponent {
  @Input() selectedLevelId: number | null = null;
  @Input() levelDisplayNum!: (levelResourceId: number) => number;
  @Input() stripScripts = false;
  @Output() stripScriptsChange = new EventEmitter<boolean>();
  @Output() close = new EventEmitter<void>();
  @Output() confirm = new EventEmitter<void>();
}
