import { Component, OnDestroy, OnInit, signal, computed, effect } from '@angular/core';
import type {
  ParsedLevel,
  LevelProperties,
  ObjectPos,
  EditableSpriteAsset,
  MarkSeg,
  ObjectTypeDefinition,
  RoadInfoData,
} from './level-editor.service';

/** Worker response envelope sent from pack.worker.ts */
interface WorkerResponse {
  id: number;
  ok: boolean;
  cmd: string;
  result?: unknown;
  error?: string;
}

export type AppTab = 'game' | 'editor';
export type EditorSection = 'properties' | 'objects' | 'sprites';

const OBJ_PALETTE = [
  '#e53935', '#42a5f5', '#66bb6a', '#ffa726',
  '#ab47bc', '#26c6da', '#d4e157', '#ff7043',
  '#8d6e63', '#78909c', '#ec407a', '#29b6f6',
];

/** typeRes value that identifies the player car object. */
const PLAYER_CAR_TYPE_RES = 128;

/**
 * Per-level road colour themes derived from the actual game texture pack (kPackTx16, ID 136).
 * Each tRoadInfo entry references bgTex (background/off-road), fgTex (road surface), and border
 * textures. Dominant colours sampled from the 16-bit RGB555 tiles.
 *
 * roadInfo index → { bg, road, dirt, kerbA, kerbB, water }
 *   bg    – far background colour (grass/sand/water/snow)
 *   road  – driveable asphalt surface colour
 *   dirt  – shoulder/verge between kerb and road
 *   kerbA – primary kerb stripe colour (alternating with kerbB)
 *   kerbB – secondary kerb stripe colour
 *   water – true if off-road is water (level 5)
 */
interface RoadTheme {
  bg: string; road: string; dirt: string;
  kerbA: string; kerbB: string;
  water: boolean;
}
const ROAD_THEMES: Record<number, RoadTheme> = {
  // roadInfo 128 – grass (levels 1, 4)
  128: { bg: '#0f7d1e', road: '#848484', dirt: '#4a6830', kerbA: '#6b8066', kerbB: '#d4e8d0', water: false },
  // roadInfo 129 – desert/earth (level 3)
  129: { bg: '#8f4e28', road: '#bf8460', dirt: '#7a4a2a', kerbA: '#9f764b', kerbB: '#d9b888', water: false },
  // roadInfo 130 – night/blue tarmac (levels 2, 6)
  130: { bg: '#354ab5', road: '#505090', dirt: '#3a3a6e', kerbA: '#4c4c9e', kerbB: '#c0c0ff', water: false },
  // roadInfo 131 – snow/ice (level 7)
  131: { bg: '#b8dde0', road: '#98aeb0', dirt: '#8099a0', kerbA: '#aacccc', kerbB: '#ffffff', water: false },
  // roadInfo 132 – snow with grass kerbs
  132: { bg: '#b8dde0', road: '#98aeb0', dirt: '#8099a0', kerbA: '#6b8066', kerbB: '#d4e8d0', water: false },
  // roadInfo 133 – tropical/water (level 5)
  133: { bg: '#0a7a1e', road: '#354ab5', dirt: '#2a6050', kerbA: '#207b44', kerbB: '#30bb66', water: true },
  // roadInfo 134 – urban/grey (level 8)
  134: { bg: '#5e5a5c', road: '#848484', dirt: '#4a4648', kerbA: '#606060', kerbB: '#c0c0c0', water: false },
  // roadInfo 135 – night desert/yellow road (level 10)
  135: { bg: '#354ab5', road: '#d8c830', dirt: '#555580', kerbA: '#b8b050', kerbB: '#ffff88', water: false },
  // roadInfo 136 – forest/dirt track (level 9)
  136: { bg: '#0a7a1e', road: '#a06840', dirt: '#4a6830', kerbA: '#5a7034', kerbB: '#99cc44', water: false },
};

/** Default road theme for unknown roadInfo values. */
const DEFAULT_ROAD_THEME: RoadTheme = ROAD_THEMES[128];

/** Minimum canvas hit radius (px) for object click detection. */
const MIN_HIT_RADIUS = 10;
/** Base world-space hit radius before zoom scaling for object click detection. */
const BASE_HIT_RADIUS = 8;
/** Canvas hit radius (px) for mark segment endpoint dragging. */
const MARK_ENDPOINT_HIT_RADIUS = 10;
/** Min canvas hit radius (px) for player start marker drag. */
const MIN_START_MARKER_HIT_RADIUS = 14;
/** Base world-space hit radius for player start marker drag. */
const BASE_START_MARKER_HIT_RADIUS = 10;
/** Max storable UInt16 time value in the level pack. */
const MAX_TIME_VALUE = 65535;

/** Euclidean distance between two 2-D points. */
function dist2d(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}

function scheduleAfterRender(callback: () => void): void {
  if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(() => callback());
    return;
  }
  setTimeout(callback, 0);
}

@Component({
  selector: 'app-root',
  templateUrl: './app.html',
  standalone: false,
  styleUrl: './app.scss',
})
export class App implements OnInit, OnDestroy {
  readonly typePalette = OBJ_PALETTE.map((hex, index) => ({ hex, typeId: index }));
  readonly getSpritePreviewDataUrlBound = this.getSpritePreviewDataUrl.bind(this);
  readonly getObjFallbackColorBound = this.getObjFallbackColor.bind(this);

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
  editTime = signal(0);
  editXStartPos = signal(0);
  editLevelEnd = signal(0);
  propertiesDirty = signal(false);

  // ---- Object placement ----
  objects = signal<ObjectPos[]>([]);
  selectedObjIndex = signal<number | null>(null);
  editObjX = signal(0);
  editObjY = signal(0);
  editObjDir = signal(0);
  editObjTypeRes = signal(128);
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

  private _prevPanMouseX = 0;
  private _prevPanMouseY = 0;
  private _isPanning = false;
  /** True while Space is held (enables Space+drag panning). */
  readonly spaceDown = signal(false);
  /** True while actively panning (middle-mouse or space+drag). */
  readonly isPanning = signal(false);
  // ---- Track waypoint drag ----
  /** When non-null, the user is dragging a track waypoint. */
  dragTrackWaypoint = signal<{ track: 'up' | 'down'; segIdx: number } | null>(null);
  /** Editable copies of track waypoints (only populated when user drags a point). */
  editTrackUp = signal<{ x: number; y: number; flags: number; velo: number }[]>([]);
  editTrackDown = signal<{ x: number; y: number; flags: number; velo: number }[]>([]);
  /** True while track waypoints are shown/editable on the canvas. */
  showTrackOverlay = signal(true);

  // ---- Mark editor ----
  marks = signal<MarkSeg[]>([]);
  selectedMarkIndex = signal<number | null>(null);
  dragMarkEndpoint = signal<{ markIdx: number; endpoint: 'p1' | 'p2' } | null>(null);
  /** True while user is dragging the player start X marker on the canvas. */
  private _draggingStartMarker = false;

  // ---- Sprite pixel grid ----
  spriteGridZoom = signal(4);

  // ---- Track segment detail ----
  selectedTrackSegIdx = signal<number | null>(null);

  // ---- Sprite editor ----
  spriteAssets = signal<EditableSpriteAsset[]>([]);
  selectedSpriteId = signal<number | null>(null);
  /** Raw bytes of the currently selected sprite (loaded from worker). */
  currentSpriteBytes = signal<Uint8Array | null>(null);

  // ---- Pack sprite viewer (decoded from Pack 129 & 137) ----
  /** Decoded game sprite frames: id → HTMLCanvasElement. */
  private packSpriteCanvases = new Map<number, HTMLCanvasElement>();
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

  private wasmScript: HTMLScriptElement | null = null;
  private objectTypeDefinitions = new Map<number, ObjectTypeDefinition>();
  private objectSpritePreviews = new Map<number, HTMLCanvasElement | null>();

  /** Decoded road info from kPackRoad: roadInfoId → texture IDs + flags. */
  private roadInfoDataMap = new Map<number, RoadInfoData>();
  /** Decoded texture canvases from kPackTx16: texId → HTMLCanvasElement. */
  private roadTextureCanvases = new Map<number, HTMLCanvasElement>();
  /** Version signal bumped when road textures are loaded (triggers canvas redraw). */
  roadTexturesVersion = signal(0);

  // ---- Pack Worker ----
  private packWorker: Worker | null = null;
  private pendingCallbacks = new Map<number, (resp: WorkerResponse) => void>();
  private nextMsgId = 0;
  /** Bumped whenever sprite previews are updated; canvas effects depend on this. */
  spritePreviewsVersion = signal(0);

  /** RAF token for debouncing canvas redraws (prevents multiple redraws per frame). */
  private _pendingRedrawRaf: number | null = null;

  constructor() {
    // Redraw object canvas when objects, selection, zoom, pan, sprite previews, or track overlay changes.
    effect(() => {
      this.objects();
      this.selectedObjIndex();
      this.canvasZoom();
      this.canvasPanX();
      this.canvasPanY();
      this.visibleTypeFilter();
      this.spritePreviewsVersion();
      this.roadTexturesVersion();
      this.showTrackOverlay();
      this.editTrackUp();
      this.editTrackDown();
      this.marks();
      const section = this.editorSection();
      if (section === 'objects') {
        this.scheduleCanvasRedraw();
      }
    });

    // Sprite pixel canvas effect removed — PPic raw preview replaced by pack sprite viewer.
  }

  /** Schedule a canvas redraw on the next animation frame, cancelling any pending redraw. */
  private scheduleCanvasRedraw(): void {
    if (typeof window === 'undefined') {
      setTimeout(() => this.redrawObjectCanvas(), 0);
      return;
    }
    if (this._pendingRedrawRaf !== null) {
      window.cancelAnimationFrame(this._pendingRedrawRaf);
    }
    this._pendingRedrawRaf = window.requestAnimationFrame(() => {
      this._pendingRedrawRaf = null;
      this.redrawObjectCanvas();
    });
  }

