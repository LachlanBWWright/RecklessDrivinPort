import { computed, inject, signal } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import type {
  ParsedLevel,
  ObjectPos,
  EditableSpriteAsset,
  MarkSeg,
  ObjectTypeDefinition,
  RoadInfoData,
  TrackWaypointRef,
  TrackMidpointRef,
  ObjectGroupDefinition,
} from './level-editor.service';
import { KonvaEditorService } from './konva-editor.service';
import { parseSndHeader, type SndInfo } from './snd-codec';
import type { EditorSection } from './layout/site-toolbar/site-toolbar.component';
import { levelDisplayNum } from './app-helpers';
import { OBJ_PALETTE } from './object-canvas';

/** Shared UI and editing state for the root app. */
export class AppStateBase {
  readonly typePalette = OBJ_PALETTE.map((hex, typeId) => ({ hex, typeId }));
  /** Convert a level resource ID (140-149) to a human-readable level number (1-10). */
  readonly levelDisplayNum = levelDisplayNum;

  /** Current level number for display (derived from selectedLevel). */
  readonly selectedLevelNum = computed(() => {
    const level = this.selectedLevel();
    return level ? this.levelDisplayNum(level.resourceId) : 0;
  });

  readonly konva = inject(KonvaEditorService);
  readonly snackBar = inject(MatSnackBar);

  // ---- Navigation ----
  activeTab = signal<'game' | 'editor'>('game');
  editorSection = signal<EditorSection>('properties');

  // ---- WASM game ----
  statusText = signal('Loading game data…');
  progressPct = signal(0);
  overlayVisible = signal(true);
  masterVolume = signal(80);

  // ---- Editor global state ----
  resourcesStatus = signal('No resources.dat loaded. Use the buttons below to load one.');
  editorError = signal('');
  hasEditorData = signal(false);
  /** True while the pack worker is busy parsing or saving. */
  workerBusy = signal(false);

  // ---- Level selector ----
  parsedLevels = signal<ParsedLevel[]>([]);
  selectedLevelId = signal<number | null>(null);

  readonly selectedLevel = computed(() => {
    const id = this.selectedLevelId();
    if (id === null) return null;
    return this.parsedLevels().find((l) => l.resourceId === id) ?? null;
  });

  // ---- Level properties editing ----
  editRoadInfo = signal(0);
  editRoadInfoData = signal<RoadInfoData | null>(null);
  selectedRoadInfoId = signal<number | null>(null);
  selectedRoadInfoData = signal<RoadInfoData | null>(null);
  editTime = signal(0);
  editXStartPos = signal(0);
  editLevelEnd = signal(0);
  editObjectGroups = signal<{ resID: number; numObjs: number }[]>([]);
  propertiesDirty = signal(false);
  propertiesSaveTimer: ReturnType<typeof setTimeout> | null = null;
  propertiesSaveLevelId: number | null = null;
  propertiesEditRevision = 0;

  // ---- Object group pack editing ----
  objectGroupDefinitions = signal<ObjectGroupDefinition[]>([]);
  selectedObjectGroupId = signal<number | null>(null);
  objectGroupsDirty = signal(false);
  objectGroupsSaveTimer: ReturnType<typeof setTimeout> | null = null;
  objectGroupsEditRevision = 0;

  // ---- Object type pack editing ----
  objectTypeDefinitions = signal<ObjectTypeDefinition[]>([]);
  selectedObjectTypeId = signal<number | null>(null);
  objectTypesDirty = signal(false);
  objectTypesSaveTimer: ReturnType<typeof setTimeout> | null = null;
  objectTypesEditRevision = 0;

