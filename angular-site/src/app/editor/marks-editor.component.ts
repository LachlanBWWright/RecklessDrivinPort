import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
} from '@angular/core';
import { FormControl, FormGroup } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import type { MarkSeg } from '../level-editor.service';

type MarkField = 'x1' | 'y1' | 'x2' | 'y2';

/**
 * Marks (checkpoint) editor panel.
 * Extracted from EditorCanvasComponent so the marks table and controls live
 * in their own component with an appropriate change-detection boundary.
 */
@Component({
  selector: 'app-marks-editor',
  templateUrl: './marks-editor.component.html',
  host: {
    class: 'block',
  },
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MarksEditorComponent implements OnChanges {
  @Input() marks: MarkSeg[] = [];
  @Input() selectedMarkIndex: number | null = null;
  @Input() workerBusy = false;

  @Output() markSelected = new EventEmitter<number>();
  @Output() markFieldInput = new EventEmitter<{ idx: number; field: MarkField; value: number }>();

  readonly markForm = new FormGroup({
    x1: new FormControl<number | null>(null),
    y1: new FormControl<number | null>(null),
    x2: new FormControl<number | null>(null),
    y2: new FormControl<number | null>(null),
  });

  /** The currently selected mark, or null if none selected. */
  get selectedMark(): MarkSeg | null {
    if (this.selectedMarkIndex === null) return null;
    return this.marks[this.selectedMarkIndex] ?? null;
  }

  constructor() {
    this.markForm.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      this.emitFieldChanges();
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['selectedMarkIndex'] || changes['marks']) {
      this.syncForm();
    }
    if (changes['workerBusy']) {
      if (this.workerBusy) {
        this.markForm.disable({ emitEvent: false });
      } else {
        this.markForm.enable({ emitEvent: false });
      }
    }
  }

  private syncForm(): void {
    const mark = this.selectedMark;
    this.markForm.patchValue(
      mark
        ? {
            x1: mark.x1,
            y1: mark.y1,
            x2: mark.x2,
            y2: mark.y2,
          }
        : {
            x1: null,
            y1: null,
            x2: null,
            y2: null,
          },
      { emitEvent: false },
    );
  }

  private emitFieldChanges(): void {
    const idx = this.selectedMarkIndex;
    const mark = this.selectedMark;
    if (idx === null || !mark) return;
    const next = this.markForm.getRawValue();
    const fields: MarkField[] = ['x1', 'y1', 'x2', 'y2'];
    for (const field of fields) {
      const value = next[field];
      if (value === null) continue;
      if (value !== mark[field]) {
        this.markFieldInput.emit({ idx, field, value });
      }
    }
  }
}
