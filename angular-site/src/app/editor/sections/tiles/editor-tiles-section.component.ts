import { Component, ChangeDetectionStrategy, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-editor-tiles-section',
  templateUrl: './editor-tiles-section.component.html',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditorTilesSectionComponent {
  @Input() tileTileEntries: { texId: number; width: number; height: number }[] = [];
  @Input() selectedTileId: number | null = null;
  @Input() workerBusy = false;
  @Input() getTileDataUrl: (texId: number) => string | null = () => null;

  @Output() selectedTileIdChange = new EventEmitter<number | null>();
  @Output() openTileEditor = new EventEmitter<number>();
  @Output() tilePngUpload = new EventEmitter<{ event: Event; texId: number }>();
  @Output() exportTilePng = new EventEmitter<number>();

  getTileDimensions(texId: number): string {
    const entry = this.tileTileEntries.find((t) => t.texId === texId);
    return entry ? `${entry.width}×${entry.height}` : '?';
  }
}
