import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-editor-audio-entry',
  template: `<button
    type="button"
    class="flex w-full items-center gap-3 rounded-[10px] border px-3 py-2.5 text-left transition"
    [ngClass]="entryClass"
    (click)="selected.emit(entry.id)"
  >
    <mat-icon class="!h-5 !w-5 !text-xl shrink-0 text-[var(--muted)]">audiotrack</mat-icon
    ><span class="flex min-w-0 flex-1 flex-col gap-0.5"
      ><span class="text-[0.94rem] font-bold">Sound #{{ entry.id }}</span
      ><span class="text-[0.76rem] text-[var(--muted)]">{{ detail }}</span></span
    ><mat-icon class="!h-[18px] !w-[18px] !text-[18px] shrink-0 text-[var(--muted)] opacity-85"
      >chevron_right</mat-icon
    >
  </button>`,
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditorAudioEntryComponent {
  @Input({ required: true }) entry!: { id: number; sizeBytes: number; durationMs?: number };
  @Input() entryClass = '';
  @Input() detail = '';
  @Output() selected = new EventEmitter<number>();
}
