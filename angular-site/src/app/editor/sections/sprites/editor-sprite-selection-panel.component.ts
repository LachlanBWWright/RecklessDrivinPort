import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
@Component({
  selector: 'app-editor-sprite-selection-panel',
  templateUrl: './editor-sprite-selection-panel.component.html',
  host: {
    class: 'flex h-full min-h-0 min-w-0 flex-1 flex-col',
  },
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditorSpriteSelectionPanelComponent {
  @Input() selectedPackSpriteFrame: {
    id: number;
    bitDepth: 8 | 16;
    width: number;
    height: number;
  } | null = null;
  @Input() workerBusy = false;
  @Input() getPackSpriteDataUrl!: (frameId: number) => string | null;
  @Output() openSpriteEditor = new EventEmitter<number>();
  @Output() spritePngUpload = new EventEmitter<{ event: Event; spriteId: number }>();
  @Output() exportSpritePng = new EventEmitter<void>();
}
