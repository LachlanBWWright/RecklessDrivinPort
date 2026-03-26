import { Component, ChangeDetectionStrategy, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-editor-sprites-section',
  templateUrl: './editor-sprites-section.component.html',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditorSpritesSectionComponent {
  @Input() packSpriteFrames: { id: number; bitDepth: 8 | 16; width: number; height: number }[] = [];
  @Input() selectedPackSpriteId: number | null = null;
  @Input() workerBusy = false;
  @Input() getPackSpriteDataUrl: (frameId: number) => string | null = () => null;

  @Output() selectedPackSpriteIdChange = new EventEmitter<number | null>();
  @Output() openSpriteEditor = new EventEmitter<number>();
  @Output() spritePngUpload = new EventEmitter<{ event: Event; spriteId: number }>();
  @Output() exportSpritePng = new EventEmitter<void>();

  get selectedPackSpriteFrame(): { id: number; bitDepth: 8 | 16; width: number; height: number } | null {
    if (this.selectedPackSpriteId === null) return null;
    return this.packSpriteFrames.find((f) => f.id === this.selectedPackSpriteId) ?? null;
  }

  getSpriteFormatLabel(bitDepth: 8 | 16 | undefined): string {
    if (bitDepth === 16) return 'RGB555';
    if (bitDepth === 8) return '8-bit';
    return '?';
  }
}
