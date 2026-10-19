import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

@Component({
  selector: 'app-editor-direction-indicator',
  template: `<mat-icon
    class="!h-[18px] !w-[18px] !text-[18px] !text-[var(--accent2)] transition-transform duration-150 ease-out"
    [style.transform]="rotation"
    >north</mat-icon
  >`,
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditorDirectionIndicatorComponent {
  @Input() rotation = '';
}
