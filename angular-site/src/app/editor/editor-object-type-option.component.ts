import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

@Component({
  selector: 'app-editor-object-type-option',
  template: `<mat-option [value]="typeRes"
    ><span
      class="flex h-[1.875rem] max-h-[1.875rem] w-full min-w-0 items-center justify-start gap-3 overflow-hidden"
      ><span>{{ typeRes }}</span
      ><app-object-type-preview
        [typeRes]="typeRes"
        [getSpriteUrl]="getSpriteUrl"
        [getFallbackColor]="getFallbackColor" /></span
  ></mat-option>`,
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditorObjectTypeOptionComponent {
  @Input({ required: true }) typeRes = 0;
  @Input() getSpriteUrl: (typeRes: number) => string | null = () => null;
  @Input() getFallbackColor: (typeRes: number) => string = () => '#888';
}
