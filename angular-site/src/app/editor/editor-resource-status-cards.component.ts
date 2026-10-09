import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

@Component({
  selector: 'app-editor-resource-status-cards',
  templateUrl: './editor-resource-status-cards.component.html',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditorResourceStatusCardsComponent {
  @Input() hasData = false;
  @Input() busy = false;
  @Input() status = '';
}
