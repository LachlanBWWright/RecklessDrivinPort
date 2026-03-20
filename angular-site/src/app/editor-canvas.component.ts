import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import type { ObjectPos, MarkSeg, TrackWaypointRef } from './level-editor.service';

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
  @Input() barrierDrawMode = false;
  @Input() barrierDrawSide: 'v0' | 'v1' | 'v2' | 'v3' = 'v0';
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
  @Output() saveTrack = new EventEmitter<void>();
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
  @Output() saveBarriers = new EventEmitter<void>();
  @Output() mergeMiddleBarriers = new EventEmitter<void>();
  @Output() splitMiddleBarriers = new EventEmitter<void>();
  @Output() toggleBarrierDrawMode = new EventEmitter<void>();
  @Output() barrierDrawSideChange = new EventEmitter<'v0' | 'v1' | 'v2' | 'v3'>();
  @Output() markSelected = new EventEmitter<number>();
  @Output() addMark = new EventEmitter<void>();
  @Output() removeMark = new EventEmitter<void>();
  @Output() saveMarks = new EventEmitter<void>();
  @Output() markFieldInput = new EventEmitter<{idx: number, field: 'x1' | 'y1' | 'x2' | 'y2', event: Event}>();
  @Output() markCanvasMouseDown = new EventEmitter<MouseEvent>();
  @Output() markCanvasMouseMove = new EventEmitter<MouseEvent>();
  @Output() markCanvasMouseUp = new EventEmitter<MouseEvent>();
  @Output() panXChange = new EventEmitter<number>();
  @Output() panYChange = new EventEmitter<number>();

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
