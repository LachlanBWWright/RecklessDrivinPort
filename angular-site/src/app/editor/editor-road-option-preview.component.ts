import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import type { RoadInfoOption } from '../level-editor.service';

@Component({
  selector: 'app-editor-road-option-preview',
  templateUrl: './editor-road-option-preview.component.html',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditorRoadOptionPreviewComponent {
  @Input() option: RoadInfoOption | null | undefined = null;
  @Input() fallbackId = 0;
}
