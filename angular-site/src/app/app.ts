import { Component, OnDestroy, OnInit, AfterViewInit, inject, signal, computed, effect } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import type {
  ParsedLevel,
  LevelProperties,
  ObjectPos,
  EditableSpriteAsset,
  MarkSeg,
  ObjectTypeDefinition,
  RoadInfoData,
  DecodedSpriteFrame,
  TrackWaypointRef,
} from './level-editor.service';
import { KonvaEditorService } from './konva-editor.service';

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
  print: (text: string) => void;
  printErr: (text: string) => void;
  setStatus: (status: string) => void;
  monitorRunDependencies: (left: number) => void;
  onRuntimeInitialized: () => void;
  preRun: (() => void)[];
  postRun: (() => void)[];
  _set_wasm_master_volume?: (vol: number) => void;
}

declare global {
  interface Window {
    /** Emscripten-compiled WASM module. Attached by the generated .js loader. */
    Module?: EmscriptenModuleInterface;
  }
}

export type AppTab = 'game' | 'editor';
export type EditorSection = 'properties' | 'objects' | 'sprites' | 'resources';

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
const MARK_ENDPOINT_HIT_RADIUS = 14;
/** Distance threshold (px) for clicking on a mark line segment to select it. */
const MARK_SEGMENT_HIT_THRESHOLD = 8;
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

// ── Resource editor types ─────────────────────────────────────────────────────

/** A single editable field in a binary resource struct. */
export interface ResField {
  name: string;
  offset: number;
  type: 'u8' | 'u16' | 's16' | 'u32' | 's32';
  value: number;
}

type ResFieldSchema = Omit<ResField, 'value'>;

/** Known struct schemas for Mac OS resource types. */
const RESOURCE_SCHEMAS: Record<string, ResFieldSchema[]> = {
  'ALRT': [
    { name: 'bounds.top',    offset: 0,  type: 's16' },
    { name: 'bounds.left',   offset: 2,  type: 's16' },
    { name: 'bounds.bottom', offset: 4,  type: 's16' },
    { name: 'bounds.right',  offset: 6,  type: 's16' },
    { name: 'itemsId',       offset: 8,  type: 's16' },
    { name: 'stages',        offset: 10, type: 'u16' },
  ],
  'DLOG': [
    { name: 'bounds.top',    offset: 0,  type: 's16' },
    { name: 'bounds.left',   offset: 2,  type: 's16' },
    { name: 'bounds.bottom', offset: 4,  type: 's16' },
    { name: 'bounds.right',  offset: 6,  type: 's16' },
    { name: 'procId',        offset: 8,  type: 'u16' },
    { name: 'visible',       offset: 10, type: 'u8'  },
    { name: 'goAway',        offset: 12, type: 'u8'  },
    { name: 'refCon',        offset: 14, type: 'u32' },
    { name: 'itemsId',       offset: 18, type: 's16' },
  ],
  'WIND': [
    { name: 'bounds.top',    offset: 0,  type: 's16' },
    { name: 'bounds.left',   offset: 2,  type: 's16' },
    { name: 'bounds.bottom', offset: 4,  type: 's16' },
    { name: 'bounds.right',  offset: 6,  type: 's16' },
    { name: 'procId',        offset: 8,  type: 'u16' },
    { name: 'visible',       offset: 10, type: 'u8'  },
    { name: 'goAway',        offset: 12, type: 'u8'  },
    { name: 'refCon',        offset: 14, type: 'u32' },
    { name: 'zoomState',     offset: 18, type: 'u16' },
  ],
  'CNTL': [
    { name: 'bounds.top',    offset: 0,  type: 's16' },
    { name: 'bounds.left',   offset: 2,  type: 's16' },
    { name: 'bounds.bottom', offset: 4,  type: 's16' },
    { name: 'bounds.right',  offset: 6,  type: 's16' },
    { name: 'value',         offset: 8,  type: 's16' },
    { name: 'visible',       offset: 10, type: 'u16' },
    { name: 'max',           offset: 12, type: 's16' },
    { name: 'min',           offset: 14, type: 's16' },
    { name: 'procId',        offset: 16, type: 'u16' },
    { name: 'refCon',        offset: 18, type: 'u32' },
  ],
  'RECT': [
    { name: 'top',    offset: 0, type: 's16' },
    { name: 'left',   offset: 2, type: 's16' },
    { name: 'bottom', offset: 4, type: 's16' },
    { name: 'right',  offset: 6, type: 's16' },
  ],
};

/** Known struct schemas for Pack entry types (by Pack resource ID). */
const PACK_ENTRY_SCHEMAS: Record<number, ResFieldSchema[]> = {
  // Pack 128: Object group reference (OGRP)
  128: [
    { name: 'typeRes',  offset: 0, type: 's16' },
    { name: 'numObjs',  offset: 2, type: 'u16' },
  ],
  // Pack 135: Road info record
  135: [
    { name: 'flags',         offset: 0,  type: 'u16' },
    { name: 'roadWidth',     offset: 2,  type: 'u16' },
    { name: 'field_4',       offset: 4,  type: 'u16' },
    { name: 'field_6',       offset: 6,  type: 'u16' },
    { name: 'field_8',       offset: 8,  type: 'u16' },
    { name: 'field_10',      offset: 10, type: 'u16' },
    { name: 'field_12',      offset: 12, type: 'u16' },
    { name: 'field_14',      offset: 14, type: 'u16' },
    { name: 'field_16',      offset: 16, type: 'u16' },
    { name: 'bgTex',         offset: 18, type: 'u16' },
    { name: 'fgTex',         offset: 20, type: 'u16' },
    { name: 'lBorder',       offset: 22, type: 'u16' },
    { name: 'rBorder',       offset: 24, type: 'u16' },
  ],
};

// Pack IDs 140-149 are level packs – generate their schema dynamically.
for (let pid = 140; pid <= 149; pid++) {
  PACK_ENTRY_SCHEMAS[pid] = [
    { name: 'roadInfo',    offset: 0,  type: 's16' },
    { name: 'time',        offset: 2,  type: 'u16' },
    // tObjectGroupReference[10] – each 4 bytes (typeRes s16 + count u16)
    ...Array.from({ length: 10 }, (_, i) => [
      { name: `objGroup[${i}].typeRes`, offset: 4 + i * 4,     type: 's16' as const },
      { name: `objGroup[${i}].count`,  offset: 4 + i * 4 + 2, type: 'u16' as const },
    ]).flat(),
    { name: 'xStartPos', offset: 44, type: 's16' },
    { name: 'levelEnd',  offset: 46, type: 'u16' },
  ];
}

/** Read a typed value from a DataView. */
function readResField(view: DataView, f: ResFieldSchema): number {
  const le = false; // big-endian (Mac OS)
  switch (f.type) {
    case 'u8':  return view.getUint8(f.offset);
    case 'u16': return view.getUint16(f.offset, le);
    case 's16': return view.getInt16(f.offset, le);
    case 'u32': return view.getUint32(f.offset, le);
    case 's32': return view.getInt32(f.offset, le);
  }
}

/** Write a typed value to a DataView. */
function writeResField(view: DataView, f: ResFieldSchema, value: number): void {
  const le = false; // big-endian (Mac OS)
  switch (f.type) {
    case 'u8':  view.setUint8(f.offset, value); break;
    case 'u16': view.setUint16(f.offset, value, le); break;
    case 's16': view.setInt16(f.offset, value, le); break;
    case 'u32': view.setUint32(f.offset, value, le); break;
    case 's32': view.setInt32(f.offset, value, le); break;
  }
}

