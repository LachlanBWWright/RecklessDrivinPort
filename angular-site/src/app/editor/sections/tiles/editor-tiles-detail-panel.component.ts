import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import type { EditorTilesSectionComponent } from './editor-tiles-section.component';

@Component({
  selector: 'app-editor-tiles-detail-panel',
  templateUrl: './editor-tiles-detail-panel.component.html',
  host: {
    class: 'flex h-full min-h-0 min-w-0 flex-1 flex-col',
  },
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditorTilesDetailPanelComponent {
  @Input() selectedTileId: number | null = null;
  @Input() selectedRoadInfoData!: EditorTilesSectionComponent['selectedRoadInfoData'];
  @Input() selectedTileDimensions = '?';
  @Input() tileTileEntries: EditorTilesSectionComponent['tileTileEntries'] = [];
  @Input() audioEntries: EditorTilesSectionComponent['audioEntries'] = [];
  @Input() workerBusy = false;
  @Input() getTileDataUrl!: EditorTilesSectionComponent['getTileDataUrl'];
  @Input() roadTextureForm!: EditorTilesSectionComponent['roadTextureForm'];
  @Output() openTileEditor = new EventEmitter<number>();
  @Output() tilePngUpload = new EventEmitter<{ event: Event; texId: number }>();
  @Output() exportTilePng = new EventEmitter<number>();
  @Output() playRoadSkidSound = new EventEmitter<number>();
}
