import { Component, ChangeDetectionStrategy, EventEmitter, Input, Output } from '@angular/core';
import { FormControl, FormGroup } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import type { MarkingRoadSelection } from '../../road-marking-utils';

export interface MarkingGenerateEvent {
  roadSelection: MarkingRoadSelection;
  yStart: number;
  yEnd: number;
  inset: number;
  yFrequency: number;
}

export interface MarkingCentreGenerateEvent {
  roadSelection: MarkingRoadSelection;
  yStart: number;
  yEnd: number;
  dashLength: number;
  gapLength: number;
}

export interface MarkingRemoveEvent {
  yStart: number;
  yEnd: number;
}

/** Road-marking generation popup — encapsulates the side/dash form state. */
@Component({
  selector: 'app-marking-popup',
  templateUrl: './marking-popup.component.html',
  host: {
    class: 'pointer-events-none col-[1/-1] row-[1/-1] block',
  },
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MarkingPopupComponent {
  @Input() roadMaxY = 0;
  @Input() workerBusy = false;

  @Output() close = new EventEmitter<void>();
  @Output() generateSideMarks = new EventEmitter<MarkingGenerateEvent>();
  @Output() generateCentreMarks = new EventEmitter<MarkingCentreGenerateEvent>();
  @Output() previewSideMarks = new EventEmitter<MarkingGenerateEvent>();
  @Output() previewCentreMarks = new EventEmitter<MarkingCentreGenerateEvent>();
  @Output() removeMarks = new EventEmitter<MarkingRemoveEvent>();
  @Output() clearPreview = new EventEmitter<void>();

  markingTab: 'side' | 'dash' | 'remove' = 'side';

  readonly sideForm = new FormGroup({
    combined: new FormControl(true, { nonNullable: true }),
    left: new FormControl(true, { nonNullable: true }),
    right: new FormControl(true, { nonNullable: true }),
    yStart: new FormControl(0, { nonNullable: true }),
    yEnd: new FormControl(400, { nonNullable: true }),
    inset: new FormControl(10, { nonNullable: true }),
    yFrequency: new FormControl(32, { nonNullable: true }),
  });

  readonly centreForm = new FormGroup({
    combined: new FormControl(true, { nonNullable: true }),
    left: new FormControl(true, { nonNullable: true }),
    right: new FormControl(true, { nonNullable: true }),
    yStart: new FormControl(0, { nonNullable: true }),
    yEnd: new FormControl(400, { nonNullable: true }),
    dashLength: new FormControl(16, { nonNullable: true }),
    gapLength: new FormControl(16, { nonNullable: true }),
  });

  readonly removeForm = new FormGroup({
    yStart: new FormControl(0, { nonNullable: true }),
    yEnd: new FormControl(400, { nonNullable: true }),
  });

  private _previewDebounce: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.sideForm.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      this.schedulePreview();
    });
    this.centreForm.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      this.schedulePreview();
    });
    this.removeForm.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      this.schedulePreview();
    });
  }

  private checkboxesToSelection(
    combined: boolean,
    left: boolean,
    right: boolean,
  ): MarkingRoadSelection {
    if (combined && (left || right)) return 'both';
    if (combined) return 'single';
    if (left && right) return 'both';
    if (left) return 'left';
    if (right) return 'right';
    return 'both';
  }

  private toNumber(value: number | null): number {
    const next = Number(value);
    return Number.isFinite(next) ? next : 0;
  }

  get sideRoadSelection(): MarkingRoadSelection {
    const { combined, left, right } = this.sideForm.getRawValue();
    return this.checkboxesToSelection(combined, left, right);
  }

  get centreRoadSelection(): MarkingRoadSelection {
    const { combined, left, right } = this.centreForm.getRawValue();
    return this.checkboxesToSelection(combined, left, right);
  }

  schedulePreview(delayMs = 300): void {
    if (this._previewDebounce !== null) clearTimeout(this._previewDebounce);
    this._previewDebounce = setTimeout(() => {
      this._previewDebounce = null;
      this.onPreview();
    }, delayMs);
  }

  onPreview(): void {
    if (this.markingTab === 'side') {
      const { combined, left, right } = this.sideForm.getRawValue();
      this.previewSideMarks.emit({
        roadSelection: this.checkboxesToSelection(combined, left, right),
        yStart: this.toNumber(this.sideForm.controls.yStart.value),
        yEnd: this.toNumber(this.sideForm.controls.yEnd.value),
        inset: this.toNumber(this.sideForm.controls.inset.value),
        yFrequency: Math.max(1, this.toNumber(this.sideForm.controls.yFrequency.value)),
      });
    } else if (this.markingTab === 'dash') {
      const { combined, left, right } = this.centreForm.getRawValue();
      this.previewCentreMarks.emit({
        roadSelection: this.checkboxesToSelection(combined, left, right),
        yStart: this.toNumber(this.centreForm.controls.yStart.value),
        yEnd: this.toNumber(this.centreForm.controls.yEnd.value),
        dashLength: Math.max(1, this.toNumber(this.centreForm.controls.dashLength.value)),
        gapLength: Math.max(1, this.toNumber(this.centreForm.controls.gapLength.value)),
      });
    }
  }

  onTabChange(tab: 'side' | 'dash' | 'remove'): void {
    this.markingTab = tab;
    this.clearPreview.emit();
    this.schedulePreview(0);
  }

  onGenerate(): void {
    if (this.markingTab === 'side') {
      const { combined, left, right } = this.sideForm.getRawValue();
      this.generateSideMarks.emit({
        roadSelection: this.checkboxesToSelection(combined, left, right),
        yStart: this.toNumber(this.sideForm.controls.yStart.value),
        yEnd: this.toNumber(this.sideForm.controls.yEnd.value),
        inset: this.toNumber(this.sideForm.controls.inset.value),
        yFrequency: Math.max(1, this.toNumber(this.sideForm.controls.yFrequency.value)),
      });
    } else if (this.markingTab === 'dash') {
      const { combined, left, right } = this.centreForm.getRawValue();
      this.generateCentreMarks.emit({
        roadSelection: this.checkboxesToSelection(combined, left, right),
        yStart: this.toNumber(this.centreForm.controls.yStart.value),
        yEnd: this.toNumber(this.centreForm.controls.yEnd.value),
        dashLength: Math.max(1, this.toNumber(this.centreForm.controls.dashLength.value)),
        gapLength: Math.max(1, this.toNumber(this.centreForm.controls.gapLength.value)),
      });
    } else {
      this.removeMarks.emit({
        yStart: this.toNumber(this.removeForm.controls.yStart.value),
        yEnd: this.toNumber(this.removeForm.controls.yEnd.value),
      });
    }
    this.clearPreview.emit();
  }
}
