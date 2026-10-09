import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import type { FormGroup } from '@angular/forms';
import type { TextureTileEntry } from '../../../level-editor.service';

@Component({
  selector: 'app-editor-texture-select',
  templateUrl: './editor-texture-select.component.html',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditorTextureSelectComponent {
  @Input() formGroup!: FormGroup;
  @Input() field = '';
  @Input() tileEntries: TextureTileEntry[] = [];
  @Input() getTileDataUrl: (texId: number) => string | null = () => null;

  getValue(): number {
    return Number(this.formGroup.get(this.field)?.value ?? 0);
  }

  getTextureEntry(texId: number): TextureTileEntry | null {
    return this.tileEntries.find((tile) => tile.texId === texId) ?? null;
  }

  getTextureLabel(texId: number): string {
    const tile = this.getTextureEntry(texId);
    return tile ? `#${tile.texId} · ${tile.width}×${tile.height} px` : `#${texId}`;
  }
}
