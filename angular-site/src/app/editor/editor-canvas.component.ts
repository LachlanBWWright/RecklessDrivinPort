import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
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
export class EditorCanvasComponent {
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
  @Output() clearMarkingPreview = new EventEmitter<void>();

  showMarkingPopup = false;
  showInfoPopup = false;

  getRoadInfoOption(roadInfoId: number): RoadInfoOption | undefined {
    return this.roadInfoOptions.find((option) => option.id === roadInfoId);
  }

  onTimeLimitInput(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    const nextValue = Number.parseInt(target?.value ?? '', 10);
    if (Number.isNaN(nextValue)) return;
    this.timeChange.emit(nextValue);
  }

  toggleMarkingPopup(): void {
    this.showMarkingPopup = !this.showMarkingPopup;
    if (!this.showMarkingPopup) {
      this.clearMarkingPreview.emit();
    }
  }

  /** Typed handler for the vertical range-input scrollbar. */
  onVertScrollInput(event: Event): void {
    if (event.target instanceof HTMLInputElement) {
      this.panYChange.emit(Number(event.target.value));
    }
  }

  /** Typed handler for the horizontal range-input scrollbar. */
  onHorizScrollInput(event: Event): void {
    if (event.target instanceof HTMLInputElement) {
      this.panXChange.emit(Number(event.target.value));
    }
  }
}
