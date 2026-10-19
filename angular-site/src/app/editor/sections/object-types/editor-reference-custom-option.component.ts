import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
@Component({
  selector: 'app-editor-reference-custom-option',
  templateUrl: './editor-reference-custom-option.component.html',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditorReferenceCustomOptionComponent {
  @Input() option: { value: number; text: string } = { value: 0, text: '' };
}
