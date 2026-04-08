import { Component, ChangeDetectionStrategy, EventEmitter, Input, Output, ViewEncapsulation } from '@angular/core';
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

/** Road-marking generation popup — encapsulates the side/dash form state. */
@Component({
  selector: 'app-marking-popup',
  templateUrl: './marking-popup.component.html',
  styleUrl: './marking-popup.component.scss',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
})
export class MarkingPopupComponent {
  @Input() roadMaxY = 0;
  @Input() workerBusy = false;

  @Output() close = new EventEmitter<void>();
  @Output() generateSideMarks = new EventEmitter<MarkingGenerateEvent>();
  @Output() generateCentreMarks = new EventEmitter<MarkingCentreGenerateEvent>();
  @Output() previewSideMarks = new EventEmitter<MarkingGenerateEvent>();
  @Output() previewCentreMarks = new EventEmitter<MarkingCentreGenerateEvent>();
  @Output() clearPreview = new EventEmitter<void>();

  markingTab: 'side' | 'dash' = 'side';

  // Side marks – road checkboxes
  sideCombined = true;
  sideLeft = true;
  sideRight = true;
  sideYStart = 0;
  sideYEnd = 400;
  sideInset = 10;
  sideYFrequency = 32;

  // Centre marks – road checkboxes
  centreCombined = true;
  centreLeft = true;
  centreRight = true;
  centreYStart = 0;
  centreYEnd = 400;
  centreDashLength = 16;
  centreGapLength = 16;

  private _previewDebounce: ReturnType<typeof setTimeout> | null = null;

  private checkboxesToSelection(combined: boolean, left: boolean, right: boolean): MarkingRoadSelection {
    if (combined && (left || right)) return 'both';
    if (combined) return 'single';
    if (left && right) return 'both';
    if (left) return 'left';
    if (right) return 'right';
    return 'both';
  }

  get sideRoadSelection(): MarkingRoadSelection {
    return this.checkboxesToSelection(this.sideCombined, this.sideLeft, this.sideRight);
  }

  get centreRoadSelection(): MarkingRoadSelection {
    return this.checkboxesToSelection(this.centreCombined, this.centreLeft, this.centreRight);
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
      this.previewSideMarks.emit({
        roadSelection: this.sideRoadSelection,
        yStart: this.sideYStart,
        yEnd: this.sideYEnd,
        inset: this.sideInset,
        yFrequency: this.sideYFrequency,
      });
    } else {
      this.previewCentreMarks.emit({
        roadSelection: this.centreRoadSelection,
        yStart: this.centreYStart,
        yEnd: this.centreYEnd,
        dashLength: this.centreDashLength,
        gapLength: this.centreGapLength,
      });
    }
  }

  onTabChange(tab: 'side' | 'dash'): void {
    this.markingTab = tab;
    this.clearPreview.emit();
    this.schedulePreview(0);
  }

  onGenerate(): void {
    if (this.markingTab === 'side') {
      this.generateSideMarks.emit({
        roadSelection: this.sideRoadSelection,
        yStart: this.sideYStart,
        yEnd: this.sideYEnd,
        inset: this.sideInset,
        yFrequency: this.sideYFrequency,
      });
    } else {
      this.generateCentreMarks.emit({
        roadSelection: this.centreRoadSelection,
        yStart: this.centreYStart,
        yEnd: this.centreYEnd,
        dashLength: this.centreDashLength,
        gapLength: this.centreGapLength,
      });
    }
    this.clearPreview.emit();
  }
}
