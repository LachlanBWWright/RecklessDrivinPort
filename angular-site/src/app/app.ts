import {
  Component,
  OnDestroy,
  OnInit,
  AfterViewInit,
  inject,
  signal,
  computed,
  ChangeDetectionStrategy,
  ViewEncapsulation,
} from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import type {
  ParsedLevel,
  ObjectPos,
  EditableSpriteAsset,
  MarkSeg,
  ObjectGroupEntryData,
  ObjectTypeDefinition,
  RoadInfoData,
  RoadInfoOption,
  RoadTileGroup,
  TextureTileEntry,
  DecodedSpriteFrame,
  TrackWaypointRef,
  TrackMidpointRef,
  ObjectGroupDefinition,
} from './level-editor.service';
import { KonvaEditorService } from './konva-editor.service';
import { parseSndHeader, type SndInfo } from './snd-codec';
import type { EditorSection } from './layout/site-toolbar/site-toolbar.component';
import { getCanvasDataUrl, getKeyedCanvasDataUrl, getObjFallbackColor } from './app-helpers';
import {
  AUDIO_RESOURCE_TYPES,
  buildResFields,
  ICON_RESOURCE_TYPES,
  MAX_AUTO_FIELDS,
  PACK_ENTRY_SCHEMAS,
  RESOURCE_SCHEMAS,
  TEXT_RESOURCE_TYPES,
  type ResField,
} from './resource-fields';
import {
  applyLevelsResult,
  onObjGroupInput,
  onPropsInput,
  onPropertiesTabInput,
  onRoadInfoChange,
  onRoadInfoInput,
  onTimeLimitChange,
  resetViewToRoad,
  selectLevel,
  selectRoadInfo,
} from './app-level';
import {
  addObjectGroup,
  addObjectGroupEntry,
  addObjectType,
  cloneObjectGroupDefinitions,
  cloneObjectTypeDefinitions,
  defaultObjectGroupEntry,
  defaultObjectTypeDefinition,
  deleteObjectGroup,
  deleteObjectGroupEntry,
  deleteObjectType,
  markObjectTypesDirty,
  nextObjectGroupId,
  nextObjectTypeId,
  onObjectGroupEntryInput,
  onObjectTypeFieldInput,
  onObjectTypeFlagToggle,
  onObjectTypeFrameChange,
  onObjectTypeReferenceChange,
  saveObjectGroups,
  saveObjectTypes,
  scheduleObjectTypesAutoSave,
  selectObjectGroup,
  selectObjectType,
  selectedObjectGroup,
  selectedObjectType,
  syncObjectTypeLookup,
} from './app-pack-editing';
import {
  addIconEntry,
  addAudioEntry,
  exportIconPng,
  exportIconRaw,
  exportAudioWav,
  iconLabel,
  loadAllIconThumbnails,
  onAudioWavUpload,
  loadIconEntries,
  onIconPngUpload,
  selectIconEntry,
} from './app-media';
import {
  addResString,
  addTileImage,
  applyTilePixels,
  deleteTileImage,
  downloadSelectedPackEntry,
  downloadSelectedResource,
  exportTilePng,
  getIconResourceDataUrl,
  getResHexDump,
  loadResourceList,
  onTileEditorSaved,
  onTilePngUpload,
  openTileEditor,
  removeResString,
  renderIconResource,
  savePackEntryFields,
  saveResText,
  saveStrList,
  selectPackEntry,
  selectResource,
  triggerUploadPackEntry,
  triggerUploadResource,
  updateResString,
} from './resource-browser';
import {
  addObject,
  applyObjEdit,
  canvasToWorld,
  centerOnSelectedObject,
  duplicateSelectedObject,
  frameAllObjects,
  getObjectTypeDimensionLabel,
  hideAllObjectTypes,
  onCanvasContextMenu,
  onCanvasDoubleClick,
  onCanvasKeyDown,
  onCanvasKeyUp,
  onCanvasMouseDown,
  onCanvasMouseMove,
  onCanvasMouseUp,
  onCanvasWheel,
  onObjDirDegInput,
  onObjFieldInput,
  onObjTypeResChange,
  redrawObjectCanvas,
  removeSelectedObject,
  resetView,
  insertWaypointAfter,
  saveLevelObjects,
  saveTrack,
  selectObject,
  showAllObjectTypes,
  toggleTypeVisibility,
  worldToCanvas,
} from './object-canvas';
import {
  beginFinishLineDrag,
  beginStartMarkerDrag,
  destroyApp,
  formatTime as formatTimeHelper,
  handleTrackContextMenuAtWorld,
  initializeKonvaOverlay,
  getEditorSectionIndex as getEditorSectionIndexHelper,
  onVolumeChange as onVolumeChangeHelper,
  onAfterViewInit as onAfterViewInitHelper,
  onInit as onInitHelper,
  scheduleCanvasRedraw as scheduleCanvasRedrawHelper,
  setupAppLifecycle,
  setEditorSectionIndex as setEditorSectionIndexHelper,
  toggleFullscreen as toggleFullscreenHelper,
  SECTION_ORDER as APP_SECTION_ORDER,
} from './app-runtime';
import {
  applyUndoSnapshot,
  captureUndoSnapshot,
  pushUndo,
  redo,
  resetObjectHistory,
  undo,
  type EditorUndoKind,
  type EditorUndoSnapshot,
} from './app-history';
import {
  addMark,
  addMarkCreatePoint,
  applyBarrierDrawPath,
  confirmMarkCreateMode,
  generateCentreRoadMarks,
  generateSideRoadMarks,
  handleCurveDrawClick,
  hasColocatedNubs,
  joinAdjacentMarkNubs,
  onMarkFieldInput,
  previewCentreRoadMarks,
  previewSideRoadMarks,
  removeSelectedMark,
  saveMarks,
  scheduleMarkAutoSave,
  splitCollocatedMarkNubs,
  startMarkCreateMode,
  updateCurvePreview,
} from './app-mark-editor';
import {
  onMarkCanvasMouseDown,
  onMarkCanvasMouseMove,
  onMarkCanvasMouseUp,
  redrawMarkCanvas,
} from './app-mark-canvas';
import {
  addSpriteFrame,
  exportSpritePng,
  getSpriteFormatLabel,
  openSpriteEditor,
  onSpriteEditorSaved,
  onSpritePngUpload,
  redrawSpriteCanvas,
  selectSprite,
} from './sprite-editor';
import {
  lookupRoadReferenceLevelNums,
  lookupTileReferenceRoadInfoIds,
  markObjectGroupsDirty,
  markPropertiesDirty,
  createRoadInfo,
  deleteRoadInfo,
  queuePackSync,
  queueRoadInfoSync,
  refreshRoadInfoDerivedState,
  saveLevelProperties,
  scheduleObjectGroupsAutoSave,
  syncSelectedRoadInfoSelection,
} from './app-road-editing';
import {
  applyVolumeToWasm,
  assetUrl,
  clearCustomResources,
  dispatchWorker,
  initPackWorker,
  loadWasmScript,
  mountCustomResourcesFs,
  onCustomResourcesFileSelected,
  readAssetBytes,
  restartGameWithCustomResources,
  setupEmscriptenModule,
  syncGameLoopWithActiveTab,
} from './app-platform';
import {
  clearEditorResources,
  downloadEditedResources,
  loadDefaultResources,
  onResourceFileSelected,
  resetEditorData,
  saveEditedResourcesToGame,
} from './app-session';
import {
  ensureAudioCtx,
  seekAudio,
  setAudioPlayerVolume,
  startAudioBuffer,
  stopAudio,
  togglePlayPause,
  updateAudioProgressRaf,
} from './app-audio';
import {
  loadAudioEntries,
  loadSelectedAudioBytes,
  playAudioEntry,
  selectAudioEntry,
} from './app-media';
import {
  OBJ_PALETTE,
} from './object-canvas';

