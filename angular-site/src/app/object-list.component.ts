import { Component, Input, Output, EventEmitter } from '@angular/core';
import type { ObjectPos } from './level-editor.service';

@Component({
  selector: 'app-object-list',
  templateUrl: './object-list.component.html',
  standalone: false,
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
}
