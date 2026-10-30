import { ChangeDetectionStrategy, Component, EventEmitter, Output } from '@angular/core';

@Component({
  selector: 'app-sprite-action-buttons',
  template: `<button
      mat-raised-button
      color="primary"
      class="justify-start gap-1"
      (click)="save.emit()"
    >
      <mat-icon>check</mat-icon> Apply changes</button
    ><button mat-stroked-button (click)="cancel.emit()">Cancel</button>`,
  host: { class: 'flex shrink-0 items-center gap-2' },
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SpriteActionButtonsComponent {
  @Output() save = new EventEmitter<void>();
  @Output() cancel = new EventEmitter<void>();
}
