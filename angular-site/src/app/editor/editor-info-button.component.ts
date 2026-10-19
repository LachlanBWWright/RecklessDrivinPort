import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

@Component({
  selector: 'app-editor-info-button',
  template: `<button
    mat-icon-button
    type="button"
    class="!flex !h-6 !w-6 !min-h-6 !min-w-6 items-center justify-center"
    [matTooltip]="tooltip"
    matTooltipPosition="above"
  >
    <mat-icon
      class="!flex !h-[16px] !w-[16px] !text-[16px] items-center justify-center !leading-none"
      >info</mat-icon
    >
  </button>`,
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditorInfoButtonComponent {
  @Input() tooltip = '';
}
