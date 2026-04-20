import { Component, ChangeDetectionStrategy, EventEmitter, Input, Output, OnChanges, SimpleChanges } from '@angular/core';
import type { RoadInfoData, RoadInfoOption, RoadTileGroup, TextureTileEntry } from '../../../level-editor.service';

type TextureField = 'backgroundTex' | 'foregroundTex' | 'roadLeftBorder' | 'roadRightBorder' | 'marks' | 'tracks' | 'skidSound';

@Component({
  selector: 'app-editor-tiles-section',
  templateUrl: './editor-tiles-section.component.html',
  styleUrl: './editor-tiles-section.component.scss',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditorTilesSectionComponent implements OnChanges {
  @Input() tileTileEntries: TextureTileEntry[] = [];
  @Input() roadTileGroups: RoadTileGroup[] = [];
  @Input() roadInfoOptions: RoadInfoOption[] = [];
  @Input() selectedRoadInfoId: number | null = null;
  @Input() selectedRoadInfoData: RoadInfoData | null = null;
  @Input() getRoadReferenceLevelNums: (roadInfoId: number) => number[] = () => [];
  @Input() getTileReferenceRoadInfoIds: (texId: number) => number[] = () => [];
  @Input() audioEntries: { id: number; sizeBytes: number; durationMs?: number }[] = [];
  @Input() selectedTileId: number | null = null;
  @Input() workerBusy = false;
  @Input() getTileDataUrl: (texId: number) => string | null = () => null;

  @Output() selectedRoadInfoIdChange = new EventEmitter<number>();
  @Output() createRoadInfo = new EventEmitter<void>();
  @Output() deleteRoadInfo = new EventEmitter<number>();
  @Output() roadInfoInput = new EventEmitter<{ field: Exclude<keyof RoadInfoData, 'id'>; event: Event }>();
  @Output() roadTextureChange = new EventEmitter<{ field: TextureField; value: number }>();
  @Output() selectedTileIdChange = new EventEmitter<number | null>();
  @Output() deleteTileImage = new EventEmitter<number>();
  @Output() openTileEditor = new EventEmitter<number>();
  @Output() tilePngUpload = new EventEmitter<{ event: Event; texId: number }>();
  @Output() exportTilePng = new EventEmitter<number>();
  @Output() addTileImage = new EventEmitter<void>();

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

  get totalTileCount(): number {
    return this.tileTileEntries.length;
  }

  getRoadInfoOption(roadInfoId: number): RoadInfoOption | undefined {
    return this.roadInfoOptions.find((option) => option.id === roadInfoId);
  }

  getTextureEntry(texId: number): TextureTileEntry | null {
    return this.tileTileEntries.find((tile) => tile.texId === texId) ?? null;
  }

  hasTextureEntry(texId: number): boolean {
    return this.getTextureEntry(texId) !== null;
  }

  getTextureLabel(texId: number): string {
    const tile = this.getTextureEntry(texId);
    return tile ? `#${tile.texId} · ${tile.width}×${tile.height} px` : `#${texId}`;
  }

  canDeleteTileImage(texId: number): boolean {
    return !this.workerBusy && this.getTileReferenceRoadInfoIds(texId).length === 0;
  }

  getTileDeleteTooltip(texId: number): string {
    const refs = this.getTileReferenceRoadInfoIds(texId);
    if (refs.length > 0) {
      return `Referenced by road${refs.length > 1 ? 's' : ''} ${refs.join(', ')}. Reassign those road textures first.`;
    }
    return this.workerBusy ? 'Wait until the current operation finishes.' : 'Delete this tile image.';
  }

  getAudioEntry(audioId: number): { id: number; sizeBytes: number; durationMs?: number } | null {
    return this.audioEntries.find((entry) => entry.id === audioId) ?? null;
  }

  getAudioLabel(audioId: number): string {
    const entry = this.getAudioEntry(audioId);
    if (!entry) return `#${audioId}`;
    return entry.durationMs !== undefined
      ? `#${entry.id} · ${(entry.durationMs / 1000).toFixed(1)}s`
      : `#${entry.id} · ${entry.sizeBytes.toLocaleString()} B`;
  }

  canDeleteRoadInfo(roadInfoId: number): boolean {
    return !this.workerBusy && this.getRoadReferenceLevelNums(roadInfoId).length === 0;
  }

  getRoadDeleteTooltip(roadInfoId: number): string {
    const refs = this.getRoadReferenceLevelNums(roadInfoId);
    if (refs.length > 0) {
      return `Referenced by level${refs.length > 1 ? 's' : ''} ${refs.join(', ')}. Reassign those level road selections first.`;
    }
    return this.workerBusy ? 'Wait until the current operation finishes.' : 'Delete this road.';
  }

  getRoadValue(field: TextureField): number {
    return this.selectedRoadInfoData?.[field] ?? 0;
  }

  setRoadValue(field: TextureField, value: number): void {
    this.roadTextureChange.emit({ field, value });
  }
}
