import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import type { RoadInfoOption, TextureTileEntry } from '../../../level-editor.service';

@Component({
  selector: 'app-editor-tiles-sidebar-lists',
  templateUrl: './editor-tiles-sidebar-lists.component.html',
  host: {
    class: 'flex min-h-0 min-w-0 flex-col gap-3',
  },
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditorTilesSidebarListsComponent {
  @Input() roadInfoOptions: RoadInfoOption[] = [];
  @Input() selectedRoadInfoId: number | null = null;
  @Input() tileTileEntries: TextureTileEntry[] = [];
  @Input() totalTileCount = 0;
  @Input() selectedTileId: number | null = null;
  @Input() workerBusy = false;
  @Input() getRoadDeleteTooltip!: (id: number) => string;
  @Input() canDeleteRoadInfo!: (id: number) => boolean;
  @Input() getTileDataUrl!: (id: number) => string | null;
  @Input() getTileDeleteTooltip!: (id: number) => string;
  @Input() canDeleteTileImage!: (id: number) => boolean;
  @Output() selectedRoadInfo = new EventEmitter<number>();
  @Output() deletedRoadInfo = new EventEmitter<number>();
  @Output() createRoadInfo = new EventEmitter<void>();
  @Output() selectedTile = new EventEmitter<number>();
  @Output() deletedTile = new EventEmitter<number>();
}
