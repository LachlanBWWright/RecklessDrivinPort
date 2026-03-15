import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import type { MarkSeg } from './level-editor.service';

/**
 * Marks (checkpoint) editor panel.
 * Extracted from EditorCanvasComponent so the marks table and controls live
 * in their own component with an appropriate change-detection boundary.
 */
@Component({
  selector: 'app-marks-editor',
  templateUrl: './marks-editor.component.html',
  styleUrl: './marks-editor.component.scss',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MarksEditorComponent {
  @Input() marks: MarkSeg[] = [];
  @Input() selectedMarkIndex: number | null = null;
  @Input() workerBusy = false;

  @Output() markSelected   = new EventEmitter<number>();
  @Output() addMark        = new EventEmitter<void>();
  @Output() removeMark     = new EventEmitter<void>();
  @Output() saveMarks      = new EventEmitter<void>();
  @Output() markFieldInput = new EventEmitter<{ idx: number; field: 'x1' | 'y1' | 'x2' | 'y2'; event: Event }>();
  @Output() markCanvasMouseDown = new EventEmitter<MouseEvent>();
  @Output() markCanvasMouseMove = new EventEmitter<MouseEvent>();
  @Output() markCanvasMouseUp   = new EventEmitter<MouseEvent>();
}
