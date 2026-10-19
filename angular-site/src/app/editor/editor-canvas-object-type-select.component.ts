import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-editor-canvas-object-type-select',
  templateUrl: './editor-canvas-object-type-select.component.html',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditorCanvasObjectTypeSelectComponent {
  @Input() selectedTypeId = 128;
  @Input() availableTypeIds: number[] = [];
  @Input() disabled = false;
  @Input() getSpriteUrl: (typeRes: number) => string | null = () => null;
  @Output() typeChange = new EventEmitter<number>();
}
