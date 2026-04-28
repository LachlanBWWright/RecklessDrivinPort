import { ChangeDetectionStrategy, Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { FormControl, FormGroup } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import type { ObjectPos, MarkSeg, RoadInfoOption, TrackWaypointRef } from '../level-editor.service';
import type { MarkingRoadSelection } from '../road-marking-utils';

export type DrawMode = 'none' | 'freehand' | 'straight' | 'curve';

@Component({
  selector: 'app-editor-canvas',
  templateUrl: './editor-canvas.component.html',
  styleUrl: './editor-canvas.component.scss',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditorCanvasComponent implements OnChanges {
  @Input() objects: ObjectPos[] = [];
  @Input() selectedObjIndex: number | null = null;
  @Input() marks: MarkSeg[] = [];
  @Input() selectedMarkIndex: number | null = null;
  @Input() showTrackOverlay = false;
  @Input() showMarks = true;
  @Input() barrierDrawSide: 'v0' | 'v1' | 'i' | 'v2' | 'v3' = 'v0';
  /** Current draw mode.  'none' = select/pan only; other values activate barrier drawing. */
  @Input() drawMode: DrawMode = 'none';
  @Input() roadInfoOptions: RoadInfoOption[] = [];
  @Input() editRoadInfo = 0;
  @Input() editTime = 0;
  @Input() canUndo = false;
  @Input() canRedo = false;
  @Input() trackUpCount = 0;
  @Input() trackDownCount = 0;
  @Input() roadSegCount = 0;
  @Input() zoom = 1;
  @Input() panX = 0;
  @Input() panY = 0;
  @Input() scrollYMax = 5000;
  @Input() scrollXMin: number = -600;
  @Input() scrollXMax: number = 600;
  @Input() levelNum = 0;
  @Input() workerBusy = false;
  @Input() isDragging = false;
  @Input() dragTrackWaypoint: TrackWaypointRef | null = null;
  @Input() hoverTrackWaypoint: TrackWaypointRef | null = null;
  @Input() spaceDown = false;
  /** Road Y range max, used for marking generation popup. */
  @Input() roadMaxY = 0;
  /** Total object count for info popup. */
  @Input() objectCount = 0;
  /** Whether there are currently previewed marks on the canvas. */
  @Input() hasMarkingPreview = false;
  /** Mark create mode state for toolbar buttons. */
  @Input() markCreateMode = false;
  @Input() pendingMarkPointCount = 0;

  @Output() canvasMouseDown = new EventEmitter<MouseEvent>();
  @Output() canvasMouseMove = new EventEmitter<MouseEvent>();
  @Output() canvasMouseUp = new EventEmitter<MouseEvent>();
  @Output() canvasDblClick = new EventEmitter<MouseEvent>();
  @Output() canvasContextMenu = new EventEmitter<MouseEvent>();
  @Output() canvasKeyDown = new EventEmitter<KeyboardEvent>();
  @Output() canvasKeyUp = new EventEmitter<KeyboardEvent>();
  @Output() canvasWheel = new EventEmitter<WheelEvent>();
  @Output() addObject = new EventEmitter<void>();
  @Output() removeObject = new EventEmitter<void>();
  @Output() duplicateObject = new EventEmitter<void>();
  @Output() frameAll = new EventEmitter<void>();
  @Output() centerSelected = new EventEmitter<void>();
  @Output() toggleTracks = new EventEmitter<void>();
  @Output() zoomIn = new EventEmitter<void>();
  @Output() zoomOut = new EventEmitter<void>();
  @Output() resetView = new EventEmitter<void>();
  @Output() undo = new EventEmitter<void>();
  @Output() redo = new EventEmitter<void>();
  @Output() roadInfoChange = new EventEmitter<number>();
  @Output() timeChange = new EventEmitter<number>();
  @Output() toggleMarks = new EventEmitter<void>();
  @Output() barrierDrawSideChange = new EventEmitter<'v0' | 'v1' | 'i' | 'v2' | 'v3'>();
  @Output() drawModeChange = new EventEmitter<DrawMode>();
  @Output() addMark = new EventEmitter<void>();
  @Output() removeMark = new EventEmitter<void>();
  @Output() startMarkCreate = new EventEmitter<void>();
  @Output() confirmMarkCreate = new EventEmitter<void>();
  @Output() panXChange = new EventEmitter<number>();
  @Output() panYChange = new EventEmitter<number>();
  @Output() generateSideMarks = new EventEmitter<{ roadSelection: MarkingRoadSelection; yStart: number; yEnd: number; inset: number; yFrequency: number }>();
  @Output() generateCentreMarks = new EventEmitter<{ roadSelection: MarkingRoadSelection; yStart: number; yEnd: number; dashLength: number; gapLength: number }>();
  @Output() previewSideMarks = new EventEmitter<{ roadSelection: MarkingRoadSelection; yStart: number; yEnd: number; inset: number; yFrequency: number }>();
  @Output() previewCentreMarks = new EventEmitter<{ roadSelection: MarkingRoadSelection; yStart: number; yEnd: number; dashLength: number; gapLength: number }>();
  @Output() removeMarks = new EventEmitter<{ yStart: number; yEnd: number }>();
  @Output() clearMarkingPreview = new EventEmitter<void>();

  showMarkingPopup = false;
  showInfoPopup = false;
  timeLimitFocused = false;

  readonly canvasForm = new FormGroup({
    roadInfo: new FormControl<number | null>(null),
    editTimeText: new FormControl('', { nonNullable: true }),
    panY: new FormControl<number | null>(null),
    panX: new FormControl<number | null>(null),
  });

  constructor() {
    this.canvasForm.controls.roadInfo.valueChanges.pipe(takeUntilDestroyed()).subscribe((value) => {
      if (value !== null) {
        this.roadInfoChange.emit(value);
      }
    });
    this.canvasForm.controls.panY.valueChanges.pipe(takeUntilDestroyed()).subscribe((value) => {
      if (value !== null) {
        this.panYChange.emit(value);
      }
    });
    this.canvasForm.controls.panX.valueChanges.pipe(takeUntilDestroyed()).subscribe((value) => {
      if (value !== null) {
        this.panXChange.emit(value);
      }
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['editRoadInfo']) {
      this.canvasForm.controls.roadInfo.setValue(this.editRoadInfo, { emitEvent: false });
    }
    if (changes['editTime'] && !this.timeLimitFocused) {
      this.canvasForm.controls.editTimeText.setValue(String(this.editTime), { emitEvent: false });
    }
    if (changes['panY']) {
      this.canvasForm.controls.panY.setValue(this.panY, { emitEvent: false });
    }
    if (changes['panX']) {
      this.canvasForm.controls.panX.setValue(this.panX, { emitEvent: false });
    }
    if (changes['workerBusy'] || changes['roadInfoOptions']) {
      const controls = this.canvasForm.controls;
      const roadInfoDisabled = this.workerBusy || this.roadInfoOptions.length === 0;
      if (roadInfoDisabled) {
        controls.roadInfo.disable({ emitEvent: false });
      } else {
        controls.roadInfo.enable({ emitEvent: false });
      }
    }
    if (changes['workerBusy']) {
      const controls = this.canvasForm.controls;
      if (this.workerBusy) {
        controls.editTimeText.disable({ emitEvent: false });
        controls.panY.disable({ emitEvent: false });
        controls.panX.disable({ emitEvent: false });
      } else {
        controls.editTimeText.enable({ emitEvent: false });
        controls.panY.enable({ emitEvent: false });
        controls.panX.enable({ emitEvent: false });
      }
    }
  }

  commitTimeLimit(): void {
    const raw = this.canvasForm.controls.editTimeText.value.trim();
    const nextValue = Number.parseInt(raw, 10);
    if (Number.isNaN(nextValue)) {
      this.canvasForm.controls.editTimeText.setValue(String(this.editTime), { emitEvent: false });
      return;
    }
    this.timeChange.emit(Math.max(0, Math.min(65535, Math.round(nextValue))));
  }

  onTimeLimitFocus(): void {
    this.timeLimitFocused = true;
  }

  onTimeLimitBlur(): void {
    this.timeLimitFocused = false;
    this.commitTimeLimit();
  }

  getRoadInfoOption(roadInfoId: number): RoadInfoOption | undefined {
    return this.roadInfoOptions.find((option) => option.id === roadInfoId);
  }

  toggleMarkingPopup(): void {
    this.showMarkingPopup = !this.showMarkingPopup;
    if (!this.showMarkingPopup) {
      this.clearMarkingPreview.emit();
    }
  }
}
