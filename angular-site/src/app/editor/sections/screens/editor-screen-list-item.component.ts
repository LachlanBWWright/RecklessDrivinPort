import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';

type IconEntry = { type: string; id: number; label: string };
type IconSelection = Pick<IconEntry, 'type' | 'id'>;

@Component({
  selector: 'app-editor-screen-list-item',
  template: `
    <button
      type="button"
      class="flex w-full items-center gap-3 rounded-[10px] border px-3 py-2.5 text-left transition"
      [ngClass]="
        selected
          ? 'border-[color:rgba(66,165,245,0.6)] bg-[color:rgba(66,165,245,0.12)] shadow-[inset_0_0_0_1px_rgba(66,165,245,0.1)]'
          : 'border-transparent bg-[var(--surface2)] hover:-translate-y-px hover:border-white/10 hover:bg-[var(--surface3)]'
      "
      (click)="selectedChange.emit({ type: icon.type, id: icon.id })"
    >
      <span
        class="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-lg border border-white/10 bg-white/5"
      >
        @if (getIconThumbDataUrl(icon.type, icon.id); as thumbUrl) {
          <img
            [src]="thumbUrl"
            class="block h-full w-full object-contain [image-rendering:pixelated]"
            alt=""
          />
        } @else {
          <mat-icon class="!h-[18px] !w-[18px] !text-[18px] text-[var(--muted)]">{{
            icon.type === 'PICT' ? 'wallpaper' : 'image'
          }}</mat-icon>
        }
      </span>
      <span class="flex min-w-0 flex-1 flex-col gap-0.5">
        <span class="text-[0.94rem] font-bold">{{ icon.label }}</span>
        <span class="text-[0.76rem] text-[var(--muted)]">{{ icon.type }}</span>
      </span>
      <span class="ml-1 text-[0.72rem] text-[var(--muted)]">{{ icon.type }}</span>
      <mat-icon class="!h-[18px] !w-[18px] !text-[18px] shrink-0 text-[var(--muted)] opacity-85"
        >chevron_right</mat-icon
      >
    </button>
  `,
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditorScreenListItemComponent {
  @Input() icon!: IconEntry;
  @Input() selected = false;
  @Input() getIconThumbDataUrl: (type: string, id: number) => string | null = () => null;
  @Output() selectedChange = new EventEmitter<IconSelection>();
}
