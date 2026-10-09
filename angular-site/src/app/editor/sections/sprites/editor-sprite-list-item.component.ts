import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';

type SpriteFrame = { id: number; bitDepth: 8 | 16; width: number; height: number };

@Component({
  selector: 'app-editor-sprite-list-item',
  template: `
    <button
      type="button"
      class="flex w-full items-center gap-3 rounded-[10px] border px-3 py-2.5 text-left transition"
      [ngClass]="
        selected
          ? 'border-red-500/60 bg-red-500/15 shadow-[inset_0_0_0_1px_rgba(229,57,53,0.08)]'
          : 'border-transparent bg-[var(--surface2)] hover:-translate-y-px hover:border-white/10 hover:bg-[var(--surface3)]'
      "
      (click)="selectedChange.emit(frame.id)"
    >
      <span
        class="grid h-[52px] w-[52px] shrink-0 place-items-center overflow-hidden rounded-[10px] border border-white/10 bg-white/5"
      >
        @if (getSpriteDataUrl(frame.id); as url) {
          <img
            [src]="url"
            class="block h-full w-full object-contain [image-rendering:pixelated]"
            alt=""
          />
        } @else {
          <span class="text-[0.8rem] font-bold text-[var(--muted)]">#{{ frame.id }}</span>
        }
      </span>
      <span class="flex min-w-0 flex-1 flex-col gap-0.5">
        <span class="text-[0.94rem] font-bold">Frame #{{ frame.id }}</span>
        <span class="text-[0.76rem] text-[var(--muted)]"
          >{{ frame.bitDepth }}-bit · {{ frame.width }}×{{ frame.height }} px</span
        >
      </span>
      <mat-icon class="!h-[18px] !w-[18px] !text-[18px] shrink-0 text-[var(--muted)] opacity-85"
        >chevron_right</mat-icon
      >
    </button>
  `,
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditorSpriteListItemComponent {
  @Input() frame!: SpriteFrame;
  @Input() selected = false;
  @Input() getSpriteDataUrl: (frameId: number) => string | null = () => null;
  @Output() selectedChange = new EventEmitter<number>();
}
