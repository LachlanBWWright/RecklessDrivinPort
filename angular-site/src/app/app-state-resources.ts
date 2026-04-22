import { computed, signal } from '@angular/core';
import type {
  DecodedSpriteFrame,
  RoadInfoData,
  RoadInfoOption,
  RoadTileGroup,
  TextureTileEntry,
  ObjectTypeDefinition,
} from './level-editor.service';
import { parseSndHeader, type SndInfo } from './snd-codec';
import {
  AUDIO_RESOURCE_TYPES,
  buildResFields,
  ICON_RESOURCE_TYPES,
  MAX_AUTO_FIELDS,
  PACK_ENTRY_SCHEMAS,
  RESOURCE_SCHEMAS,
  TEXT_RESOURCE_TYPES,
} from './resource-fields';
import type { EditorUndoSnapshot } from './app-history';
import { AppStateBase } from './app-state-base';
export {
  saveCustomResourcesDb,
  loadCustomResourcesDb,
  clearCustomResourcesDb,
} from './app-idb';

interface WorkerResponse {
  id: number;
  ok: boolean;
  cmd: string;
  result?: unknown;
  error?: string;
}

/** Resource, persistence, and worker-backed state for the app. */
export class AppStateResources extends AppStateBase {
  // ---- Pack sprite viewer (decoded from Pack 129 & 137) ----
  /** Decoded game sprite frames: id → HTMLCanvasElement. */
  packSpriteCanvases = new Map<number, HTMLCanvasElement>();
  /** Cached data URLs for pack sprite canvases. Cleared when canvases are rebuilt. */
  _packSpriteDataUrls = new Map<number, string>();
  /** Cached data URLs for decoded sprite previews. Cleared when previews are rebuilt. */
  _spritePreviewDataUrls = new Map<number, string>();
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
  readonly selectedResFields = computed(() => {
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
  readonly selectedPackEntryFields = computed(() => {
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
}

declare module './app' {
  interface App extends AppStateResources {}
}