  ngOnInit(): void {
    this.initPackWorker();
    this.setupEmscriptenModule();
    this.loadWasmScript();
  }

  ngOnDestroy(): void {
    if (this.wasmScript?.parentNode) {
      (this.wasmScript.parentNode as HTMLElement).removeChild(this.wasmScript);
    }
    this.packWorker?.terminate();
    this.packWorker = null;
  }

  // ---- Tab / section navigation ----

  setTab(tab: AppTab): void {
    this.activeTab.set(tab);
  }

  setSection(section: EditorSection): void {
    this.editorSection.set(section);
  }

  // ---- Resources loading ----

  async loadDefaultResources(): Promise<void> {
    try {
      this.editorError.set('');
      this.resourcesStatus.set('Loading default resources.dat…');
      const bytes = await this.readAssetBytes('resources.dat');
      await this.loadResourcesBytes(bytes, 'default resources.dat');
    } catch (error) {
      this.editorError.set(error instanceof Error ? error.message : 'Failed to load resources.dat');
      this.resourcesStatus.set('Failed to load resources.');
      this.workerBusy.set(false);
    }
  }

  async onResourceFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.editorError.set('');
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      await this.loadResourcesBytes(bytes, file.name);
    } catch (error) {
      this.editorError.set(error instanceof Error ? error.message : 'Failed to load file');
      this.resourcesStatus.set('Failed to load uploaded file.');
      this.workerBusy.set(false);
    }
  }

  async downloadEditedResources(): Promise<void> {
    if (!this.hasEditorData()) return;
    try {
      this.workerBusy.set(true);
      this.resourcesStatus.set('Serializing resources…');
      const buf = await this.dispatchWorker<ArrayBuffer>('SERIALIZE');
      const blob = new Blob([buf], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'resources.dat';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      this.resourcesStatus.set('Downloaded updated resources.dat.');
    } catch (error) {
      this.editorError.set(error instanceof Error ? error.message : 'Failed to serialize resources');
    } finally {
      this.workerBusy.set(false);
    }
  }

  // ---- Level selection ----

  selectLevel(id: number): void {
    this.selectedLevelId.set(id);
    const level = this.parsedLevels().find((l) => l.resourceId === id);
    if (level) {
      this.editRoadInfo.set(level.properties.roadInfo);
      this.editTime.set(level.properties.time);
      this.editXStartPos.set(level.properties.xStartPos);
      this.editLevelEnd.set(level.properties.levelEnd);
      this.propertiesDirty.set(false);
      this.objects.set([...level.objects]);
      this.selectedObjIndex.set(null);
      this.visibleTypeFilter.set(new Set(this.typePalette.map((item) => item.typeId)));
      this.marks.set([...level.marks]);
      this.selectedMarkIndex.set(null);
      // Load track waypoints into editable copies
      this.editTrackUp.set(level.trackUp.map((s) => ({ x: s.x, y: s.y, flags: s.flags, velo: s.velo })));
      this.editTrackDown.set(level.trackDown.map((s) => ({ x: s.x, y: s.y, flags: s.flags, velo: s.velo })));
      this.dragTrackWaypoint.set(null);
      // Set a smart default zoom/pan so the road appears at correct game proportions.
      this.resetViewToRoad(level);
    }
  }

  /**
   * Set zoom and pan so the road fills the canvas width at ~1:1 game scale.
   * World X range of road segs → determines zoom; Y=0 (start) near top of canvas.
   */
  private resetViewToRoad(level: ParsedLevel): void {
    const canvas = document.getElementById('object-canvas') as HTMLCanvasElement | null;
    const W = canvas?.width ?? 640;
    const H = canvas?.height ?? 540;
    if (level.roadSegs.length > 0) {
      const minX = Math.min(...level.roadSegs.slice(0, 100).map((s) => s.v0));
      const maxX = Math.max(...level.roadSegs.slice(0, 100).map((s) => s.v3));
      const roadW = Math.max(50, maxX - minX);
      // Fill ~85 % of canvas width with the road
      const zoom = Math.min(4.0, Math.max(0.25, (W * 0.85) / roadW));
      this.canvasZoom.set(zoom);
      // Centre the road horizontally
      this.canvasPanX.set((minX + maxX) / 2);
      // With Y-axis flipped: Y=0 (start) is at canvas bottom, Y=levelEnd at top.
      // Set panY so Y=0 appears near the bottom (show ~35% of visible height above start).
      const visibleH = H / zoom;
      this.canvasPanY.set(visibleH * 0.35);
    } else {
      this.canvasZoom.set(1.5);
      this.canvasPanX.set(0);
      this.canvasPanY.set(0);
    }
  }

  // ---- Level properties ----

  onPropsInput(field: keyof LevelProperties, event: Event): void {
    const val = Number.parseInt((event.target as HTMLInputElement).value, 10);
    if (Number.isNaN(val)) return;
    switch (field) {
      case 'roadInfo': this.editRoadInfo.set(val); break;
      case 'time': {
        const nextTime = Math.max(0, Math.min(MAX_TIME_VALUE, val));
        this.editTime.set(nextTime);
        break;
      }
      case 'xStartPos': this.editXStartPos.set(val); break;
      case 'levelEnd': this.editLevelEnd.set(Math.max(0, val)); break;
    }
    this.propertiesDirty.set(true);
  }

  async saveLevelProperties(): Promise<void> {
    const id = this.selectedLevelId();
    if (id === null) return;
    const props: LevelProperties = {
      roadInfo: this.editRoadInfo(),
      time: this.editTime(),
      xStartPos: this.editXStartPos(),
      levelEnd: this.editLevelEnd(),
    };
    try {
      this.workerBusy.set(true);
      const result = await this.dispatchWorker<{ levels: ParsedLevel[] }>('APPLY_PROPS', { resourceId: id, props });
      this.applyLevelsResult(result.levels);
      this.propertiesDirty.set(false);
      this.resourcesStatus.set(`Saved properties for level ${id - 139}.`);
    } catch (error) {
      this.editorError.set(error instanceof Error ? error.message : 'Save failed');
    } finally {
      this.workerBusy.set(false);
    }
  }

  // ---- Object placement ----

  selectObject(index: number, centerCanvas = false): void {
    this.selectedObjIndex.set(index);
    const objs = this.objects();
    if (index >= 0 && index < objs.length) {
      const obj = objs[index];
      this.editObjX.set(obj.x);
      this.editObjY.set(obj.y);
      this.editObjDir.set(obj.dir);
      this.editObjTypeRes.set(obj.typeRes);
      if (centerCanvas) this.centerOnSelectedObject();
    }
  }

  /** Valid field names: 'x' | 'y' | 'dir' | 'typeRes' */
  onObjFieldInput(field: 'x' | 'y' | 'dir' | 'typeRes', event: Event): void {
    const val = parseFloat((event.target as HTMLInputElement).value);
    if (Number.isNaN(val)) return;
    switch (field) {
      case 'x': this.editObjX.set(Math.round(val)); break;
      case 'y': this.editObjY.set(Math.round(val)); break;
      case 'dir': {
        // Normalise to [-π, π] using atan2 of the unit vector – handles all edge cases.
        const wrapped = Math.atan2(Math.sin(val), Math.cos(val));
        this.editObjDir.set(wrapped);
        break;
      }
      case 'typeRes': this.editObjTypeRes.set(Math.round(val)); break;
    }
    // Auto-apply so the canvas reflects changes immediately without a separate button press.
    this.applyObjEdit();
  }

  applyObjEdit(): void {
    const idx = this.selectedObjIndex();
    if (idx === null) return;
    const objs = [...this.objects()];
    if (idx < 0 || idx >= objs.length) return;
    objs[idx] = {
      x: this.editObjX(),
      y: this.editObjY(),
      dir: this.editObjDir(),
      typeRes: this.editObjTypeRes(),
    };
    this.objects.set(objs);
  }

  addObject(): void {
    const objs = [...this.objects()];
    objs.push({ x: 0, y: 0, dir: 0, typeRes: 128 });
    this.objects.set(objs);
    this.selectObject(objs.length - 1);
  }

  duplicateSelectedObject(): void {
    const idx = this.selectedObjIndex();
    if (idx === null) return;
    const objs = [...this.objects()];
    if (idx < 0 || idx >= objs.length) return;
    const original = objs[idx];
    objs.push({ ...original, x: original.x + 50 });
    this.objects.set(objs);
    this.selectObject(objs.length - 1);
  }

  toggleTypeVisibility(typeId: number): void {
    const next = new Set(this.visibleTypeFilter());
    if (next.has(typeId)) {
      next.delete(typeId);
    } else {
      next.add(typeId);
    }
    this.visibleTypeFilter.set(next);
  }

  showAllObjectTypes(): void {
    this.visibleTypeFilter.set(new Set(this.typePalette.map((item) => item.typeId)));
  }

  hideAllObjectTypes(): void {
    this.visibleTypeFilter.set(new Set());
  }

  /** Return a short human-readable dimension string for a type resource ID (e.g. "32×64 px"). */
  getObjTypeDimensionLabel(typeRes: number): string {
    const def = this.objectTypeDefinitions.get(typeRes);
    if (!def) return '';
    const w = Math.round(def.width);
    const l = Math.round(def.length);
    return `${w}×${l} px`;
  }

  removeSelectedObject(): void {
    const idx = this.selectedObjIndex();
    if (idx === null) return;
    const objs = this.objects().filter((_, i) => i !== idx);
    this.objects.set(objs);
    this.selectedObjIndex.set(objs.length > 0 ? Math.min(idx, objs.length - 1) : null);
  }

  async saveLevelObjects(): Promise<void> {
    const id = this.selectedLevelId();
    if (id === null) return;
    try {
      this.workerBusy.set(true);
      const result = await this.dispatchWorker<{ levels: ParsedLevel[] }>('APPLY_OBJECTS', {
        resourceId: id,
        objects: this.objects(),
      });
      this.applyLevelsResult(result.levels);
      this.resourcesStatus.set(`Saved objects for level ${id - 139} (${this.objects().length} objects).`);
    } catch (error) {
      this.editorError.set(error instanceof Error ? error.message : 'Save failed');
    } finally {
      this.workerBusy.set(false);
    }
  }

  // ---- Canvas coordinate transforms ----

  worldToCanvas(wx: number, wy: number): [number, number] {
    const canvas = document.getElementById('object-canvas') as HTMLCanvasElement | null;
    const W = canvas?.width ?? 600;
    const H = canvas?.height ?? 500;
    const cx = W / 2 + (wx - this.canvasPanX()) * this.canvasZoom();
    const cy = H / 2 - (wy - this.canvasPanY()) * this.canvasZoom(); // flip Y: world Y up = canvas up
    return [cx, cy];
  }

  canvasToWorld(cx: number, cy: number): [number, number] {
    const canvas = document.getElementById('object-canvas') as HTMLCanvasElement | null;
    const W = canvas?.width ?? 600;
    const H = canvas?.height ?? 500;
    const wx = (cx - W / 2) / this.canvasZoom() + this.canvasPanX();
    const wy = -(cy - H / 2) / this.canvasZoom() + this.canvasPanY(); // flip Y
    return [wx, wy];
  }

  // ---- Canvas event handlers ----

  onCanvasMouseDown(event: MouseEvent): void {
    event.preventDefault();
    const isPanningGesture = event.button === 1 || (event.button === 0 && this.spaceDown());
    if (isPanningGesture) {
      // Middle mouse button OR Space+left-drag: start panning
      this._isPanning = true;
      this.isPanning.set(true);
      this._prevPanMouseX = event.offsetX;
      this._prevPanMouseY = event.offsetY;
      return;
    }
    // Left click: find closest object OR track waypoint
    const [wx, wy] = this.canvasToWorld(event.offsetX, event.offsetY);
    const objs = this.objects();
    const hitRadius = Math.max(MIN_HIT_RADIUS, BASE_HIT_RADIUS / this.canvasZoom());

    // Check track waypoints first (only when overlay is visible)
    if (this.showTrackOverlay()) {
      const trackUp = this.editTrackUp();
      const trackDown = this.editTrackDown();
      const trackHitR = Math.max(12, 10 / this.canvasZoom());
      for (let i = 0; i < trackUp.length; i++) {
        if (dist2d(trackUp[i].x, trackUp[i].y, wx, wy) < trackHitR) {
          this.dragTrackWaypoint.set({ track: 'up', segIdx: i });
          this.selectedObjIndex.set(null);
          (event.target as HTMLCanvasElement).focus();
          return;
        }
      }
      for (let i = 0; i < trackDown.length; i++) {
        if (dist2d(trackDown[i].x, trackDown[i].y, wx, wy) < trackHitR) {
          this.dragTrackWaypoint.set({ track: 'down', segIdx: i });
          this.selectedObjIndex.set(null);
          (event.target as HTMLCanvasElement).focus();
          return;
        }
      }
    }

    // Check start marker (player start X at world Y=0)
    const startHitR = Math.max(MIN_START_MARKER_HIT_RADIUS, BASE_START_MARKER_HIT_RADIUS / this.canvasZoom());
    if (dist2d(this.editXStartPos(), 0, wx, wy) < startHitR) {
      this._draggingStartMarker = true;
      this.selectedObjIndex.set(null);
      (event.target as HTMLCanvasElement).focus();
      return;
    }

    // Check objects
    let closest = -1;
    let closestDist = hitRadius;
    for (let i = 0; i < objs.length; i++) {
      const d = dist2d(objs[i].x, objs[i].y, wx, wy);
      if (d < closestDist) { closestDist = d; closest = i; }
    }
    if (closest >= 0) {
      this.selectObject(closest);
      this.isDragging.set(true);
      this.dragObjIndex.set(closest);
    } else {
      this.selectedObjIndex.set(null);
    }
    const canvas = event.target as HTMLCanvasElement;
    canvas.focus();
  }

  onCanvasMouseMove(event: MouseEvent): void {
    if (this._isPanning) {
      const zoom = this.canvasZoom();
      const dx = event.offsetX - this._prevPanMouseX;
      const dy = event.offsetY - this._prevPanMouseY;
      this._prevPanMouseX = event.offsetX;
      this._prevPanMouseY = event.offsetY;
      this.canvasPanX.set(this.canvasPanX() - dx / zoom);
      this.canvasPanY.set(this.canvasPanY() - dy / zoom);
      return;
    }
    // Track waypoint drag
    const twp = this.dragTrackWaypoint();
    if (twp) {
      const [wx, wy] = this.canvasToWorld(event.offsetX, event.offsetY);
      if (twp.track === 'up') {
        const arr = [...this.editTrackUp()];
        arr[twp.segIdx] = { ...arr[twp.segIdx], x: Math.round(wx), y: Math.round(wy) };
        this.editTrackUp.set(arr);
      } else {
        const arr = [...this.editTrackDown()];
        arr[twp.segIdx] = { ...arr[twp.segIdx], x: Math.round(wx), y: Math.round(wy) };
        this.editTrackDown.set(arr);
      }
      return;
    }
    // Start marker drag (X only)
    if (this._draggingStartMarker) {
      const [wx] = this.canvasToWorld(event.offsetX, event.offsetY);
      this.editXStartPos.set(Math.round(wx));
      this.propertiesDirty.set(true);
      return;
    }
    if (!this.isDragging()) return;
    const dragIdx = this.dragObjIndex();
    if (dragIdx === null) return;
    const [wx, wy] = this.canvasToWorld(event.offsetX, event.offsetY);
    const objs = [...this.objects()];
    objs[dragIdx] = { ...objs[dragIdx], x: Math.round(wx), y: Math.round(wy) };
    this.objects.set(objs);
    // Sync edit fields
    this.editObjX.set(Math.round(wx));
    this.editObjY.set(Math.round(wy));
  }

  onCanvasMouseUp(event: MouseEvent): void {
    if (this._isPanning) {
      this._isPanning = false;
      this.isPanning.set(false);
      return;
    }
    // Finish track waypoint drag (no save needed – editTrackUp/Down are live)
    if (this.dragTrackWaypoint()) {
      this.dragTrackWaypoint.set(null);
      return;
    }
    // Finish start marker drag
    if (this._draggingStartMarker) {
      this._draggingStartMarker = false;
      return;
    }
    const wasDragging = this.isDragging();
    this.isDragging.set(false);
    this.dragObjIndex.set(null);
    if (wasDragging) {
      this.applyObjEdit();
    }
  }

  onCanvasDoubleClick(event: MouseEvent): void {
    const [wx, wy] = this.canvasToWorld(event.offsetX, event.offsetY);
    const objs = [...this.objects()];
    objs.push({ x: Math.round(wx), y: Math.round(wy), dir: 0, typeRes: 128 });
    this.objects.set(objs);
    this.selectObject(objs.length - 1);
  }

  onCanvasKeyDown(event: KeyboardEvent): void {
    if (event.key === ' ') {
      this.spaceDown.set(true);
      event.preventDefault(); // prevent page scroll
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd') {
      event.preventDefault();
      this.duplicateSelectedObject();
      return;
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      this.removeSelectedObject();
      return;
    }
    // Arrow key panning (Y flipped: ArrowUp → higher world Y)
    const panStep = 50 / this.canvasZoom(); // world units per keystroke
    if (event.key === 'ArrowUp')    { event.preventDefault(); this.canvasPanY.update((y) => y + panStep); }
    if (event.key === 'ArrowDown')  { event.preventDefault(); this.canvasPanY.update((y) => y - panStep); }
    if (event.key === 'ArrowLeft')  { event.preventDefault(); this.canvasPanX.update((x) => x - panStep); }
    if (event.key === 'ArrowRight') { event.preventDefault(); this.canvasPanX.update((x) => x + panStep); }
  }

  onCanvasKeyUp(event: KeyboardEvent): void {
    if (event.key === ' ') {
      this.spaceDown.set(false);
      if (this._isPanning) {
        this._isPanning = false;
        this.isPanning.set(false);
      }
    }
  }

  onCanvasWheel(event: WheelEvent): void {
    event.preventDefault();
    const delta = event.deltaY;
    const factor = 1 - delta * 0.001;
    const newZoom = Math.min(10, Math.max(0.1, this.canvasZoom() * factor));
    this.canvasZoom.set(newZoom);
  }

  zoomIn(): void {
    this.canvasZoom.set(Math.min(10, this.canvasZoom() + 0.25));
  }

  zoomOut(): void {
    this.canvasZoom.set(Math.max(0.1, this.canvasZoom() - 0.25));
  }

  resetView(): void {
    const level = this.selectedLevel();
    if (level) {
      this.resetViewToRoad(level);
    } else {
      this.canvasZoom.set(1.5);
      this.canvasPanX.set(0);
      this.canvasPanY.set(0);
    }
  }

  frameAllObjects(): void {
    const objs = this.objects();
    if (objs.length === 0) {
      this.resetView();
      return;
    }
    const xs = objs.map((obj) => obj.x);
    const ys = objs.map((obj) => obj.y);
    this.frameWorldRect(Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys));
  }

  centerOnSelectedObject(): void {
    const idx = this.selectedObjIndex();
    if (idx === null) return;
    const obj = this.objects()[idx];
    if (!obj) return;
    this.canvasPanX.set(obj.x);
    this.canvasPanY.set(obj.y);
  }

  // ---- Object canvas drawing ----

  redrawObjectCanvas(): void {
    const canvas = document.getElementById('object-canvas') as HTMLCanvasElement | null;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const zoom = this.canvasZoom();
    const panX = this.canvasPanX();
    const panY = this.canvasPanY();
    const objs = this.objects();
    const selIdx = this.selectedObjIndex();
    const visibleTypes = this.visibleTypeFilter();
    const level = this.selectedLevel();

    ctx.clearRect(0, 0, W, H);

    // ---- Per-level background colour from actual game texture (kPackTx16 dominant colour) ----
    const roadInfo = level?.properties.roadInfo ?? 0;
    const theme: RoadTheme = ROAD_THEMES[roadInfo] ?? DEFAULT_ROAD_THEME;
    ctx.fillStyle = theme.bg;
    ctx.fillRect(0, 0, W, H);

    // Draw grid (subtle, over the background)
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.lineWidth = 1;
    const gridStep = 100; // world units
    const gridStepPx = gridStep * zoom;
    if (gridStepPx > 8) {
      const startWorldX = panX - W / (2 * zoom);
      const startWorldY = panY - H / (2 * zoom);
      const endWorldX = panX + W / (2 * zoom);
      const endWorldY = panY + H / (2 * zoom);
      const firstX = Math.floor(startWorldX / gridStep) * gridStep;
      const firstY = Math.floor(startWorldY / gridStep) * gridStep;
      for (let gx = firstX; gx <= endWorldX; gx += gridStep) {
        const [cx] = this.worldToCanvas(gx, 0);
        ctx.beginPath();
        ctx.moveTo(cx, 0);
        ctx.lineTo(cx, H);
        ctx.stroke();
      }
      for (let gy = firstY; gy <= endWorldY; gy += gridStep) {
        const [, cy] = this.worldToCanvas(0, gy);
        ctx.beginPath();
        ctx.moveTo(0, cy);
        ctx.lineTo(W, cy);
        ctx.stroke();
      }
    }

    if (level) {
      this.drawObjectRoadPreview(ctx, level, theme);
    }

    // Draw axes (faint, only if road not drawn)
    if (!level || level.roadSegs.length === 0) {
      const [ox2, oy2] = this.worldToCanvas(0, 0);
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(ox2, 0); ctx.lineTo(ox2, H); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, oy2); ctx.lineTo(W, oy2); ctx.stroke();
    }

    // Draw track overlay (AI paths) over road but under objects
    if (level && this.showTrackOverlay()) {
      this.drawObjectTrackOverlay(ctx);
    }

    // Draw marks (checkpoint lines) over road
    if (level) {
      this.drawMarksOnCanvas(ctx);
    }

    // Draw objects
    const baseRadius = Math.min(20, Math.max(5, 8 * zoom));
    const labelFont = `${Math.max(9, 10 * zoom)}px monospace`;
    for (let i = 0; i < objs.length; i++) {
      const obj = objs[i];
      const typeIdx = ((obj.typeRes % OBJ_PALETTE.length) + OBJ_PALETTE.length) % OBJ_PALETTE.length;
      const isFilteredOut = !visibleTypes.has(typeIdx);
      if (isFilteredOut && i !== selIdx) continue;
      const [cx, cy] = this.worldToCanvas(obj.x, obj.y);
      if (cx < -50 || cx > W + 50 || cy < -50 || cy > H + 50) continue;

      ctx.globalAlpha = isFilteredOut ? 0.3 : 1.0;
      const color = OBJ_PALETTE[typeIdx];
      const objectType = this.objectTypeDefinitions.get(obj.typeRes) ?? null;
      const preview = this.getObjectSpritePreview(obj.typeRes);

      // Scale object size with zoom
      const drawWidth  = objectType ? Math.max(8, objectType.width  * zoom) : baseRadius * 2.5;
      const drawHeight = objectType ? Math.max(8, objectType.length * zoom) : baseRadius * 2.5;

      const isPlayerCar = obj.typeRes === PLAYER_CAR_TYPE_RES;
      const isSel = i === selIdx;

      if (preview) {
        // Draw sprite rotated to match direction (game Y-axis is up, so negate for canvas)
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(-obj.dir);
        ctx.drawImage(preview, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
        ctx.restore();
      } else {
        // Fallback circle
        ctx.fillStyle = isPlayerCar ? '#ffe082' : color;
        ctx.beginPath();
        ctx.arc(cx, cy, baseRadius, 0, Math.PI * 2);
        ctx.fill();
      }

      // Bounding-box outline (colour-coded by type)
      ctx.strokeStyle = isSel ? '#ffffff' : (isPlayerCar ? '#ffe082' : color);
      ctx.lineWidth = isSel ? 2 : 1;
      ctx.strokeRect(cx - drawWidth / 2, cy - drawHeight / 2, drawWidth, drawHeight);

      // Direction arrow – always visible so user can see AI direction in the layout
      const arrowLen = Math.max(baseRadius * 1.2, drawHeight * 0.6);
      const arrowColor = isSel ? '#ffffff' : 'rgba(255,255,255,0.6)';
      ctx.strokeStyle = arrowColor;
      ctx.lineWidth = isSel ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      // In world space Y is "up the track"; dir=0 means pointing up (+Y world = −Y canvas)
      ctx.lineTo(cx + Math.sin(obj.dir) * arrowLen, cy - Math.cos(obj.dir) * arrowLen);
      ctx.stroke();

      // Selection ring
      if (isSel) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2.5;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.arc(cx, cy, Math.max(drawWidth, drawHeight) / 2 + 5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Player-car star marker
      if (isPlayerCar) {
        ctx.fillStyle = '#ffe082';
        ctx.font = `${Math.max(10, 12 * zoom)}px sans-serif`;
        ctx.fillText('★', cx - 6, cy - drawHeight / 2 - 4);
      }

      // Label when zoomed in enough or selected
      if (zoom > 0.35 || isSel) {
        ctx.fillStyle = isSel ? '#ffffff' : 'rgba(220,220,220,0.85)';
        ctx.font = labelFont;
        ctx.fillText(`#${i} T${obj.typeRes}`, cx + drawWidth / 2 + 4, cy + 4);
      }
      ctx.globalAlpha = 1.0;
    }

    // Origin marker at world (0,0)
    const [ox, oy] = this.worldToCanvas(0, 0);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath();
    ctx.arc(ox, oy, 3, 0, Math.PI * 2);
    ctx.fill();

    // Player Start X marker – draggable flag at (xStartPos, 0)
    if (level) {
      const startX = this.editXStartPos();
      const [smx, smy] = this.worldToCanvas(startX, 0);
      if (smx > -20 && smx < W + 20 && smy > -20 && smy < H + 20) {
        const isDraggingStart = this._draggingStartMarker;
        const zf = Math.min(zoom, 2); // zoom factor capped at 2×
        const POLE_H   = 20 * zf;
        const FLAG_TIP = 10 * zf;
        const FLAG_MID = 14 * zf;
        const FLAG_BOT = 8  * zf;
        ctx.strokeStyle = isDraggingStart ? '#ffffff' : '#00e5ff';
        ctx.fillStyle   = isDraggingStart ? '#ffffff' : '#00e5ff';
        ctx.lineWidth = 2;
        // Vertical pole
        ctx.beginPath();
        ctx.moveTo(smx, smy);
        ctx.lineTo(smx, smy - POLE_H);
        ctx.stroke();
        // Flag triangle
        ctx.beginPath();
        ctx.moveTo(smx, smy - POLE_H);
        ctx.lineTo(smx + FLAG_TIP, smy - FLAG_MID);
        ctx.lineTo(smx, smy - FLAG_BOT);
        ctx.closePath();
        ctx.fill();
        // Label
        if (zoom > 0.4) {
          ctx.font = `${Math.max(9, 10 * zoom)}px monospace`;
          ctx.fillStyle = isDraggingStart ? '#ffffff' : '#00e5ff';
          ctx.fillText(`START X=${startX}`, smx + 6, smy - POLE_H - 2);
        }
      }
    }

    // Finish line at levelEnd Y
    if (level && level.properties.levelEnd > 0) {
      const [, finishY] = this.worldToCanvas(0, level.properties.levelEnd);
      if (finishY > -2 && finishY < H + 2) {
        ctx.strokeStyle = '#f9a825';
        ctx.lineWidth = 2;
        ctx.setLineDash([10, 6]);
        ctx.beginPath();
        ctx.moveTo(0, finishY);
        ctx.lineTo(W, finishY);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#f9a825';
        ctx.font = `${Math.max(9, 11 * zoom)}px monospace`;
        ctx.fillText('FINISH', 6, finishY - 4);
      }
    }
  }

  // ---- Mark segment editor ----

  addMark(): void {
    const ms = [...this.marks()];
    ms.push({ x1: -100, y1: 0, x2: 100, y2: 0 });
    this.marks.set(ms);
    this.selectedMarkIndex.set(ms.length - 1);
  }

  removeSelectedMark(): void {
    const idx = this.selectedMarkIndex();
    if (idx === null) return;
    const ms = this.marks().filter((_, i) => i !== idx);
    this.marks.set(ms);
    this.selectedMarkIndex.set(ms.length > 0 ? Math.min(idx, ms.length - 1) : null);
  }

  /** Valid field names: 'x1' | 'y1' | 'x2' | 'y2' */
  onMarkFieldInput(markIdx: number, field: 'x1' | 'y1' | 'x2' | 'y2', event: Event): void {
    const val = Number.parseInt((event.target as HTMLInputElement).value, 10);
    if (Number.isNaN(val)) return;
    const ms = [...this.marks()];
    ms[markIdx] = { ...ms[markIdx], [field]: val };
    this.marks.set(ms);
  }

  async saveMarks(): Promise<void> {
    const id = this.selectedLevelId();
    if (id === null) return;
    try {
      this.workerBusy.set(true);
      const result = await this.dispatchWorker<{ levels: ParsedLevel[] }>('APPLY_MARKS', {
        resourceId: id,
        marks: this.marks(),
      });
      this.applyLevelsResult(result.levels);
      this.resourcesStatus.set(`Saved ${this.marks().length} mark segments for level ${id - 139}.`);
    } catch (error) {
      this.editorError.set(error instanceof Error ? error.message : 'Save failed');
    } finally {
      this.workerBusy.set(false);
    }
  }

  // ---- Mark canvas helpers ----

  private markWorldToCanvas(wx: number, wy: number, canvas: HTMLCanvasElement,
    minX: number, minY: number, rangeX: number, rangeY: number): [number, number] {
    const pad = 24;
    const W = canvas.width;
    const H = canvas.height;
    const cx = pad + ((wx - minX) / (rangeX || 1)) * (W - 2 * pad);
    const cy = H - pad - ((wy - minY) / (rangeY || 1)) * (H - 2 * pad);
    return [cx, cy];
  }

  private markBounds(ms: MarkSeg[]): { minX: number; minY: number; maxX: number; maxY: number; rangeX: number; rangeY: number } {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const m of ms) {
      if (m.x1 < minX) minX = m.x1; if (m.x2 < minX) minX = m.x2;
      if (m.y1 < minY) minY = m.y1; if (m.y2 < minY) minY = m.y2;
      if (m.x1 > maxX) maxX = m.x1; if (m.x2 > maxX) maxX = m.x2;
      if (m.y1 > maxY) maxY = m.y1; if (m.y2 > maxY) maxY = m.y2;
    }
    return { minX, minY, maxX, maxY, rangeX: maxX - minX, rangeY: maxY - minY };
  }

  redrawMarkCanvas(): void {
    const canvas = document.getElementById('mark-canvas') as HTMLCanvasElement | null;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const ms = this.marks();
    const selIdx = this.selectedMarkIndex();

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, W, H);

    if (ms.length === 0) {
      ctx.fillStyle = '#555';
      ctx.font = '13px monospace';
      ctx.fillText('No mark segments. Click "+ Add Mark" to add one.', 20, H / 2);
      return;
    }

    const { minX, minY, rangeX, rangeY } = this.markBounds(ms);

    const toC = (wx: number, wy: number) =>
      this.markWorldToCanvas(wx, wy, canvas, minX, minY, rangeX, rangeY);

    for (let i = 0; i < ms.length; i++) {
      const m = ms[i];
      const [ax, ay] = toC(m.x1, m.y1);
      const [bx, by] = toC(m.x2, m.y2);
      const isSel = i === selIdx;

      ctx.strokeStyle = isSel ? '#42a5f5' : '#555';
      ctx.lineWidth = isSel ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();

      // Endpoint dots
      ctx.fillStyle = isSel ? '#42a5f5' : '#888';
      ctx.beginPath(); ctx.arc(ax, ay, 6, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(bx, by, 6, 0, Math.PI * 2); ctx.fill();

      if (isSel) {
        ctx.fillStyle = '#fff';
        ctx.font = '10px monospace';
        ctx.fillText(`P1(${m.x1},${m.y1})`, ax + 8, ay - 4);
        ctx.fillText(`P2(${m.x2},${m.y2})`, bx + 8, by - 4);
      }
    }
  }

  onMarkCanvasMouseDown(event: MouseEvent): void {
    const canvas = event.target as HTMLCanvasElement;
    const ms = this.marks();
    if (ms.length === 0) return;

    const { minX, minY, rangeX, rangeY } = this.markBounds(ms);

    const hitR = MARK_ENDPOINT_HIT_RADIUS;
    for (let i = 0; i < ms.length; i++) {
      const m = ms[i];
      const [ax, ay] = this.markWorldToCanvas(m.x1, m.y1, canvas, minX, minY, rangeX, rangeY);
      const [bx, by] = this.markWorldToCanvas(m.x2, m.y2, canvas, minX, minY, rangeX, rangeY);
      if (dist2d(event.offsetX, event.offsetY, ax, ay) < hitR) {
        this.selectedMarkIndex.set(i);
        this.dragMarkEndpoint.set({ markIdx: i, endpoint: 'p1' });
        return;
      }
      if (dist2d(event.offsetX, event.offsetY, bx, by) < hitR) {
        this.selectedMarkIndex.set(i);
        this.dragMarkEndpoint.set({ markIdx: i, endpoint: 'p2' });
        return;
      }
    }
    // Click on a line to select it
    for (let i = 0; i < ms.length; i++) {
      const m = ms[i];
      const [ax, ay] = this.markWorldToCanvas(m.x1, m.y1, canvas, minX, minY, rangeX, rangeY);
      const [bx, by] = this.markWorldToCanvas(m.x2, m.y2, canvas, minX, minY, rangeX, rangeY);
      const dist = this.pointToSegmentDist(event.offsetX, event.offsetY, ax, ay, bx, by);
      if (dist < 8) {
        this.selectedMarkIndex.set(i);
        return;
      }
    }
  }

  onMarkCanvasMouseMove(event: MouseEvent): void {
    const drag = this.dragMarkEndpoint();
    if (!drag) return;
    const canvas = event.target as HTMLCanvasElement;
    const ms = this.marks();
    const { minX, minY, rangeX: rawRangeX, rangeY: rawRangeY } = this.markBounds(ms);
    const rangeX = rawRangeX || 1;
    const rangeY = rawRangeY || 1;
    const pad = 24;
    const W = canvas.width; const H = canvas.height;
    // Invert the canvas-to-world mapping
    const wx = Math.round(minX + ((event.offsetX - pad) / (W - 2 * pad)) * rangeX);
    const wy = Math.round(minY + ((H - pad - event.offsetY) / (H - 2 * pad)) * rangeY);
    const newMs = [...ms];
    if (drag.endpoint === 'p1') {
      newMs[drag.markIdx] = { ...newMs[drag.markIdx], x1: wx, y1: wy };
    } else {
      newMs[drag.markIdx] = { ...newMs[drag.markIdx], x2: wx, y2: wy };
    }
    this.marks.set(newMs);
  }

  onMarkCanvasMouseUp(_event: MouseEvent): void {
    this.dragMarkEndpoint.set(null);
  }

  private pointToSegmentDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
    const dx = bx - ax; const dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.sqrt((px - ax) ** 2 + (py - ay) ** 2);
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
    return Math.sqrt((px - (ax + t * dx)) ** 2 + (py - (ay + t * dy)) ** 2);
  }

  // ---- Sprite editor ----

  async selectSprite(spriteId: number): Promise<void> {
    this.selectedSpriteId.set(spriteId);
    this.currentSpriteBytes.set(null);
    try {
      const result = await this.dispatchWorker<{ bytes: Uint8Array | null }>('GET_SPRITE_BYTES', { spriteId });
      const bytes = result.bytes;
      this.currentSpriteBytes.set(bytes);
    } catch {
      // non-fatal: pixel canvas just stays empty
    }
  }

  // ---- Sprite pixel canvas ----

  redrawSpriteCanvas(): void {
    const canvas = document.getElementById('sprite-pixel-canvas') as HTMLCanvasElement | null;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const id = this.selectedSpriteId();
    if (id === null) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }
    const bytes = this.currentSpriteBytes();
    if (!bytes || bytes.length === 0) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    const cols = 16;
    const rows = Math.ceil(bytes.length / cols);
    const cellW = Math.floor(canvas.width / cols);
    const cellH = Math.max(1, Math.floor(canvas.height / Math.max(rows, 1)));

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let i = 0; i < bytes.length; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const v = bytes[i];
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.fillRect(col * cellW, row * cellH, cellW, cellH);
    }
  }

  // ---- Fullscreen / volume ----

  toggleFullscreen(): void {
    const canvas = document.getElementById('canvas') as HTMLCanvasElement;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      canvas.requestFullscreen().catch((err) => console.warn('Fullscreen error:', err));
    }
  }

  onVolumeChange(event: Event): void {
    const pct = Number.parseInt((event.target as HTMLInputElement).value, 10);
    this.masterVolume.set(pct);
    this.applyVolumeToWasm(pct);
  }

  // ---- Private helpers ----

  private async loadResourcesBytes(bytes: Uint8Array, sourceName: string): Promise<void> {
    this.workerBusy.set(true);
    this.resourcesStatus.set(`Parsing ${sourceName}…`);
    this.editorError.set('');
    try {
      // Transfer the underlying ArrayBuffer to avoid copying inside postMessage.
      const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      type LoadResult = {
        levels: ParsedLevel[];
        sprites: EditableSpriteAsset[];
        objectTypesArr: [number, ObjectTypeDefinition][];
      };
      const result = await this.dispatchWorker<LoadResult>('LOAD', buffer, [buffer]);

      // Rebuild object type definitions map
      this.objectTypeDefinitions.clear();
      for (const [typeRes, def] of result.objectTypesArr) {
        if (def) this.objectTypeDefinitions.set(typeRes, def);
      }

      // Clear previews — fresh ones will arrive shortly from DECODE_SPRITE_PREVIEWS
      this.objectSpritePreviews.clear();

      this.parsedLevels.set(result.levels);
      this.spriteAssets.set(result.sprites);
      this.hasEditorData.set(true);
      this.resourcesStatus.set(
        `Loaded ${result.levels.length} level(s) and ${result.sprites.length} sprite(s) from ${sourceName}.`,
      );

      // Auto-select first level
      const curId = this.selectedLevelId();
      if (curId !== null && result.levels.some((l) => l.resourceId === curId)) {
        this.selectLevel(curId);
      } else if (result.levels.length > 0) {
        this.selectLevel(result.levels[0].resourceId);
      } else {
        this.selectedLevelId.set(null);
      }
      if (result.sprites.length > 0 && this.selectedSpriteId() === null) {
        void this.selectSprite(result.sprites[0].id);
      }

      // Kick off sprite pre-decoding in the background so the editor
      // is usable immediately while previews are being decoded.
      void this.decodeSpritePreviewsInBackground(result.objectTypesArr);
      // Kick off road texture decoding in the background.
      void this.decodeRoadTexturesInBackground();
      // Kick off pack sprite frames decoding for the Sprites tab.
      void this.decodePackSpritesInBackground();
    } catch (error) {
      this.editorError.set(error instanceof Error ? error.message : 'Failed to parse resources');
      this.resourcesStatus.set('Failed to parse resources.');
    } finally {
      this.workerBusy.set(false);
    }
  }

  /** Ask the worker to decode sprite previews and populate the preview cache. */
  private async decodeSpritePreviewsInBackground(
    objectTypesArr: [number, ObjectTypeDefinition][],
  ): Promise<void> {
    try {
      type DecodeResult = {
        decodedSprites: { typeRes: number; pixels: ArrayBuffer; width: number; height: number }[];
      };
      const result = await this.dispatchWorker<DecodeResult>('DECODE_SPRITE_PREVIEWS', { objectTypesArr });
      for (const { typeRes, pixels, width, height } of result.decodedSprites) {
        const clamped = new Uint8ClampedArray(pixels);
        const canvas = this.renderSpritePixels(clamped, width, height);
        this.objectSpritePreviews.set(typeRes, canvas);
      }
      // Bump the version signal so the object canvas redraws with sprite previews.
      this.spritePreviewsVersion.update((v) => v + 1);
    } catch {
      // Non-fatal: sprites just show as colored circles.
    }
  }

  /**
   * Ask the worker to decode road textures from kPackTx16 and store them as
   * OffscreenCanvas / HTMLCanvasElement entries for use as CanvasPattern fills.
   */
  private async decodeRoadTexturesInBackground(): Promise<void> {
    try {
      type RoadTexResult = {
        roadInfoArr: [number, RoadInfoData][];
        textures: { texId: number; width: number; height: number; pixels: ArrayBuffer }[];
      };
      const result = await this.dispatchWorker<RoadTexResult>('DECODE_ROAD_TEXTURES');

      // Rebuild road info map
      this.roadInfoDataMap.clear();
      for (const [id, ri] of result.roadInfoArr) {
        this.roadInfoDataMap.set(id, ri);
      }

      // Build one HTMLCanvasElement per texture (for createPattern use)
      for (const { texId, width, height, pixels } of result.textures) {
        const clamped = new Uint8ClampedArray(pixels);
        const tc = document.createElement('canvas');
        tc.width = width;
        tc.height = height;
        const tctx = tc.getContext('2d');
        if (tctx) {
          const imgData = new ImageData(clamped, width, height);
          tctx.putImageData(imgData, 0, 0);
        }
        this.roadTextureCanvases.set(texId, tc);
      }
      // Bump version to trigger canvas redraw with real textures
      this.roadTexturesVersion.update((v) => v + 1);
    } catch {
      // Non-fatal: road falls back to flat colours.
    }
  }

  /**
   * Ask the worker to decode all sprite frames from Pack 129 (8-bit) and Pack 137 (16-bit)
   * and store them as HTMLCanvasElement entries for the Sprites tab viewer.
   */
  private async decodePackSpritesInBackground(): Promise<void> {
    try {
      type AllSpritesResult = {
        frames: { id: number; bitDepth: 8 | 16; width: number; height: number; pixels: ArrayBuffer }[];
      };
      const result = await this.dispatchWorker<AllSpritesResult>('DECODE_ALL_SPRITE_FRAMES');
      this.packSpriteCanvases.clear();
      const frameInfos: { id: number; bitDepth: 8 | 16; width: number; height: number }[] = [];
      for (const { id, bitDepth, width, height, pixels } of result.frames) {
        const clamped = new Uint8ClampedArray(pixels);
        const canvas = this.renderSpritePixels(clamped, width, height);
        if (canvas) this.packSpriteCanvases.set(id, canvas);
        frameInfos.push({ id, bitDepth, width, height });
      }
      this.packSpriteFrames.set(frameInfos);
      this.packSpritesVersion.update((v) => v + 1);
      // Auto-select first frame if none selected
      if (this.selectedPackSpriteId() === null && frameInfos.length > 0) {
        this.selectedPackSpriteId.set(frameInfos[0].id);
      }
    } catch {
      // Non-fatal: sprites tab falls back to PPic hex viewer only.
    }
  }

  /** Return the pack sprite preview as a data URL for a given frame ID. */
  getPackSpriteDataUrl(frameId: number): string | null {
    const canvas = this.packSpriteCanvases.get(frameId) ?? null;
    if (!canvas) return null;
    try { return canvas.toDataURL(); } catch { return null; }
  }

  exportSpritePng(): void {
    const id = this.selectedPackSpriteId();
    if (id === null) return;
    const canvas = this.packSpriteCanvases.get(id);
    if (!canvas) return;
    try {
      const url = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url;
      a.download = `sprite-${id}.png`;
      a.click();
    } catch { /* security error on cross-origin canvas */ }
  }

  /** Return a human-readable pixel format label for a sprite pack bit depth. */
  getSpriteFormatLabel(bitDepth: 8 | 16 | undefined): string {
    if (bitDepth === 16) return 'RGB555';
    if (bitDepth === 8) return '8-bit';
    return '?';
  }

  /** Apply fresh level list received from the worker after a save operation. */
  private applyLevelsResult(levels: ParsedLevel[]): void {
    this.parsedLevels.set(levels);
    const curId = this.selectedLevelId();
    if (curId !== null && levels.some((l) => l.resourceId === curId)) {
      this.selectLevel(curId);
    } else if (levels.length > 0) {
      this.selectLevel(levels[0].resourceId);
    } else {
      this.selectedLevelId.set(null);
    }
  }

  // ---- Pack Worker management ----

  /** Initialise the pack web worker and wire up the message handler. */
  private initPackWorker(): void {
    if (typeof Worker === 'undefined') {
      // Worker not available (e.g., some test environments). The editor
      // will not be able to parse resources in this environment.
      console.warn('[App] Web Worker not available; pack operations will not work.');
      return;
    }
    try {
      this.packWorker = new Worker(new URL('./pack.worker', import.meta.url), { type: 'module' });
      this.packWorker.onmessage = (event: MessageEvent<WorkerResponse>) => {
        const { id, ok, result, error } = event.data;
        const callback = this.pendingCallbacks.get(id);
        if (callback) {
          this.pendingCallbacks.delete(id);
          callback({ id, ok, cmd: event.data.cmd, result, error });
        }
      };
      this.packWorker.onerror = (err: ErrorEvent) => {
        console.error('[PackWorker] Error:', err.message);
        this.editorError.set(`Worker error: ${err.message}`);
        this.workerBusy.set(false);
        // Reject all outstanding calls so they don't hang forever.
        for (const cb of this.pendingCallbacks.values()) {
          cb({ id: -1, ok: false, cmd: '', error: err.message });
        }
        this.pendingCallbacks.clear();
      };
    } catch (err) {
      console.error('[App] Failed to create pack worker:', err);
    }
  }

  /**
   * Send a command to the pack worker and return a Promise that resolves with
   * the result when the worker responds, or rejects on error.
   */
  private dispatchWorker<T>(cmd: string, payload?: unknown, transferables?: Transferable[]): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      if (!this.packWorker) {
        reject(new Error('Pack worker not available'));
        return;
      }
      const id = this.nextMsgId++;
      this.pendingCallbacks.set(id, (resp: WorkerResponse) => {
        if (resp.ok) {
          resolve(resp.result as T);
        } else {
          reject(new Error(resp.error ?? 'Worker error'));
        }
      });
      if (transferables?.length) {
        this.packWorker.postMessage({ id, cmd, payload }, transferables);
      } else {
        this.packWorker.postMessage({ id, cmd, payload });
      }
    });
  }

  private setupEmscriptenModule(): void {
    const canvas = document.getElementById('canvas') as HTMLCanvasElement;
    const origOpen = XMLHttpRequest.prototype.open;
    const self = this;
    XMLHttpRequest.prototype.open = function (this: XMLHttpRequest, method: string, url: string, ...rest: any[]) {
      if (url && url.indexOf('.data') !== -1) {
        this.addEventListener('progress', (e: ProgressEvent) => {
          if (e.lengthComputable) self.progressPct.set(Math.round((e.loaded / e.total) * 100));
        });
      }
      origOpen.apply(this, [method, url, ...rest] as any);
    } as typeof XMLHttpRequest.prototype.open;

    (window as any)['Module'] = {
      canvas,
      print: (t: string) => console.log('[WASM]', t),
      printErr: (t: string) => console.warn('[WASM ERR]', t),
      setStatus: (t: string) => {
        if (t) {
          this.statusText.set(t);
          const m = t.match(/(\d+(?:\.\d+)?)\/(\d+)/);
          if (m) this.progressPct.set(Math.round((parseFloat(m[1]) / parseFloat(m[2])) * 100));
        } else {
          this.statusText.set('Running');
          this.progressPct.set(100);
          this.overlayVisible.set(false);
        }
      },
      monitorRunDependencies: (left: number) => { if (left === 0) this.progressPct.set(100); },
      onRuntimeInitialized: () => {
        this.statusText.set('Running');
        this.overlayVisible.set(false);
        console.log('[Angular] WASM runtime initialized');
        this.applyVolumeToWasm(this.masterVolume());
      },
      preRun: [],
      postRun: [],
    };
  }

  private loadWasmScript(): void {
    this.wasmScript = document.createElement('script');
    this.wasmScript.src = this.assetUrl('reckless_drivin.js');
    this.wasmScript.async = true;
    this.wasmScript.onerror = () => {
      this.statusText.set('WASM bundle missing. Build `build_wasm/` and rerun `npm start` (see dev-readme.md).');
      console.error('[Angular] Failed to load WASM JS module');
    };
    document.body.appendChild(this.wasmScript);
  }

  private assetUrl(path: string): string {
    return new URL(path, document.baseURI).toString();
  }

  private async readAssetBytes(path: string): Promise<Uint8Array> {
    const response = await fetch(this.assetUrl(path));
    if (!response.ok) {
      throw new Error(`Could not fetch ${path} (HTTP ${response.status}). Run \`npm start\` again so dev assets are synced.`);
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.includes('text/html') || this.looksLikeHtml(bytes)) {
      throw new Error(
        `${path} is not being served as a binary asset. Run \`cd angular-site && npm start\` again; it now auto-syncs default assets before launching the dev server.`,
      );
    }
    return bytes;
  }

  private looksLikeHtml(bytes: Uint8Array): boolean {
    const prefix = new TextDecoder().decode(bytes.slice(0, 32)).toLowerCase();
    return prefix.includes('<!doctype html') || prefix.includes('<html');
  }

  private frameWorldRect(minX: number, maxX: number, minY: number, maxY: number): void {
    const canvas = document.getElementById('object-canvas') as HTMLCanvasElement | null;
    const width = canvas?.width ?? 600;
    const height = canvas?.height ?? 500;
    const worldWidth = Math.max(120, maxX - minX);
    const worldHeight = Math.max(120, maxY - minY);
    const paddedWidth = worldWidth * 1.25;
    const paddedHeight = worldHeight * 1.25;
    const zoom = Math.min(10, Math.max(0.1, Math.min(width / paddedWidth, height / paddedHeight)));
    this.canvasZoom.set(zoom);
    this.canvasPanX.set((minX + maxX) / 2);
    this.canvasPanY.set((minY + maxY) / 2);
  }

  private drawObjectRoadPreview(ctx: CanvasRenderingContext2D, level: ParsedLevel, theme: RoadTheme): void {
    if (level.roadSegs.length < 2) return;

    const W = (ctx.canvas as HTMLCanvasElement).width;
    const H = (ctx.canvas as HTMLCanvasElement).height;
    const zoom  = this.canvasZoom();
    const panX  = this.canvasPanX();
    const panY  = this.canvasPanY();

    // Look up the road info for this level to get real texture IDs.
    const roadInfo  = level.properties.roadInfo;
    const ri        = this.roadInfoDataMap.get(roadInfo);
    const KERB_WIDTH = 16; // world units (matches game's 16.0f/zoom borderWidth)

    /**
     * Create a tiled CanvasPattern from a decoded texture canvas, aligned to world space.
     * @param texId        – key into roadTextureCanvases
     * @param texWorldSize – how many world units one tile of this texture covers
     *                       (128 for main road/grass textures; 16 for border/kerb textures).
     *                       Combined with tc.width (pixel size of the texture canvas), the
     *                       scale factor is: zoom * tc.width / texWorldSize canvas-pixels per
     *                       texture-pixel (NOT a 1:1 pixel=world-unit relationship).
     */
    const makePattern = (texId: number, texWorldSize: number): CanvasPattern | string | null => {
      const tc = this.roadTextureCanvases.get(texId);
      if (!tc) return null;
      try {
        const pat = ctx.createPattern(tc, 'repeat');
        if (!pat) return null;
        // Scale: one world unit = zoom canvas pixels; one texture tile covers texWorldSize
        // world units → texWorldSize * zoom canvas pixels for the full tile.
        // tc.width texture pixels must fill that many canvas pixels → scale per pixel.
        const scale = zoom * tc.width / texWorldSize;
        // Tile size in canvas pixels
        const tileW = tc.width * scale;
        const tileH = tc.height * scale;
        // Translate so that world origin (0,0) aligns with a tile boundary
        const tx = ((W / 2 - panX * zoom) % tileW + tileW) % tileW;
        const ty = ((H / 2 - panY * zoom) % tileH + tileH) % tileH;
        // DOMMatrix: [a, b, c, d, e, f] = [scaleX, 0, 0, scaleY, translateX, translateY]
        pat.setTransform(new DOMMatrix([scale, 0, 0, scale, tx, ty]));
        return pat;
      } catch {
        return null;
      }
    };

    // Obtain patterns (fall back to theme colours if textures not yet loaded)
    const bgPat   = ri ? (makePattern(ri.backgroundTex, 128)  ?? theme.bg)   : theme.bg;
    const fgPat   = ri ? (makePattern(ri.foregroundTex, 128)  ?? theme.road)  : theme.road;
    const lbPat   = ri ? (makePattern(ri.roadLeftBorder, 16)  ?? theme.kerbA) : theme.kerbA;
    const rbPat   = ri ? (makePattern(ri.roadRightBorder, 16) ?? theme.kerbB) : theme.kerbB;
    // Centre line: cyan for water, yellow for asphalt
    const CENTRE_COLOUR = theme.water ? 'rgba(80, 255, 180, 0.85)' : 'rgba(255, 248, 140, 0.85)';

    /** Fill a screen-space quad given four world-space corners */
    const fillQuad = (
      x0: number, y0: number,
      x1: number, y1: number,
      x2: number, y2: number,
      x3: number, y3: number,
      fill: CanvasPattern | string,
    ): void => {
      const [ax0, ay0] = this.worldToCanvas(x0, y0);
      const [ax1, ay1] = this.worldToCanvas(x1, y1);
      const [ax2, ay2] = this.worldToCanvas(x2, y2);
      const [ax3, ay3] = this.worldToCanvas(x3, y3);
      if (ay0 < -H && ay1 < -H && ay2 < -H && ay3 < -H) return;
      if (ay0 > H * 2 && ay1 > H * 2 && ay2 > H * 2 && ay3 > H * 2) return;
      ctx.fillStyle = fill as string; // CanvasPattern is assignable here
      ctx.beginPath();
      ctx.moveTo(ax0, ay0);
      ctx.lineTo(ax1, ay1);
      ctx.lineTo(ax2, ay2);
      ctx.lineTo(ax3, ay3);
      ctx.closePath();
      ctx.fill();
    };

    // Draw road geometry using actual textures – only render segments visible in viewport.
    // Each road segment at index i has world Y = i*2.  Cull segments outside the viewport
    // with a generous margin (2 extra segment heights = 4 world units margin).
    const visibleWorldMinY = panY - H / (2 * zoom) - 4;
    const visibleWorldMaxY = panY + H / (2 * zoom) + 4;
    const firstSeg = Math.max(0, Math.floor(visibleWorldMinY / 2));
    const lastSeg  = Math.min(level.roadSegs.length - 2, Math.ceil(visibleWorldMaxY / 2));

    // Skip segments when zoomed out far (performance optimisation)
    const step = zoom < 0.3 ? 4 : zoom < 0.6 ? 2 : 1;
    // Compute world extents at canvas edges for background fill (extends beyond road edges)
    const worldMinX = panX - W / (2 * zoom) - 200;
    const worldMaxX = panX + W / (2 * zoom) + 200;
    for (let index = firstSeg; index <= lastSeg; index += step) {
      const cur = level.roadSegs[index];
      const nxt = level.roadSegs[index + step];
      const y0  = index * 2;
      const y1  = (index + step) * 2;

      // Off-road (background texture) – extend to canvas edges
      fillQuad(worldMinX, y0,  cur.v0 - KERB_WIDTH, y0,  nxt.v0 - KERB_WIDTH, y1,  worldMinX, y1,  bgPat ?? theme.bg);

      // Left border/kerb
      fillQuad(cur.v0 - KERB_WIDTH, y0,  cur.v0, y0,  nxt.v0, y1,  nxt.v0 - KERB_WIDTH, y1,  lbPat ?? theme.kerbA);

      // Left road lane: v0 to v1 (road surface)
      fillQuad(cur.v0, y0,  cur.v1, y0,  nxt.v1, y1,  nxt.v0, y1,  fgPat ?? theme.road);

      // Median / center gap: v1 to v2 (background with kerbs on both edges)
      // Only draw if there is actually space (v1 == v2 means single-road / no median)
      const medianW = Math.min(cur.v2 - cur.v1, nxt.v2 - nxt.v1);
      if (medianW > 0) {
        const halfKerb = Math.min(KERB_WIDTH, medianW / 2);
        // Right edge of left lane → left edge of median
        fillQuad(cur.v1, y0,  cur.v1 + halfKerb, y0,  nxt.v1 + halfKerb, y1,  nxt.v1, y1,  rbPat ?? theme.kerbB);
        // Center of median (background fill)
        if (medianW > halfKerb * 2) {
          fillQuad(cur.v1 + halfKerb, y0,  cur.v2 - halfKerb, y0,  nxt.v2 - halfKerb, y1,  nxt.v1 + halfKerb, y1,  bgPat ?? theme.bg);
        }
        // Right edge of median → left edge of right lane
        fillQuad(cur.v2 - halfKerb, y0,  cur.v2, y0,  nxt.v2, y1,  nxt.v2 - halfKerb, y1,  lbPat ?? theme.kerbA);
      }

      // Right road lane: v2 to v3 (road surface)
      fillQuad(cur.v2, y0,  cur.v3, y0,  nxt.v3, y1,  nxt.v2, y1,  fgPat ?? theme.road);

      // Right border/kerb
      fillQuad(cur.v3, y0,  cur.v3 + KERB_WIDTH, y0,  nxt.v3 + KERB_WIDTH, y1,  nxt.v3, y1,  rbPat ?? theme.kerbB);

      // Off-road far right – extend to canvas edges
      fillQuad(cur.v3 + KERB_WIDTH, y0,  worldMaxX, y0,  worldMaxX, y1,  nxt.v3 + KERB_WIDTH, y1,  bgPat ?? theme.bg);
    }

    // Centre dashed line (between lanes: midpoint of v1→v2) – only in viewport
    ctx.strokeStyle = CENTRE_COLOUR;
    ctx.lineWidth = Math.max(1, 1.5);
    ctx.setLineDash([12, 10]);
    ctx.beginPath();
    let dashStarted = false;
    for (let index = firstSeg; index <= lastSeg; index += 2) {
      const seg = level.roadSegs[index];
      const midX = (seg.v1 + seg.v2) / 2;
      const [cx, cy] = this.worldToCanvas(midX, index * 2);
      if (!dashStarted) { ctx.moveTo(cx, cy); dashStarted = true; }
      else ctx.lineTo(cx, cy);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // Finish line: checkerboard band at levelEnd Y
    const levelEnd = level.properties.levelEnd;
    if (levelEnd > 0 && level.roadSegs.length > 0) {
      const endSegIdx = Math.min(Math.floor(levelEnd / 2), level.roadSegs.length - 1);
      const seg = level.roadSegs[endSegIdx];
      const [leftX, lineY] = this.worldToCanvas(seg.v1, levelEnd);
      const [rightX] = this.worldToCanvas(seg.v2, levelEnd);
      if (lineY > -10 && lineY < H + 10) {
        const roadWidth = Math.max(4, rightX - leftX);
        const sqSz = Math.max(6, roadWidth / 10);
        const numSq = Math.ceil(roadWidth / sqSz);
        for (let s = 0; s < numSq; s++) {
          ctx.fillStyle = s % 2 === 0 ? '#000000' : '#ffffff';
          ctx.fillRect(leftX + s * sqSz, lineY - sqSz, sqSz, sqSz * 2);
        }
        ctx.fillStyle = '#f9a825';
        ctx.font = `bold 11px monospace`;
        ctx.fillText('FINISH', leftX + 4, lineY - sqSz - 4);
      }
    }

    // Y-axis ruler tick marks (every 1000 world units)
    const canvasEl = ctx.canvas as HTMLCanvasElement;
    const canvasW  = canvasEl.width;
    const canvasH  = canvasEl.height;
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.font = '9px monospace';
    const startY = Math.floor((panY - canvasH / (2 * zoom)) / 1000) * 1000;
    const endY   = panY + canvasH / (2 * zoom);
    for (let wy = startY; wy <= endY; wy += 1000) {
      const [, tickY] = this.worldToCanvas(0, wy);
      if (tickY < 0 || tickY > canvasH) continue;
      ctx.fillRect(canvasW - 28, tickY - 0.5, 28, 1);
      ctx.fillText(`${wy}`, canvasW - 60, tickY - 2);
    }

    // Vertical scrollbar-like position indicator (right edge)
    if (level.roadSegs.length > 1) {
      const totalWorldH = (level.roadSegs.length - 1) * 2;
      // With Y flipped, world Y 0 (start) is at canvas bottom, levelEnd at top.
      // viewWorldMin = lowest Y visible, viewWorldMax = highest Y visible
      const viewWorldMin = panY - canvasH / (2 * zoom);
      const viewWorldMax = panY + canvasH / (2 * zoom);
      const barX = canvasW - 8;
      const barW = 6;
      const barH = canvasH - 20;
      const barY = 10;
      // Track background
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(barX, barY, barW, barH);
      // Thumb: top of bar = finish (high Y), bottom = start (Y=0)
      const thumbTop    = Math.max(barY,       (1 - Math.min(1, viewWorldMax / totalWorldH)) * barH + barY);
      const thumbBottom = Math.min(barH + barY, (1 - Math.max(0, viewWorldMin / totalWorldH)) * barH + barY);
      const thumbH = Math.max(12, thumbBottom - thumbTop);
      ctx.fillStyle = 'rgba(66, 165, 245, 0.55)';
      ctx.beginPath();
      ctx.roundRect(barX, thumbTop, barW, thumbH, 3);
      ctx.fill();
    }
  }

  /**
   * Draw the editable AI track waypoints on the object canvas.
   * Uses `editTrackUp` / `editTrackDown` signals (live editable copies).
   */
  private drawObjectTrackOverlay(ctx: CanvasRenderingContext2D): void {
    const canvas = ctx.canvas as HTMLCanvasElement;
    const W = canvas.width;
    const H = canvas.height;
    const zoom = this.canvasZoom();
    const dragWp = this.dragTrackWaypoint();

    const drawPath = (
      segs: { x: number; y: number }[],
      lineColor: string,
      dotColor: string,
      label: string,
      track: 'up' | 'down',
    ): void => {
      if (segs.length === 0) return;

      // Draw path line
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = Math.max(1.5, 2.5 * Math.min(zoom, 1));
      ctx.beginPath();
      segs.forEach((seg, i) => {
        const [cx, cy] = this.worldToCanvas(seg.x, seg.y);
        if (i === 0) ctx.moveTo(cx, cy); else ctx.lineTo(cx, cy);
      });
      ctx.stroke();

      // Arrow heads every N segments to show travel direction
      const arrowStep = Math.max(1, Math.floor(segs.length / 10));
      ctx.fillStyle = lineColor;
      for (let i = arrowStep; i < segs.length - 1; i += arrowStep) {
        const [x1, y1] = this.worldToCanvas(segs[i - 1].x, segs[i - 1].y);
        const [x2, y2] = this.worldToCanvas(segs[i].x, segs[i].y);
        const angle = Math.atan2(y2 - y1, x2 - x1);
        const sz = 7;
        ctx.save();
        ctx.translate(x2, y2);
        ctx.rotate(angle);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(-sz, -sz / 2);
        ctx.lineTo(-sz, sz / 2);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }

      // Waypoint dots (only draw if zoomed in enough to be useful, or always show sparse set)
      const dotEvery = Math.max(1, Math.floor(segs.length / 40));
      const dotR = Math.max(3, Math.min(6, 4 * zoom));
      for (let i = 0; i < segs.length; i += dotEvery) {
        const [cx, cy] = this.worldToCanvas(segs[i].x, segs[i].y);
        if (cx < -10 || cx > W + 10 || cy < -10 || cy > H + 10) continue;
        const isDragged = dragWp?.track === track && dragWp.segIdx === i;
        ctx.fillStyle = isDragged ? '#ffffff' : dotColor;
        ctx.beginPath();
        ctx.arc(cx, cy, isDragged ? dotR + 3 : dotR, 0, Math.PI * 2);
        ctx.fill();
      }

      // Start dot with label
      const [sx, sy] = this.worldToCanvas(segs[0].x, segs[0].y);
      if (sx > -20 && sx < W + 20 && sy > -20 && sy < H + 20) {
        ctx.fillStyle = lineColor;
        ctx.beginPath();
        ctx.arc(sx, sy, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.font = 'bold 10px monospace';
        ctx.fillText(label, sx + 9, sy + 4);
      }
    };

    drawPath(this.editTrackUp(),   'rgba(66,165,245,0.9)',  'rgba(66,165,245,0.7)',  '▲ Up',   'up');
    drawPath(this.editTrackDown(), 'rgba(239,83,80,0.9)',   'rgba(239,83,80,0.7)',   '▼ Down', 'down');
  }

  /** Draw mark segments (checkpoint lines) on the object canvas. */
  private drawMarksOnCanvas(ctx: CanvasRenderingContext2D): void {
    const marks = this.marks();
    const selMark = this.selectedMarkIndex();
    marks.forEach((m, i) => {
      const [x1, y1] = this.worldToCanvas(m.x1, m.y1);
      const [x2, y2] = this.worldToCanvas(m.x2, m.y2);
      const isSel = i === selMark;
      ctx.strokeStyle = isSel ? '#ffeb3b' : 'rgba(255,235,59,0.7)';
      ctx.lineWidth = isSel ? 3 : 2;
      ctx.setLineDash(isSel ? [] : [6, 4]);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.setLineDash([]);
      // Endpoint dots
      ctx.fillStyle = isSel ? '#ffffff' : '#ffeb3b';
      [x1, y1, x2, y2].reduce<[number, number][]>((acc, v, idx) => {
        if (idx % 2 === 0) acc.push([v, 0]);
        else acc[acc.length - 1][1] = v;
        return acc;
      }, []).forEach(([px, py]) => {
        ctx.beginPath(); ctx.arc(px, py, 5, 0, Math.PI * 2); ctx.fill();
      });
    });
  }

  private getObjectSpritePreview(typeRes: number): HTMLCanvasElement | null {
    // Sprite previews are pre-decoded by the worker during LOAD and stored in objectSpritePreviews.
    return this.objectSpritePreviews.get(typeRes) ?? null;
  }

  private renderSpritePixels(pixels: Uint8ClampedArray, width: number, height: number): HTMLCanvasElement | null {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    // Ensure the Uint8ClampedArray is backed by a plain ArrayBuffer for ImageData.
    const safePixels = new Uint8ClampedArray(pixels);
    const imageData = new ImageData(safePixels, width, height);
    ctx.putImageData(imageData, 0, 0);
    return canvas;
  }

  /** Return the sprite preview as a data URL for use in <img> tags. */
  getSpritePreviewDataUrl(typeRes: number): string | null {
    const canvas = this.objectSpritePreviews.get(typeRes) ?? null;
    if (!canvas) return null;
    try { return canvas.toDataURL(); } catch { return null; }
  }

  /** Deterministic fallback colour for an object type when no sprite preview is available. */
  getObjFallbackColor(typeRes: number): string {
    // FNV-1a style: rotate around the palette
    const paletteIdx = ((typeRes % OBJ_PALETTE.length) + OBJ_PALETTE.length) % OBJ_PALETTE.length;
    return OBJ_PALETTE[paletteIdx];
  }

  private applyVolumeToWasm(pct: number): void {
    const mod = (window as any)['Module'];
    if (mod && typeof mod._set_wasm_master_volume === 'function') {
      mod._set_wasm_master_volume(pct / 100.0);
    }
  }
}
