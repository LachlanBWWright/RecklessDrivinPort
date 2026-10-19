import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import type { RoadInfoOption } from '../level-editor.service';
import type { EditorCanvasComponent } from './editor-canvas.component';

@Component({
  selector: 'app-editor-canvas-road-controls',
  templateUrl: './editor-canvas-road-controls.component.html',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditorCanvasRoadControlsComponent {
  @Input({ required: true }) canvasForm!: EditorCanvasComponent['canvasForm'];
  @Input() editRoadInfo = 0;
  @Input() roadInfoOptions: RoadInfoOption[] = [];
  @Input() getRoadInfoOption: (id: number) => RoadInfoOption | undefined = () => undefined;
  @Output() timeLimitFocus = new EventEmitter<void>();
  @Output() timeLimitBlur = new EventEmitter<void>();
  @Output() timeLimitCommit = new EventEmitter<void>();
}
