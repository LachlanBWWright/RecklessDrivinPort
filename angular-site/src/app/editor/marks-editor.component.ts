import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import type { MarkSeg } from '../level-editor.service';

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
  @Output() markFieldInput = new EventEmitter<{ idx: number; field: 'x1' | 'y1' | 'x2' | 'y2'; event: Event }>();

  /** The currently selected mark, or null if none selected. */
  get selectedMark(): MarkSeg | null {
    if (this.selectedMarkIndex === null) return null;
    return this.marks[this.selectedMarkIndex] ?? null;
  }

  onFieldInput(idx: number | null, field: 'x1' | 'y1' | 'x2' | 'y2', event: Event): void {
    if (idx === null) return;
    this.markFieldInput.emit({ idx, field, event });
  }
}
