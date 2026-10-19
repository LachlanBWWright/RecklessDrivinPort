import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
@Component({
  selector: 'app-object-type-preview',
  templateUrl: './object-type-preview.component.html',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ObjectTypePreviewComponent {
  @Input() typeRes = 0;
  @Input() getSpriteUrl: (typeRes: number) => string | null = () => null;
  @Input() getFallbackColor: (typeRes: number) => string = () => '';
}
