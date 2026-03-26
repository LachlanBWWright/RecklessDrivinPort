import { Component, ChangeDetectionStrategy, EventEmitter, Input, Output, OnChanges, SimpleChanges } from '@angular/core';

@Component({
  selector: 'app-editor-tiles-section',
  templateUrl: './editor-tiles-section.component.html',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditorTilesSectionComponent implements OnChanges {
  @Input() tileTileEntries: { texId: number; width: number; height: number }[] = [];
  @Input() selectedTileId: number | null = null;
  @Input() workerBusy = false;
  @Input() getTileDataUrl: (texId: number) => string | null = () => null;

  @Output() selectedTileIdChange = new EventEmitter<number | null>();
  @Output() openTileEditor = new EventEmitter<number>();
  @Output() tilePngUpload = new EventEmitter<{ event: Event; texId: number }>();
  @Output() exportTilePng = new EventEmitter<number>();

  /** Cached dimensions label for the currently selected tile. */
  selectedTileDimensions = '?';

  ngOnChanges(changes: SimpleChanges): void {
    if ('selectedTileId' in changes || 'tileTileEntries' in changes) {
      const entry = this.selectedTileId !== null
        ? this.tileTileEntries.find((t) => t.texId === this.selectedTileId)
        : undefined;
      this.selectedTileDimensions = entry ? `${entry.width}×${entry.height}` : '?';
    }
  }
}
