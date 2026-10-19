import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

@Component({
  selector: 'app-editor-inspector-preview',
  template: `<div class="mb-6 flex min-h-20 flex-col items-center gap-3 px-3 py-3">
    <div class="flex min-w-0 flex-1 flex-col gap-1">
      <div style="display: flex; gap: 8px; align-items: center; justify-content: center">
        <span
          class="block max-w-full overflow-hidden text-ellipsis text-[0.95rem] font-bold leading-[1.15] text-[var(--on-surface)]"
          >Object #{{ selectedIndex }}</span
        ><app-object-type-dimension-badge [label]="typeDimLabel" />
      </div>
    </div>
    @if (spriteUrl; as url) {
      <div
        class="flex h-16 w-16 items-center justify-center overflow-hidden rounded-md border border-[var(--border)] bg-[var(--surface3)]"
      >
        <img
          [src]="url"
          class="h-16 w-16 object-contain [image-rendering:pixelated]"
          alt="sprite preview"
        />
      </div>
    }
  </div>`,
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditorInspectorPreviewComponent {
  @Input({ required: true }) selectedIndex: number | null = null;
  @Input() typeDimLabel = '';
  @Input() spriteUrl: string | null = null;
}