/**
 * Build a ResField[] from bytes, using a known schema if available, or
 * auto-generating u16 fields at every 2-byte offset otherwise.
 */
/** Maximum number of auto-generated fields to display (avoids locking up for large blobs). */
const MAX_AUTO_FIELDS = 128;

function buildResFields(bytes: Uint8Array, schema: ResFieldSchema[] | null): ResField[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (schema) {
    return schema
      .filter(f => f.offset + fieldByteSize(f.type) <= bytes.byteLength)
      .map(f => ({ ...f, value: readResField(view, f) }));
  }
  // Auto-generate: u16 at every 2 bytes (capped to avoid locking up on large blobs)
  const fields: ResField[] = [];
  const maxOffset = Math.min(bytes.byteLength, MAX_AUTO_FIELDS * 2);
  for (let offset = 0; offset + 2 <= maxOffset; offset += 2) {
    fields.push({ name: `field_${offset}`, offset, type: 'u16', value: view.getUint16(offset, false) });
  }
  return fields;
}

function fieldByteSize(type: ResField['type']): number {
  if (type === 'u32' || type === 's32') return 4;
  if (type === 'u8') return 1;
  return 2; // u16, s16
}

/** Resource types that contain human-readable text (shown as textarea). */
const TEXT_RESOURCE_TYPES = new Set(['TEXT', 'STR ']);
/** Resource types that contain an icon (shown as a canvas). */
const ICON_RESOURCE_TYPES = new Set(['ICN#', 'ics#', 'icl8', 'ics8']);


@Component({
  selector: 'app-root',
  templateUrl: './app.html',
  standalone: false,
  styleUrl: './app.scss',
})
export class App implements OnInit, AfterViewInit, OnDestroy {
  readonly typePalette = OBJ_PALETTE.map((hex, index) => ({ hex, typeId: index }));
  readonly getSpritePreviewDataUrlBound = this.getSpritePreviewDataUrl.bind(this);
  readonly getObjFallbackColorBound = this.getObjFallbackColor.bind(this);

  /** Convert a level resource ID (140-149) to a human-readable level number (1-10). */
  levelDisplayNum(resourceId: number): number { return resourceId - 139; }

  private readonly konva = inject(KonvaEditorService);
  private readonly snackBar = inject(MatSnackBar);

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

