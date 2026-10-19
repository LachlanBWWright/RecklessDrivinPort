import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import type { FormGroup } from '@angular/forms';

@Component({
  selector: 'app-editor-object-type-frame-select',
  templateUrl: './editor-object-type-frame-select.component.html',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditorObjectTypeFrameSelectComponent {
  @Input({ required: true }) form!: FormGroup;
  @Input() frames: { id: number }[] = [];
  @Input() typeFrame = 0;
  @Input() getFrameLabel: (frame: number) => string = (frame) => '#' + frame;

  get value(): number {
    return Number(this.form.get('frame')?.value ?? this.typeFrame);
  }

  get hasCustom(): boolean {
    return !this.frames.some((frame) => frame.id === this.value);
  }
}
