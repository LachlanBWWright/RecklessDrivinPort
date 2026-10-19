import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import type { ObjectPos } from '../level-editor.service';

@Component({
  selector: 'app-editor-object-list-row',
  templateUrl: './editor-object-list-row.component.html',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditorObjectListRowComponent {
  @Input({ required: true }) object!: ObjectPos;
  @Input({ required: true }) index = 0;
  @Input() selected = false;
  @Input() getSpriteUrl: (typeRes: number) => string | null = () => null;
  @Input() getFallbackColor: (typeRes: number) => string = () => '#888';
  @Output() selectedChange = new EventEmitter<void>();
}
