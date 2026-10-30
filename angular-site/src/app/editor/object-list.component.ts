import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  ElementRef,
  inject,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
} from '@angular/core';
import { FormControl } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import type { ObjectPos } from '../level-editor.service';

@Component({
  selector: 'app-object-list',
  templateUrl: './object-list.component.html',
  host: {
    class: 'flex min-h-0 flex-1 flex-col overflow-hidden',
  },
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ObjectListComponent implements OnChanges {
  @Input() objects: ObjectPos[] = [];
  @Input() filteredIndices: number[] = [];
  @Input() selectedIndex: number | null = null;
  @Input() searchTerm = '';
  @Input() getSpriteUrl: (typeRes: number) => string | null = () => null;
  @Input() getFallbackColor: (typeRes: number) => string = () => '#888';

  @Output() objectSelected = new EventEmitter<number>();
  @Output() searchTermChange = new EventEmitter<string>();

  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);

  onListKeydown(event: KeyboardEvent): void {
    if (!(event.target instanceof HTMLElement)) return;
    const row = event.target.closest<HTMLButtonElement>('button[data-object-index]');
    if (!row) return;
    const position = this.filteredIndices.indexOf(Number(row.dataset['objectIndex']));
    if (position < 0) return;
    let next = position;
    switch (event.key) {
      case 'ArrowDown':
        next = Math.min(position + 1, this.filteredIndices.length - 1);
        break;
      case 'ArrowUp':
        next = Math.max(position - 1, 0);
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = this.filteredIndices.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    event.stopPropagation();
    const index = this.filteredIndices[next];
    this.objectSelected.emit(index);
    this.element.nativeElement
      .querySelector<HTMLButtonElement>(`button[data-object-index="${index}"]`)
      ?.focus();
  }

  readonly searchControl = new FormControl('', { nonNullable: true });

  constructor() {
    this.searchControl.valueChanges.pipe(takeUntilDestroyed()).subscribe((value) => {
      this.searchTermChange.emit(value ?? '');
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['searchTerm']) {
      this.searchControl.setValue(this.searchTerm, { emitEvent: false });
    }
  }
}
