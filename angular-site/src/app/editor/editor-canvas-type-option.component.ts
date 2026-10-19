import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

@Component({
  selector: 'app-editor-canvas-type-option',
  template: `<mat-option [value]="typeRes"
    ><span class="inline-flex min-w-0 items-center gap-2">
      @if (getSpriteUrl(typeRes); as url) {
        <img
          class="h-7 w-7 shrink-0 rounded border border-white/20 object-contain"
          [src]="url"
          alt=""
        />
      } @else {
        <span
          class="grid h-7 w-7 shrink-0 place-items-center rounded border border-white/20 text-[0.68rem] font-bold"
          >{{ typeRes }}</span
        >
      }
      <span>Type {{ typeRes }}</span></span
    ></mat-option
  >`,
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditorCanvasTypeOptionComponent {
  @Input({ required: true }) typeRes = 0;
  @Input() getSpriteUrl: (typeRes: number) => string | null = () => null;
}
