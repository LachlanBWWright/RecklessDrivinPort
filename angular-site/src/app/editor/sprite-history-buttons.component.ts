import { ChangeDetectionStrategy, Component, EventEmitter, Output } from '@angular/core';
@Component({
  selector: 'app-sprite-history-buttons',
  templateUrl: './sprite-history-buttons.component.html',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SpriteHistoryButtonsComponent {
  @Output() undo = new EventEmitter<void>();
  @Output() redo = new EventEmitter<void>();
}
