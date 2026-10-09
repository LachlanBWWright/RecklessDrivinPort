import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-editor-detail-card',
  template: '<div class="rounded-[14px] border border-white/10 bg-[var(--surface2)] p-[14px]"><ng-content /></div>',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditorDetailCardComponent {}
