import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
@Component({
  selector: 'app-editor-object-entry-thumbnail',
  templateUrl: './editor-object-entry-thumbnail.component.html',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditorObjectEntryThumbnailComponent {
  @Input() url: string | null = null;
  @Input() fallbackText = '#';
}
