import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import type { TextureTileEntry } from '../../../level-editor.service';

@Component({
  selector: 'app-editor-tile-row',
  templateUrl: './editor-tile-row.component.html',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditorTileRowComponent {
  @Input({ required: true }) tile!: TextureTileEntry;
  @Input() selectedTileId: number | null = null;
  @Input() getTileDataUrl!: (id: number) => string | null;
  @Input() getTileDeleteTooltip!: (id: number) => string;
  @Input() canDeleteTileImage!: (id: number) => boolean;
  @Output() selected = new EventEmitter<number>();
  @Output() deleted = new EventEmitter<number>();
}
