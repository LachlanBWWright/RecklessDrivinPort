import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import type { ParsedLevel, ObjectGroupRef, RoadInfoData, TextureTileEntry } from '../level-editor.service';

type TextureField = 'backgroundTex' | 'foregroundTex' | 'roadLeftBorder' | 'roadRightBorder';
type RoadField = TextureField | 'marks' | 'tracks' | 'skidSound';

/**
 * Level Properties tab — extracted from app.html for better component separation.
 * Displays and edits road-info records plus object group references.
 */
@Component({
  selector: 'app-properties-tab',
  templateUrl: './properties-tab.component.html',
  styleUrl: './properties-tab.component.scss',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PropertiesTabComponent {
  @Input() selectedLevel: ParsedLevel | null = null;
  @Input() levelNum = 0;
  @Input() editRoadInfo = 0;
  @Input() roadInfoData: RoadInfoData | null = null;
  @Input() editObjectGroups: ObjectGroupRef[] = [];
  @Input() tileTileEntries: TextureTileEntry[] = [];
  @Input() audioEntries: { id: number; sizeBytes: number; durationMs?: number }[] = [];
  @Input() getTileDataUrl: (texId: number) => string | null = () => null;
  @Input() propertiesDirty = false;
  @Input() workerBusy = false;

  @Output() roadInfoInput = new EventEmitter<{ field: Exclude<keyof RoadInfoData, 'id'>; event: Event }>();
  @Output() objGroupInput = new EventEmitter<{ index: number; field: 'resID' | 'numObjs'; event: Event }>();
  @Output() saveProperties = new EventEmitter<void>();

  readonly textureFields: { field: TextureField; label: string }[] = [
    { field: 'backgroundTex', label: 'backgroundTex' },
    { field: 'foregroundTex', label: 'foregroundTex' },
    { field: 'roadLeftBorder', label: 'roadLeftBorder' },
    { field: 'roadRightBorder', label: 'roadRightBorder' },
  ];

  get textureEntries(): TextureTileEntry[] {
    return [...this.tileTileEntries].sort((a, b) => a.texId - b.texId);
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

  getTextureValue(field: TextureField): number {
    return this.roadInfoData?.[field] ?? 0;
  }

  setTextureValue(field: TextureField, texId: number): void {
    this.roadInfoInput.emit({
      field,
      event: { target: { value: String(texId) } } as unknown as Event,
    });
  }

  getRoadValue(field: RoadField): number {
    return this.roadInfoData?.[field] ?? 0;
  }

  setRoadValue(field: RoadField, value: number): void {
    this.roadInfoInput.emit({
      field,
      event: { target: { value: String(value) } } as unknown as Event,
    });
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
}
