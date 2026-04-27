import { Component, ChangeDetectionStrategy, EventEmitter, Input, Output } from '@angular/core';
import type { MarkSeg, ObjectPos, RoadInfoOption, TrackWaypointRef } from '../../../level-editor.service';
import type { DrawMode } from '../../../editor/editor-canvas.component';
import type { MarkingRoadSelection } from '../../../road-marking-utils';

@Component({
  selector: 'app-editor-objects-section',
  templateUrl: './editor-objects-section.component.html',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditorObjectsSectionComponent {
  @Input() selectedLevel: {
    resourceId: number;
    roadSegs: { v0: number; v3: number }[];
    roadSegCount: number;
    trackUp: unknown[];
    trackDown: unknown[];
  } | null = null;
  @Input() levelNum = 0;
  @Input() objects: ObjectPos[] = [];
  @Input() selectedObjIndex: number | null = null;
  @Input() marks: MarkSeg[] = [];
  @Input() selectedMarkIndex: number | null = null;
  @Input() showTrackOverlay = false;
  @Input() showMarks = true;
  @Input() barrierDrawSide: 'v0' | 'v1' | 'i' | 'v2' | 'v3' = 'v0';
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
  @Input() scrollXMin = -600;
  @Input() scrollXMax = 600;
  @Input() workerBusy = false;
  @Input() isDragging = false;
  @Input() dragTrackWaypoint: TrackWaypointRef | null = null;
  @Input() hoverTrackWaypoint: TrackWaypointRef | null = null;
  @Input() spaceDown = false;
  @Input() roadMaxY = 0;
  @Input() objectCount = 0;
  @Input() hasMarkingPreview = false;
  @Input() markCreateMode = false;
  @Input() pendingMarkPointCount = 0;
  @Input() editObjDirDeg = 0;
  @Input() editObjTypeRes = 128;
  @Input() availableTypeIds: number[] = [];
  @Input() spriteUrl: string | null = null;
  @Input() getSpriteUrl: (typeRes: number) => string | null = () => null;
  @Input() getFallbackColor: (typeRes: number) => string = () => '#888';
  @Input() typePalette: { hex: string; typeId: number }[] = [];
  @Input() visibleTypeFilter: Set<number> = new Set();
  @Input() typeDimLabel = '';
  @Input() filteredIndices: number[] = [];
  @Input() searchTerm = '';

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
  @Output() generateSideMarks = new EventEmitter<{ roadSelection: MarkingRoadSelection; yStart: number; yEnd: number; inset: number; yFrequency: number }>();
  @Output() generateCentreMarks = new EventEmitter<{ roadSelection: MarkingRoadSelection; yStart: number; yEnd: number; dashLength: number; gapLength: number }>();
  @Output() previewSideMarks = new EventEmitter<{ roadSelection: MarkingRoadSelection; yStart: number; yEnd: number; inset: number; yFrequency: number }>();
  @Output() previewCentreMarks = new EventEmitter<{ roadSelection: MarkingRoadSelection; yStart: number; yEnd: number; dashLength: number; gapLength: number }>();
  @Output() clearMarkingPreview = new EventEmitter<void>();
  @Output() panXChange = new EventEmitter<number>();
  @Output() panYChange = new EventEmitter<number>();
  @Output() objectSelected = new EventEmitter<number>();
  @Output() searchTermChange = new EventEmitter<string>();
  @Output() dirDegInput = new EventEmitter<string>();
  @Output() typeResChange = new EventEmitter<number>();
  @Output() typeVisibilityToggle = new EventEmitter<number>();
  @Output() showAll = new EventEmitter<void>();
  @Output() hideAll = new EventEmitter<void>();
  @Output() removeSelected = new EventEmitter<void>();
  @Output() deselect = new EventEmitter<void>();
}
