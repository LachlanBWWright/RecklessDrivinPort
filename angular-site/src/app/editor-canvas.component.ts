import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import type { ObjectPos, MarkSeg, TrackWaypointRef } from './level-editor.service';
import type { MarkingRoadSelection } from './road-marking-utils';

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
  @Input() showObjects = true;
  @Input() showMarks = true;
  @Input() showRoad = true;
  @Input() showTrackUp = true;
  @Input() showTrackDown = true;
  @Input() showGrid = true;
  @Input() showBarriers = true;
  @Input() barrierDrawSide: 'v0' | 'v1' | 'i' | 'v2' | 'v3' = 'v0';
  /** Current draw mode.  'none' = select/pan only; other values activate barrier drawing. */
  @Input() drawMode: DrawMode = 'none';
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
  @Output() toggleObjects = new EventEmitter<void>();
  @Output() toggleMarks = new EventEmitter<void>();
  @Output() toggleRoad = new EventEmitter<void>();
  @Output() toggleTrackUp = new EventEmitter<void>();
  @Output() toggleTrackDown = new EventEmitter<void>();
  @Output() toggleGrid = new EventEmitter<void>();
  @Output() toggleBarriers = new EventEmitter<void>();
  @Output() barrierDrawSideChange = new EventEmitter<'v0' | 'v1' | 'i' | 'v2' | 'v3'>();
  @Output() drawModeChange = new EventEmitter<DrawMode>();
  @Output() markSelected = new EventEmitter<number>();
  @Output() addMark = new EventEmitter<void>();
  @Output() removeMark = new EventEmitter<void>();
  @Output() saveMarks = new EventEmitter<void>();
  @Output() startMarkCreate = new EventEmitter<void>();
  @Output() confirmMarkCreate = new EventEmitter<void>();
  @Output() markFieldInput = new EventEmitter<{idx: number, field: 'x1' | 'y1' | 'x2' | 'y2', event: Event}>();
  @Output() markCanvasMouseDown = new EventEmitter<MouseEvent>();
  @Output() markCanvasMouseMove = new EventEmitter<MouseEvent>();
  @Output() markCanvasMouseUp = new EventEmitter<MouseEvent>();
  @Output() panXChange = new EventEmitter<number>();
  @Output() panYChange = new EventEmitter<number>();
  @Output() generateSideMarks = new EventEmitter<{ roadSelection: MarkingRoadSelection; yStart: number; yEnd: number; inset: number }>();
  @Output() generateCentreMarks = new EventEmitter<{ roadSelection: MarkingRoadSelection; yStart: number; yEnd: number; dashFrequency: number }>();
  @Output() previewSideMarks = new EventEmitter<{ roadSelection: MarkingRoadSelection; yStart: number; yEnd: number; inset: number }>();
  @Output() previewCentreMarks = new EventEmitter<{ roadSelection: MarkingRoadSelection; yStart: number; yEnd: number; dashFrequency: number }>();
  @Output() clearMarkingPreview = new EventEmitter<void>();

  // ── Marking popup local state ─────────────────────────────────────────────
  showMarkingPopup = false;
  showInfoPopup = false;
  markingTab: 'side' | 'dash' = 'side';

  sideRoadSelection: MarkingRoadSelection = 'both';
  sideYStart = 0;
  sideYEnd = 400;
  sideInset = 10;

  centreRoadSelection: MarkingRoadSelection = 'both';
  centreYStart = 0;
  centreYEnd = 400;
  dashFrequency = 32;

  toggleMarkingPopup(): void {
    this.showMarkingPopup = !this.showMarkingPopup;
    if (!this.showMarkingPopup) {
      this.clearMarkingPreview.emit();
    }
  }

  onPreview(): void {
    if (this.markingTab === 'side') {
      this.previewSideMarks.emit({ roadSelection: this.sideRoadSelection, yStart: this.sideYStart, yEnd: this.sideYEnd, inset: this.sideInset });
    } else {
      this.previewCentreMarks.emit({ roadSelection: this.centreRoadSelection, yStart: this.centreYStart, yEnd: this.centreYEnd, dashFrequency: this.dashFrequency });
    }
  }

  onGenerate(): void {
    if (this.markingTab === 'side') {
      this.generateSideMarks.emit({ roadSelection: this.sideRoadSelection, yStart: this.sideYStart, yEnd: this.sideYEnd, inset: this.sideInset });
    } else {
      this.generateCentreMarks.emit({ roadSelection: this.centreRoadSelection, yStart: this.centreYStart, yEnd: this.centreYEnd, dashFrequency: this.dashFrequency });
    }
    this.clearMarkingPreview.emit();
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
