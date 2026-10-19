import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';

export interface SpritePaletteColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

@Component({
  selector: 'app-sprite-palette-swatches',
  templateUrl: './sprite-palette-swatches.component.html',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SpritePaletteSwatchesComponent {
  @Input() colors: readonly SpritePaletteColor[] = [];
  @Input() emptyLabel = '';
  @Output() colorSelected = new EventEmitter<SpritePaletteColor>();
}