import {
  decodePackSpritesInBackground,
  decodeRoadTexturesInBackground,
  decodeSpritePreviewsInBackground,
  failEditor,
  getPackSpriteDataUrl,
  getRoadInfoPreviewDataUrl,
  getTileDataUrl,
  loadResourcesBytes,
  lookupTileDimensions,
} from './app-loaders';

/** Worker response envelope sent from pack.worker.ts */
interface WorkerResponse {
  id: number;
  ok: boolean;
  cmd: string;
  result?: unknown;
  error?: string;
}

/**
 * Subset of the Emscripten runtime module attached to window.Module.
 * Allows typed access without `window as any`.
 */
interface EmscriptenModuleInterface {
  canvas: HTMLCanvasElement;
  /** Emscripten hook to resolve file paths (e.g. .wasm, .data) relative to base href. */
  locateFile?: (path: string, scriptDirectory?: string) => string;
  print: (text: string) => void;
  printErr: (text: string) => void;
  setStatus: (status: string) => void;
  monitorRunDependencies: (left: number) => void;
  onRuntimeInitialized: () => void;
  preRun: (() => void)[];
  postRun: (() => void)[];
  _set_wasm_master_volume?: (vol: number) => void;
  /** Pause the Emscripten main loop before a restart. */
  pauseMainLoop?: () => void;
  /** Resume the Emscripten main loop after a pause. */
  resumeMainLoop?: () => void;
  /** Re-run C main() with new argv — restarts the game in-place. */
  callMain?: (args: string[]) => void;
  /** Direct C _main(argc, argv) — fallback if callMain not present. */
  _main?: (argc: number, argv: number) => void;
  /** Add an async startup dependency so main() waits until it is removed. */
  addRunDependency?: (id: string) => void;
  /** Remove a startup dependency previously added with addRunDependency. */
  removeRunDependency?: (id: string) => void;
}

declare global {
  interface Window {
    /** Emscripten-compiled WASM module. Attached by the generated .js loader. */
    Module?: EmscriptenModuleInterface;
  }
}

export type AppTab = 'game' | 'editor';

export type { EditorUndoKind, EditorUndoSnapshot } from './app-history';

@Component({
  selector: 'app-root',
  templateUrl: './app.html',
  standalone: false,
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
})
export class App implements OnInit, AfterViewInit, OnDestroy {
  readonly typePalette = OBJ_PALETTE.map((hex, index) => ({ hex, typeId: index }));
  readonly getSpritePreviewDataUrlBound = this.getSpritePreviewDataUrl.bind(this);
  readonly getPackSpriteDataUrlBound = this.getPackSpriteDataUrl.bind(this);
  readonly getTileDataUrlBound = this.getTileDataUrl.bind(this);
  readonly getIconThumbDataUrlBound = this.getIconThumbDataUrl.bind(this);
  readonly getObjFallbackColorBound = this.getObjFallbackColor.bind(this);
  readonly getObjTypeDimensionLabelBound = this.getObjTypeDimensionLabel.bind(this);
  readonly getRoadReferenceLevelNumsBound = this.getRoadReferenceLevelNums.bind(this);
  readonly getTileReferenceRoadInfoIdsBound = this.getTileReferenceRoadInfoIds.bind(this);

  /** Convert a level resource ID (140-149) to a human-readable level number (1-10). */
  levelDisplayNum(resourceId: number): number {
    return resourceId - 139;
  }

  /** Current level number for display (derived from selectedLevel). */
  readonly selectedLevelNum = computed(() => {
    const level = this.selectedLevel();
    return level ? this.levelDisplayNum(level.resourceId) : 0;
  });

  readonly konva = inject(KonvaEditorService);
  readonly snackBar = inject(MatSnackBar);

  // ---- Navigation ----
  activeTab = signal<AppTab>('game');
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

  // ---- Pack sprite viewer (decoded from Pack 129 & 137) ----
  /** Decoded game sprite frames: id → HTMLCanvasElement. */
  packSpriteCanvases = new Map<number, HTMLCanvasElement>();
  /** Cached data URLs for pack sprite canvases. Cleared when canvases are rebuilt. */
  _packSpriteDataUrls = new Map<number, string>();
  /** Full decoded frames for the sprite editor – includes pixel data. */
  packSpriteDecodedFrames = new Map<number, DecodedSpriteFrame>();
  /** List of decoded sprite frame infos (id, bitDepth, w, h). */
  packSpriteFrames = signal<{ id: number; bitDepth: 8 | 16; width: number; height: number }[]>([]);
  /** Currently selected sprite frame in the pack sprite viewer. */
  selectedPackSpriteId = signal<number | null>(null);
  /** Version bumped when pack sprite canvases are ready. */
  packSpritesVersion = signal(0);
  /** Computed metadata for the currently selected pack sprite frame. */
  readonly selectedPackSpriteFrame = computed(() => {
    const id = this.selectedPackSpriteId();
    if (id === null) return null;
    return this.packSpriteFrames().find((f) => f.id === id) ?? null;
  });

