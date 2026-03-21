import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';

@Component({
  selector: 'app-object-inspector',
  templateUrl: './object-inspector.component.html',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ObjectInspectorComponent {
  @Input() selectedIndex: number | null = null;
  @Input() editDirDeg = 0;
  @Input() editTypeRes = 128;
  @Input() availableTypeIds: number[] = [];
  @Input() spriteUrl: string | null = null;
  @Input() typePalette: {hex: string, typeId: number}[] = [];
  @Input() visibleTypeFilter: Set<number> = new Set();
  @Input() workerBusy = false;
  @Input() typeDimLabel = '';

  @Output() dirDegInput = new EventEmitter<{event: Event}>();
  @Output() typeResChange = new EventEmitter<number>();
  @Output() typeVisibilityToggle = new EventEmitter<number>();
  @Output() showAll = new EventEmitter<void>();
  @Output() hideAll = new EventEmitter<void>();
  @Output() removeSelected = new EventEmitter<void>();
  @Output() deselect = new EventEmitter<void>();
}
