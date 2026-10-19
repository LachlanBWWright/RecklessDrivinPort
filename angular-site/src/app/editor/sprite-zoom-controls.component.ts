import { ChangeDetectionStrategy, Component, EventEmitter, Output } from '@angular/core';

@Component({
  selector: 'app-sprite-zoom-controls',
  templateUrl: './sprite-zoom-controls.component.html',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SpriteZoomControlsComponent {
  @Output() zoomOut = new EventEmitter<void>();
  @Output() zoomIn = new EventEmitter<void>();
}
