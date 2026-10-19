import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
@Component({
  selector: 'app-editor-tile-thumbnail',
  templateUrl: './editor-tile-thumbnail.component.html',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditorTileThumbnailComponent {
  @Input() url: string | null = null;
  @Input() alt = '';
}
