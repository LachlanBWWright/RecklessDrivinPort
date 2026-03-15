import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import type { ObjectPos } from './level-editor.service';

@Component({
  selector: 'app-object-list',
  templateUrl: './object-list.component.html',
  styleUrl: './object-list.component.scss',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ObjectListComponent {
  @Input() objects: ObjectPos[] = [];
  @Input() filteredIndices: number[] = [];
  @Input() selectedIndex: number | null = null;
  @Input() searchTerm = '';
  @Input() getSpriteUrl: (typeRes: number) => string | null = () => null;
  @Input() getFallbackColor: (typeRes: number) => string = () => '#888';

  @Output() objectSelected = new EventEmitter<number>();
  @Output() searchTermChange = new EventEmitter<string>();

  /** Typed handler for the search input event – avoids $any() in the template. */
  onSearchInput(event: Event): void {
    const input = event.target;
    if (input instanceof HTMLInputElement) {
      this.searchTermChange.emit(input.value);
    }
  }
}
