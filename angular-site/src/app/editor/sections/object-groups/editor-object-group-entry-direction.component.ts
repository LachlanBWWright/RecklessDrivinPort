import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { FormControl } from '@angular/forms';

@Component({
  selector: 'app-editor-object-group-entry-direction',
  templateUrl: './editor-object-group-entry-direction.component.html',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditorObjectGroupEntryDirectionComponent {
  @Input({ required: true }) control!: FormControl<number>;
  @Input({ required: true }) getDirArrowRotation!: (dir: number) => string;
  @Input({ required: true }) isAutoDir!: (dir: number) => boolean;
}