  private _prevPanMouseX = 0;
  private _prevPanMouseY = 0;
  private _isPanning = false;
  /** True while Space is held (enables Space+drag panning). */
  readonly spaceDown = signal(false);
  /** True while actively panning (middle-mouse or space+drag). */
  readonly isPanning = signal(false);
  // ---- Track waypoint drag ----
  /** When non-null, the user is dragging a track waypoint. */
  dragTrackWaypoint = signal<TrackWaypointRef | null>(null);
  /** Hovered track waypoint (for cursor change and highlight). */
  hoverTrackWaypoint = signal<TrackWaypointRef | null>(null);
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
  /** Full decoded frames for the sprite editor – includes pixel data. */
  private packSpriteDecodedFrames = new Map<number, DecodedSpriteFrame>();
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
      if (!bucket) { bucket = []; map.set(entry.type, bucket); }
      bucket.push(entry);
    }
    return [...map.entries()].map(([type, entries]) => ({ type, entries }))
      .sort((a, b) => a.type.localeCompare(b.type));
  });

  /** Structured editable fields for the currently selected binary resource. */
  readonly selectedResFields = computed<ResField[]>(() => {
    const bytes = this.selectedResBytes();
    const type = this.selectedResType();
    if (!bytes || bytes.length === 0) return [];
    if (type && TEXT_RESOURCE_TYPES.has(type)) return [];
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
  /** Cached offscreen road bitmap – invalidated when pan/zoom/level/textures change. */
  private _roadBitmapCache: { key: string; bitmap: ImageBitmap } | null = null;

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

    // Redraw mark canvas when marks or selected mark changes.
    effect(() => {
      this.marks();
      this.selectedMarkIndex();
      if (typeof window !== 'undefined') {
        window.requestAnimationFrame(() => this.redrawMarkCanvas());
      }
    });
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
  }

  ngAfterViewInit(): void {
    this.setupEmscriptenModule();
    this.loadWasmScript();
  }

  /** True once the Konva stage has been initialized on the canvas DOM element. */
  private _konvaInitialized = false;

  /**
   * Initialise (or re-initialise) the Konva overlay.
   * Called after each redrawObjectCanvas() once the canvas is in the DOM.
   */
  private initKonvaIfNeeded(): void {
    if (typeof window === 'undefined') return;
    const canvas = document.getElementById('object-canvas') as HTMLCanvasElement | null;
    if (!canvas || this._konvaInitialized) return;
    const parent = canvas.parentElement;
    if (!parent) return;

    // Create a container div for Konva OVER the canvas.
    // IMPORTANT: size the container to the CSS display dimensions (not logical pixels)
    // so the Konva stage coordinate space matches what the canvas visually renders at.
    const rect = canvas.getBoundingClientRect();
    const cssW = Math.max(1, Math.round(rect.width));
    const cssH = Math.max(1, Math.round(rect.height));

    let konvaContainer = document.getElementById('konva-container');
    if (!konvaContainer) {
      konvaContainer = document.createElement('div');
      konvaContainer.id = 'konva-container';
      parent.style.position = 'relative';
      canvas.insertAdjacentElement('afterend', konvaContainer);

      // Forward wheel events from Konva container to the canvas for zoom/pan
      konvaContainer.addEventListener('wheel', (e) => {
        const fwd = new WheelEvent('wheel', e);
        canvas.dispatchEvent(fwd);
      }, { passive: false });
    }
    // Always update the container CSS to match the current canvas display size
    konvaContainer.style.cssText = `
      position:absolute; top:0; left:0;
      width:${cssW}px; height:${cssH}px;
      pointer-events:all;
    `;

    this.konva.init('konva-container', canvas.width, canvas.height, cssW, cssH);
    this._konvaInitialized = true;

    // Keep the Konva container + stage in sync if the canvas CSS display size changes
    const resizeObserver = new ResizeObserver(() => {
      const r = canvas.getBoundingClientRect();
      const w = Math.max(1, Math.round(r.width));
      const h = Math.max(1, Math.round(r.height));
      if (konvaContainer) {
        konvaContainer.style.width = `${w}px`;
        konvaContainer.style.height = `${h}px`;
      }
      this.konva.resize(w, h);
      this.scheduleCanvasRedraw();
    });
    resizeObserver.observe(canvas);

    // Wire up Konva drag callbacks
    this.konva.onObjectDragEnd = (e) => {
      const objs = [...this.objects()];
      if (e.index < objs.length) {
        objs[e.index] = { ...objs[e.index], x: e.worldX, y: e.worldY };
        this.objects.set(objs);
        if (this.selectedObjIndex() === e.index) {
          this.editObjX.set(e.worldX);
          this.editObjY.set(e.worldY);
        }
        this.applyObjEdit();
      }
    };

    this.konva.onObjectClick = (index) => {
      this.selectObject(index);
    };

    this.konva.onStageDblClick = (wx, wy) => {
      const objs = [...this.objects()];
      objs.push({ x: wx, y: wy, dir: 0, typeRes: 128 });
      this.objects.set(objs);
      this.selectObject(objs.length - 1);
    };

    this.konva.onStageRightClick = (wx, wy) => {
      if (!this.showTrackOverlay()) return;
      // Simulate the context menu logic
      this._handleTrackContextMenuAtWorld(wx, wy);
    };

    this.konva.onWaypointDragEnd = (e) => {
      if (e.track === 'up') {
        const arr = [...this.editTrackUp()];
        if (e.segIdx < arr.length) {
          arr[e.segIdx] = { ...arr[e.segIdx], x: e.worldX, y: e.worldY };
          this.editTrackUp.set(arr);
        }
      } else {
        const arr = [...this.editTrackDown()];
        if (e.segIdx < arr.length) {
          arr[e.segIdx] = { ...arr[e.segIdx], x: e.worldX, y: e.worldY };
          this.editTrackDown.set(arr);
        }
      }
    };

    this.konva.onWaypointRightClick = (track, segIdx, _wx, _wy) => {
      // Remove the clicked waypoint
      if (track === 'up') {
        const arr = [...this.editTrackUp()];
        arr.splice(segIdx, 1);
        this.editTrackUp.set(arr);
      } else {
        const arr = [...this.editTrackDown()];
        arr.splice(segIdx, 1);
        this.editTrackDown.set(arr);
      }
    };
  }

  /** Handle track context menu at given world coordinates (extracted for re-use). */
  private _handleTrackContextMenuAtWorld(wx: number, wy: number): void {
    const trackUp   = this.editTrackUp();
    const trackDown = this.editTrackDown();
    const trackHitR = Math.max(20, 14 / this.canvasZoom());

    // Check if clicking near an existing waypoint to remove it
    for (let i = 0; i < trackUp.length; i++) {
      if (dist2d(trackUp[i].x, trackUp[i].y, wx, wy) < trackHitR) {
        const arr = [...trackUp]; arr.splice(i, 1);
        this.editTrackUp.set(arr);
        return;
      }
    }
    for (let i = 0; i < trackDown.length; i++) {
      if (dist2d(trackDown[i].x, trackDown[i].y, wx, wy) < trackHitR) {
        const arr = [...trackDown]; arr.splice(i, 1);
        this.editTrackDown.set(arr);
        return;
      }
    }

    // Insert into nearest track, sorted by Y
    const level = this.selectedLevel();
    if (!level) return;

    const nearestUp   = trackUp.reduce((best, pt) => dist2d(pt.x, pt.y, wx, wy) < best ? dist2d(pt.x, pt.y, wx, wy) : best, Infinity);
    const nearestDown = trackDown.reduce((best, pt) => dist2d(pt.x, pt.y, wx, wy) < best ? dist2d(pt.x, pt.y, wx, wy) : best, Infinity);

    const newPt = { x: Math.round(wx), y: Math.round(wy), flags: 0, velo: 0 };
    if (nearestUp <= nearestDown || trackDown.length === 0) {
      const arr = [...trackUp, newPt].sort((a, b) => a.y - b.y);
      this.editTrackUp.set(arr);
    } else {
      const arr = [...trackDown, newPt].sort((a, b) => a.y - b.y);
      this.editTrackDown.set(arr);
    }
  }

  ngOnDestroy(): void {
    if (this.wasmScript?.parentNode) {
      (this.wasmScript.parentNode as HTMLElement).removeChild(this.wasmScript);
    }
    this.packWorker?.terminate();
    this.packWorker = null;
    this.konva.destroy();
    this._konvaInitialized = false;
  }

  // ---- Tab / section navigation ----

  setTab(tab: AppTab): void {
    this.activeTab.set(tab);
  }

  setSection(section: EditorSection): void {
    this.editorSection.set(section);
  }

  /** Maps EditorSection → mat-tab index for [(selectedIndex)] binding. */
  private readonly SECTION_ORDER: EditorSection[] = ['properties', 'objects', 'sprites', 'resources'];
  get editorSectionIndex(): number {
    return this.SECTION_ORDER.indexOf(this.editorSection());
  }
  set editorSectionIndex(idx: number) {
    const section = this.SECTION_ORDER[idx];
    if (section) this.setSection(section);
  }

  /** Called when the volume slider value changes. Updates the signal and applies to WASM. */
  onVolumeSliderChange(pct: number): void {
    this.masterVolume.set(pct);
    this.applyVolumeToWasm(pct);
  }

  /** Alias so the template can call applyVolume() from the mat-slider. */
  applyVolume(): void {
    this.applyVolumeToWasm(this.masterVolume());
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
    const input = event.target as EventTarget & { files?: FileList };
    const file = input?.files?.[0];
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
      this.snackBar.open('✓ Downloaded resources.dat', 'OK', { duration: 3000, panelClass: 'snack-success' });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to serialize resources';
      this.editorError.set(msg);
      this.snackBar.open(`✗ ${msg}`, 'Dismiss', { duration: 5000, panelClass: 'snack-error' });
    } finally {
      this.workerBusy.set(false);
    }
  }

  // ---- Level selection ----

  // ---- Resource browser methods ----

  /** Fetch the complete resource list from the worker and populate allResourceEntries. */
  private async loadResourceList(): Promise<void> {
    try {
      type ListResult = { entries: { type: string; id: number; size: number }[] };
      const result = await this.dispatchWorker<ListResult>('LIST_RESOURCES');
      this.allResourceEntries.set(result.entries);
    } catch (err) {
      console.warn('[App] loadResourceList failed:', err);
    }
  }

  /** Select a resource in the browser and lazily load its bytes. */
  async selectResource(type: string, id: number): Promise<void> {
    this.selectedResType.set(type);
    this.selectedResId.set(id);
    this.selectedResBytes.set(null);
    this.selectedResStrings.set(null);
    this.selectedResText.set(null);
    this.selectedPackEntries.set(null);
    this.selectedPackEntryId.set(null);
    this.selectedPackEntryBytes.set(null);
    this.resBrowserStatus.set('');

    try {
      this.resBrowserBusy.set(true);
      if (type === 'Pack') {
        // For packs, load the entry list instead of raw bytes
        type ListPackResult = { entries: { id: number; size: number }[] | null };
        const r = await this.dispatchWorker<ListPackResult>('LIST_PACK_ENTRIES', { packId: id });
        this.selectedPackEntries.set(r.entries);
      } else if (type === 'STR#') {
        // For string lists, load decoded strings
        type StrResult = { strings: string[] };
        const r = await this.dispatchWorker<StrResult>('GET_STR_LIST', { id });
        this.selectedResStrings.set(r.strings);
      } else if (TEXT_RESOURCE_TYPES.has(type)) {
        // For text resources (STR, TEXT), load as decoded string
        const r = await this.dispatchWorker<{ bytes: ArrayBuffer | null }>('GET_RESOURCE_RAW', { type, id });
        if (r.bytes) {
          const bytes = new Uint8Array(r.bytes);
          this.selectedResBytes.set(bytes);
          // STR is a Pascal string (1-byte length prefix); TEXT is raw bytes
          if (type === 'STR ') {
            const len = bytes[0] ?? 0;
            const chars: string[] = [];
            for (let i = 1; i <= len && i < bytes.length; i++) chars.push(String.fromCharCode(bytes[i]));
            this.selectedResText.set(chars.join(''));
          } else {
            const chars: string[] = [];
            for (let i = 0; i < bytes.length; i++) chars.push(String.fromCharCode(bytes[i]));
            this.selectedResText.set(chars.join(''));
          }
        }
      } else {
        // Load raw bytes for structured field editor (and icon preview)
        const r = await this.dispatchWorker<{ bytes: ArrayBuffer | null }>('GET_RESOURCE_RAW', { type, id });
        if (r.bytes) this.selectedResBytes.set(new Uint8Array(r.bytes));
      }
    } catch (err) {
      this.resBrowserStatus.set(`Error loading resource: ${err}`);
    } finally {
      this.resBrowserBusy.set(false);
    }
  }

  /** Select a pack entry and load its raw bytes. */
  async selectPackEntry(packId: number, entryId: number): Promise<void> {
    this.selectedPackEntryId.set(entryId);
    this.selectedPackEntryBytes.set(null);
    try {
      this.resBrowserBusy.set(true);
      const r = await this.dispatchWorker<{ bytes: ArrayBuffer | null }>(
        'GET_PACK_ENTRY_RAW', { packId, entryId },
      );
      if (r.bytes) this.selectedPackEntryBytes.set(new Uint8Array(r.bytes));
    } catch (err) {
      this.resBrowserStatus.set(`Error loading pack entry: ${err}`);
    } finally {
      this.resBrowserBusy.set(false);
    }
  }

  /** Download raw bytes for the currently selected resource. */
  downloadSelectedResource(): void {
    const bytes = this.selectedResBytes();
    const type = this.selectedResType();
    const id = this.selectedResId();
    if (!bytes || !type || id === null) return;
    this.triggerBytesDownload(bytes, `${type}_${id}.bin`);
  }

  /** Download raw bytes for the currently selected pack entry. */
  downloadSelectedPackEntry(): void {
    const bytes = this.selectedPackEntryBytes();
    const id = this.selectedResId();
    const entryId = this.selectedPackEntryId();
    if (!bytes || id === null || entryId === null) return;
    this.triggerBytesDownload(bytes, `Pack_${id}_entry_${entryId}.bin`);
  }

  /** Trigger a file upload dialog to replace a resource, then save it. */
  triggerUploadResource(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.bin,*/*';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const type = this.selectedResType();
      const id = this.selectedResId();
      if (!type || id === null) return;
      try {
        this.resBrowserBusy.set(true);
        const bytes = new Uint8Array(await file.arrayBuffer());
        const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
        await this.dispatchWorker('PUT_RESOURCE_RAW', { type, id, bytes: buf }, [buf]);
        await this.loadResourceList();
        // Reload raw bytes
        const r = await this.dispatchWorker<{ bytes: ArrayBuffer | null }>('GET_RESOURCE_RAW', { type, id });
        if (r.bytes) this.selectedResBytes.set(new Uint8Array(r.bytes));
        this.snackBar.open(`✓ Replaced ${type}#${id} (${bytes.length} bytes)`, 'OK', { duration: 3000 });
      } catch (err) {
        this.snackBar.open(`✗ Upload failed: ${err}`, 'Dismiss', { duration: 5000 });
      } finally {
        this.resBrowserBusy.set(false);
      }
    };
    input.click();
  }

  /** Trigger a file upload dialog to replace a pack entry's raw bytes. */
  triggerUploadPackEntry(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.bin,*/*';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const packId = this.selectedResId();
      const entryId = this.selectedPackEntryId();
      if (packId === null || entryId === null) return;
      try {
        this.resBrowserBusy.set(true);
        const bytes = new Uint8Array(await file.arrayBuffer());
        const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
        await this.dispatchWorker('PUT_PACK_ENTRY_RAW', { packId, entryId, bytes: buf }, [buf]);
        // Refresh entry list + bytes
        type ListPackResult = { entries: { id: number; size: number }[] | null };
        const listR = await this.dispatchWorker<ListPackResult>('LIST_PACK_ENTRIES', { packId });
        this.selectedPackEntries.set(listR.entries);
        const r = await this.dispatchWorker<{ bytes: ArrayBuffer | null }>(
          'GET_PACK_ENTRY_RAW', { packId, entryId },
        );
        if (r.bytes) this.selectedPackEntryBytes.set(new Uint8Array(r.bytes));
        await this.loadResourceList();
        this.snackBar.open(`✓ Replaced Pack#${packId} entry #${entryId} (${bytes.length} bytes)`, 'OK', { duration: 3000 });
      } catch (err) {
        this.snackBar.open(`✗ Upload failed: ${err}`, 'Dismiss', { duration: 5000 });
      } finally {
        this.resBrowserBusy.set(false);
      }
    };
    input.click();
  }

  /** Save edited STR# strings back to the worker. */
  async saveStrList(): Promise<void> {
    const id = this.selectedResId();
    const strings = this.selectedResStrings();
    if (id === null || strings === null) return;
    try {
      this.resBrowserBusy.set(true);
      await this.dispatchWorker('PUT_STR_LIST', { id, strings });
      await this.loadResourceList();
      this.snackBar.open(`✓ Saved STR#${id}`, 'OK', { duration: 3000 });
    } catch (err) {
      this.snackBar.open(`✗ Save failed: ${err}`, 'Dismiss', { duration: 5000 });
    } finally {
      this.resBrowserBusy.set(false);
    }
  }

  /** Update a single string in the STR# editor. */
  updateResString(index: number, value: string): void {
    const strings = this.selectedResStrings();
    if (!strings) return;
    const updated = strings.slice();
    updated[index] = value;
    this.selectedResStrings.set(updated);
  }

  /** Add a new empty string to the STR# list. */
  addResString(): void {
    const strings = this.selectedResStrings();
    if (!strings) return;
    this.selectedResStrings.set([...strings, '']);
  }

  /** Remove a string from the STR# list. */
  removeResString(index: number): void {
    const strings = this.selectedResStrings();
    if (!strings) return;
    this.selectedResStrings.set(strings.filter((_, i) => i !== index));
  }

  /** Save edited text (STR / TEXT) resource back to the worker. */
  async saveResText(): Promise<void> {
    const type = this.selectedResType();
    const id = this.selectedResId();
    const text = this.selectedResText();
    if (!type || id === null || text === null) return;
    try {
      this.resBrowserBusy.set(true);
      let bytes: Uint8Array;
      if (type === 'STR ') {
        // Pascal string: 1-byte length prefix
        const encoded = new Uint8Array(Math.min(255, text.length) + 1);
        encoded[0] = Math.min(255, text.length);
        for (let i = 0; i < encoded[0]; i++) encoded[i + 1] = text.charCodeAt(i) & 0xFF;
        bytes = encoded;
      } else {
        // TEXT: raw bytes
        bytes = new Uint8Array(text.length);
        for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i) & 0xFF;
      }
      const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      await this.dispatchWorker('PUT_RESOURCE_RAW', { type, id, bytes: buf }, [buf]);
      this.selectedResBytes.set(bytes);
      await this.loadResourceList();
      this.snackBar.open(`✓ Saved ${type}#${id}`, 'OK', { duration: 3000 });
    } catch (err) {
      this.snackBar.open(`✗ Save failed: ${err}`, 'Dismiss', { duration: 5000 });
    } finally {
      this.resBrowserBusy.set(false);
    }
  }

  /** Update a binary field value in the current resource. */
  onResFieldInput(fieldIdx: number, event: Event): void {
    const target = event.target as EventTarget & { value?: string };
    const val = Number.parseInt(target?.value ?? '', 10);
    if (Number.isNaN(val)) return;
    const fields = this.selectedResFields();
    const bytes = this.selectedResBytes();
    if (!bytes || fieldIdx >= fields.length) return;
    const field = fields[fieldIdx];
    // Write back to a mutable copy of the bytes
    const copy = new Uint8Array(bytes);
    const view = new DataView(copy.buffer);
    const schema: ResFieldSchema = { name: field.name, offset: field.offset, type: field.type };
    writeResField(view, schema, val);
    this.selectedResBytes.set(copy);
  }

  /** Save binary field edits for the currently selected resource. */
  async saveResFields(): Promise<void> {
    const type = this.selectedResType();
    const id = this.selectedResId();
    const bytes = this.selectedResBytes();
    if (!type || id === null || !bytes) return;
    try {
      this.resBrowserBusy.set(true);
      const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      await this.dispatchWorker('PUT_RESOURCE_RAW', { type, id, bytes: buf }, [buf]);
      await this.loadResourceList();
      this.snackBar.open(`✓ Saved ${type}#${id}`, 'OK', { duration: 3000 });
    } catch (err) {
      this.snackBar.open(`✗ Save failed: ${err}`, 'Dismiss', { duration: 5000 });
    } finally {
      this.resBrowserBusy.set(false);
    }
  }

  /** Update a binary field value in the selected pack entry. */
  onPackEntryFieldInput(fieldIdx: number, event: Event): void {
    const target = event.target as EventTarget & { value?: string };
    const val = Number.parseInt(target?.value ?? '', 10);
    if (Number.isNaN(val)) return;
    const fields = this.selectedPackEntryFields();
    const bytes = this.selectedPackEntryBytes();
    if (!bytes || fieldIdx >= fields.length) return;
    const field = fields[fieldIdx];
    const copy = new Uint8Array(bytes);
    const view = new DataView(copy.buffer);
    const schema: ResFieldSchema = { name: field.name, offset: field.offset, type: field.type };
    writeResField(view, schema, val);
    this.selectedPackEntryBytes.set(copy);
  }

  /** Save binary field edits for the selected pack entry. */
  async savePackEntryFields(): Promise<void> {
    const packId = this.selectedResId();
    const entryId = this.selectedPackEntryId();
    const bytes = this.selectedPackEntryBytes();
    if (packId === null || entryId === null || !bytes) return;
    try {
      this.resBrowserBusy.set(true);
      const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      await this.dispatchWorker('PUT_PACK_ENTRY_RAW', { packId, entryId, bytes: buf }, [buf]);
      // Refresh entry list size
      type ListPackResult = { entries: { id: number; size: number }[] | null };
      const listR = await this.dispatchWorker<ListPackResult>('LIST_PACK_ENTRIES', { packId });
      this.selectedPackEntries.set(listR.entries);
      this.snackBar.open(`✓ Saved Pack#${packId} entry #${entryId}`, 'OK', { duration: 3000 });
    } catch (err) {
      this.snackBar.open(`✗ Save failed: ${err}`, 'Dismiss', { duration: 5000 });
    } finally {
      this.resBrowserBusy.set(false);
    }
  }

  /** Render an ICN# resource (32×32 1-bit) as an RGBA canvas for preview. */
  renderIconResource(bytes: Uint8Array | null): HTMLCanvasElement | null {
    if (typeof document === 'undefined' || !bytes || bytes.length < 128) return null;
    const SIZE = 32;
    const canvas = document.createElement('canvas');
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const imgData = ctx.createImageData(SIZE, SIZE);
    for (let row = 0; row < SIZE; row++) {
      for (let col = 0; col < SIZE; col++) {
        const byteIdx = row * 4 + Math.floor(col / 8);
        const bit = (bytes[byteIdx] >> (7 - (col % 8))) & 1;
        const pixIdx = (row * SIZE + col) * 4;
        imgData.data[pixIdx]     = bit ? 0 : 255;
        imgData.data[pixIdx + 1] = bit ? 0 : 255;
        imgData.data[pixIdx + 2] = bit ? 0 : 255;
        imgData.data[pixIdx + 3] = 255;
      }
    }
    ctx.putImageData(imgData, 0, 0);
    return canvas;
  }

  /** Return a data URL for the icon resource (for display in <img>). */
  getIconResourceDataUrl(bytes: Uint8Array | null): string | null {
    const canvas = this.renderIconResource(bytes);
    if (!canvas) return null;
    try { return canvas.toDataURL(); } catch { return null; }
  }

  /** Trigger a browser download of the given bytes. */
  private triggerBytesDownload(bytes: Uint8Array, filename: string): void {
    // Copy into a plain ArrayBuffer to satisfy strict BlobPart type check.
    const plain = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(plain).set(bytes);
    const blob = new Blob([plain], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  selectLevel(id: number): void {
    this.selectedLevelId.set(id);
    this._roadOffscreenKey = ''; // invalidate road bitmap cache
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
    const target = event.target as EventTarget & { value?: string };
    const val = Number.parseInt(target?.value ?? '', 10);
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
      this.snackBar.open(`✓ Level ${id - 139} properties saved`, 'OK', { duration: 3000, panelClass: 'snack-success' });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Save failed';
      this.editorError.set(msg);
      this.snackBar.open(`✗ ${msg}`, 'Dismiss', { duration: 5000, panelClass: 'snack-error' });
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
    const target = event.target as EventTarget & { value?: string };
    const val = parseFloat(target?.value ?? '');
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

  /** Return a short human-readable physics-dimension string for a type resource ID (e.g. "1.5×3.0 m"). */
  getObjTypeDimensionLabel(typeRes: number): string {
    const def = this.objectTypeDefinitions.get(typeRes);
    if (!def) return '';
    return `${def.width.toFixed(1)}×${def.length.toFixed(1)} m`;
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
      const msg = `Saved ${this.objects().length} objects for level ${id - 139}.`;
      this.resourcesStatus.set(msg);
      this.snackBar.open(`✓ ${msg}`, 'OK', { duration: 3000, panelClass: 'snack-success' });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Save failed';
      this.editorError.set(msg);
      this.snackBar.open(`✗ ${msg}`, 'Dismiss', { duration: 5000, panelClass: 'snack-error' });
    } finally {
      this.workerBusy.set(false);
    }
  }

  async saveTrack(): Promise<void> {
    const id = this.selectedLevelId();
    if (id === null) return;
    try {
      this.workerBusy.set(true);
      const result = await this.dispatchWorker<{ levels: ParsedLevel[] }>('APPLY_TRACK', {
        resourceId: id,
        trackUp:   this.editTrackUp(),
        trackDown: this.editTrackDown(),
      });
      this.applyLevelsResult(result.levels);
      const msg = `Saved track waypoints for level ${id - 139}.`;
      this.resourcesStatus.set(msg);
      this.snackBar.open(`✓ ${msg}`, 'OK', { duration: 3000, panelClass: 'snack-success' });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Track save failed';
      this.editorError.set(msg);
      this.snackBar.open(`✗ ${msg}`, 'Dismiss', { duration: 5000, panelClass: 'snack-error' });
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

  /**
   * Returns the CSS→canvas pixel scale ratio for the object-canvas element.
   *
   * When the canvas is scaled via CSS (e.g. `width: 100%`) the element may render
   * at a different CSS pixel size than its logical pixel dimensions (`canvas.width`).
   * Mouse events report coordinates in CSS pixels (`event.offsetX/Y`), so before
   * passing those coordinates to the canvas coordinate transform we must multiply by
   * this ratio to convert them to the canvas's own logical pixel space.
   *
   * Example: a 900×700 canvas rendered at 700px CSS width → scale = 900/700 ≈ 1.286.
   * Without this correction, click/drag positions would be significantly offset from
   * the objects' actual painted positions.
   */
  private getCanvasScale(): number {
    const canvas = document.getElementById('object-canvas') as HTMLCanvasElement | null;
    if (!canvas) return 1;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0) return 1;
    return canvas.width / rect.width;
  }

  canvasToWorld(cx: number, cy: number): [number, number] {
    const canvas = document.getElementById('object-canvas') as HTMLCanvasElement | null;
    const W = canvas?.width ?? 600;
    const H = canvas?.height ?? 500;
    // cx/cy are CSS pixels from offsetX/Y; scale to logical canvas pixels
    const scale = this.getCanvasScale();
    const lx = cx * scale;
    const ly = cy * scale;
    const wx = (lx - W / 2) / this.canvasZoom() + this.canvasPanX();
    const wy = -(ly - H / 2) / this.canvasZoom() + this.canvasPanY(); // flip Y
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
    if (!this.isDragging()) {
      // Update hover state for track waypoints (for cursor feedback)
      if (this.showTrackOverlay()) {
        const [wx, wy] = this.canvasToWorld(event.offsetX, event.offsetY);
        const trackHitR = Math.max(12, 10 / this.canvasZoom());
        let found: { track: 'up' | 'down'; segIdx: number } | null = null;
        for (let i = 0; i < this.editTrackUp().length && !found; i++) {
          const s = this.editTrackUp()[i];
          if (dist2d(s.x, s.y, wx, wy) < trackHitR) found = { track: 'up', segIdx: i };
        }
        for (let i = 0; i < this.editTrackDown().length && !found; i++) {
          const s = this.editTrackDown()[i];
          if (dist2d(s.x, s.y, wx, wy) < trackHitR) found = { track: 'down', segIdx: i };
        }
        const prev = this.hoverTrackWaypoint();
        if (found?.track !== prev?.track || found?.segIdx !== prev?.segIdx) {
          this.hoverTrackWaypoint.set(found);
        }
      }
      return;
    }
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

  onCanvasMouseUp(_event: MouseEvent): void {
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

  /**
   * Right-click on the canvas:
   *  - When track overlay visible, right-click near an existing waypoint removes it.
   *  - Right-click away from waypoints inserts a new waypoint into the nearest track
   *    at the correct position (sorted by Y-coordinate so the path remains ordered).
   */
  onCanvasContextMenu(event: MouseEvent): void {
    if (!this.showTrackOverlay()) return;
    const [wx, wy] = this.canvasToWorld(event.offsetX, event.offsetY);
    const trackUp   = this.editTrackUp();
    const trackDown = this.editTrackDown();
    const trackHitR = Math.max(20, 14 / this.canvasZoom());

    // 1. Check removal – right-click on existing waypoint
    for (let i = 0; i < trackUp.length; i++) {
      if (dist2d(trackUp[i].x, trackUp[i].y, wx, wy) < trackHitR) {
        const arr = trackUp.filter((_, j) => j !== i);
        this.editTrackUp.set(arr);
        this._roadOffscreenKey = '';
        return;
      }
    }
    for (let i = 0; i < trackDown.length; i++) {
      if (dist2d(trackDown[i].x, trackDown[i].y, wx, wy) < trackHitR) {
        const arr = trackDown.filter((_, j) => j !== i);
        this.editTrackDown.set(arr);
        this._roadOffscreenKey = '';
        return;
      }
    }

    // 2. Insert new waypoint – choose track by X offset (negative=up, positive=down convention)
    const level = this.selectedLevel();
    if (!level) return;
    const insertWp = { x: Math.round(wx), y: Math.round(wy), flags: 0, velo: 0 };
    // Insert into both tracks, sorted ascending by Y
    const insertSorted = (arr: typeof trackUp, wp: typeof insertWp) => {
      const idx = arr.findIndex((s) => s.y >= wp.y);
      const copy = arr.slice();
      if (idx === -1) copy.push(wp); else copy.splice(idx, 0, wp);
      return copy;
    };
    // Determine which track to insert into based on minimum distance to any existing waypoint
    let distToUp = Infinity;
    for (const s of trackUp) {
      const d = dist2d(s.x, s.y, wx, wy);
      if (d < distToUp) distToUp = d;
    }
    let distToDown = Infinity;
    for (const s of trackDown) {
      const d = dist2d(s.x, s.y, wx, wy);
      if (d < distToDown) distToDown = d;
    }
    if (distToUp <= distToDown) {
      this.editTrackUp.set(insertSorted(trackUp, insertWp));
    } else {
      this.editTrackDown.set(insertSorted(trackDown, insertWp));
    }
    this._roadOffscreenKey = '';
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

    // Draw grid (subtle, over the background) — all lines in a single path for performance
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
      ctx.beginPath();
      for (let gx = firstX; gx <= endWorldX; gx += gridStep) {
        const [cx] = this.worldToCanvas(gx, 0);
        ctx.moveTo(cx, 0);
        ctx.lineTo(cx, H);
      }
      for (let gy = firstY; gy <= endWorldY; gy += gridStep) {
        const [, cy] = this.worldToCanvas(0, gy);
        ctx.moveTo(0, cy);
        ctx.lineTo(W, cy);
      }
      ctx.stroke();
    }

    if (level) {
      this.drawObjectRoadPreviewCached(ctx, level, theme, W, H, zoom, panX, panY);
    }

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
    // When Konva is initialized it renders the same sprite images on top of the main canvas,
    // so we skip the ctx.drawImage() / arc() fills here to avoid redundant GPU work.
    // We still draw direction arrows, bounding-box outlines, labels, and selection rings
    // since those are NOT rendered by the Konva overlay.
    const konvaRendersSprites = this._konvaInitialized;
    for (let i = 0; i < objs.length; i++) {
      const obj = objs[i];
      const typeIdx = ((obj.typeRes % OBJ_PALETTE.length) + OBJ_PALETTE.length) % OBJ_PALETTE.length;
      const isFilteredOut = !visibleTypes.has(typeIdx);
      if (isFilteredOut && i !== selIdx) continue;
      const [cx, cy] = this.worldToCanvas(obj.x, obj.y);
      if (cx < -50 || cx > W + 50 || cy < -50 || cy > H + 50) continue;

      ctx.globalAlpha = isFilteredOut ? 0.3 : 1.0;
      const color = OBJ_PALETTE[typeIdx];
      const preview = this.getObjectSpritePreview(obj.typeRes);

      // Use native sprite pixel dimensions (xSize × ySize from tSpriteHeader) scaled by
      // canvasZoom (canvas pixels per world unit).  The game's DrawSprite() renders:
      //   screen_width = xSize / roadZoom  (where roadZoom = world_units / screen_pixel)
      // which is equivalent to  xSize * (1/roadZoom) = xSize * canvasZoom.
      // objectType.width/length are PHYSICS metres only – never use them for rendering.
      const drawWidth  = preview ? Math.max(MIN_HIT_RADIUS * 2, preview.width  * zoom)
                                 : baseRadius * 2.5;
      const drawHeight = preview ? Math.max(MIN_HIT_RADIUS * 2, preview.height * zoom)
                                 : baseRadius * 2.5;

      const isPlayerCar = obj.typeRes === PLAYER_CAR_TYPE_RES;
      const isSel = i === selIdx;

      if (!konvaRendersSprites) {
        // Fallback: render sprites / circles in the main canvas before Konva is ready.
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

    // ── Konva overlay update ──────────────────────────────────────────────────
    // Initialise Konva on first render; thereafter update transforms + nodes.
    this.initKonvaIfNeeded();
    this.konva.setTransform(zoom, panX, panY);

    // Update Konva objects layer
    const getImgForType = (typeRes: number): CanvasImageSource | null => {
      return this.getObjectSpritePreview(typeRes);
    };
    this.konva.setObjects(objs, selIdx, visibleTypes, OBJ_PALETTE, getImgForType, zoom, panX, panY);

    // Update Konva track layer
    if (level && this.showTrackOverlay()) {
      this.konva.setTrackWaypoints(
        this.editTrackUp() as {x:number,y:number}[],
        this.editTrackDown() as {x:number,y:number}[],
        zoom, panX, panY,
      );
    } else {
      this.konva.clearTrackWaypoints();
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
    const target = event.target as EventTarget & { value?: string };
    const val = Number.parseInt(target?.value ?? '', 10);
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
      const msg = `Saved ${this.marks().length} mark segments for level ${id - 139}.`;
      this.resourcesStatus.set(msg);
      this.snackBar.open(`✓ ${msg}`, 'OK', { duration: 3000, panelClass: 'snack-success' });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Save failed';
      this.editorError.set(msg);
      this.snackBar.open(`✗ ${msg}`, 'Dismiss', { duration: 5000, panelClass: 'snack-error' });
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
    const canvas = event.target;
    if (!(canvas instanceof HTMLCanvasElement)) return;
    const ms = this.marks();
    if (ms.length === 0) return;

    // Scale CSS offset pixels to logical canvas pixels
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width > 0 ? canvas.width / rect.width : 1;
    const scaleY = rect.height > 0 ? canvas.height / rect.height : 1;
    const ox = event.offsetX * scaleX;
    const oy = event.offsetY * scaleY;

    const { minX, minY, rangeX, rangeY } = this.markBounds(ms);

    const hitR = MARK_ENDPOINT_HIT_RADIUS;
    for (let i = 0; i < ms.length; i++) {
      const m = ms[i];
      const [ax, ay] = this.markWorldToCanvas(m.x1, m.y1, canvas, minX, minY, rangeX, rangeY);
      const [bx, by] = this.markWorldToCanvas(m.x2, m.y2, canvas, minX, minY, rangeX, rangeY);
      if (dist2d(ox, oy, ax, ay) < hitR) {
        this.selectedMarkIndex.set(i);
        this.dragMarkEndpoint.set({ markIdx: i, endpoint: 'p1' });
        return;
      }
      if (dist2d(ox, oy, bx, by) < hitR) {
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
      const dist = this.pointToSegmentDist(ox, oy, ax, ay, bx, by);
      if (dist < MARK_SEGMENT_HIT_THRESHOLD) {
        this.selectedMarkIndex.set(i);
        return;
      }
    }
  }

  onMarkCanvasMouseMove(event: MouseEvent): void {
    const drag = this.dragMarkEndpoint();
    if (!drag) return;
    const canvas = event.target;
    if (!(canvas instanceof HTMLCanvasElement)) return;
    const ms = this.marks();
    const { minX, minY, rangeX: rawRangeX, rangeY: rawRangeY } = this.markBounds(ms);
    const rangeX = Math.max(rawRangeX, 100);
    const rangeY = Math.max(rawRangeY, 100);
    const pad = 24;
    const W = canvas.width;
    const H = canvas.height;

    // Scale CSS offset pixels to logical canvas pixels
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width > 0 ? canvas.width / rect.width : 1;
    const scaleY = rect.height > 0 ? canvas.height / rect.height : 1;
    const ox = event.offsetX * scaleX;
    const oy = event.offsetY * scaleY;

    // Invert the canvas-to-world mapping
    const wx = Math.round(minX + ((ox - pad) / (W - 2 * pad)) * rangeX);
    const wy = Math.round(minY + ((H - pad - oy) / (H - 2 * pad)) * rangeY);
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
      const statusMsg = `Loaded ${result.levels.length} level(s) and ${result.sprites.length} sprite(s) from ${sourceName}.`;
      this.resourcesStatus.set(statusMsg);
      this.snackBar.open(`✓ ${statusMsg}`, 'OK', { duration: 4000, panelClass: 'snack-success' });

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
      // Populate resource browser entry list.
      void this.loadResourceList();
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
      this.packSpriteDecodedFrames.clear();
      const frameInfos: { id: number; bitDepth: 8 | 16; width: number; height: number }[] = [];
      for (const { id, bitDepth, width, height, pixels } of result.frames) {
        const clamped = new Uint8ClampedArray(pixels);
        const canvas = this.renderSpritePixels(clamped, width, height);
        if (canvas) this.packSpriteCanvases.set(id, canvas);
        this.packSpriteDecodedFrames.set(id, { frameId: id, width, height, pixels: clamped, bitDepth });
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

  /** Open the sprite pixel editor for the given frame ID. */
  openSpriteEditor(frameId: number): void {
    const frame = this.packSpriteDecodedFrames.get(frameId) ?? null;
    if (!frame) return;
    this.spriteEditorFrame.set({ ...frame, pixels: frame.pixels.slice() as Uint8ClampedArray });
    this.spriteEditorOpen.set(true);
  }

  /** Handle save event from sprite editor – write pixels back to the pack. */
  async onSpriteEditorSaved(event: { frameId: number; pixels: Uint8ClampedArray }): Promise<void> {
    this.spriteEditorOpen.set(false);
    try {
      this.workerBusy.set(true);
      const result = await this.dispatchWorker<{ levels: ParsedLevel[] }>(
        'APPLY_SPRITE_PACK_PIXELS',
        { frameId: event.frameId, pixels: event.pixels },
      );
      this.applyLevelsResult(result.levels);
      // Refresh sprite canvases to reflect edited pixels
      this.decodePackSpritesInBackground();
      this.resourcesStatus.set(`Sprite frame #${event.frameId} saved.`);
    } catch (err) {
      this.editorError.set(err instanceof Error ? err.message : 'Sprite save failed');
    } finally {
      this.workerBusy.set(false);
    }
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
    const canvasEl = document.getElementById('canvas');
    if (!(canvasEl instanceof HTMLCanvasElement)) return;
    const canvas = canvasEl;
    const origOpen = XMLHttpRequest.prototype.open;
    const self = this;
    // Monkey-patch XHR to track .data file download progress for the loading bar.
    // The XMLHttpRequest.open signature is (method, url, async?, user?, password?).
    XMLHttpRequest.prototype.open = function (
      this: XMLHttpRequest,
      method: string,
      url: string,
      asyncFlag: boolean = true,
      user?: string,
      password?: string,
    ): void {
      if (url && url.indexOf('.data') !== -1) {
        this.addEventListener('progress', (e: ProgressEvent) => {
          if (e.lengthComputable) self.progressPct.set(Math.round((e.loaded / e.total) * 100));
        });
      }
      origOpen.call(this, method, url, asyncFlag, user, password);
    } as typeof XMLHttpRequest.prototype.open;

    window.Module = {
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

    /** Offscreen canvas used to cache road rendering between frames. */
  private _roadOffscreen: HTMLCanvasElement | null = null;
  private _roadOffscreenKey = '';
  /** panY (world units) at which the offscreen was last rendered – used for fast-blit panning. */
  private _roadOffscreenPanY = 0;
  /** Canvas-pixel overhang above and below the viewport in the oversized offscreen canvas. */
  private static readonly ROAD_OVERHANG_PX = 700;

  /**
   * Draw road via an oversized offscreen bitmap cache.
   *
   * The offscreen canvas is `W × (H + 2*OVERHANG)` tall.  Its vertical centre corresponds to
   * `_roadOffscreenPanY` in world space.  When the user pans vertically the cached bitmap is
   * simply blitted with a Y offset, avoiding an expensive re-render every frame.
   *
   * The cache is re-rendered only when:
   *  • zoom, panX, level ID, or texture version changes, OR
   *  • the visible area moves outside the pre-rendered overhang.
   *
   * Object drags and selection changes do NOT invalidate the cache.
   */
  private drawObjectRoadPreviewCached(
    ctx: CanvasRenderingContext2D,
    level: ParsedLevel,
    theme: RoadTheme,
    W: number,
    H: number,
    zoom: number,
    panX: number,
    panY: number,
  ): void {
    const OVERHANG = App.ROAD_OVERHANG_PX;
    const offH = H + 2 * OVERHANG;

    // Key excludes panY so vertical panning doesn't cause re-renders.
    // Instead we re-render only when panY moves outside the pre-rendered overhang.
    const staticKey = `${level.resourceId}|${W}|${H}|${zoom.toFixed(3)}|${panX.toFixed(0)}|${this.roadTexturesVersion()}`;

    // How far (in canvas pixels) has panY moved from the offscreen centre?
    const offscreenCentreCanvasY = OVERHANG + H / 2;
    const panYDeltaPx = (panY - this._roadOffscreenPanY) * zoom;
    const srcY = offscreenCentreCanvasY - panYDeltaPx - H / 2;

    const needsRender =
      this._roadOffscreenKey !== staticKey ||         // zoom/pan-x/level changed
      !this._roadOffscreen ||
      this._roadOffscreen.width !== W ||
      this._roadOffscreen.height !== offH ||
      srcY < 0 ||                                    // panned beyond top overhang
      srcY + H > offH;                               // panned beyond bottom overhang

    if (needsRender) {
      // (Re-)render into oversized offscreen canvas centred at current panY.
      this._roadOffscreenPanY = panY;
      if (!this._roadOffscreen || this._roadOffscreen.width !== W || this._roadOffscreen.height !== offH) {
        this._roadOffscreen = document.createElement('canvas');
        this._roadOffscreen.width  = W;
        this._roadOffscreen.height = offH;
      }
      const offCtx = this._roadOffscreen.getContext('2d');
      if (offCtx) {
        offCtx.clearRect(0, 0, W, offH);
        // Render using the viewport H and an explicit yOverhang so the road extends
        // above and below the viewport into the cache overhang region.
        this.drawObjectRoadPreview(offCtx, level, theme, panX, panY, zoom, W, H, OVERHANG);
        this._roadOffscreenKey = staticKey;
      }
    }

    // Blit the slice of the oversized offscreen that corresponds to the current viewport.
    if (this._roadOffscreen) {
      const offscreenSrcY = offscreenCentreCanvasY - (panY - this._roadOffscreenPanY) * zoom - H / 2;
      ctx.drawImage(this._roadOffscreen, 0, offscreenSrcY, W, H, 0, 0, W, H);
    }
  }

  private drawObjectRoadPreview(
    ctx: CanvasRenderingContext2D,
    level: ParsedLevel,
    theme: RoadTheme,
    panX: number,
    panY: number,
    zoom: number,
    W: number,
    H: number,
    /** Extra vertical canvas-pixel padding above and below the viewport centre (for oversized cache). */
    yOverhang = 0,
  ): void {
    if (level.roadSegs.length < 2) return;

    /** Local worldToCanvas that respects the explicit pan/zoom and optional yOverhang. */
    const wtc = (wx: number, wy: number): [number, number] => {
      const cx = W / 2 + (wx - panX) * zoom;
      const cy = (H / 2 + yOverhang) - (wy - panY) * zoom;
      return [cx, cy];
    };

    /** Total canvas height (including overhang above and below viewport). */
    const canvasH = H + 2 * yOverhang;

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
        // Translate so that world origin (0,0) aligns with a tile boundary.
        // Canvas-Y of world Y=0: cy = (H/2 + yOverhang) - (0 - panY)*zoom = H/2 + yOverhang + panY*zoom
        const tx = ((W / 2 - panX * zoom) % tileW + tileW) % tileW;
        const ty = (((H / 2 + yOverhang) + panY * zoom) % tileH + tileH) % tileH;
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
      const [ax0, ay0] = wtc(x0, y0);
      const [ax1, ay1] = wtc(x1, y1);
      const [ax2, ay2] = wtc(x2, y2);
      const [ax3, ay3] = wtc(x3, y3);
      if (ay0 < -H && ay1 < -H && ay2 < -H && ay3 < -H) return;
      if (ay0 > canvasH + H && ay1 > canvasH + H && ay2 > canvasH + H && ay3 > canvasH + H) return;
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
    const visibleWorldMinY = panY - (H / 2 + yOverhang) / zoom - 4;
    const visibleWorldMaxY = panY + (H / 2 + yOverhang) / zoom + 4;
    const firstSeg = Math.max(0, Math.floor(visibleWorldMinY / 2));
    const lastSeg  = Math.min(level.roadSegs.length - 2, Math.ceil(visibleWorldMaxY / 2));

    // Adaptive step: merge adjacent segments when zoom is very small to keep rendering fast.
    // Each segment occupies 2 world-Y units; at zoom < 0.25 one segment = < 0.5 canvas px,
    // so merging 4 at a time is visually indistinguishable and 4× faster.
    const step = Math.max(1, Math.ceil(1.5 / zoom));
    // Compute world extents at canvas edges for background fill (extends beyond road edges)
    const worldMinX = panX - W / (2 * zoom) - 200;
    const worldMaxX = panX + W / (2 * zoom) + 200;
    for (let index = firstSeg; index <= lastSeg; index += step) {
      const cur = level.roadSegs[index];
      const nxtIdx = Math.min(index + step, level.roadSegs.length - 1);
      const nxt = level.roadSegs[nxtIdx];
      const y0  = index * 2;
      const y1  = nxtIdx * 2;

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
      const [cx, cy] = wtc(midX, index * 2);
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
      const [leftX, lineY] = wtc(seg.v1, levelEnd);
      const [rightX] = wtc(seg.v2, levelEnd);
      if (lineY > -10 && lineY < H + yOverhang * 2 + 10) {
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
    // canvasH (= H + 2*yOverhang, declared near the top of the function) is the full
    // height of the canvas being rendered (viewport height + above/below overhang).
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.font = '9px monospace';
    const startY = Math.floor((panY - canvasH / (2 * zoom)) / 1000) * 1000;
    const endY   = panY + canvasH / (2 * zoom);
    for (let wy = startY; wy <= endY; wy += 1000) {
      const [, tickY] = wtc(0, wy);
      if (tickY < 0 || tickY > canvasH) continue;
      ctx.fillRect(W - 28, tickY - 0.5, 28, 1);
      ctx.fillText(`${wy}`, W - 60, tickY - 2);
    }

    // Vertical scrollbar-like position indicator (right edge)
    if (level.roadSegs.length > 1) {
      const totalWorldH = (level.roadSegs.length - 1) * 2;
      const viewWorldMin = panY - canvasH / (2 * zoom);
      const viewWorldMax = panY + canvasH / (2 * zoom);
      const barX = W - 8;
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
    const dragWp  = this.dragTrackWaypoint();
    const hoverWp = this.hoverTrackWaypoint();

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
        const isHovered = !isDragged && hoverWp?.track === track && hoverWp.segIdx === i;
        ctx.fillStyle = isDragged ? '#ffffff' : (isHovered ? '#ffdd00' : dotColor);
        ctx.beginPath();
        ctx.arc(cx, cy, isDragged ? dotR + 3 : (isHovered ? dotR + 2 : dotR), 0, Math.PI * 2);
        ctx.fill();
        if (isHovered) {
          ctx.strokeStyle = 'rgba(255,255,255,0.7)';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
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
        ctx.beginPath(); ctx.arc(px, py, isSel ? 12 : 8, 0, Math.PI * 2); ctx.fill();
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
    const mod = window.Module;
    if (mod && typeof mod._set_wasm_master_volume === 'function') {
      mod._set_wasm_master_volume(pct / 100.0);
    }
  }
}
