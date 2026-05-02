import {
  Component,
  ChangeDetectionStrategy,
  EventEmitter,
  Input,
  Output,
  OnChanges,
  SimpleChanges,
} from '@angular/core';

@Component({
  selector: 'app-editor-screens-section',
  templateUrl: './editor-screens-section.component.html',
  host: {
    class: 'flex min-h-0 w-full flex-1 flex-col',
  },
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditorScreensSectionComponent implements OnChanges {
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
  @Output() iconRawUpload = new EventEmitter<Event>();
  @Output() iconPngUpload = new EventEmitter<Event>();
  @Output() addIconEntry = new EventEmitter<void>();

  /** Cached data URL for the large preview canvas — recomputed only when the canvas reference changes. */
  iconPreviewDataUrl: string | null = null;

  /** Stable track-by key for icon entries. */
  trackIconEntry(_index: number, icon: { type: string; id: number; label: string }): string {
    return `${icon.type}:${icon.id}`;
  }

  isPictureResourceType(type: string): boolean {
    const normalized = type.trim().toUpperCase();
    return normalized === 'PICT' || normalized === 'PPIC';
  }

  ngOnChanges(changes: SimpleChanges): void {
    if ('iconPreviewCanvas' in changes) {
      const canvas = this.iconPreviewCanvas;
      this.iconPreviewDataUrl = canvas ? canvas.toDataURL() : null;
    }
  }
}
