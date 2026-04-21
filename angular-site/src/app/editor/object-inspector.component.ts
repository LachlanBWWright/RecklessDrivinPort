import { ChangeDetectionStrategy, Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { FormControl, FormGroup } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

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
  /** True while the direction input element has focus – prevents ngOnChanges resetting typed text. */
  dirDegFocused = false;

  @Output() dirDegInput = new EventEmitter<string>();
  @Output() typeResChange = new EventEmitter<number>();
  @Output() typeVisibilityToggle = new EventEmitter<number>();
  @Output() showAll = new EventEmitter<void>();
  @Output() hideAll = new EventEmitter<void>();
  @Output() removeSelected = new EventEmitter<void>();
  @Output() deselect = new EventEmitter<void>();

  readonly inspectorForm = new FormGroup({
    dirDegText: new FormControl('0', { nonNullable: true }),
    typeRes: new FormControl<number | null>(null),
  });

  /** CSS rotation for the direction arrow (degrees, clockwise from up). */
  get dirArrowRotation(): string {
    const deg = Number.isFinite(this.editDirDeg) ? this.editDirDeg : 0;
    // World dir=0 = up. Arrow points up (north) at 0°. Positive deg rotates clockwise.
    return `rotate(${deg}deg)`;
  }

  get dirDegText(): string {
    return this.inspectorForm.controls.dirDegText.value;
  }

  /** Commit the current direction text to the parent model. */
  commitDirDegText(): void {
    this.dirDegInput.emit(this.dirDegText);
  }

  constructor() {
    this.inspectorForm.controls.typeRes.valueChanges.pipe(takeUntilDestroyed()).subscribe((value) => {
      if (value !== null) {
        this.typeResChange.emit(value);
      }
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    // Only update the text input when the user is NOT actively editing it.
    // Without this guard, every Angular change-detection cycle (triggered by
    // canvas redraws etc.) would reset the typed value mid-edit.
    if (changes['editDirDeg'] && !this.dirDegFocused) {
      this.inspectorForm.controls.dirDegText.setValue(
        Number.isFinite(this.editDirDeg) ? this.editDirDeg.toString() : '0',
        { emitEvent: false },
      );
    }
    if (changes['editTypeRes']) {
      this.inspectorForm.controls.typeRes.setValue(this.editTypeRes, { emitEvent: false });
    }
    if (changes['workerBusy']) {
      if (this.workerBusy) {
        this.inspectorForm.disable({ emitEvent: false });
      } else {
        this.inspectorForm.enable({ emitEvent: false });
      }
    }
  }
}
