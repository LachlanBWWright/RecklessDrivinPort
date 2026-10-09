import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import type { SpriteEditorTool } from './sprite-editor.component';

@Component({
  selector: 'app-sprite-tool-buttons',
  templateUrl: './sprite-tool-buttons.component.html',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SpriteToolButtonsComponent {
  @Input() tools: readonly SpriteEditorTool[] = [];
  @Input() tool: SpriteEditorTool = 'pencil';
  @Input() toolIcons: Readonly<Partial<Record<SpriteEditorTool, string>>> = {};
  @Output() toolChange = new EventEmitter<SpriteEditorTool>();
}
