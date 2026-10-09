import { ChangeDetectionStrategy, Component, EventEmitter, Output } from '@angular/core';

@Component({
  selector: 'app-sprite-action-buttons',
  template: `<button
      mat-raised-button
      color="primary"
      class="justify-start gap-1"
      (click)="save.emit()"
    >
      <mat-icon>save</mat-icon> Save to file</button
    ><button mat-stroked-button (click)="cancel.emit()">Cancel</button>`,
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SpriteActionButtonsComponent {
  @Output() save = new EventEmitter<void>();
  @Output() cancel = new EventEmitter<void>();
}
