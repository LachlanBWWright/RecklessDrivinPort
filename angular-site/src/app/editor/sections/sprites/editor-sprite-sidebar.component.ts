import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
@Component({
  selector: 'app-editor-sprite-sidebar',
  templateUrl: './editor-sprite-sidebar.component.html',
  host: { style: 'display: contents' },
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditorSpriteSidebarComponent {
  @Input() frames: { id: number; bitDepth: 8 | 16; width: number; height: number }[] = [];
  @Input() selectedId: number | null = null;
  @Input() workerBusy = false;
  @Input() getSpriteDataUrl: (id: number) => string | null = () => null;
  @Output() addFrame = new EventEmitter<void>();
  @Output() selectedChange = new EventEmitter<number>();
}
