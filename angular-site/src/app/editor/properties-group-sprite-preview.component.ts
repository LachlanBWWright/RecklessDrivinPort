import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
@Component({
  selector: 'app-properties-group-sprite-preview',
  templateUrl: './properties-group-sprite-preview.component.html',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PropertiesGroupSpritePreviewComponent {
  @Input() typeResIds: number[] = [];
  @Input() getSpriteUrl: (typeRes: number) => string | null = () => null;
}
