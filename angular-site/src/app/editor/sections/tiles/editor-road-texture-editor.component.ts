import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import type { FormGroup } from '@angular/forms';
import type { RoadInfoData, TextureTileEntry } from '../../../level-editor.service';

type TextureField =
  | 'backgroundTex'
  | 'foregroundTex'
  | 'roadLeftBorder'
  | 'roadRightBorder'
  | 'marks'
  | 'tracks'
  | 'skidSound';

@Component({
  selector: 'app-editor-road-texture-editor',
  templateUrl: './editor-road-texture-editor.component.html',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditorRoadTextureEditorComponent {
  @Input() selectedRoadInfoData: RoadInfoData | null = null;
  @Input() roadTextureForm!: FormGroup;
  @Input() tileTileEntries: TextureTileEntry[] = [];
  @Input() audioEntries: { id: number; sizeBytes: number; durationMs?: number }[] = [];
  @Input() workerBusy = false;
  @Input() getTileDataUrl: (texId: number) => string | null = () => null;
  @Output() playRoadSkidSound = new EventEmitter<number>();

  getTextureEntry(texId: number): TextureTileEntry | null {
    return this.tileTileEntries.find((tile) => tile.texId === texId) ?? null;
  }

  getTextureLabel(texId: number): string {
    const tile = this.getTextureEntry(texId);
    return tile ? `#${tile.texId} · ${tile.width}×${tile.height} px` : `#${texId}`;
  }

  getRoadValue(field: TextureField): number {
    return Number(this.roadTextureForm.get(field)?.value ?? 0);
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
