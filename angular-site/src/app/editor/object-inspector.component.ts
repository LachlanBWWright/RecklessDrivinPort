import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy, OnChanges, SimpleChanges } from '@angular/core';

@Component({
  selector: 'app-object-inspector',
  templateUrl: './object-inspector.component.html',
  styleUrl: './object-inspector.component.scss',
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
  /** True while the direction input element has focus – prevents ngOnChanges resetting typed text. */
  dirDegFocused = false;

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

  onDirDegTextInput(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    if (!target) return;
    this.dirDegText = target.value;
    if (this.dirDegFocused) {
      this.dirDegInput.emit(this.dirDegText);
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    // Only update the text input when the user is NOT actively editing it.
    // Without this guard, every Angular change-detection cycle (triggered by
    // canvas redraws etc.) would reset the typed value mid-edit.
    if (changes['editDirDeg'] && !this.dirDegFocused) {
      this.dirDegText = Number.isFinite(this.editDirDeg) ? this.editDirDeg.toString() : '0';
    }
  }
}
