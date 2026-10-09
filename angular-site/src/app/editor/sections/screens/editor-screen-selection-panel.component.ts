import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
@Component({
  selector: 'app-editor-screen-selection-panel',
  templateUrl: './editor-screen-selection-panel.component.html',
  host: {
    class: 'flex h-full min-h-0 min-w-0 flex-1 flex-col',
  },
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditorScreenSelectionPanelComponent {
  @Input() selectedIconId: number | null = null;
  @Input() selectedIconLabel = '';
  @Input() selectedIconType = '';
  @Input() iconPreviewDataUrl: string | null = null;
  @Input() workerBusy = false;
  @Output() openImageEditor = new EventEmitter<void>();
  @Output() exportPng = new EventEmitter<void>();
  @Output() exportRaw = new EventEmitter<void>();
  @Output() pngUpload = new EventEmitter<Event>();
  @Output() rawUpload = new EventEmitter<Event>();
}
