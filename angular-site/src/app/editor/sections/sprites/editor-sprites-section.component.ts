import { Component, ChangeDetectionStrategy, EventEmitter, Input, Output } from '@angular/core';
import { getSpriteFormatLabel } from '../../../sprite-editor';

@Component({
  selector: 'app-editor-sprites-section',
  templateUrl: './editor-sprites-section.component.html',
  styleUrls: ['./editor-sprites-section.component.scss'],
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
  @Output() spritePngUpload = new EventEmitter<{ file: File | null; spriteId: number }>();
  @Output() exportSpritePng = new EventEmitter<void>();
  @Output() addSpriteFrame = new EventEmitter<void>();

  get selectedPackSpriteFrame(): { id: number; bitDepth: 8 | 16; width: number; height: number } | null {
    if (this.selectedPackSpriteId === null) return null;
    return this.packSpriteFrames.find((f) => f.id === this.selectedPackSpriteId) ?? null;
  }

  readonly getSpriteFormatLabel = getSpriteFormatLabel;

  onFileChange(event: Event): void {
    if (this.selectedPackSpriteId === null) return;
    const input = event.target as HTMLInputElement | null;
    this.spritePngUpload.emit({ file: input?.files?.[0] ?? null, spriteId: this.selectedPackSpriteId });
  }
}
