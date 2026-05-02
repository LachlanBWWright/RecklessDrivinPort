import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-editor-strings-section',
  templateUrl: './editor-strings-section.component.html',
  host: {
    class: 'flex min-h-0 w-full flex-1 flex-col',
  },
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditorStringsSectionComponent {
  /** All strings in the STR# resource, null while loading. */
  @Input() strings: string[] | null = null;
  /** True while a save or load operation is in progress. */
  @Input() busy = false;
  /** True once strings have been modified since the last save. */
  @Input() dirty = false;

  @Output() stringChange = new EventEmitter<{ index: number; value: string }>();
  @Output() addString = new EventEmitter<void>();
  @Output() removeString = new EventEmitter<number>();
  @Output() save = new EventEmitter<void>();

  trackByIndex(index: number): number {
    return index;
  }

  onInput(index: number, event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.stringChange.emit({ index, value });
  }
}