  // ---- Object placement ----
  objects = signal<ObjectPos[]>([]);
  selectedObjIndex = signal<number | null>(null);
  editObjX = signal(0);
  editObjY = signal(0);
  editObjDir = signal(0);
  /** editObjDir expressed in degrees for display in the inspector. */
  readonly editObjDirDeg = computed(() =>
    parseFloat(((this.editObjDir() * 180) / Math.PI).toFixed(2)),
  );
  editObjTypeRes = signal(128);
  /** Sorted list of available typeRes IDs (populated after loading resources). */
  availableTypeIds = signal<number[]>([]);
  visibleTypeFilter = signal<Set<number>>(new Set(this.typePalette.map((item) => item.typeId)));
  /** Text typed into the object-list search box. */
  objectSearchTerm = signal('');
  /** Indices of objects that match the current search term. */
  readonly filteredObjectIndices = computed(() => {
    const term = this.objectSearchTerm().trim().toLowerCase();
    const objs = this.objects();
    if (!term) return objs.map((_, i) => i);
    return objs.reduce<number[]>((acc, obj, i) => {
      const typeStr = `t${obj.typeRes}`;
      const idxStr = `#${i}`;
      if (idxStr.includes(term) || typeStr.includes(term)) acc.push(i);
      return acc;
    }, []);
  });

  // ---- Canvas interaction state ----
  canvasZoom = signal(1.0);
  canvasPanX = signal(0);
  canvasPanY = signal(0);
  isDragging = signal(false);
  dragObjIndex = signal<number | null>(null);
  /** True once the current object drag has captured its pre-drag undo snapshot. */
  _objectDragUndoCaptured = false;

  // Computed signals for horizontal scrollbar range based on full road data
  roadXMin = computed(() => {
    const level = this.selectedLevel();
    if (!level || level.roadSegs.length === 0) return -600;
    let minX = 0;
    for (const seg of level.roadSegs) if (seg.v0 < minX) minX = seg.v0;
    return Math.floor(minX - 300);
  });
  roadXMax = computed(() => {
    const level = this.selectedLevel();
    if (!level || level.roadSegs.length === 0) return 600;
    let maxX = 0;
    for (const seg of level.roadSegs) if (seg.v3 > maxX) maxX = seg.v3;
    return Math.ceil(maxX + 300);
  });

  _prevPanMouseX = 0;
  _prevPanMouseY = 0;
  _isPanning = false;
  /** True while barrier draw gesture is active (mouse held during draw mode). */
  _barrierDrawing = false;
  /** True once the current start-marker drag has captured its pre-drag undo snapshot. */
  _startMarkerDragUndoCaptured = false;
  /** World-coordinate points collected during the current barrier draw gesture. */
  _barrierDrawPath: { wx: number; wy: number }[] = [];
  /** Start point for straight-line barrier draw mode (set on mousedown, cleared on mouseup). */
  _barrierDrawStart: { wx: number; wy: number } | null = null;
  /** RAF gate: true while a hover-detection frame is already queued. */
  _hoverRafPending = false;
  /** Pending waypoint position during a live drag (committed to signal on mouseup). */
  _pendingWaypointDragPos: { x: number; y: number } | null = null;
  /** True while Space is held (enables Space+drag panning). */
  readonly spaceDown = signal(false);
  /** True while actively panning (middle-mouse or space+drag). */
  readonly isPanning = signal(false);
  // ---- Track waypoint drag ----
  /** When non-null, the user is dragging a track waypoint. */
  dragTrackWaypoint = signal<TrackWaypointRef | null>(null);
  /** Hovered track waypoint (for cursor change and highlight). */
  hoverTrackWaypoint = signal<TrackWaypointRef | null>(null);
  /** Hovered midpoint between two consecutive track waypoints (for insertion hint). */
  hoverTrackMidpoint = signal<TrackMidpointRef | null>(null);
  /** Editable copies of track waypoints (only populated when user drags a point). */
  editTrackUp = signal<{ x: number; y: number; flags: number; velo: number }[]>([]);
  editTrackDown = signal<{ x: number; y: number; flags: number; velo: number }[]>([]);
  /** True while track waypoints are shown/editable on the canvas. */
  showTrackOverlay = signal(true);
  /** True while objects are visible on the canvas. */
  showObjects = signal(true);
  /** True while mark segments are shown on the canvas. */
  showMarks = signal(true);
  /** True while road segments are shown on the canvas. */
  showRoad = signal(true);
  /** True while track-up waypoints are visible. */
  showTrackUp = signal(true);
  /** True while track-down waypoints are visible. */
  showTrackDown = signal(true);
  /** True while the background grid is visible. */
  showGrid = signal(true);
  /** True while road barrier edges are visible. */
  showBarriers = signal(true);
  /** Which barrier side the draw tool affects: v0=left outer, v1=left inner, i=merge inner, v2=right inner, v3=right outer. */
  barrierDrawSide = signal<'v0' | 'v1' | 'i' | 'v2' | 'v3'>('v0');
  /**
   * Draw mode for the barrier/road editor canvas.
   * 'none'     = select/pan (no drawing; objects can be clicked/dragged normally)
   * 'freehand' = draw by dragging (path follows mouse)
   * 'straight' = click two endpoints; a straight line is applied between them
   * 'curve'    = click start, end, and bend points for a quadratic-style curve
   */
  drawMode = signal<'none' | 'freehand' | 'straight' | 'curve'>('none');

