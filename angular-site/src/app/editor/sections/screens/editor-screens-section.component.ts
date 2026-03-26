import { Component, ChangeDetectionStrategy, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-editor-screens-section',
  templateUrl: './editor-screens-section.component.html',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditorScreensSectionComponent {
  @Input() iconEntries: { type: string; id: number; label: string }[] = [];
  @Input() selectedIconId: number | null = null;
  @Input() selectedIconType = 'ICN#';
  @Input() selectedIconLabel = '';
  @Input() iconPreviewCanvas: HTMLCanvasElement | null = null;
  @Input() workerBusy = false;
  @Input() getIconThumbDataUrl: (type: string, id: number) => string | null = () => null;

  @Output() selectIconEntry = new EventEmitter<{ type: string; id: number }>();
  @Output() exportIconPng = new EventEmitter<void>();
  @Output() exportIconRaw = new EventEmitter<void>();
  @Output() iconPngUpload = new EventEmitter<Event>();
}
