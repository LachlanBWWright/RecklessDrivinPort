import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-site-toolbar-download-dialog',
  templateUrl: './site-toolbar-download-dialog.component.html',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SiteToolbarDownloadDialogComponent {
  @Input() stripScripts = false;
  @Output() stripScriptsChange = new EventEmitter<boolean>();
  @Output() close = new EventEmitter<void>();
  @Output() confirm = new EventEmitter<void>();
}
