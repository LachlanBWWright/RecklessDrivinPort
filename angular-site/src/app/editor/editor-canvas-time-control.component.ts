import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import type { EditorCanvasComponent } from './editor-canvas.component';

@Component({
  selector: 'app-editor-canvas-time-control',
  templateUrl: './editor-canvas-time-control.component.html',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditorCanvasTimeControlComponent {
  @Input({ required: true }) canvasForm!: EditorCanvasComponent['canvasForm'];
  @Output() focus = new EventEmitter<void>();
  @Output() blur = new EventEmitter<void>();
  @Output() commit = new EventEmitter<void>();
}
