import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ChangeDetectionStrategy, Component, Input, Output, EventEmitter } from '@angular/core';

@Component({
  selector: 'app-lua-script-api-completion',
  template: `<button
    mat-button
    type="button"
    class="api-completion !h-auto !min-w-0 !w-full !justify-start !whitespace-normal !px-2 !py-2 !text-left"
    [matTooltip]="documentation"
    (click)="use.emit(apply)"
  >
    <span class="min-w-0"><span class="block truncate font-mono text-[0.78rem] text-[var(--text)]">{{ label }}</span><span class="block truncate font-mono text-[0.68rem] text-[var(--muted)]">{{ detail }}</span></span>
  </button>`,
  standalone: true,
  imports: [MatButtonModule, MatTooltipModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LuaScriptApiCompletionComponent {
  @Input() label = '';
  @Input() documentation = '';
  @Input() detail = '';
  @Input() apply: string | undefined;
  @Output() use = new EventEmitter<string | undefined>();
}
