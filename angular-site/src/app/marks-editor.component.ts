import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import type { MarkSeg } from './level-editor.service';
import type { MarkingRoadSelection } from './road-marking-utils';

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
  @Input() markCreateMode = false;
  @Input() pendingMarkPointCount = 0;
  @Input() roadMaxY = 0;

  sideRoadSelection: MarkingRoadSelection = 'both';
  sideYStart = 0;
  sideYEnd = 400;
  sideInset = 10;

  centreRoadSelection: MarkingRoadSelection = 'both';
  centreYStart = 0;
  centreYEnd = 400;
  dashFrequency = 32;

  @Output() markSelected   = new EventEmitter<number>();
  @Output() addMark        = new EventEmitter<void>();
  @Output() removeMark     = new EventEmitter<void>();
  @Output() saveMarks      = new EventEmitter<void>();
  @Output() startMarkCreate = new EventEmitter<void>();
  @Output() confirmMarkCreate = new EventEmitter<void>();
  @Output() generateSideMarks = new EventEmitter<{ roadSelection: MarkingRoadSelection; yStart: number; yEnd: number; inset: number }>();
  @Output() generateCentreMarks = new EventEmitter<{ roadSelection: MarkingRoadSelection; yStart: number; yEnd: number; dashFrequency: number }>();
  @Output() markFieldInput = new EventEmitter<{ idx: number; field: 'x1' | 'y1' | 'x2' | 'y2'; event: Event }>();
  @Output() markCanvasMouseDown = new EventEmitter<MouseEvent>();
  @Output() markCanvasMouseMove = new EventEmitter<MouseEvent>();
  @Output() markCanvasMouseUp   = new EventEmitter<MouseEvent>();
}