  /** Whether the sprite pixel editor popup is open. */
  spriteEditorOpen = signal(false);
  /** The decoded frame currently being edited in the popup. */
  spriteEditorFrame = signal<DecodedSpriteFrame | null>(null);
  /** True when the sprite editor is being used to edit a tile (not a sprite). */
  _editingTileId: number | null = null;

  // ---- Raw resource browser ----
  /** Summary list of all resources from resources.dat (type, id, size). Populated on load. */
  allResourceEntries = signal<{ type: string; id: number; size: number }[]>([]);
  /** Currently selected resource type in the resource browser. */
  selectedResType = signal<string | null>(null);
  /** Currently selected resource id in the resource browser. */
  selectedResId = signal<number | null>(null);
  /** Raw bytes of the currently selected resource (lazily loaded). */
  selectedResBytes = signal<Uint8Array | null>(null);
  /** If the selected resource is STR#, holds the decoded string list for editing. */
  selectedResStrings = signal<string[] | null>(null);
  /** If the selected resource is STR or TEXT, holds the decoded text for editing. */
  selectedResText = signal<string | null>(null);
  /** If the selected resource is a Pack, holds its entry list. */
  selectedPackEntries = signal<{ id: number; size: number }[] | null>(null);
  /** Currently selected pack entry id. */
  selectedPackEntryId = signal<number | null>(null);
  /** Raw bytes of the currently selected pack entry (lazily loaded). */
  selectedPackEntryBytes = signal<Uint8Array | null>(null);
  /** Resource browser loading status. */
  resBrowserStatus = signal('');
  /** Whether resource browser is loading. */
  resBrowserBusy = signal(false);

  /** Resource types grouped for the browser UI. */
  readonly allResourceTypes = computed(() => {
    const map = new Map<string, { type: string; id: number; size: number }[]>();
    for (const entry of this.allResourceEntries()) {
      let bucket = map.get(entry.type);
      if (!bucket) {
        bucket = [];
        map.set(entry.type, bucket);
      }
      bucket.push(entry);
    }
    return [...map.entries()]
      .map(([type, entries]) => ({ type, entries }))
      .sort((a, b) => a.type.localeCompare(b.type));
  });

  /** Structured editable fields for the currently selected binary resource. */
  readonly selectedResFields = computed<ResField[]>(() => {
    const bytes = this.selectedResBytes();
    const type = this.selectedResType();
    if (!bytes || bytes.length === 0) return [];
    if (type && TEXT_RESOURCE_TYPES.has(type)) return [];
    if (type && AUDIO_RESOURCE_TYPES.has(type)) return [];
    if (type === 'STR#') return [];
    if (type === 'Pack') return [];
    return buildResFields(bytes, type ? (RESOURCE_SCHEMAS[type] ?? null) : null);
  });

  /** Structured editable fields for the currently selected pack entry. */
  readonly selectedPackEntryFields = computed<ResField[]>(() => {
    const bytes = this.selectedPackEntryBytes();
    const packId = this.selectedResId();
    if (!bytes || bytes.length === 0) return [];
    return buildResFields(bytes, packId !== null ? (PACK_ENTRY_SCHEMAS[packId] ?? null) : null);
  });

  /** True if the selected resource is an icon type that can be previewed as a canvas. */
  readonly selectedResIsIcon = computed(() => {
    const t = this.selectedResType();
    return t !== null && ICON_RESOURCE_TYPES.has(t);
  });

  /** True if the selected resource is an audio type (snd). */
  readonly selectedResIsAudio = computed(() => {
    const t = this.selectedResType();
    return t !== null && AUDIO_RESOURCE_TYPES.has(t);
  });

  /** Parsed Mac snd resource metadata for the selected audio resource. */
  readonly selectedResSndInfo = computed<SndInfo | null>(() => {
    if (!this.selectedResIsAudio()) return null;
    const bytes = this.selectedResBytes();
    if (!bytes || bytes.length < 4) return null;
    return parseSndHeader(bytes);
  });

  /** True if the selected resource type has a known named struct schema. */
  readonly selectedResHasNamedSchema = computed(() => {
    const t = this.selectedResType();
    return t !== null && t in RESOURCE_SCHEMAS;
  });

  /** True if selected resource has more bytes than are shown as fields (auto-truncated). */
  readonly selectedResFieldsTruncated = computed(() => {
    const bytes = this.selectedResBytes();
    const type = this.selectedResType();
    if (!bytes || !type || type in RESOURCE_SCHEMAS) return false;
    return bytes.byteLength > MAX_AUTO_FIELDS * 2;
  });

  /** All icon-family and screen image resource entries. */
  iconEntries = signal<{ type: string; id: number; label: string; sizeBytes: number }[]>([]);
  /** Currently selected entry: type + id. */
  selectedIconId = signal<number | null>(null);
  /** Currently selected resource type (ICN#, icl8, ics8, PICT). */
  selectedIconType = signal<string>('ICN#');
  /** Canvas displaying the selected image resource. */
  iconPreviewCanvas = signal<HTMLCanvasElement | null>(null);
  /** Label for the currently selected icon entry (derived from iconEntries). */
  readonly selectedIconLabel = computed<string>(() => {
    const id = this.selectedIconId();
    const type = this.selectedIconType();
    if (id === null) return '';
    return (
      this.iconEntries().find((e) => e.id === id && e.type === type)?.label ?? `${type} #${id}`
    );
  });

  wasmScript: HTMLScriptElement | null = null;
  /** Custom resources.dat loaded via the game tab upload; queued until WASM inits if needed. */
  _pendingCustomResources: Uint8Array | null = null;
  /** True after the custom resources.dat has been applied to the WASM FS. */
  customResourcesLoaded = signal(false);
  /** Name of custom resources.dat file, shown in UI. */
  customResourcesName = signal<string | null>(null);
  /** True while the game is being restarted. */
  gameRestarting = signal(false);

