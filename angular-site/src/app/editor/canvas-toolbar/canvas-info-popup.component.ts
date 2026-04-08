import { Component, ChangeDetectionStrategy, Input, Output, EventEmitter, ViewEncapsulation } from '@angular/core';

/** Canvas info/help popup overlay. Shows level stats and keyboard shortcuts. */
@Component({
  selector: 'app-canvas-info-popup',
  templateUrl: './canvas-info-popup.component.html',
  styleUrl: './canvas-info-popup.component.scss',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
})
export class CanvasInfoPopupComponent {
  @Input() levelNum = 0;
  @Input() objectCount = 0;

  @Output() close = new EventEmitter<void>();
}
