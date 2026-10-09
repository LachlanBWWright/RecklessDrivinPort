import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-editor-audio-sidebar',
  templateUrl: './editor-audio-sidebar.component.html',
  host: { style: 'display: contents' },
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditorAudioSidebarComponent {
  @Input() audioEntries: { id: number; sizeBytes: number; durationMs?: number }[] = [];
  @Input() workerBusy = false;
  @Input() audioEntryClass!: (id: number) => string;
  @Input() audioEntryDetail!: (entry: { sizeBytes: number; durationMs?: number }) => string;
  @Output() addAudioEntry = new EventEmitter<void>();
  @Output() selectAudioEntry = new EventEmitter<number>();
}
