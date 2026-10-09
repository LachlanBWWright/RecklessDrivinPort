import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import type { EditorCanvasComponent } from './editor-canvas.component';

@Component({
  selector: 'app-editor-canvas-toolbar',
  templateUrl: './editor-canvas-toolbar.component.html',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditorCanvasToolbarComponent {
  @Input({ required: true }) state!: EditorCanvasComponent;

  get host(): EditorCanvasComponent {
    return this.state;
  }
}
