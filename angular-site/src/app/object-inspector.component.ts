import { Component, Input, Output, EventEmitter } from '@angular/core';

@Component({
  selector: 'app-object-inspector',
  templateUrl: './object-inspector.component.html',
  standalone: false,
})
export class ObjectInspectorComponent {
  @Input() selectedIndex: number | null = null;
  @Input() editX = 0;
  @Input() editY = 0;
  @Input() editDir = 0;
  @Input() editTypeRes = 128;
  @Input() spriteUrl: string | null = null;
  @Input() typePalette: {hex: string, typeId: number}[] = [];
  @Input() visibleTypeFilter: Set<number> = new Set();
  @Input() workerBusy = false;
  @Input() typeDimLabel = '';

  @Output() fieldInput = new EventEmitter<{field: string, event: Event}>();
  @Output() typeVisibilityToggle = new EventEmitter<number>();
  @Output() showAll = new EventEmitter<void>();
  @Output() hideAll = new EventEmitter<void>();
  @Output() removeSelected = new EventEmitter<void>();
}
