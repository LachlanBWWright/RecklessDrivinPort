import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

@Component({
  selector: 'app-properties-slot-label',
  template: `<span
    class="whitespace-nowrap text-[0.78rem] font-bold uppercase tracking-[0.08em] text-[var(--muted)]"
    >Slot {{ index }}</span
  >`,
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PropertiesSlotLabelComponent {
  @Input() index = 0;
}
