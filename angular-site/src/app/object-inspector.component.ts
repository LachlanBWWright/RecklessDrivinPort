import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy, OnChanges, SimpleChanges } from '@angular/core';

@Component({
  selector: 'app-object-inspector',
  templateUrl: './object-inspector.component.html',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ObjectInspectorComponent implements OnChanges {
  @Input() selectedIndex: number | null = null;
  @Input() editDirDeg = 0;
  @Input() editTypeRes = 128;
  @Input() availableTypeIds: number[] = [];
  @Input() spriteUrl: string | null = null;
  @Input() getSpriteUrl: (typeRes: number) => string | null = () => null;
  @Input() getFallbackColor: (typeRes: number) => string = () => '#888';
  @Input() typePalette: {hex: string, typeId: number}[] = [];
  @Input() visibleTypeFilter: Set<number> = new Set();
  @Input() workerBusy = false;
  @Input() typeDimLabel = '';
  dirDegText = '0';

  @Output() dirDegInput = new EventEmitter<string>();
  @Output() typeResChange = new EventEmitter<number>();
  @Output() typeVisibilityToggle = new EventEmitter<number>();
  @Output() showAll = new EventEmitter<void>();
  @Output() hideAll = new EventEmitter<void>();
  @Output() removeSelected = new EventEmitter<void>();
  @Output() deselect = new EventEmitter<void>();

  /** CSS rotation for the direction arrow (degrees, clockwise from up). */
  get dirArrowRotation(): string {
    const deg = Number.isFinite(this.editDirDeg) ? this.editDirDeg : 0;
    // World dir=0 = up. Arrow points up (north) at 0°. Positive deg rotates clockwise.
    return `rotate(${deg}deg)`;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['editDirDeg']) {
      this.dirDegText = Number.isFinite(this.editDirDeg) ? this.editDirDeg.toString() : '0';
    }
  }
}
