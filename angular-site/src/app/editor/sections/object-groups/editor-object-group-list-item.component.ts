import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-editor-object-group-list-item',
  template: `<button
    class="flex w-full items-center justify-between gap-2.5 rounded-[10px] border border-transparent bg-[var(--surface2)] px-3 py-2.5 text-left transition duration-100 ease-out hover:-translate-y-px hover:border-white/10 hover:bg-[var(--surface3)]"
    [ngClass]="objectGroupClass(group.id)"
    (click)="selected.emit(group.id)"
  >
    <span class="flex min-w-0 flex-1 flex-col gap-0.5"
      ><span class="text-[0.94rem] font-bold">Group #{{ group.id }}</span
      ><span class="text-[0.76rem] text-[var(--muted)]"
        >{{ group.entries.length }} entries</span
      ></span
    ><mat-icon class="!h-[18px] !w-[18px] !text-[18px] shrink-0 text-[var(--muted)] opacity-85"
      >chevron_right</mat-icon
    >
  </button>`,
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditorObjectGroupListItemComponent {
  @Input({ required: true }) group!: { id: number; entries: readonly unknown[] };
  @Input() objectGroupClass!: (id: number) => string;
  @Output() selected = new EventEmitter<number>();
}