  // ── IndexedDB persistence for custom resources.dat ─────────────────────────
  // The game is compiled with Emscripten ASYNCIFY, which makes calling callMain()
  // a second time unsafe (the ASYNCIFY state machine is not designed to be re-entered).
  // We therefore restart by reloading the page, persisting the custom bytes in IndexedDB
  // so the preRun hook can inject them into MEMFS before the game's main() runs.
  private static readonly _IDB_NAME = 'reckless-drivin';
  private static readonly _IDB_STORE = 'custom-resources';
  private static readonly _IDB_KEY = 'resources-dat';

  static _openCustomResourcesDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(App._IDB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(App._IDB_STORE)) {
          req.result.createObjectStore(App._IDB_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  static async _saveCustomResourcesDb(bytes: Uint8Array, name: string): Promise<void> {
    const db = await App._openCustomResourcesDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(App._IDB_STORE, 'readwrite');
      tx.objectStore(App._IDB_STORE).put({ bytes, name }, App._IDB_KEY);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
  }

  static async _loadCustomResourcesDb(): Promise<{ bytes: Uint8Array; name: string } | null> {
    return new Promise((resolve) => {
      const req = indexedDB.open(App._IDB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(App._IDB_STORE)) {
          req.result.createObjectStore(App._IDB_STORE);
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(App._IDB_STORE)) {
          db.close();
          resolve(null);
          return;
        }
        const tx = db.transaction(App._IDB_STORE, 'readonly');
        const getReq = tx.objectStore(App._IDB_STORE).get(App._IDB_KEY);
        getReq.onsuccess = () => {
          db.close();
          resolve((getReq.result as { bytes: Uint8Array; name: string }) ?? null);
        };
        getReq.onerror = () => {
          db.close();
          resolve(null);
        };
      };
      req.onerror = () => resolve(null);
    });
  }

  static async _clearCustomResourcesDb(): Promise<void> {
    return new Promise((resolve) => {
      const req = indexedDB.open(App._IDB_NAME, 1);
      req.onsuccess = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(App._IDB_STORE)) {
          db.close();
          resolve();
          return;
        }
        const tx = db.transaction(App._IDB_STORE, 'readwrite');
        tx.objectStore(App._IDB_STORE).delete(App._IDB_KEY);
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => {
          db.close();
          resolve();
        };
      };
      req.onerror = () => resolve();
    });
  }

  objectTypeDefinitionMap = new Map<number, ObjectTypeDefinition>();
  objectSpritePreviews = new Map<number, HTMLCanvasElement>();

  /** Decoded road info from kPackRoad: roadInfoId → texture IDs + flags. */
  roadInfoDataMap = new Map<number, RoadInfoData>();
  /** Offscreen canvas used to cache road rendering between frames. */
  _roadOffscreen: HTMLCanvasElement | null = null;
  /** Cache key for the oversized road preview bitmap. */
  _roadOffscreenKey = '';
  /** panY (world units) at which the offscreen was last rendered. */
  _roadOffscreenPanY = 0;
  /** Cached rendered canvases for icon/screen resources (type:id → canvas). */
  iconCanvasMap = new Map<string, HTMLCanvasElement>();
  /** Cached data URLs for icon thumbnails (type:id → data URL). */
  _iconDataUrls = new Map<string, string>();
  /** Cached data URLs for road texture canvases. Cleared when textures are reloaded. */
  _roadTextureDataUrls = new Map<number, string>();
  /** Cached data URLs for road-info dropdown thumbnails. */
  _roadInfoPreviewDataUrls = new Map<number, string>();
  /** Decoded texture canvases from kPackTx16: texId → HTMLCanvasElement. */
  roadTextureCanvases = new Map<number, HTMLCanvasElement>();
  /** Version signal bumped when road textures are loaded (triggers canvas redraw). */
  roadTexturesVersion = signal(0);
  /** Version signal bumped when road-info data changes. */
  roadInfoVersion = signal(0);
  /** Version signal bumped when road segment data changes (invalidates road offscreen cache). */
  roadSegsVersion = signal(0);

  /** Tile viewer: all decoded texture tile entries for the Tiles tab. */
  tileTileEntries = signal<TextureTileEntry[]>([]);
  roadTileGroups = signal<RoadTileGroup[]>([]);
  /** Currently selected tile ID in the tile viewer. */
  selectedTileId = signal<number | null>(null);
  /** Road-info dropdown entries with preview thumbnails. */
  roadInfoOptions = signal<RoadInfoOption[]>([]);

  // ---- Pack Worker ----
  packWorker: Worker | null = null;
  pendingCallbacks = new Map<number, (resp: WorkerResponse) => void>();
  nextMsgId = 0;
  _undoStack: EditorUndoSnapshot[] = [];
  _redoStack: EditorUndoSnapshot[] = [];
  readonly canUndo = signal(false);
  readonly canRedo = signal(false);
  /** Bumped whenever sprite previews are updated; canvas effects depend on this. */
  spritePreviewsVersion = signal(0);

  /** RAF token for debouncing canvas redraws (prevents multiple redraws per frame). */
  _pendingRedrawRaf: number | null = null;

  constructor() {
    setupAppLifecycle(this);
  }

  /** Format seconds as M:SS (handles NaN and Infinity). */
  formatTime(seconds: number): string {
    return formatTimeHelper(seconds);
  }

  /** Schedule a canvas redraw on the next animation frame, cancelling any pending redraw. */
  scheduleCanvasRedraw(): void {
    scheduleCanvasRedrawHelper(this);
  }

  ngOnInit(): void { onInitHelper(this); }

  ngAfterViewInit(): void { onAfterViewInitHelper(this); }

  /** True once the Konva stage has been initialized on the canvas DOM element. */
  _konvaInitialized = false;
  /** Serialized key of the last barriers state drawn; used to skip redundant rebuilds. */
  _lastBarriersSerialized = '';

  /**
   * Initialise (or re-initialise) the Konva overlay.
   * Called after each redrawObjectCanvas() once the canvas is in the DOM.
   */
  initKonvaIfNeeded(): void {
    initializeKonvaOverlay(this);
  }

  _beginStartMarkerDrag(focusTarget: EventTarget | null): void {
    beginStartMarkerDrag(this, focusTarget);
  }

  _beginFinishLineDrag(focusTarget: EventTarget | null): void {
    beginFinishLineDrag(this, focusTarget);
  }

  /** Handle track context menu at given world coordinates (extracted for re-use). */
  _handleTrackContextMenuAtWorld(wx: number, wy: number): void {
    handleTrackContextMenuAtWorld(this, wx, wy);
  }

  ngOnDestroy(): void {
    destroyApp(this);
  }

  /** Maps EditorSection → mat-tab index for [(selectedIndex)] binding. */
  readonly SECTION_ORDER: EditorSection[] = APP_SECTION_ORDER;
  get editorSectionIndex(): number { return getEditorSectionIndexHelper(this); }
  set editorSectionIndex(idx: number) { setEditorSectionIndexHelper(this, idx); }
  // ---- Fullscreen / volume ----

  toggleFullscreen(): void { toggleFullscreenHelper(); }

  onVolumeChange(event: Event): void { onVolumeChangeHelper(this, event); }

  // ---- Private helpers ----

  async loadResourcesBytes(bytes: Uint8Array, sourceName: string): Promise<void> {
    await loadResourcesBytes(this, bytes, sourceName);
  }

  failEditor(message: string, status?: string): void {
    failEditor(this, message, status);
  }

  /** Ask the worker to decode sprite previews and populate the preview cache. */
  async decodeSpritePreviewsInBackground(
    objectTypesArr: [number, ObjectTypeDefinition][],
  ): Promise<void> {
    await decodeSpritePreviewsInBackground(this, objectTypesArr);
  }

  /**
   * Ask the worker to decode road textures from kPackTx16 and store them as
   * OffscreenCanvas / HTMLCanvasElement entries for use as CanvasPattern fills.
   * Also decodes ALL tiles for the Tiles tab viewer.
   */
  async decodeRoadTexturesInBackground(): Promise<void> {
    await decodeRoadTexturesInBackground(this);
  }

  /**
   * Ask the worker to decode all sprite frames from Pack 129 (8-bit) and Pack 137 (16-bit)
   * and store them as HTMLCanvasElement entries for the Sprites tab viewer.
   */
  async decodePackSpritesInBackground(): Promise<void> {
    await decodePackSpritesInBackground(this);
  }

  /** Return the pack sprite preview as a data URL for a given frame ID. */
  getPackSpriteDataUrl(frameId: number): string | null {
    return getPackSpriteDataUrl(this, frameId);
  }

  /** Return a data URL for a road texture tile by its texId. */
  getTileDataUrl(texId: number): string | null {
    return getTileDataUrl(this, texId);
  }

  /** Return a data URL for a road-info dropdown thumbnail. */
  getRoadInfoPreviewDataUrl(roadInfoId: number): string | null {
    return getRoadInfoPreviewDataUrl(this, roadInfoId);
  }

  /** Return "WxH px" label for a tile by texId, or '?' if not found. */
  getTileDimensions(texId: number): string {
    return lookupTileDimensions(this, texId);
  }

  /** Return a data URL for a cached icon thumbnail, or null if not yet rendered. */
  getIconThumbDataUrl(type: string, id: number): string | null {
    const key = `${type}:${id}`;
    return getKeyedCanvasDataUrl(this._iconDataUrls, this.iconCanvasMap, key);
  }

  /** Apply fresh level list received from the worker after a save operation. */
  applyLevelsResult(
    levels: ParsedLevel[],
    options?: { preserveCanvasView?: boolean; refreshSelectedLevelState?: boolean },
  ): void {
    applyLevelsResult(this, levels, options);
  }

  getObjectSpritePreview(typeRes: number): HTMLCanvasElement | null {
    return this.objectSpritePreviews.get(typeRes) ?? null;
  }

  /** Return the sprite preview as a data URL for use in <img> tags. */
  _spritePreviewDataUrls = new Map<number, string>();
  getSpritePreviewDataUrl(typeRes: number): string | null {
    return getCanvasDataUrl(this._spritePreviewDataUrls, this.objectSpritePreviews, typeRes);
  }

  /** Deterministic fallback colour for an object type when no sprite preview is available. */
  getObjFallbackColor(typeRes: number): string {
    return getObjFallbackColor(typeRes, OBJ_PALETTE);
  }

  selectLevel(id: number, options?: { preserveView?: boolean }): void {
    selectLevel(this, id, options);
  }

  resetViewToRoad(level: ParsedLevel): void {
    resetViewToRoad(this, level);
  }

  onPropsInput(field: keyof import('./level-editor.service').LevelProperties, event: Event): void {
    onPropsInput(this, field, event);
  }

  onRoadInfoChange(roadInfo: number): void {
    onRoadInfoChange(this, roadInfo);
  }

  selectRoadInfo(roadInfo: number): void {
    selectRoadInfo(this, roadInfo);
  }

  createRoadInfo(): Promise<void> {
    return createRoadInfo(this);
  }

  deleteRoadInfo(roadInfoId: number | null = this.selectedRoadInfoId()): Promise<void> {
    return deleteRoadInfo(this, roadInfoId);
  }

  onRoadInfoInput(field: Exclude<keyof RoadInfoData, 'id'>, event: Event): void {
    onRoadInfoInput(this, field, event);
  }

  onTimeLimitChange(value: number): void {
    onTimeLimitChange(this, value);
  }

  onPropertiesTabInput(e: { field: keyof import('./level-editor.service').LevelProperties; event: Event }): void {
    onPropertiesTabInput(this, e);
  }

  onObjGroupInput(index: number, field: 'resID' | 'numObjs', event: Event): void {
    onObjGroupInput(this, index, field, event);
  }

  _captureUndoSnapshot(kind: EditorUndoKind): EditorUndoSnapshot {
    return captureUndoSnapshot(this, kind);
  }

  _applyUndoSnapshot(snapshot: EditorUndoSnapshot): void {
    applyUndoSnapshot(this, snapshot);
  }

  _pushUndo(kind: EditorUndoKind): void {
    pushUndo(this, kind);
  }

  _resetObjectHistory(): void {
    resetObjectHistory(this);
  }

  undo(): void {
    undo(this);
  }

  redo(): void {
    redo(this);
  }

  getRoadReferenceLevelNums(roadInfoId: number): number[] {
    return lookupRoadReferenceLevelNums(this, roadInfoId);
  }

  getTileReferenceRoadInfoIds(texId: number): number[] {
    return lookupTileReferenceRoadInfoIds(this, texId);
  }

  syncSelectedRoadInfoSelection(preferredId?: number | null): void {
    syncSelectedRoadInfoSelection(this, preferredId ?? this.selectedRoadInfoId());
  }

  refreshRoadInfoDerivedState(): void {
    refreshRoadInfoDerivedState(this);
  }

  queueRoadInfoSync(syncPromises: Promise<unknown>[]): void {
    queueRoadInfoSync(this, syncPromises);
  }

  queuePackSync(syncPromises: Promise<unknown>[]): void {
    queuePackSync(this, syncPromises);
  }

  markPropertiesDirty(): void {
    markPropertiesDirty(this);
  }

  scheduleObjectGroupsAutoSave(): void {
    scheduleObjectGroupsAutoSave(this);
  }

  markObjectGroupsDirty(): void {
    markObjectGroupsDirty(this);
  }

  saveLevelProperties(): Promise<void> {
    return saveLevelProperties(this);
  }

  setTab(tab: 'game' | 'editor'): void {
    this.activeTab.set(tab);
    this.syncGameLoopWithActiveTab();
    if (tab === 'editor') {
      window.requestAnimationFrame(() => this.redrawObjectCanvas());
    }
  }

  setSection(section: EditorSection): void {
    this.editorSection.set(section);
  }

  resetEditorData(): void {
    resetEditorData(this);
  }

  onVolumeSliderChange(pct: number): void {
    this.masterVolume.set(pct);
    this.applyVolumeToWasm(pct);
  }

  applyVolume(): void {
    this.applyVolumeToWasm(this.masterVolume());
  }

  loadDefaultResources(): Promise<void> {
    return loadDefaultResources(this);
  }

  onResourceFileSelected(event: Event): Promise<void> {
    return onResourceFileSelected(this, event);
  }

  clearEditorResources(): void {
    clearEditorResources(this);
  }

  downloadEditedResources(): Promise<void> {
    return downloadEditedResources(this);
  }

  saveEditedResourcesToGame(): Promise<void> {
    return saveEditedResourcesToGame(this);
  }

  initPackWorker(): void {
    initPackWorker(this);
  }

  dispatchWorker<T>(cmd: string, payload?: unknown, transferables?: Transferable[]): Promise<T> {
    return dispatchWorker<T>(this, cmd, payload, transferables);
  }

  setupEmscriptenModule(): void {
    setupEmscriptenModule(this);
  }

  loadWasmScript(): void {
    loadWasmScript(this);
  }

  assetUrl(path: string): string {
    return assetUrl(this, path);
  }

  readAssetBytes(path: string): ReturnType<typeof readAssetBytes> {
    return readAssetBytes(this, path);
  }

  looksLikeHtml(bytes: Uint8Array): boolean {
    return bytes.length > 0 && /<html|<!doctype html/i.test(new TextDecoder().decode(bytes.slice(0, 32)));
  }

  applyVolumeToWasm(pct: number): void {
    applyVolumeToWasm(this, pct);
  }

  syncGameLoopWithActiveTab(): void {
    syncGameLoopWithActiveTab(this);
  }

  onCustomResourcesFileSelected(event: Event): Promise<void> {
    return onCustomResourcesFileSelected(this, event);
  }

  restartGameWithCustomResources(): void {
    restartGameWithCustomResources(this);
  }

  _mountCustomResourcesFs(bytes: Uint8Array): void {
    mountCustomResourcesFs(this, bytes);
  }

  clearCustomResources(): void {
    clearCustomResources(this);
  }

  _ensureAudioCtx(): AudioContext {
    return ensureAudioCtx(this);
  }

  setAudioPlayerVolume(pct: number): void {
    setAudioPlayerVolume(this, pct);
  }

  _startAudioBuffer(buffer: AudioBuffer, offset = 0): void {
    startAudioBuffer(this, buffer, offset);
  }

  togglePlayPause(): Promise<void> {
    return togglePlayPause(this);
  }

  stopAudio(): void {
    stopAudio(this);
  }

  seekAudio(seconds: number): void {
    seekAudio(this, seconds);
  }

  _updateAudioProgressRaf(): void {
    updateAudioProgressRaf(this);
  }

  playSndResource(): Promise<void> {
    return playAudioEntry(this);
  }

  loadAudioEntries(): Promise<void> {
    return loadAudioEntries(this);
  }

  selectAudioEntry(id: number): Promise<void> {
    return selectAudioEntry(this, id);
  }

  loadSelectedAudioBytes(id: number): Promise<void> {
    return loadSelectedAudioBytes(this, id);
  }

  cloneObjectGroupDefinitions(groups = this.objectGroupDefinitions()): ObjectGroupDefinition[] {
    return cloneObjectGroupDefinitions(this, groups);
  }

  nextObjectGroupId(groups = this.objectGroupDefinitions()): number {
    return nextObjectGroupId(this, groups);
  }

  defaultObjectGroupEntry(): ObjectGroupEntryData {
    return defaultObjectGroupEntry(this);
  }

  selectedObjectGroup(): ObjectGroupDefinition | null {
    return selectedObjectGroup(this);
  }

  selectObjectGroup(groupId: number): void {
    selectObjectGroup(this, groupId);
  }

  addObjectGroup(duplicateSelected = false): void {
    addObjectGroup(this, duplicateSelected);
  }

  deleteObjectGroup(groupId: number): void {
    deleteObjectGroup(this, groupId);
  }

  addObjectGroupEntry(groupId: number): void {
    addObjectGroupEntry(this, groupId);
  }

  deleteObjectGroupEntry(groupId: number, entryIndex: number): void {
    deleteObjectGroupEntry(this, groupId, entryIndex);
  }

  onObjectGroupEntryInput(
    groupId: number,
    entryIndex: number,
    field: keyof ObjectGroupEntryData,
    event: Event,
  ): void {
    onObjectGroupEntryInput(this, groupId, entryIndex, field, event);
  }

  saveObjectGroups(): Promise<void> {
    return saveObjectGroups(this);
  }

  cloneObjectTypeDefinitions(defs = this.objectTypeDefinitions()): ObjectTypeDefinition[] {
    return cloneObjectTypeDefinitions(this, defs);
  }

  syncObjectTypeLookup(defs = this.objectTypeDefinitions()): void {
    syncObjectTypeLookup(this, defs);
  }

  nextObjectTypeId(defs = this.objectTypeDefinitions()): number {
    return nextObjectTypeId(this, defs);
  }

  selectedObjectType(): ObjectTypeDefinition | null {
    return selectedObjectType(this);
  }

  scheduleObjectTypesAutoSave(): void {
    scheduleObjectTypesAutoSave(this);
  }

  markObjectTypesDirty(defs: ObjectTypeDefinition[]): void {
    markObjectTypesDirty(this, defs);
  }

  defaultObjectTypeDefinition(typeRes: number, source?: ObjectTypeDefinition | null): ObjectTypeDefinition {
    return defaultObjectTypeDefinition(this, typeRes, source);
  }

  selectObjectType(typeRes: number): void {
    selectObjectType(this, typeRes);
  }

  addObjectType(duplicateSelected = false): void {
    addObjectType(this, duplicateSelected);
  }

  deleteObjectType(typeRes: number): void {
    deleteObjectType(this, typeRes);
  }

  onObjectTypeFieldInput(
    typeRes: number,
    field: Exclude<keyof ObjectTypeDefinition, 'typeRes'>,
    event: Event,
  ): void {
    onObjectTypeFieldInput(this, typeRes, field, event);
  }

  onObjectTypeReferenceChange(
    typeRes: number,
    field: 'deathObj' | 'creationSound' | 'otherSound' | 'weaponObj',
    value: number,
  ): void {
    onObjectTypeReferenceChange(this, typeRes, field, value);
  }

  onObjectTypeFlagToggle(
    typeRes: number,
    field: 'flags' | 'flags2',
    bit: number,
    checked: boolean,
  ): void {
    onObjectTypeFlagToggle(this, typeRes, field, bit, checked);
  }

  onObjectTypeFrameChange(typeRes: number, frame: number): void {
    onObjectTypeFrameChange(this, typeRes, frame);
  }

  saveObjectTypes(): Promise<void> {
    return saveObjectTypes(this);
  }

  loadResourceList(): Promise<void> {
    return loadResourceList(this);
  }

  selectResource(type: string, id: number): Promise<void> {
    return selectResource(this, type, id);
  }

  selectPackEntry(packId: number, entryId: number): Promise<void> {
    return selectPackEntry(this, packId, entryId);
  }

  loadIconEntries(): Promise<void> {
    return loadIconEntries(this);
  }

  selectIconEntry(type: string, id: number): Promise<void> {
    return selectIconEntry(this, type, id);
  }

  exportIconPng(): void {
    exportIconPng(this);
  }

  exportIconRaw(): void {
    exportIconRaw(this);
  }

  onIconPngUpload(event: Event): Promise<void> {
    return onIconPngUpload(this, event);
  }

  addIconEntry(): Promise<void> {
    return addIconEntry(this);
  }

  exportAudioWav(): void {
    exportAudioWav(this);
  }

  onAudioWavUpload(event: Event): Promise<void> {
    return onAudioWavUpload(this, event);
  }

  addAudioEntry(): Promise<void> {
    return addAudioEntry(this);
  }

  _iconLabel(type: string, id: number): string {
    return iconLabel(type, id);
  }

  loadAllIconThumbnails(): Promise<void> {
    return loadAllIconThumbnails(this);
  }

  downloadSelectedResource(): void {
    downloadSelectedResource(this);
  }

  downloadSelectedPackEntry(): void {
    downloadSelectedPackEntry(this);
  }

  triggerUploadResource(): void {
    triggerUploadResource(this);
  }

  triggerUploadPackEntry(): void {
    triggerUploadPackEntry(this);
  }

  saveStrList(): Promise<void> {
    return saveStrList(this);
  }

  updateResString(index: number, value: string): void {
    updateResString(this, index, value);
  }

  addResString(): void {
    addResString(this);
  }

  removeResString(index: number): void {
    removeResString(this, index);
  }

  saveResText(): Promise<void> {
    return saveResText(this);
  }

  getResHexDump(bytes: Uint8Array, maxBytes = 512): string {
    return getResHexDump(bytes, maxBytes);
  }

  getIconResourceDataUrl(bytes: Uint8Array | null): string | null {
    return getIconResourceDataUrl(bytes);
  }

  renderIconResource(bytes: Uint8Array | null): HTMLCanvasElement | null {
    return renderIconResource(bytes);
  }

  async savePackEntryFields(): Promise<void> {
    return savePackEntryFields(this);
  }

  openTileEditor(texId: number): void {
    openTileEditor(this, texId);
  }

  exportTilePng(texId: number): void {
    exportTilePng(this, texId);
  }

  onTilePngUpload(event: Event, texId: number): Promise<void> {
    return onTilePngUpload(this, event, texId);
  }

  onTileEditorSaved(event: { frameId: number; pixels: Uint8ClampedArray }): Promise<void> {
    return onTileEditorSaved(this, event);
  }

  addTileImage(): Promise<void> {
    return addTileImage(this);
  }

  deleteTileImage(texId: number): Promise<void> {
    return deleteTileImage(this, texId);
  }

  async _applyTilePixels(texId: number, pixels: Uint8ClampedArray): Promise<void> {
    return applyTilePixels(this, texId, pixels);
  }

  selectObject(index: number, centerCanvas = false): void {
    selectObject(this, index, centerCanvas);
  }

  onObjFieldInput(field: 'x' | 'y' | 'dir' | 'typeRes', event: Event): void {
    onObjFieldInput(this, field, event);
  }

  onObjDirDegInput(value: string | Event): void {
    onObjDirDegInput(this, value);
  }

  onObjTypeResChange(typeRes: number): void {
    onObjTypeResChange(this, typeRes);
  }

  applyObjEdit(): void {
    applyObjEdit(this);
  }

  addObject(): void {
    addObject(this);
  }

  duplicateSelectedObject(): void {
    duplicateSelectedObject(this);
  }

  toggleTypeVisibility(typeId: number): void {
    toggleTypeVisibility(this, typeId);
  }

  showAllObjectTypes(): void {
    showAllObjectTypes(this);
  }

  hideAllObjectTypes(): void {
    hideAllObjectTypes(this);
  }

  getObjTypeDimensionLabel(typeRes: number): string {
    return getObjectTypeDimensionLabel(this, typeRes);
  }

  removeSelectedObject(): void {
    removeSelectedObject(this);
  }

  saveLevelObjects(): Promise<void> {
    return saveLevelObjects(this);
  }

  saveTrack(): Promise<void> {
    return saveTrack(this);
  }

  worldToCanvas(wx: number, wy: number): [number, number] {
    return worldToCanvas(this, wx, wy);
  }

  canvasToWorld(cx: number, cy: number): [number, number] {
    return canvasToWorld(this, cx, cy);
  }

  onCanvasMouseDown(event: MouseEvent): void {
    onCanvasMouseDown(this, event);
  }

  onCanvasMouseMove(event: MouseEvent): void {
    onCanvasMouseMove(this, event);
  }

  onCanvasMouseUp(): void {
    onCanvasMouseUp(this);
  }

  onCanvasDoubleClick(event: MouseEvent): void {
    onCanvasDoubleClick(this, event);
  }

  onCanvasContextMenu(event: MouseEvent): void {
    onCanvasContextMenu(this, event);
  }

  _insertWaypointAfter(track: 'up' | 'down', segIdx: number): void {
    insertWaypointAfter(this, track, segIdx);
  }

  onCanvasKeyDown(event: KeyboardEvent): void {
    onCanvasKeyDown(this, event);
  }

  onCanvasKeyUp(event: KeyboardEvent): void {
    onCanvasKeyUp(this, event);
  }

  onCanvasWheel(event: WheelEvent): void {
    onCanvasWheel(this, event);
  }

  zoomIn(): void {
    this.canvasZoom.set(Math.min(10, this.canvasZoom() + 0.25));
  }

  zoomOut(): void {
    this.canvasZoom.set(Math.max(0.1, this.canvasZoom() - 0.25));
  }

  resetView(): void {
    resetView(this);
  }

  frameAllObjects(): void {
    frameAllObjects(this);
  }

  centerOnSelectedObject(): void {
    centerOnSelectedObject(this);
  }

  redrawObjectCanvas(): void {
    redrawObjectCanvas(this);
  }

  addMark(): void {
    addMark(this);
  }

  startMarkCreateMode(): void {
    startMarkCreateMode(this);
  }

  confirmMarkCreateMode(): void {
    confirmMarkCreateMode(this);
  }

  generateSideRoadMarks(
    roadSelection: import('./road-marking-utils').MarkingRoadSelection,
    yStart: number,
    yEnd: number,
    inset: number,
    yFrequency: number,
  ): void {
    generateSideRoadMarks(this, roadSelection, yStart, yEnd, inset, yFrequency);
  }

  generateCentreRoadMarks(
    roadSelection: import('./road-marking-utils').MarkingRoadSelection,
    yStart: number,
    yEnd: number,
    dashLength: number,
    gapLength: number,
  ): void {
    generateCentreRoadMarks(this, roadSelection, yStart, yEnd, dashLength, gapLength);
  }

  previewSideRoadMarks(
    roadSelection: import('./road-marking-utils').MarkingRoadSelection,
    yStart: number,
    yEnd: number,
    inset: number,
    yFrequency: number,
  ): void {
    previewSideRoadMarks(this, roadSelection, yStart, yEnd, inset, yFrequency);
  }

  previewCentreRoadMarks(
    roadSelection: import('./road-marking-utils').MarkingRoadSelection,
    yStart: number,
    yEnd: number,
    dashLength: number,
    gapLength: number,
  ): void {
    previewCentreRoadMarks(this, roadSelection, yStart, yEnd, dashLength, gapLength);
  }

  removeSelectedMark(): void {
    removeSelectedMark(this);
  }

  _appendGeneratedMarks(generated: { x1: number; y1: number; x2: number; y2: number }[], label: string): void {
    void generated;
    void label;
  }

  _addMarkCreatePoint(x: number, y: number): void {
    addMarkCreatePoint(this, x, y);
  }

  _hasColocatedNubs(): boolean {
    return hasColocatedNubs(this);
  }

  _splitCollocatedMarkNubs(): void {
    splitCollocatedMarkNubs(this);
  }

  _joinAdjacentMarkNubs(): void {
    joinAdjacentMarkNubs(this);
  }

  onMarkFieldInput(markIdx: number, field: 'x1' | 'y1' | 'x2' | 'y2', event: Event): void {
    onMarkFieldInput(this, markIdx, field, event);
  }

  saveMarks(): Promise<void> {
    return saveMarks(this);
  }

  scheduleMarkAutoSave(): void {
    scheduleMarkAutoSave(this);
  }

  _handleCurveDrawClick(wx: number, wy: number): void {
    handleCurveDrawClick(this, wx, wy);
  }

  _updateCurvePreview(wx: number, wy: number): void {
    updateCurvePreview(this, wx, wy);
  }

  _applyBarrierDrawPath(): void {
    applyBarrierDrawPath(this);
  }

  redrawMarkCanvas(): void {
    redrawMarkCanvas(this);
  }

  onMarkCanvasMouseDown(event: MouseEvent): void {
    onMarkCanvasMouseDown(this, event);
  }

  onMarkCanvasMouseMove(event: MouseEvent): void {
    onMarkCanvasMouseMove(this, event);
  }

  onMarkCanvasMouseUp(): void {
    onMarkCanvasMouseUp(this);
  }

  selectSprite(spriteId: number): Promise<void> {
    return selectSprite(this, spriteId);
  }

  redrawSpriteCanvas(): void {
    redrawSpriteCanvas(this);
  }

  exportSpritePng(): void {
    exportSpritePng(this);
  }

  getSpriteFormatLabel(bitDepth: 8 | 16 | undefined): string {
    return getSpriteFormatLabel(bitDepth);
  }

  openSpriteEditor(frameId: number): void {
    openSpriteEditor(this, frameId);
  }

  onSpritePngUpload(event: Event, frameId: number): Promise<void> {
    return onSpritePngUpload(this, event, frameId);
  }

  addSpriteFrame(): Promise<void> {
    return addSpriteFrame(this);
  }

  onSpriteEditorSaved(event: { frameId: number; pixels: Uint8ClampedArray }): Promise<void> {
    return onSpriteEditorSaved(this, event);
  }
}
