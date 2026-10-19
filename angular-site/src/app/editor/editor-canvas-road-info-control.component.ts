import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import type { RoadInfoOption } from '../level-editor.service';
import type { EditorCanvasComponent } from './editor-canvas.component';

@Component({
  selector: 'app-editor-canvas-road-info-control',
  templateUrl: './editor-canvas-road-info-control.component.html',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditorCanvasRoadInfoControlComponent {
  @Input({ required: true }) canvasForm!: EditorCanvasComponent['canvasForm'];
  @Input() editRoadInfo = 0;
  @Input() roadInfoOptions: RoadInfoOption[] = [];
  @Input() getRoadInfoOption: (id: number) => RoadInfoOption | undefined = () => undefined;
}
