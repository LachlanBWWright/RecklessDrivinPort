import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

@Component({
  selector: 'app-editor-sound-option',
  template: `<span class="inline-flex min-w-0 items-center gap-2"
    ><span
      class="inline-flex h-6 w-12 shrink-0 items-center justify-center rounded border border-white/20 bg-[linear-gradient(135deg,#555,#2c2c2c)] text-[10px] font-semibold uppercase tracking-[0.12em] text-white/60"
      >SFX</span
    ><span class="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{{ label }}</span></span
  >`,
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditorSoundOptionComponent {
  @Input({ required: true }) label = '';
}
