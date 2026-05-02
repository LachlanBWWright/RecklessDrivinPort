import { Component, ChangeDetectionStrategy, Input, Output, EventEmitter } from '@angular/core';

/** Canvas info/help popup overlay. Shows level stats and keyboard shortcuts. */
@Component({
  selector: 'app-canvas-info-popup',
  templateUrl: './canvas-info-popup.component.html',
  host: {
    class: 'pointer-events-none col-[1/-1] row-[1/-1] block',
  },
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CanvasInfoPopupComponent {
  @Input() levelNum = 0;
  @Input() objectCount = 0;

  @Output() close = new EventEmitter<void>();
}