  // ---- Mark editor ----
  marks = signal<MarkSeg[]>([]);
  selectedMarkIndex = signal<number | null>(null);
  markCreateMode = signal(false);
  pendingMarkPointCount = signal(0);
  /** Preview marks shown on canvas with distinct styling (blue dashed) when generating. */
  markingPreview = signal<MarkSeg[]>([]);
  /** Active Y-range preview shown on the object canvas for road-marking tools. */
  markingRangePreview = signal<{ yStart: number; yEnd: number } | null>(null);
  /** Active Y-range preview shown for the selected level object-group slot. */
  objectGroupRangePreview = signal<{ yStart: number; yEnd: number } | null>(null);
  _markAutoSaveTimer: ReturnType<typeof setTimeout> | null = null;
  _lastDraggedNubKey: { markIdx: number; endpoint: 'p1' | 'p2' } | null = null;
  _pendingMarkPoints: { x: number; y: number }[] = [];
  _markCreateHoverPoint: { x: number; y: number } | null = null;
  dragMarkEndpoint = signal<{ markIdx: number; endpoint: 'p1' | 'p2' } | null>(null);
  /** True while user is dragging the player start X marker on the canvas. */
  _draggingStartMarker = false;
  /** True while user is dragging the finish line on the canvas. */
  _draggingFinishLine = false;
  _finishLineDragUndoCaptured = false;
  _curveStartPoint: { wx: number; wy: number } | null = null;
  _curveEndPoint: { wx: number; wy: number } | null = null;
  /** True after the Konva overlay has been created for the current canvas. */
  _konvaInitialized = false;
  _konvaResizeObserver: ResizeObserver | null = null;
  /** Serialized barrier path cache used to avoid unnecessary redraw work. */
  _lastBarriersSerialized = '';

  // ---- Sprite pixel grid ----
  spriteGridZoom = signal(4);

  // ---- Track segment detail ----
  selectedTrackSegIdx = signal<number | null>(null);

  // ---- Sprite editor ----
  spriteAssets = signal<EditableSpriteAsset[]>([]);
  selectedSpriteId = signal<number | null>(null);
  /** Raw bytes of the currently selected sprite (loaded from worker). */
  currentSpriteBytes = signal<Uint8Array | null>(null);

  // ---- Audio editor ----
  audioEntries = signal<{ id: number; sizeBytes: number; durationMs?: number }[]>([]);
  selectedAudioId = signal<number | null>(null);
  selectedAudioBytes = signal<Uint8Array | null>(null);
  audioPlayerVolume = signal(80);
  audioPlaying = signal(false);
  audioCurrentTime = signal(0);
  audioDuration = signal(0);
  audioDecodeInProgress = signal(false);
  readonly audioControllable = computed(() => this._lastAudioBuffer !== null);
  readonly selectedAudioSndInfo = computed<SndInfo | null>(() => {
    const bytes = this.selectedAudioBytes();
    if (!bytes || bytes.length < 4) return null;
    return parseSndHeader(bytes);
  });
  _audioCtx: AudioContext | null = null;
  _audioGainNode: GainNode | null = null;
  _audioSource: AudioBufferSourceNode | null = null;
  _lastAudioBuffer: AudioBuffer | null = null;
  _audioStartTime = 0;
  _audioPauseOffset = 0;
  _audioRaf: number | null = null;
}
