import { ChangeDetectionStrategy, Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { FormControl } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import type { ObjectPos } from '../level-editor.service';

@Component({
  selector: 'app-object-list',
  templateUrl: './object-list.component.html',
  styleUrl: './object-list.component.scss',
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
