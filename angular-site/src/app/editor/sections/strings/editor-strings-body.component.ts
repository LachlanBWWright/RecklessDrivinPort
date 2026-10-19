import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-editor-strings-body',
  templateUrl: './editor-strings-body.component.html',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditorStringsBodyComponent {
  @Input() strings: string[] = [];
  @Input() busy = false;
  @Input() dirty = false;
  @Output() stringChange = new EventEmitter<{ index: number; value: string }>();
  @Output() addString = new EventEmitter<void>();
  @Output() removeString = new EventEmitter<number>();
  @Output() save = new EventEmitter<void>();

  onInput(index: number, event: Event): void {
    const target = event.target;
    if (target instanceof HTMLInputElement) this.stringChange.emit({ index, value: target.value });
  }
}
