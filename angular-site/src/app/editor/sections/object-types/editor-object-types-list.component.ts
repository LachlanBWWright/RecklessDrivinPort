import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import type { ObjectTypeDefinition } from '../../../level-editor.service';

@Component({
  selector: 'app-editor-object-types-list',
  templateUrl: './editor-object-types-list.component.html',
  host: { style: 'display: contents' },
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditorObjectTypesListComponent {
  @Input() objectTypes: ObjectTypeDefinition[] = [];
  @Input() selectedObjectTypeId: number | null = null;
  @Input() workerBusy = false;
  @Input() getSpriteUrl: (frameId: number) => string | null = () => null;
  @Input() getFrameLabel: (frameId: number) => string = (id) => `#${id}`;
  @Output() addType = new EventEmitter<void>();
  @Output() selectType = new EventEmitter<number>();

  trackType(index: number, type: ObjectTypeDefinition): number {
    return type.typeRes || index;
  }
}
