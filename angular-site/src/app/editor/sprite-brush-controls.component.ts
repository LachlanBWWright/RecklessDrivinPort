import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import type { FormControl } from '@angular/forms';

@Component({
  selector: 'app-sprite-brush-controls',
  template: `<div class="flex items-center gap-2">
      <input
        class="h-2 flex-1 accent-[var(--accent2)]"
        type="range"
        min="1"
        max="12"
        step="1"
        [formControl]="brushSize"
      /><span class="min-w-10 text-right text-[0.72rem] text-[var(--on-surface)]"
        >{{ brushSize.value }} px</span
      >
    </div>
    <div class="mt-1 text-[0.7rem] uppercase tracking-[0.06em] text-[var(--muted)]">Colour</div>
    <div class="flex items-center gap-2">
      <div
        class="h-8 w-8 rounded border border-[var(--border)]"
        [style.background]="colorStyle"
      ></div>
      <input
        type="color"
        class="h-8 w-10 cursor-pointer rounded border border-[var(--border)] bg-[var(--surface3)] p-0"
        [value]="colorHex"
        (input)="colorInput.emit($event)"
        title="Pick colour"
      />
    </div>`,
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SpriteBrushControlsComponent {
  @Input({ required: true }) brushSize!: FormControl<number>;
  @Input() colorStyle = '';
  @Input() colorHex = '';
  @Output() colorInput = new EventEmitter<Event>();
}
