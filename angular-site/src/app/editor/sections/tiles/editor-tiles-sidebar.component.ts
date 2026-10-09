import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import type { RoadInfoOption, TextureTileEntry } from '../../../level-editor.service';

@Component({
  selector: 'app-editor-tiles-sidebar',
  templateUrl: './editor-tiles-sidebar.component.html',
  host: { style: 'display: contents' },
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditorTilesSidebarComponent {
  @Input() roadInfoOptions: RoadInfoOption[] = [];
  @Input() selectedRoadInfoId: number | null = null;
  @Input() tileTileEntries: TextureTileEntry[] = [];
  @Input() selectedTileId: number | null = null;
  @Input() totalTileCount = 0;
  @Input() workerBusy = false;
  @Input() getRoadDeleteTooltip!: (id: number) => string;
  @Input() canDeleteRoadInfo!: (id: number) => boolean;
  @Input() getTileDataUrl!: (id: number) => string | null;
  @Input() getTileDeleteTooltip!: (id: number) => string;
  @Input() canDeleteTileImage!: (id: number) => boolean;
  @Output() createRoadInfo = new EventEmitter<void>();
  @Output() addTileImage = new EventEmitter<void>();
  @Output() selectedRoadInfo = new EventEmitter<number>();
  @Output() deletedRoadInfo = new EventEmitter<number>();
  @Output() selectedTile = new EventEmitter<number>();
  @Output() deletedTile = new EventEmitter<number>();
}
