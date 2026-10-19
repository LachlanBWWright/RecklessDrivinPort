import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
@Component({
  selector: 'app-object-type-dimension-badge',
  templateUrl: './object-type-dimension-badge.component.html',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ObjectTypeDimensionBadgeComponent {
  @Input() label = '';
}
