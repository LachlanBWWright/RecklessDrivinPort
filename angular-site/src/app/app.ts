import { Component, OnDestroy, OnInit, AfterViewInit, inject, signal, computed, effect, ChangeDetectionStrategy } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import type {
  ParsedLevel,
  LevelProperties,
  ObjectPos,
  EditableSpriteAsset,
  MarkSeg,
  RoadSeg,
  ObjectTypeDefinition,
  RoadInfoData,
  DecodedSpriteFrame,
  TrackWaypointRef,
  TrackMidpointRef,
} from './level-editor.service';
import { KonvaEditorService } from './konva-editor.service';
import {
  clampBarrierPoint,
  generateCentreDashMarkings,
  generateSideMarkings,
  sampleQuadraticBezier,
  type MarkingRoadSelection,
} from './road-marking-utils';
import { decodeIMA4, parseSndHeader, buildWav, SndInfo } from './snd-codec';
import {
  worldDirToCanvasForwardVector,
  worldDirToCanvasRotationRad,
} from './object-direction-utils';

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
export type EditorSection = 'properties' | 'objects' | 'sprites' | 'tiles' | 'audio' | 'screens';

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

/**
 * Perpendicular distance from point (px,py) to segment (ax,ay)-(bx,by).
 * Returns Euclidean distance to the nearest point on the segment.
 */
function distToSegment2d(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return dist2d(px, py, ax, ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  return dist2d(px, py, ax + t * dx, ay + t * dy);
}

/**
 * Insert a new waypoint into `arr` at the position that minimises total path
 * distortion – i.e. between the two consecutive waypoints whose segment is
 * closest to (wx, wy).  Falls back to append when the array is empty.
 */
function insertBetweenClosestSegment(
  arr: readonly { x: number; y: number; flags: number; velo: number }[],
  wx: number, wy: number,
): { x: number; y: number; flags: number; velo: number }[] {
  const newPt = { x: Math.round(wx), y: Math.round(wy), flags: 0, velo: 0 };
  if (arr.length <= 1) return [...arr, newPt];
  let bestDist = Infinity;
  let bestIdx = arr.length;
  for (let i = 0; i < arr.length - 1; i++) {
    const d = distToSegment2d(wx, wy, arr[i].x, arr[i].y, arr[i + 1].x, arr[i + 1].y);
    if (d < bestDist) { bestDist = d; bestIdx = i + 1; }
  }
  const copy = [...arr];
  copy.splice(bestIdx, 0, newPt);
  return copy;
}

/** Decode Mac PackBits RLE-compressed bytes into a fixed-size output buffer. */
function decodePackBits(src: Uint8Array, expectedSize: number): Uint8Array {
  const out = new Uint8Array(expectedSize);
  let si = 0, di = 0;
  while (si < src.length && di < expectedSize) {
    const flag = src[si++];
    if (flag === undefined) break;
    if (flag > 127) {
      // Repeat next byte (-flag+1) times
      const count = 257 - flag;
      const val = si < src.length ? src[si++] : 0;
      for (let k = 0; k < count && di < expectedSize; k++) out[di++] = val ?? 0;
    } else {
      // Copy next (flag+1) bytes literally
      const count = flag + 1;
      for (let k = 0; k < count && si < src.length && di < expectedSize; k++) {
        out[di++] = src[si++] ?? 0;
      }
    }
  }
  return out;
}

// ── Resource editor types ─────────────────────────────────────────────────────

/** A single editable field in a binary resource struct. */
export interface ResField {
  name: string;
  offset: number;
  type: 'u8' | 'u16' | 's16' | 'u32' | 's32' | 'f32';
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
  // Mac OS Menu resource (MENU) — header fields
  'MENU': [
    { name: 'menuId',       offset: 0,  type: 's16' },
    { name: 'width',        offset: 2,  type: 'u16' },
    { name: 'height',       offset: 4,  type: 'u16' },
    { name: 'procId',       offset: 6,  type: 's16' },
    { name: 'flags',        offset: 10, type: 'u32' },
  ],
  // Version resource (vers)
  'vers': [
    { name: 'numericVersion', offset: 0, type: 'u32' },
    { name: 'country',        offset: 4, type: 'u16' },
  ],
  // Mac OS Picture (PICT) — header only
  'PICT': [
    { name: 'size',        offset: 0, type: 'u16' },
    { name: 'bounds.top',  offset: 2, type: 's16' },
    { name: 'bounds.left', offset: 4, type: 's16' },
    { name: 'bounds.bot',  offset: 6, type: 's16' },
    { name: 'bounds.rgt',  offset: 8, type: 's16' },
  ],
  // Mac OS snd resource — format header
  'snd ': [
    { name: 'format',        offset: 0, type: 'u16' },
    { name: 'numSynths',     offset: 2, type: 'u16' },
  ],
};

/** Known struct schemas for Pack entry types (by Pack resource ID). */
const PACK_ENTRY_SCHEMAS: Record<number, ResFieldSchema[]> = {
  // Pack 128: Object group reference (tObjectGroupReference)
  128: [
    { name: 'typeRes',  offset: 0, type: 's16' },
    { name: 'numObjs',  offset: 2, type: 'u16' },
  ],
  // Pack 130: Object group entries (tObjectGroup + tObjectGroupEntry[])
  130: [
    { name: 'numEntries',         offset: 0,  type: 'u32' },
    // First entry at offset 4 (tObjectGroupEntry: typeRes s16 + minOffs s16 + maxOffs s16 + probility s16 + dir f32)
    { name: 'entry[0].typeRes',   offset: 4,  type: 's16' },
    { name: 'entry[0].minOffs',   offset: 6,  type: 's16' },
    { name: 'entry[0].maxOffs',   offset: 8,  type: 's16' },
    { name: 'entry[0].probility', offset: 10, type: 's16' },
    { name: 'entry[0].dir',       offset: 12, type: 'f32' },
  ],
  // Pack 134 (kPackSnds): Mac OS 'snd ' entries — SoundHeader
  134: [
    { name: 'snd.format',     offset: 0,  type: 'u16' },
    { name: 'snd.numSynths',  offset: 2,  type: 'u16' },
  ],
  // Pack 135 (kPackRoad): Road info record (tRoadInfo, big-endian)
  // struct tRoadInfo {
  //   float friction;         @  0  (f32)
  //   float airResistance;    @  4  (f32)
  //   float backResistance;   @  8  (f32)
  //   UInt16 tolerance;       @ 12  (u16)
  //   SInt16 marks;           @ 14  (s16) — marking texture index
  //   SInt16 deathOffs;       @ 16  (s16)
  //   SInt16 backgroundTex;   @ 18  (s16) — background texture
  //   SInt16 foregroundTex;   @ 20  (s16) — road foreground texture
  //   SInt16 roadLeftBorder;  @ 22  (s16)
  //   SInt16 roadRightBorder; @ 24  (s16)
  //   SInt16 tracks;          @ 26  (s16)
  //   SInt16 skidSound;       @ 28  (s16)
  //   SInt16 filler;          @ 30  (s16)
  //   float xDrift;           @ 32  (f32)
  //   float yDrift;           @ 36  (f32)
  //   float xFrontDrift;      @ 40  (f32)
  //   float yFrontDrift;      @ 44  (f32)
  //   float trackSlide;       @ 48  (f32)
  //   float dustSlide;        @ 52  (f32)
  //   UInt8 dustColor;        @ 56  (u8)
  //   UInt8 water;            @ 57  (u8)
  //   UInt16 filler2;         @ 58  (u16)
  //   float slideFriction;    @ 60  (f32)
  // }
  135: [
    { name: 'friction',        offset: 0,  type: 'f32' },
    { name: 'airResistance',   offset: 4,  type: 'f32' },
    { name: 'backResistance',  offset: 8,  type: 'f32' },
    { name: 'tolerance',       offset: 12, type: 'u16' },
    { name: 'marks',           offset: 14, type: 's16' },
    { name: 'deathOffs',       offset: 16, type: 's16' },
    { name: 'bgTex',           offset: 18, type: 's16' },
    { name: 'fgTex',           offset: 20, type: 's16' },
    { name: 'lBorder',         offset: 22, type: 's16' },
    { name: 'rBorder',         offset: 24, type: 's16' },
    { name: 'tracks',          offset: 26, type: 's16' },
    { name: 'skidSound',       offset: 28, type: 's16' },
    { name: 'filler',          offset: 30, type: 's16' },
    { name: 'xDrift',          offset: 32, type: 'f32' },
    { name: 'yDrift',          offset: 36, type: 'f32' },
    { name: 'xFrontDrift',     offset: 40, type: 'f32' },
    { name: 'yFrontDrift',     offset: 44, type: 'f32' },
    { name: 'trackSlide',      offset: 48, type: 'f32' },
    { name: 'dustSlide',       offset: 52, type: 'f32' },
    { name: 'dustColor',       offset: 56, type: 'u8'  },
    { name: 'water',           offset: 57, type: 'u8'  },
    { name: 'filler2',         offset: 58, type: 'u16' },
    { name: 'slideFriction',   offset: 60, type: 'f32' },
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
    case 'f32': return view.getFloat32(f.offset, le);
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
    case 'f32': view.setFloat32(f.offset, value, le); break;
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
  if (type === 'u32' || type === 's32' || type === 'f32') return 4;
  if (type === 'u8') return 1;
  return 2; // u16, s16
}

/** Resource types that contain human-readable text (shown as textarea). */
const TEXT_RESOURCE_TYPES = new Set(['TEXT', 'STR ']);
/** Resource types that contain an icon (shown as a canvas). */
const ICON_RESOURCE_TYPES = new Set(['ICN#', 'ics#', 'icl8', 'ics8']);
/** Resource types that contain Mac OS audio data. */
const AUDIO_RESOURCE_TYPES = new Set(['snd ']);

/**
 * Standard Macintosh 8-bit system colour table (clut id=8).
 * 256 entries × 3 bytes (R, G, B). Used for icl8 and ics8 icon resources.
 * This matches the Apple System 7 / Mac OS 9 "system palette".
 */
// prettier-ignore
const MAC_8BIT_PALETTE: readonly number[] = [
  255,255,255, 255,255,204, 255,255,153, 255,255,102, 255,255,51,  255,255,0,
  255,204,255, 255,204,204, 255,204,153, 255,204,102, 255,204,51,  255,204,0,
  255,153,255, 255,153,204, 255,153,153, 255,153,102, 255,153,51,  255,153,0,
  255,102,255, 255,102,204, 255,102,153, 255,102,102, 255,102,51,  255,102,0,
  255,51,255,  255,51,204,  255,51,153,  255,51,102,  255,51,51,   255,51,0,
  255,0,255,   255,0,204,   255,0,153,   255,0,102,   255,0,51,    255,0,0,
  204,255,255, 204,255,204, 204,255,153, 204,255,102, 204,255,51,  204,255,0,
  204,204,255, 204,204,204, 204,204,153, 204,204,102, 204,204,51,  204,204,0,
  204,153,255, 204,153,204, 204,153,153, 204,153,102, 204,153,51,  204,153,0,
  204,102,255, 204,102,204, 204,102,153, 204,102,102, 204,102,51,  204,102,0,
  204,51,255,  204,51,204,  204,51,153,  204,51,102,  204,51,51,   204,51,0,
  204,0,255,   204,0,204,   204,0,153,   204,0,102,   204,0,51,    204,0,0,
  153,255,255, 153,255,204, 153,255,153, 153,255,102, 153,255,51,  153,255,0,
  153,204,255, 153,204,204, 153,204,153, 153,204,102, 153,204,51,  153,204,0,
  153,153,255, 153,153,204, 153,153,153, 153,153,102, 153,153,51,  153,153,0,
  153,102,255, 153,102,204, 153,102,153, 153,102,102, 153,102,51,  153,102,0,
  153,51,255,  153,51,204,  153,51,153,  153,51,102,  153,51,51,   153,51,0,
  153,0,255,   153,0,204,   153,0,153,   153,0,102,   153,0,51,    153,0,0,
  102,255,255, 102,255,204, 102,255,153, 102,255,102, 102,255,51,  102,255,0,
  102,204,255, 102,204,204, 102,204,153, 102,204,102, 102,204,51,  102,204,0,
  102,153,255, 102,153,204, 102,153,153, 102,153,102, 102,153,51,  102,153,0,
  102,102,255, 102,102,204, 102,102,153, 102,102,102, 102,102,51,  102,102,0,
  102,51,255,  102,51,204,  102,51,153,  102,51,102,  102,51,51,   102,51,0,
  102,0,255,   102,0,204,   102,0,153,   102,0,102,   102,0,51,    102,0,0,
  51,255,255,  51,255,204,  51,255,153,  51,255,102,  51,255,51,   51,255,0,
  51,204,255,  51,204,204,  51,204,153,  51,204,102,  51,204,51,   51,204,0,
  51,153,255,  51,153,204,  51,153,153,  51,153,102,  51,153,51,   51,153,0,
  51,102,255,  51,102,204,  51,102,153,  51,102,102,  51,102,51,   51,102,0,
  51,51,255,   51,51,204,   51,51,153,   51,51,102,   51,51,51,    51,51,0,
  51,0,255,    51,0,204,    51,0,153,    51,0,102,    51,0,51,     51,0,0,
  0,255,255,   0,255,204,   0,255,153,   0,255,102,   0,255,51,    0,255,0,
  0,204,255,   0,204,204,   0,204,153,   0,204,102,   0,204,51,    0,204,0,
  0,153,255,   0,153,204,   0,153,153,   0,153,102,   0,153,51,    0,153,0,
  0,102,255,   0,102,204,   0,102,153,   0,102,102,   0,102,51,    0,102,0,
  0,51,255,    0,51,204,    0,51,153,    0,51,102,    0,51,51,     0,51,0,
  0,0,255,     0,0,204,     0,0,153,     0,0,102,     0,0,51,      0,0,0,
  // 40 system/grayscale entries (indices 216..255)
  0,0,0,         17,17,17,      34,34,34,      51,51,51,      68,68,68,      85,85,85,
  102,102,102,   119,119,119,   136,136,136,   153,153,153,   170,170,170,   187,187,187,
  204,204,204,   221,221,221,   238,238,238,   255,165,0,     255,128,0,     128,0,128,
  128,128,0,     0,128,128,     0,128,0,       128,0,0,       0,0,128,       210,180,140,
  160,82,45,     139,69,19,     105,105,105,   112,128,144,   119,136,153,   47,79,79,
  72,61,139,     139,0,139,     0,100,0,       165,42,42,     188,143,143,   173,153,127,
  244,164,96,    210,105,30,    255,218,185,   0,0,0,
];


/**
 * Attempt to play a Mac OS 'snd ' resource using the Web Audio API.
 * Supports:
 *   - stdSH (encode=0x00): uncompressed 8-bit mono PCM
 *   - cmpSH (encode=0xFE) with 'ima4': Apple IMA4 ADPCM compressed
 *   - extSH (encode=0xFF): uncompressed 16-bit mono PCM
 * Returns true if playback started, false if format is unsupported.
 */
function tryPlaySndResource(bytes: Uint8Array, audioCtx: AudioContext): boolean {
  if (bytes.length < 6) return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const format = view.getUint16(0, false);
  let cmdOffset = 0;

  if (format === 1) {
    const numSynths = view.getUint16(2, false);
    cmdOffset = 4 + numSynths * 6;
  } else if (format === 2) {
    cmdOffset = 4;
  } else {
    return false;
  }

  if (cmdOffset + 2 > bytes.length) return false;
  const numCmds = view.getUint16(cmdOffset, false);
  cmdOffset += 2;

  for (let i = 0; i < numCmds; i++) {
    if (cmdOffset + 8 > bytes.length) break;
    const cmd = view.getUint16(cmdOffset, false) & 0x7FFF;
    const param2 = view.getUint32(cmdOffset + 4, false);
    cmdOffset += 8;

    if (cmd === 80 || cmd === 81) {
      const headerOff = param2;
      if (headerOff + 22 > bytes.length) break;
      const numFrames      = view.getUint32(headerOff + 4, false);
      const sampleRateFixed = view.getUint32(headerOff + 8, false);
      const sampleRate     = Math.max(sampleRateFixed / 65536, 100); // clamp ≥ 100 Hz
      const encode         = view.getUint8(headerOff + 20);

      // ── stdSH: 8-bit unsigned mono PCM ──────────────────────────────
      if (encode === 0x00) {
        const dataStart = headerOff + 22;
        const sampleCount = Math.min(numFrames, bytes.length - dataStart);
        if (sampleCount <= 0 || sampleCount > 10_000_000) break;
        const audioBuffer = audioCtx.createBuffer(1, sampleCount, sampleRate);
        const ch = audioBuffer.getChannelData(0);
        for (let s = 0; s < sampleCount; s++) ch[s] = (bytes[dataStart + s] - 128) / 128;
        const src = audioCtx.createBufferSource();
        src.buffer = audioBuffer; src.connect(audioCtx.destination); src.start();
        return true;
      }

      // ── cmpSH: compressed (IMA4 ADPCM) ──────────────────────────────
      if (encode === 0xFE) {
        // cmpSH extra fields layout (after the 22-byte base):
        //   numFrames2(4) + AIFFSampleRate(10) + markerChunk(4) + format(4) = 22 extra bytes
        //   + futureUse2(4) + stateVars(4) + leftOverSamples(4) = 12 more
        //   + compressionID(2) + packetSize(2) + snthID(2) + numChannels(2) + sampleSize(2) = 10
        //   Total extra: 44 bytes → data starts at headerOff + 66
        if (headerOff + 66 > bytes.length) break;
        const fmtBytes = bytes.slice(headerOff + 40, headerOff + 44);
        const comprFmt = String.fromCharCode(...fmtBytes);
        if (comprFmt !== 'ima4') break; // only IMA4 supported

        const dataStart = headerOff + 66;
        // numFrames from headerOff+4 = number of IMA4 packets (each produces 64 samples)
        const numPackets   = numFrames;
        const totalSamples = numPackets * 64;
        if (totalSamples <= 0 || totalSamples > 10_000_000) break;
        const available    = Math.floor((bytes.length - dataStart) / 34);
        const pktsToUse    = Math.min(numPackets, available);
        if (pktsToUse <= 0) break;

        const f32 = decodeIMA4(bytes.subarray(dataStart), pktsToUse);
        const audioBuffer = audioCtx.createBuffer(1, f32.length, sampleRate);
        audioBuffer.getChannelData(0).set(f32);
        const src = audioCtx.createBufferSource();
        src.buffer = audioBuffer; src.connect(audioCtx.destination); src.start();
        return true;
      }

      // ── extSH: uncompressed 16-bit big-endian mono PCM ───────────────
      if (encode === 0xFF) {
        // extSH data starts at headerOff + 64 (base 22 + 42 extra bytes)
        // numFrames at headerOff+4 is the frame count; each frame = 1 sample (mono)
        const dataStart = headerOff + 64;
        if (dataStart + 2 > bytes.length) break;
        const sampleCount = Math.min(numFrames, Math.floor((bytes.length - dataStart) / 2));
        if (sampleCount <= 0 || sampleCount > 10_000_000) break;
        const audioBuffer = audioCtx.createBuffer(1, sampleCount, sampleRate);
        const ch = audioBuffer.getChannelData(0);
        for (let s = 0; s < sampleCount; s++) {
          let sample = view.getInt16(dataStart + s * 2, false); // big-endian
          ch[s] = sample / 32768.0;
        }
        const src = audioCtx.createBufferSource();
        src.buffer = audioBuffer; src.connect(audioCtx.destination); src.start();
        return true;
      }

      break; // encode value not supported
    }
  }
  return false;
}



@Component({
  selector: 'app-root',
  templateUrl: './app.html',
  standalone: false,
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
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
  editObjectGroups = signal<{ resID: number; numObjs: number }[]>([]);
  propertiesDirty = signal(false);

  // ---- Object placement ----
  objects = signal<ObjectPos[]>([]);
  selectedObjIndex = signal<number | null>(null);
  editObjX = signal(0);
  editObjY = signal(0);
  editObjDir = signal(0);
  /** editObjDir expressed in degrees for display in the inspector. */
  readonly editObjDirDeg = computed(() => parseFloat((this.editObjDir() * 180 / Math.PI).toFixed(2)));
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
  /** True while barrier draw gesture is active (mouse held during draw mode). */
  private _barrierDrawing = false;
  /** World-coordinate points collected during the current barrier draw gesture. */
  private _barrierDrawPath: { wx: number; wy: number }[] = [];
  /** Start point for straight-line barrier draw mode (set on mousedown, cleared on mouseup). */
  private _barrierDrawStart: { wx: number; wy: number } | null = null;
  /** RAF gate: true while a hover-detection frame is already queued. */
  private _hoverRafPending = false;
  /** Pending waypoint position during a live drag (committed to signal on mouseup). */
  private _pendingWaypointDragPos: { x: number; y: number } | null = null;
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

  // ---- Undo / Redo ----
  /** Snapshot stack for undo. Each entry is a deep copy of the objects array. */
  private _undoStack: ObjectPos[][] = [];
  private _redoStack: ObjectPos[][] = [];
  readonly canUndo = signal(false);
  readonly canRedo = signal(false);

  /** Push a snapshot of the current objects list onto the undo stack. */
  private _pushUndo(): void {
    this._undoStack.push(this.objects().map((o) => ({ ...o })));
    if (this._undoStack.length > 50) this._undoStack.shift();
    this._redoStack = [];
    this.canUndo.set(true);
    this.canRedo.set(false);
  }

  undo(): void {
    if (this._undoStack.length === 0) return;
    this._redoStack.push(this.objects().map((o) => ({ ...o })));
    this.objects.set(this._undoStack.pop()!);
    this.canUndo.set(this._undoStack.length > 0);
    this.canRedo.set(true);
  }

  redo(): void {
    if (this._redoStack.length === 0) return;
    this._undoStack.push(this.objects().map((o) => ({ ...o })));
    this.objects.set(this._redoStack.pop()!);
    this.canUndo.set(true);
    this.canRedo.set(this._redoStack.length > 0);
  }

  // ---- Mark editor ----
  marks = signal<MarkSeg[]>([]);
  selectedMarkIndex = signal<number | null>(null);
  markCreateMode = signal(false);
  pendingMarkPointCount = signal(0);
  /** Preview marks shown on canvas with distinct styling (blue dashed) when generating. */
  markingPreview = signal<MarkSeg[]>([]);
  private _markAutoSaveTimer: ReturnType<typeof setTimeout> | null = null;
  private _lastDraggedNubKey: { markIdx: number; endpoint: 'p1' | 'p2' } | null = null;
  private _pendingMarkPoints: { x: number; y: number }[] = [];
  private _markCreateHoverPoint: { x: number; y: number } | null = null;
  dragMarkEndpoint = signal<{ markIdx: number; endpoint: 'p1' | 'p2' } | null>(null);
  /** True while user is dragging the player start X marker on the canvas. */
  private _draggingStartMarker = false;
  private _curveStartPoint: { wx: number; wy: number } | null = null;
  private _curveEndPoint: { wx: number; wy: number } | null = null;

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
  /** True when the sprite editor is being used to edit a tile (not a sprite). */
  private _editingTileId: number | null = null;

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

  private wasmScript: HTMLScriptElement | null = null;
  /** Custom resources.dat loaded via the game tab upload; queued until WASM inits if needed. */
  private _pendingCustomResources: Uint8Array | null = null;
  /** True after the custom resources.dat has been applied to the WASM FS. */
  customResourcesLoaded = signal(false);
  /** Name of custom resources.dat file, shown in UI. */
  customResourcesName = signal<string | null>(null);

  // ── IndexedDB persistence for custom resources.dat ─────────────────────────
  // The game is compiled with Emscripten ASYNCIFY, which makes calling callMain()
  // a second time unsafe (the ASYNCIFY state machine is not designed to be re-entered).
  // We therefore restart by reloading the page, persisting the custom bytes in IndexedDB
  // so the preRun hook can inject them into MEMFS before the game's main() runs.
  private static readonly _IDB_NAME  = 'reckless-drivin';
  private static readonly _IDB_STORE = 'custom-resources';
  private static readonly _IDB_KEY   = 'resources-dat';

  private static _openCustomResourcesDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(App._IDB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(App._IDB_STORE)) {
          req.result.createObjectStore(App._IDB_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror  = () => reject(req.error);
    });
  }

  private static async _saveCustomResourcesDb(bytes: Uint8Array, name: string): Promise<void> {
    const db = await App._openCustomResourcesDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(App._IDB_STORE, 'readwrite');
      tx.objectStore(App._IDB_STORE).put({ bytes, name }, App._IDB_KEY);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror    = () => { db.close(); reject(tx.error); };
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
        if (!db.objectStoreNames.contains(App._IDB_STORE)) { db.close(); resolve(null); return; }
        const tx     = db.transaction(App._IDB_STORE, 'readonly');
        const getReq = tx.objectStore(App._IDB_STORE).get(App._IDB_KEY);
        getReq.onsuccess = () => { db.close(); resolve((getReq.result as { bytes: Uint8Array; name: string }) ?? null); };
        getReq.onerror   = () => { db.close(); resolve(null); };
      };
      req.onerror = () => resolve(null);
    });
  }

  static async _clearCustomResourcesDb(): Promise<void> {
    return new Promise((resolve) => {
      const req = indexedDB.open(App._IDB_NAME, 1);
      req.onsuccess = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(App._IDB_STORE)) { db.close(); resolve(); return; }
        const tx = db.transaction(App._IDB_STORE, 'readwrite');
        tx.objectStore(App._IDB_STORE).delete(App._IDB_KEY);
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror    = () => { db.close(); resolve(); };
      };
      req.onerror = () => resolve();
    });
  }

  private objectTypeDefinitions = new Map<number, ObjectTypeDefinition>();
  private objectSpritePreviews = new Map<number, HTMLCanvasElement | null>();

  /** Decoded road info from kPackRoad: roadInfoId → texture IDs + flags. */
  private roadInfoDataMap = new Map<number, RoadInfoData>();
  /** Cached rendered canvases for icon/screen resources (type:id → canvas). */
  iconCanvasMap = new Map<string, HTMLCanvasElement>();
  /** Decoded texture canvases from kPackTx16: texId → HTMLCanvasElement. */
  private roadTextureCanvases = new Map<number, HTMLCanvasElement>();
  /** Version signal bumped when road textures are loaded (triggers canvas redraw). */
  roadTexturesVersion = signal(0);
  /** Version signal bumped when road segment data changes (invalidates road offscreen cache). */
  private roadSegsVersion = signal(0);

  /** Tile viewer: all decoded texture tile entries for the Tiles tab. */
  tileTileEntries = signal<{ texId: number; width: number; height: number }[]>([]);
  /** Currently selected tile ID in the tile viewer. */
  selectedTileId = signal<number | null>(null);

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
      // Read activeTab first so that signal subscriptions below are still registered
      // (Angular effects always run the full body once, so we still need all reads),
      // but we avoid scheduling redundant redraws when the editor is not visible.
      const tab = this.activeTab();
      const section = this.editorSection();
      this.objects();
      this.selectedObjIndex();
      this.canvasZoom();
      this.canvasPanX();
      this.canvasPanY();
      this.visibleTypeFilter();
      this.spritePreviewsVersion();
      this.roadTexturesVersion();
      this.roadSegsVersion();
      this.showTrackOverlay();
      this.showObjects();
      this.showMarks();
      this.showRoad();
      this.showBarriers();
      this.showTrackUp();
      this.showTrackDown();
      this.showGrid();
      this.editTrackUp();
      this.editTrackDown();
      this.hoverTrackWaypoint();
      this.hoverTrackMidpoint();
      this.marks();
      this.selectedMarkIndex();
      this.markCreateMode();
      this.pendingMarkPointCount();
      this.markingPreview();
      this.editXStartPos();
      // Track the full selectedLevel (includes roadSegs) so any road-segment
      // mutation (barrier drag, merge/split) automatically triggers a redraw
      // without requiring explicit scheduleCanvasRedraw() calls.
      this.selectedLevel();
      if (tab === 'editor' && section === 'objects') {
        this.scheduleCanvasRedraw();
      }
    });

    // Redraw mark canvas when marks or selected mark changes.
    effect(() => {
      this.marks();
      this.selectedMarkIndex();
      this.markCreateMode();
      this.pendingMarkPointCount();
      if (typeof window !== 'undefined') {
        window.requestAnimationFrame(() => this.redrawMarkCanvas());
      }
    });

    // Reactively update the Konva container cursor when the draw mode changes.
    effect(() => {
      const mode = this.drawMode();
      if (mode !== 'curve') {
        this._curveStartPoint = null;
        this._curveEndPoint = null;
        this.konva.clearBarrierDrawPreview();
      }
      if (typeof document === 'undefined') return;
      const kc = document.getElementById('konva-container');
      if (!kc) return;
      if (!this.spaceDown() && !this._isPanning) {
        kc.style.cursor = mode !== 'none' ? 'crosshair' : 'default';
      }
    });
  }

  /** Format seconds as M:SS (handles NaN and Infinity). */
  formatTime(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds <= 0) return '0:00';
    const s = Math.floor(seconds);
    const mm = Math.floor(s / 60);
    const ss = s % 60;
    return `${mm}:${ss.toString().padStart(2, '0')}`;
  }

  /** Schedule a canvas redraw on the next animation frame, cancelling any pending redraw. */
  private scheduleCanvasRedraw(): void {
    // Skip canvas redraws when the editor tab is not visible.
    if (this.activeTab() !== 'editor') return;
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
    // Restore any previously saved custom resources.dat from IndexedDB.
    // This allows the custom resources to persist after a page reload triggered by the
    // "Restart Game" button (which uses window.location.reload() instead of callMain()).
    if (typeof indexedDB !== 'undefined') {
      App._loadCustomResourcesDb().then((entry) => {
        if (entry) {
          this.customResourcesLoaded.set(true);
          this.customResourcesName.set(entry.name);
        }
      }).catch(() => { /* ignore */ });
    }
  }

  ngAfterViewInit(): void {
    this.setupEmscriptenModule();
    this.loadWasmScript();
  }

  /** True once the Konva stage has been initialized on the canvas DOM element. */
  private _konvaInitialized = false;
  /** Serialized key of the last barriers state drawn; used to skip redundant rebuilds. */
  private _lastBarriersSerialized = '';

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

      // Make Konva container focusable so it can receive keyboard events.
      // Forward key events to the canvas so existing Angular key handlers fire.
      konvaContainer.tabIndex = 0;
      konvaContainer.addEventListener('keydown', (e) => {
        canvas.dispatchEvent(new KeyboardEvent('keydown', {
          key: e.key, code: e.code, keyCode: e.keyCode, which: e.which,
          ctrlKey: e.ctrlKey, metaKey: e.metaKey, shiftKey: e.shiftKey, altKey: e.altKey,
          repeat: e.repeat, bubbles: true, cancelable: true,
        }));
      });
      konvaContainer.addEventListener('keyup', (e) => {
        canvas.dispatchEvent(new KeyboardEvent('keyup', {
          key: e.key, code: e.code, keyCode: e.keyCode, which: e.which,
          ctrlKey: e.ctrlKey, metaKey: e.metaKey, shiftKey: e.shiftKey, altKey: e.altKey,
          repeat: e.repeat, bubbles: true, cancelable: true,
        }));
      });
      // Focus Konva container when user clicks in canvas area
      konvaContainer.addEventListener('mousedown', () => {
        konvaContainer!.focus({ preventScroll: true });
      });
    }
    // Always update the container CSS to match the current canvas display size
    konvaContainer.style.cssText = `
      position:absolute; top:0; left:0;
      width:${cssW}px; height:${cssH}px;
      pointer-events:all;
      outline:none;
      cursor:default;
    `;

    this.konva.init('konva-container', canvas.width, canvas.height, cssW, cssH);
    this._konvaInitialized = true;

    // Keep the Konva container + stage in sync if the canvas CSS display size changes.
    // Also update the canvas pixel-buffer dimensions to match CSS size (1:1 DPR mapping)
    // so that rendering fills the expanded height correctly.
    const resizeObserver = new ResizeObserver(() => {
      const r = canvas.getBoundingClientRect();
      const w = Math.max(1, Math.round(r.width));
      const h = Math.max(1, Math.round(r.height));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width  = w;
        canvas.height = h;
        // Invalidate the road offscreen cache since the canvas dimensions changed.
        this._roadOffscreenKey = '';
        this._roadOffscreen = null;
      }
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
        this._pushUndo();
        objs[e.index] = { ...objs[e.index], x: e.worldX, y: e.worldY };
        this.objects.set(objs);
        if (this.selectedObjIndex() === e.index) {
          this.editObjX.set(e.worldX);
          this.editObjY.set(e.worldY);
        }
      }
    };

    this.konva.onObjectClick = (index) => {
      this.selectObject(index);
    };

    this.konva.onStageDblClick = (wx, wy) => {
      if (this.markCreateMode() || this.drawMode() !== 'none') return;
      const objs = [...this.objects()];
      // Use currently selected object's typeRes if available, otherwise default to 128
      const selIdx = this.selectedObjIndex();
      const typeRes = selIdx !== null && selIdx < objs.length
        ? objs[selIdx].typeRes
        : 128;
      // Push undo BEFORE mutating so undo restores the pre-add state.
      this._pushUndo();
      objs.push({ x: Math.round(wx), y: Math.round(wy), dir: 0, typeRes });
      this.objects.set(objs);
      this.selectObject(objs.length - 1);
    };

    this.konva.onStageRightClick = (wx, wy) => {
      if (!this.showTrackOverlay()) return;
      // Simulate the context menu logic
      this._handleTrackContextMenuAtWorld(wx, wy);
    };

    this.konva.onWaypointDragEnd = (e) => {
      // Deselect any selected object when a path waypoint is moved
      this.selectedObjIndex.set(null);
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

    this.konva.onWaypointDoubleClick = (track, segIdx) => {
      this._insertWaypointAfter(track, segIdx);
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

    // ── Mark segment endpoint drag ─────────────────────────────────────────
    this.konva.onMarkEndpointDragEnd = (e) => {
      // Deselect any selected object when a mark endpoint is moved
      this.selectedObjIndex.set(null);
      this._pushUndo();
      const ms = [...this.marks()];
      if (e.markIdx >= ms.length) return;
      const m = ms[e.markIdx];
      // Get the OLD position of the dragged endpoint
      const oldX = e.endpoint === 'p1' ? m.x1 : m.x2;
      const oldY = e.endpoint === 'p1' ? m.y1 : m.y2;
      // Move the dragged endpoint
      ms[e.markIdx] = e.endpoint === 'p1'
        ? { ...m, x1: e.worldX, y1: e.worldY }
        : { ...m, x2: e.worldX, y2: e.worldY };
      // Move all OTHER endpoints that were colocated with the dragged endpoint
      // (i.e. same x,y as oldX,oldY). This lets chained/shared mark vertices
      // move as a single handle when they are coincident.
      for (let i = 0; i < ms.length; i++) {
        if (i === e.markIdx) continue;
        const other = ms[i];
        if (other.x1 === oldX && other.y1 === oldY) {
          ms[i] = { ...other, x1: e.worldX, y1: e.worldY };
        }
        if (other.x2 === oldX && other.y2 === oldY) {
          ms[i] = { ...ms[i], x2: e.worldX, y2: e.worldY };
        }
      }
      this._lastDraggedNubKey = { markIdx: e.markIdx, endpoint: e.endpoint };
      this.marks.set(ms);
      this.scheduleMarkAutoSave();
    };

    this.konva.onMarkClick = (markIdx) => {
      this.selectedMarkIndex.set(markIdx);
    };

    // ── Pan via Konva stage mouse events ───────────────────────────────────
    // The Konva container intercepts ALL mouse events before they reach the
    // underlying #object-canvas.  We must handle panning through Konva's own
    // stage mouse callbacks.  The stage.getPointerPosition() returns CSS-pixel
    // coordinates equivalent to MouseEvent.offsetX/offsetY on the canvas.
    this.konva.onStageMouseDown = (cssX, cssY, button, targetIsStage) => {
      const isPanGesture = button === 1 || (button === 0 && this.spaceDown());
      if (isPanGesture) {
        this._isPanning = true;
        this.isPanning.set(true);
        this._prevPanMouseX = cssX;
        this._prevPanMouseY = cssY;
        // Update cursor on the Konva container
        const kc = document.getElementById('konva-container');
        if (kc) kc.style.cursor = 'grabbing';
        return;
      }
      if (button === 0 && this.markCreateMode() && targetIsStage) {
        const [wx, wy] = this.canvasToWorld(cssX, cssY);
        this._addMarkCreatePoint(Math.round(wx), Math.round(wy));
        return;
      }
      if (button === 0 && this.showBarriers() && this.drawMode() !== 'none' && targetIsStage) {
        // Start barrier draw gesture (only when a draw mode is selected)
        const [wx, wy] = this.canvasToWorld(cssX, cssY);
        if (this.drawMode() === 'curve') {
          this._handleCurveDrawClick(wx, wy);
          return;
        }
        this._barrierDrawing = true;
        if (this.drawMode() === 'straight') {
          // Straight-line mode: record start point; path will be finalised on mouseup
          this._barrierDrawStart = { wx, wy };
          this._barrierDrawPath = [{ wx, wy }];
        } else {
          this._barrierDrawStart = null;
          this._barrierDrawPath = [{ wx, wy }];
        }
        const kc = document.getElementById('konva-container');
        if (kc) kc.style.cursor = 'crosshair';
        return;
      }
      if (button === 0) {
        // Check for start-marker drag (the player start position triangle at Y=0)
        const [wx, wy] = this.canvasToWorld(cssX, cssY);
        const startHitR = Math.max(MIN_START_MARKER_HIT_RADIUS, BASE_START_MARKER_HIT_RADIUS / this.canvasZoom());
        if (dist2d(this.editXStartPos(), 0, wx, wy) < startHitR) {
          this._draggingStartMarker = true;
          return;
        }
      }
    };

    this.konva.onStageMouseMove = (cssX, cssY) => {
      if (this._isPanning) {
        const zoom = this.canvasZoom();
        const dx = cssX - this._prevPanMouseX;
        const dy = cssY - this._prevPanMouseY;
        this._prevPanMouseX = cssX;
        this._prevPanMouseY = cssY;
        // Screen right → world left ⟹ panX decreases
        // Screen down  → world down ⟹ panY decreases (world +Y is up)
        this.canvasPanX.update(x => x - dx / zoom);
        this.canvasPanY.update(y => y - dy / zoom);
        return;
      }
      if (this.markCreateMode() && this._pendingMarkPoints.length > 0) {
        const [wx, wy] = this.canvasToWorld(cssX, cssY);
        this._markCreateHoverPoint = { x: Math.round(wx), y: Math.round(wy) };
        this.scheduleCanvasRedraw();
        return;
      }
      if (this.drawMode() === 'curve') {
        const [wx, wy] = this.canvasToWorld(cssX, cssY);
        this._updateCurvePreview(wx, wy);
        return;
      }
      if (this._barrierDrawing) {
        const [wx, wy] = this.canvasToWorld(cssX, cssY);
        if (this.drawMode() === 'straight' && this._barrierDrawStart) {
          // Straight-line mode: track start→current end in path and show preview
          this._barrierDrawPath = [this._barrierDrawStart, { wx, wy }];
          const start = this._barrierDrawStart;
          this.konva.setBarrierDrawPreview([start.wx, -start.wy, wx, -wy]);
          this.konva.flush();
        } else {
          this._barrierDrawPath.push({ wx, wy });
          // Update preview line (every N points to reduce noise)
          if (this._barrierDrawPath.length % 3 === 0) {
            const pts: number[] = [];
            for (const p of this._barrierDrawPath) { pts.push(p.wx, -p.wy); }
            this.konva.setBarrierDrawPreview(pts);
            this.konva.flush();
          }
        }
        return;
      }
      if (this._draggingStartMarker) {
        const [wx] = this.canvasToWorld(cssX, cssY);
        this.editXStartPos.set(Math.round(wx));
        this.propertiesDirty.set(true);
      }
    };

    this.konva.onStageMouseUp = (button) => {
      if (button === 0 || button === 1) {
        if (this._isPanning) {
          this._isPanning = false;
          this.isPanning.set(false);
          const kc = document.getElementById('konva-container');
          if (kc) kc.style.cursor = this.spaceDown() ? 'grab' : (this.drawMode() !== 'none' ? 'crosshair' : 'default');
        }
        if (this._barrierDrawing) {
          this._barrierDrawing = false;
          this.konva.clearBarrierDrawPreview();
          if (this.drawMode() === 'straight') {
            // Straight-line mode: _barrierDrawPath is [start, end] set during mousemove.
            // _applyBarrierDrawPath() handles 2-point paths as a straight line.
            this._barrierDrawStart = null;
            this._applyBarrierDrawPath();
          } else {
            this._applyBarrierDrawPath();
          }
          const kc = document.getElementById('konva-container');
          if (kc) kc.style.cursor = this.spaceDown() ? 'grab' : (this.drawMode() !== 'none' ? 'crosshair' : 'default');
        }
        if (this._draggingStartMarker) {
          this._draggingStartMarker = false;
        }
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

    // Insert into the nearest track, positioned between the two closest consecutive waypoints
    const level = this.selectedLevel();
    if (!level) return;

    // Find nearest segment distance for each track to decide which to insert into
    let nearestSegDistUp = Infinity;
    for (let i = 0; i < trackUp.length - 1; i++) {
      const d = distToSegment2d(wx, wy, trackUp[i].x, trackUp[i].y, trackUp[i + 1].x, trackUp[i + 1].y);
      if (d < nearestSegDistUp) nearestSegDistUp = d;
    }
    if (trackUp.length === 1) nearestSegDistUp = dist2d(trackUp[0].x, trackUp[0].y, wx, wy);

    let nearestSegDistDown = Infinity;
    for (let i = 0; i < trackDown.length - 1; i++) {
      const d = distToSegment2d(wx, wy, trackDown[i].x, trackDown[i].y, trackDown[i + 1].x, trackDown[i + 1].y);
      if (d < nearestSegDistDown) nearestSegDistDown = d;
    }
    if (trackDown.length === 1) nearestSegDistDown = dist2d(trackDown[0].x, trackDown[0].y, wx, wy);

    if (nearestSegDistUp <= nearestSegDistDown || trackDown.length === 0) {
      this.editTrackUp.set(insertBetweenClosestSegment(trackUp, wx, wy));
    } else {
      this.editTrackDown.set(insertBetweenClosestSegment(trackDown, wx, wy));
    }
  }

  ngOnDestroy(): void {
    // Ensure any managed audio playback is stopped and RAF cancelled
    try { this.stopAudio(); } catch { /* ignore */ }
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
    this.syncGameLoopWithActiveTab();
    // Resume canvas rendering when the editor tab becomes active.
    if (tab === 'editor') {
      window.requestAnimationFrame(() => this.redrawObjectCanvas());
    }
  }

  setSection(section: EditorSection): void {
    this.editorSection.set(section);
  }

  /** Maps EditorSection → mat-tab index for [(selectedIndex)] binding. */
  private readonly SECTION_ORDER: EditorSection[] = ['properties', 'objects', 'sprites', 'tiles', 'audio', 'screens'];
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

      // Flush all in-memory edits to the worker before serializing.
      // Road-segment edits (onBarrierDragEnd), mark drags (onMarkEndpointDragEnd),
      // track edits, object edits, and property edits all update Angular signals but
      // are NOT automatically dispatched to the pack worker's resources state.
      // We fire all APPLY_* messages concurrently (the single-threaded worker queues
      // them in order) so that the subsequent SERIALIZE sees the latest editor state.
      this.resourcesStatus.set('Saving pending edits before download…');
      const syncPromises: Promise<unknown>[] = [];

      // Sync road segments (barriers) for every loaded level.
      for (const level of this.parsedLevels()) {
        syncPromises.push(this.dispatchWorker<unknown>('APPLY_ROAD_SEGS', {
          resourceId: level.resourceId,
          roadSegs: level.roadSegs,
        }));
      }

      // Sync current-level marks, track, objects, and properties (only available
      // for the selected level because those signals are per-selection).
      const selId = this.selectedLevelId();
      if (selId !== null) {
        syncPromises.push(this.dispatchWorker<unknown>('APPLY_MARKS', {
          resourceId: selId,
          marks: this.marks(),
        }));
        syncPromises.push(this.dispatchWorker<unknown>('APPLY_TRACK', {
          resourceId: selId,
          trackUp:   this.editTrackUp(),
          trackDown: this.editTrackDown(),
        }));
        syncPromises.push(this.dispatchWorker<unknown>('APPLY_OBJECTS', {
          resourceId: selId,
          objects: this.objects(),
        }));
        if (this.propertiesDirty()) {
          const props: LevelProperties = {
            roadInfo:     this.editRoadInfo(),
            time:         this.editTime(),
            xStartPos:    this.editXStartPos(),
            levelEnd:     this.editLevelEnd(),
            objectGroups: this.editObjectGroups(),
          };
          syncPromises.push(this.dispatchWorker<unknown>('APPLY_PROPS', { resourceId: selId, props }));
        }
      }

      // Wait for all pending edits to land in the worker before serializing.
      await Promise.all(syncPromises);

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

  /**
   * Serialize the current in-memory resources, persist them in IndexedDB, and
   * offer to restart the game so the changes (including sprite edits) take effect.
   *
   * This avoids the cumbersome download → re-upload workflow:  sprite edits are
   * stored only in the worker's in-memory resources and are not visible in the
   * live game until a full page-reload injects the new resources.dat from IDB.
   */
  async saveEditedResourcesToGame(): Promise<void> {
    if (!this.hasEditorData()) return;
    try {
      this.workerBusy.set(true);
      this.resourcesStatus.set('Flushing pending edits…');

      // Sync all in-memory edits to the worker (same as downloadEditedResources).
      const syncPromises: Promise<unknown>[] = [];
      for (const level of this.parsedLevels()) {
        syncPromises.push(this.dispatchWorker<unknown>('APPLY_ROAD_SEGS', {
          resourceId: level.resourceId,
          roadSegs: level.roadSegs,
        }));
      }
      const selId = this.selectedLevelId();
      if (selId !== null) {
        syncPromises.push(this.dispatchWorker<unknown>('APPLY_MARKS', {
          resourceId: selId, marks: this.marks(),
        }));
        syncPromises.push(this.dispatchWorker<unknown>('APPLY_TRACK', {
          resourceId: selId, trackUp: this.editTrackUp(), trackDown: this.editTrackDown(),
        }));
        syncPromises.push(this.dispatchWorker<unknown>('APPLY_OBJECTS', {
          resourceId: selId, objects: this.objects(),
        }));
        if (this.propertiesDirty()) {
          const props: LevelProperties = {
            roadInfo: this.editRoadInfo(), time: this.editTime(),
            xStartPos: this.editXStartPos(), levelEnd: this.editLevelEnd(),
            objectGroups: this.editObjectGroups(),
          };
          syncPromises.push(this.dispatchWorker<unknown>('APPLY_PROPS', { resourceId: selId, props }));
        }
      }
      await Promise.all(syncPromises);

      this.resourcesStatus.set('Serializing…');
      const buf = await this.dispatchWorker<ArrayBuffer>('SERIALIZE');
      const bytes = new Uint8Array(buf);

      // Persist in IndexedDB so the preRun hook injects them on next page load.
      const name = this.customResourcesName() ?? 'resources.dat';
      await App._saveCustomResourcesDb(bytes, name);
      this.customResourcesName.set(name);
      this.customResourcesLoaded.set(true);

      this.resourcesStatus.set('Saved to game. Restart the game to apply changes.');
      this.snackBar.open('✓ Saved to game – click Restart Game to apply', 'Restart', {
        duration: 8000, panelClass: 'snack-success',
      }).onAction().subscribe(() => this.restartGameWithCustomResources());
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to save resources';
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
    // Stop audio and clear the cached buffer so the next Play decodes the new selection.
    this.stopAudio();
    this._lastAudioBuffer = null;
    this.audioCurrentTime.set(0);
    this.audioDuration.set(0);

    try {
      this.resBrowserBusy.set(true);
      if (type === 'Pack') {
        // For packs, load the entry list instead of raw bytes
        type ListPackResult = { entries: { id: number; size: number }[] | null };
        const r = await this.dispatchWorker<ListPackResult>('LIST_PACK_ENTRIES', { packId: id });
        this.selectedPackEntries.set(r.entries);
      } else if (type === 'STR#') {
        // For string lists, load decoded strings and also raw bytes (needed for Download button)
        type StrResult = { strings: string[] };
        const [strR, rawR] = await Promise.all([
          this.dispatchWorker<StrResult>('GET_STR_LIST', { id }),
          this.dispatchWorker<{ bytes: ArrayBuffer | null }>('GET_RESOURCE_RAW', { type, id }),
        ]);
        this.selectedResStrings.set(strR.strings);
        if (rawR.bytes) this.selectedResBytes.set(new Uint8Array(rawR.bytes));
      } else if (TEXT_RESOURCE_TYPES.has(type)) {
        // For text resources (STR, TEXT), load as decoded string
        const r = await this.dispatchWorker<{ bytes: ArrayBuffer | null }>('GET_RESOURCE_RAW', { type, id });
        if (r.bytes) {
          const bytes = new Uint8Array(r.bytes);
          this.selectedResBytes.set(bytes);
          // STR is a Pascal string (1-byte length prefix); TEXT is raw bytes
          if (type === 'STR ') {
            const len = bytes[0] ?? 0;
            this.selectedResText.set(String.fromCharCode(...bytes.subarray(1, 1 + len)));
          } else {
            // TEXT may be large; build via array join to avoid spread stack overflow
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
      // Refresh raw bytes so the Download button stays current
      const rawR = await this.dispatchWorker<{ bytes: ArrayBuffer | null }>('GET_RESOURCE_RAW', { type: 'STR#', id });
      if (rawR.bytes) this.selectedResBytes.set(new Uint8Array(rawR.bytes));
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
    const raw = target?.value ?? '';
    const val = (this.selectedResFields()[fieldIdx]?.type === 'f32') ? parseFloat(raw) : Number.parseInt(raw, 10);
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
    const raw = target?.value ?? '';
    const val = (this.selectedPackEntryFields()[fieldIdx]?.type === 'f32') ? parseFloat(raw) : Number.parseInt(raw, 10);
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

  /** Web Audio context, lazily created for snd resource playback. */
  private _audioCtx: AudioContext | null = null;
  /** Gain node for per-player volume control (0–1). Connected between sources and destination. */
  private _audioGainNode: GainNode | null = null;

  // Managed playback state for controllable audio (pause/seek)
  audioPlaying = signal(false);
  audioCurrentTime = signal(0);
  audioDuration = signal(0);
  /** Volume for the audio editor player (0–100). */
  audioPlayerVolume = signal(80);
  readonly audioControllable = computed(() => this._lastAudioBuffer !== null);
  // True while an async decode / preparation for managed playback is in progress
  audioDecodeInProgress = signal(false);

  private _audioSource: AudioBufferSourceNode | null = null;
  private _lastAudioBuffer: AudioBuffer | null = null;
  private _audioStartTime = 0; // audioCtx.currentTime when playback started minus offset
  private _audioPauseOffset = 0; // seconds offset where paused
  private _audioRaf: number | null = null;

  /** Ensure AudioContext and GainNode are created; return the gain node. */
  private _ensureAudioCtx(): GainNode {
    if (!this._audioCtx) {
      this._audioCtx = new AudioContext({ latencyHint: 'interactive' });
      this._audioGainNode = this._audioCtx.createGain();
      this._audioGainNode.connect(this._audioCtx.destination);
      this._audioGainNode.gain.value = this.audioPlayerVolume() / 100;
    }
    if (!this._audioGainNode) {
      this._audioGainNode = this._audioCtx.createGain();
      this._audioGainNode.connect(this._audioCtx.destination);
      this._audioGainNode.gain.value = this.audioPlayerVolume() / 100;
    }
    return this._audioGainNode;
  }

  /** Update the audio player volume (0–100). */
  setAudioPlayerVolume(pct: number): void {
    const clamped = Math.max(0, Math.min(100, pct));
    this.audioPlayerVolume.set(clamped);
    if (this._audioGainNode) {
      this._audioGainNode.gain.value = clamped / 100;
    }
  }

  /** Create a BufferSource from buffer and wire the ended handler. */
  private _createSourceFromBuffer(buffer: AudioBuffer, onended?: () => void): AudioBufferSourceNode {
    if (!this._audioCtx) throw new Error('No AudioContext');
    const gainNode = this._ensureAudioCtx();
    const src = this._audioCtx.createBufferSource();
    src.buffer = buffer;
    src.connect(gainNode);
    src.onended = () => {
      try { onended?.(); } finally { if (this._audioSource === src) this._audioSource = null; }
    };
    return src;
  }

  /** Start playback of an AudioBuffer at optional offset (seconds). */
  private _startAudioBuffer(buffer: AudioBuffer, offset = 0): void {
    if (!this._audioCtx) return;
    try { this._audioSource?.stop(); } catch { /* ignore */ }
    this._audioSource = this._createSourceFromBuffer(buffer, () => {
      this.audioPlaying.set(false);
      this.audioCurrentTime.set(this.audioDuration());
      if (this._audioRaf !== null) { cancelAnimationFrame(this._audioRaf); this._audioRaf = null; }
      this._audioPauseOffset = 0;
    });
    const startAt = Math.max(0, Math.min(offset, buffer.duration));
    this._audioStartTime = this._audioCtx.currentTime - startAt;
    this._audioPauseOffset = startAt;
    this._audioSource.start(0, startAt);
    this.audioDuration.set(buffer.duration);
    this.audioPlaying.set(true);
    this._updateAudioProgressRaf();
  }

  async togglePlayPause(): Promise<void> {
    if (this.audioPlaying()) {
      if (!this._audioCtx) return;
      // Pause
      if (this._audioSource) {
        try {
          const offset = this._audioCtx!.currentTime - this._audioStartTime;
          this._audioPauseOffset = Math.max(0, Math.min(offset, this.audioDuration()));
          this._audioSource.stop();
        } catch { /* ignore */ }
        this._audioSource = null;
      }
      this.audioPlaying.set(false);
      if (this._audioRaf !== null) { cancelAnimationFrame(this._audioRaf); this._audioRaf = null; }
      return;
    }

    // If we don't yet have a managed AudioBuffer, attempt to prepare one from
    // the currently-selected audio bytes. Prefer the audio-editor selection
    // (kPackSnds) then the resource browser selection. Those helper methods
    // will set _lastAudioBuffer on success or fall back to legacy player.
    if (!this._lastAudioBuffer) {
      // Prevent rapid re-entry while a decode is already underway
      if (this.audioDecodeInProgress()) return;
      this.audioDecodeInProgress.set(true);
      try {
        if (this.selectedAudioBytes()) {
          await this.playAudioEntry();
          return;
        }
        if (this.selectedResBytes()) {
          await this.playSndResource();
          return;
        }
        return;
      } finally {
        // Always clear the in-progress flag so the UI doesn't stay disabled
        this.audioDecodeInProgress.set(false);
      }
    }

    // Resume managed playback from pause offset
    const buf = this._lastAudioBuffer;
    if (!buf || !this._audioCtx) return;
    const offset = this._audioPauseOffset || 0;
    try { await this._audioCtx!.resume().catch(() => {}); } catch { /* ignore */ }
    this._startAudioBuffer(buf, offset);
  }

  stopAudio(): void {
    if (this._audioSource) {
      try { this._audioSource.stop(); } catch { /* ignore */ }
      this._audioSource = null;
    }
    this._lastAudioBuffer = null;
    this.audioPlaying.set(false);
    this.audioCurrentTime.set(0);
    this.audioDuration.set(0);
    this._audioPauseOffset = 0;
    if (this._audioRaf !== null) { cancelAnimationFrame(this._audioRaf); this._audioRaf = null; }
  }

  seekAudio(seconds: number): void {
    const buf = this._lastAudioBuffer;
    if (!buf || !this._audioCtx) return;
    const clamped = Math.max(0, Math.min(seconds, buf.duration));
    const wasPlaying = this.audioPlaying();
    if (this._audioSource) {
      try { this._audioSource.stop(); } catch { /* ignore */ }
      this._audioSource = null;
    }
    this._audioPauseOffset = clamped;
    this.audioCurrentTime.set(clamped);
    if (wasPlaying) {
      this._startAudioBuffer(buf, clamped);
    }
  }

  private _updateAudioProgressRaf(): void {
    if (!this._audioCtx) return;
    if (!this.audioPlaying() || !this._lastAudioBuffer) return;
    const now = this._audioCtx.currentTime - this._audioStartTime;
    const cur = Math.max(0, Math.min(now, this.audioDuration()));
    this.audioCurrentTime.set(cur);
    if (this.audioPlaying()) {
      this._audioRaf = requestAnimationFrame(() => this._updateAudioProgressRaf());
    } else {
      this._audioRaf = null;
    }
  }

  /** Play the currently selected 'snd ' resource via the Web Audio API. */
  async playSndResource(): Promise<void> {
    const bytes = this.selectedResBytes();
    if (!bytes) return;
    this._ensureAudioCtx();
    const ctx = this._audioCtx!;
    if (ctx.state === 'suspended') {
      try { await ctx.resume(); } catch { /* ignore */ }
    }
    if (ctx.state === 'suspended') {
      this.snackBar.open('⚠ Click/interact with the page first to allow audio playback.', 'OK', { duration: 4000 });
      return;
    }
    try {
      const info = parseSndHeader(bytes);
      if (info) {
        try {
          // Preferred: create an AudioBuffer and use managed playback where possible.
          // Handle stdSH (8-bit unsigned mono)
          if (info.encode === 0x00) {
            const data = bytes.subarray(info.pcmOffset, info.pcmOffset + info.numFrames);
            const floatBuf = new Float32Array(data.length);
            for (let i = 0; i < data.length; i++) floatBuf[i] = (data[i] - 128) / 128;
            const audioBuffer = ctx.createBuffer(1, floatBuf.length, Math.max(1, Math.round(info.sampleRate)));
            audioBuffer.getChannelData(0).set(floatBuf);
            // Use managed playback: set last buffer and start via helper
            this._lastAudioBuffer = audioBuffer;
            this._startAudioBuffer(audioBuffer, 0);
            return;
          // Handle IMA4 compressed (use decoder)
          } else if (info.encode === 0xFE) {
            const dataStart = info.pcmOffset;
            const pktsAvail = Math.floor((bytes.length - dataStart) / 34);
            if (pktsAvail > 0) {
              const f32 = decodeIMA4(bytes.subarray(dataStart), pktsAvail);
              const audioBuffer = ctx.createBuffer(1, f32.length, Math.max(1, Math.round(info.sampleRate)));
              audioBuffer.getChannelData(0).set(f32);
              this._lastAudioBuffer = audioBuffer;
              this._startAudioBuffer(audioBuffer, 0);
              return;
            }
            // Fallthrough to fallback below
          // Handle extSH (16-bit big-endian, possibly multi-channel)
          } else if (info.encode === 0xFF) {
            const sampleCount = info.numFrames;
            const ch = info.numChannels || 1;
            const audioBuffer = ctx.createBuffer(ch, sampleCount, Math.max(1, Math.round(info.sampleRate)));
            const view = new DataView(bytes.buffer, bytes.byteOffset + info.pcmOffset, bytes.length - info.pcmOffset);
            for (let s = 0; s < sampleCount; s++) {
              for (let c = 0; c < ch; c++) {
                const idx = (s * ch + c) * 2;
                if (idx + 2 > view.byteLength) break;
                const sample = view.getInt16(idx, false); // big-endian
                audioBuffer.getChannelData(c)[s] = sample / 32768.0;
              }
            }
            this._lastAudioBuffer = audioBuffer;
            this._startAudioBuffer(audioBuffer, 0);
            return;
          }
          // Unknown encode – fall through to legacy fallback
        } catch (err) {
          // If any decoding/AudioBuffer creation failed, fall back to legacy player below.
        }
      }

      // Final fallback: legacy one-shot player. Mark that controlled UI is not available.
      this._lastAudioBuffer = null;
      const played = tryPlaySndResource(bytes, ctx);
      if (!played) {
        this.snackBar.open('⚠ Cannot play: compressed or unsupported snd format', 'OK', { duration: 4000 });
      } else {
        this.snackBar.open('Playing using legacy one-shot player — pause/seek unavailable.', 'OK', { duration: 4000 });
      }
      } catch (e) {
        this._lastAudioBuffer = null;
        this.snackBar.open(`⚠ Audio error: ${e instanceof Error ? e.message : String(e)}`, 'OK', { duration: 4000 });
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

  /**
   * Format raw bytes as a hex dump (16 bytes per line, with ASCII sidebar).
   * Used in the resource browser to display unknown resource types.
   */
  getResHexDump(bytes: Uint8Array, maxBytes = 512): string {
    const limit = Math.min(bytes.length, maxBytes);
    const lines: string[] = [];
    for (let i = 0; i < limit; i += 16) {
      const row = bytes.subarray(i, Math.min(i + 16, limit));
      const hex = Array.from(row).map(b => b.toString(16).padStart(2, '0')).join(' ').padEnd(47, ' ');
      const ascii = Array.from(row).map(b => (b >= 32 && b < 127) ? String.fromCharCode(b) : '.').join('');
      lines.push(`${i.toString(16).padStart(4, '0')}  ${hex}  ${ascii}`);
    }
    if (bytes.length > maxBytes) {
      lines.push(`… (${bytes.length - maxBytes} more bytes)`);
    }
    return lines.join('\n');
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
      this.editObjectGroups.set(level.objectGroups.map((g) => ({ resID: g.resID, numObjs: g.numObjs })));
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
      this.scheduleCanvasRedraw();
      if (typeof window !== 'undefined') {
        window.requestAnimationFrame(() => this.scheduleCanvasRedraw());
      }
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

  /** Bridge for PropertiesTabComponent propsInput output. */
  onPropertiesTabInput(e: { field: keyof LevelProperties; event: Event }): void {
    this.onPropsInput(e.field, e.event);
  }

  /** Handle editing of a single objectGroup field (resID or numObjs). */
  onObjGroupInput(index: number, field: 'resID' | 'numObjs', event: Event): void {
    const target = event.target as EventTarget & { value?: string };
    const val = Number.parseInt(target?.value ?? '', 10);
    if (Number.isNaN(val)) return;
    const groups = this.editObjectGroups().slice();
    const existing = groups[index] ?? { resID: 0, numObjs: 0 };
    groups[index] = { ...existing, [field]: val };
    this.editObjectGroups.set(groups);
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
      objectGroups: this.editObjectGroups(),
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
    // Cancel any in-progress barrier draw when an object is selected.
    if (this._barrierDrawing) {
      this._barrierDrawing = false;
      this._barrierDrawPath = [];
    }
    const kc = document.getElementById('konva-container');
    if (kc) kc.style.cursor = 'default';
    this.konva.clearBarrierDrawPreview();
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

  /** Handler for direction input in degrees (converts to radians internally). */
  onObjDirDegInput(value: string | Event): void {
    const deg = typeof value === 'string'
      ? parseFloat(value)
      : parseFloat(((value.target as EventTarget & { value?: string } | null)?.value) ?? '');
    if (Number.isNaN(deg)) return;
    const rad = deg * Math.PI / 180;
    // Normalise to [-π, π] using atan2 of the unit vector – handles all edge cases.
    const wrapped = Math.atan2(Math.sin(rad), Math.cos(rad));
    this.editObjDir.set(wrapped);
    this.applyObjEdit();
  }

  /** Handler for typeRes selection change from the dropdown. */
  onObjTypeResChange(typeRes: number): void {
    this.editObjTypeRes.set(typeRes);
    this.applyObjEdit();
  }

  applyObjEdit(): void {
    const idx = this.selectedObjIndex();
    if (idx === null) return;
    const objs = [...this.objects()];
    if (idx < 0 || idx >= objs.length) return;
    this._pushUndo();
    objs[idx] = {
      x: this.editObjX(),
      y: this.editObjY(),
      dir: this.editObjDir(),
      typeRes: this.editObjTypeRes(),
    };
    this.objects.set(objs);
  }

  addObject(): void {
    this._pushUndo();
    const objs = [...this.objects()];
    objs.push({ x: Math.round(this.canvasPanX()), y: Math.round(this.canvasPanY()), dir: 0, typeRes: 128 });
    this.objects.set(objs);
    this.selectObject(objs.length - 1);
  }

  duplicateSelectedObject(): void {
    const idx = this.selectedObjIndex();
    if (idx === null) return;
    const objs = [...this.objects()];
    if (idx < 0 || idx >= objs.length) return;
    this._pushUndo();
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
    this._pushUndo();
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
      // Check midpoint diamond handles (click to insert between consecutive waypoints)
      const midHitR = Math.max(14, 12 / this.canvasZoom());
      for (let i = 0; i < trackUp.length - 1; i++) {
        const mx = (trackUp[i].x + trackUp[i + 1].x) / 2;
        const my = (trackUp[i].y + trackUp[i + 1].y) / 2;
        if (dist2d(mx, my, wx, wy) < midHitR) {
          this._insertWaypointAfter('up', i);
          return;
        }
      }
      for (let i = 0; i < trackDown.length - 1; i++) {
        const mx = (trackDown[i].x + trackDown[i + 1].x) / 2;
        const my = (trackDown[i].y + trackDown[i + 1].y) / 2;
        if (dist2d(mx, my, wx, wy) < midHitR) {
          this._insertWaypointAfter('down', i);
          return;
        }
      }
    }
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
    // Track waypoint drag — move Konva node directly without signal update for 60fps.
    // The signal is updated on mouseup so undo still works correctly.
    const twp = this.dragTrackWaypoint();
    if (twp) {
      const [wx, wy] = this.canvasToWorld(event.offsetX, event.offsetY);
      const rx = Math.round(wx), ry = Math.round(wy);
      // Store the pending position for commit on mouseup
      this._pendingWaypointDragPos = { x: rx, y: ry };
      // Move Konva node immediately (O(1), no signal/effect/redraw chain)
      this.konva.moveTrackWaypointDirect(twp.track, twp.segIdx, rx, ry);
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
      // Update hover state for track waypoints and segment midpoints.
      // Throttle: only run the detection once per animation frame.
      if (this.showTrackOverlay() && !this._hoverRafPending) {
        this._hoverRafPending = true;
        const evX = event.offsetX, evY = event.offsetY;
        window.requestAnimationFrame(() => {
          this._hoverRafPending = false;
          const [wx, wy] = this.canvasToWorld(evX, evY);
          const trackHitR = Math.max(12, 10 / this.canvasZoom());
          // Check waypoint nodes first
          let found: TrackWaypointRef | null = null;
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
          // Check midpoints (only when not hovering a waypoint node)
          let foundMid: TrackMidpointRef | null = null;
          if (!found) {
            const midHitR = Math.max(14, 12 / this.canvasZoom());
            const upSegs = this.editTrackUp();
            for (let i = 0; i < upSegs.length - 1 && !foundMid; i++) {
              const mx = (upSegs[i].x + upSegs[i + 1].x) / 2;
              const my = (upSegs[i].y + upSegs[i + 1].y) / 2;
              if (dist2d(mx, my, wx, wy) < midHitR) foundMid = { track: 'up', segIdx: i };
            }
            const downSegs = this.editTrackDown();
            for (let i = 0; i < downSegs.length - 1 && !foundMid; i++) {
              const mx = (downSegs[i].x + downSegs[i + 1].x) / 2;
              const my = (downSegs[i].y + downSegs[i + 1].y) / 2;
              if (dist2d(mx, my, wx, wy) < midHitR) foundMid = { track: 'down', segIdx: i };
            }
          }
          const prevMid = this.hoverTrackMidpoint();
          if (foundMid?.track !== prevMid?.track || foundMid?.segIdx !== prevMid?.segIdx) {
            this.hoverTrackMidpoint.set(foundMid);
          }
        });
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
    // Finish track waypoint drag – commit the pending position to the signal
    if (this.dragTrackWaypoint()) {
      const twp = this.dragTrackWaypoint()!;
      const pos = this._pendingWaypointDragPos;
      if (pos) {
        if (twp.track === 'up') {
          const arr = [...this.editTrackUp()];
          arr[twp.segIdx] = { ...arr[twp.segIdx], x: pos.x, y: pos.y };
          this.editTrackUp.set(arr);
        } else {
          const arr = [...this.editTrackDown()];
          arr[twp.segIdx] = { ...arr[twp.segIdx], x: pos.x, y: pos.y };
          this.editTrackDown.set(arr);
        }
        this._pendingWaypointDragPos = null;
      }
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
    if (this.markCreateMode() || this.drawMode() !== 'none') return;
    const [wx, wy] = this.canvasToWorld(event.offsetX, event.offsetY);
    const objs = [...this.objects()];
    objs.push({ x: Math.round(wx), y: Math.round(wy), dir: 0, typeRes: 128 });
    this.objects.set(objs);
    this.selectObject(objs.length - 1);
  }

  /**
   * Right-click on the canvas:
   *  - When track overlay visible, right-click near an existing waypoint removes it.
   /**
   * Right-click on the canvas:
   *  - When track overlay visible, right-click near an existing waypoint removes it.
   *  - Right-click away from waypoints inserts a new waypoint between the two closest
   *    consecutive waypoints in the nearest track (preserves path shape).
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

    // 2. Insert new waypoint between the two closest consecutive waypoints
    const level = this.selectedLevel();
    if (!level) return;

    // Find nearest segment distance for each track
    let nearestSegDistUp = Infinity;
    for (let i = 0; i < trackUp.length - 1; i++) {
      const d = distToSegment2d(wx, wy, trackUp[i].x, trackUp[i].y, trackUp[i + 1].x, trackUp[i + 1].y);
      if (d < nearestSegDistUp) nearestSegDistUp = d;
    }
    if (trackUp.length === 1) nearestSegDistUp = dist2d(trackUp[0].x, trackUp[0].y, wx, wy);

    let nearestSegDistDown = Infinity;
    for (let i = 0; i < trackDown.length - 1; i++) {
      const d = distToSegment2d(wx, wy, trackDown[i].x, trackDown[i].y, trackDown[i + 1].x, trackDown[i + 1].y);
      if (d < nearestSegDistDown) nearestSegDistDown = d;
    }
    if (trackDown.length === 1) nearestSegDistDown = dist2d(trackDown[0].x, trackDown[0].y, wx, wy);

    if (nearestSegDistUp <= nearestSegDistDown || trackDown.length === 0) {
      this.editTrackUp.set(insertBetweenClosestSegment(trackUp, wx, wy));
    } else {
      this.editTrackDown.set(insertBetweenClosestSegment(trackDown, wx, wy));
    }
    this._roadOffscreenKey = '';
  }

  private _insertWaypointAfter(track: 'up' | 'down', segIdx: number): void {
    const source = track === 'up' ? this.editTrackUp() : this.editTrackDown();
    if (segIdx < 0 || segIdx >= source.length - 1) return;
    const cur = source[segIdx];
    const next = source[segIdx + 1];
    const inserted = {
      x: Math.round((cur.x + next.x) / 2),
      y: Math.round((cur.y + next.y) / 2),
      flags: 0,
      velo: 0,
    };
    this._pushUndo();
    const copy = [...source];
    copy.splice(segIdx + 1, 0, inserted);
    if (track === 'up') this.editTrackUp.set(copy);
    else this.editTrackDown.set(copy);
    this.hoverTrackMidpoint.set(null);
    this._roadOffscreenKey = '';
    this.snackBar.open(`Inserted ${track} waypoint at midpoint.`, undefined, { duration: 1500 });
  }

  onCanvasKeyDown(event: KeyboardEvent): void {
    if (event.key === ' ') {
      this.spaceDown.set(true);
      this.konva.setPanMode(true);
      // Update cursor on the Konva container
      const kc = document.getElementById('konva-container');
      if (kc) kc.style.cursor = 'grab';
      event.preventDefault(); // prevent page scroll
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && !event.shiftKey) {
      event.preventDefault();
      this.undo();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && (event.key.toLowerCase() === 'y' || (event.key.toLowerCase() === 'z' && event.shiftKey))) {
      event.preventDefault();
      this.redo();
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
    // Mark-segment nub helpers (only when showMarks is active)
    if (this.showMarks()) {
      // N = Toggle join/split: auto-detects if colocated nubs exist (splits) or joins nearest nubs
      if (event.key === 'n' && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        if (this._hasColocatedNubs()) {
          this._splitCollocatedMarkNubs();
        } else {
          this._joinAdjacentMarkNubs();
        }
        return;
      }
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
      this.konva.setPanMode(false);
      // Restore cursor based on current draw mode
      const kc = document.getElementById('konva-container');
      if (kc) kc.style.cursor = this.drawMode() !== 'none' ? 'crosshair' : 'default';
      if (this._isPanning) {
        this._isPanning = false;
        this.isPanning.set(false);
      }
    }
  }

  onCanvasWheel(event: WheelEvent): void {
    event.preventDefault();
    const oldZoom = this.canvasZoom();

    // Normalise deltaY: WheelEvent.deltaMode can be pixels (0), lines (1), or pages (2).
    // A mouse-wheel notch produces deltaY ≈ 120 in line mode (deltaMode=1).
    // Touchpads fire pixel mode (deltaMode=0) with small values (2-10 per event).
    // Dividing by 4 converts pixel-mode deltas to roughly line-mode scale
    // (typical touchpad scroll: 480px = ~120 lines → divide by 4).
    let delta = event.deltaY;
    if (event.deltaMode === WheelEvent.DOM_DELTA_PIXEL) {
      delta = delta / 4; // ~120 "line units" per 480px of scrolling
    } else if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
      delta = delta * 120;
    }
    const factor  = 1 - delta * 0.001;
    const newZoom = Math.min(10, Math.max(0.1, oldZoom * factor));
    if (Math.abs(newZoom - oldZoom) < 1e-6) return;

    // Zoom toward the cursor position: the world point under the cursor
    // stays at the same screen position after zoom.
    const [wx, wy] = this.canvasToWorld(event.offsetX, event.offsetY);
    const scale    = this.getCanvasScale();
    const canvas   = document.getElementById('object-canvas') as HTMLCanvasElement | null;
    const W = canvas?.width  ?? 900;
    const H = canvas?.height ?? 700;
    const lx = event.offsetX * scale;
    const ly = event.offsetY * scale;
    // New pan so that (wx, wy) stays at canvas pixel (lx, ly):
    //   lx = (wx - panX') * newZoom + W/2  →  panX' = wx - (lx - W/2) / newZoom
    //   ly = -(wy - panY') * newZoom + H/2 →  panY' = wy + (ly - H/2) / newZoom
    const newPanX = wx - (lx - W / 2) / newZoom;
    const newPanY = wy + (ly - H / 2) / newZoom;

    this.canvasZoom.set(newZoom);
    this.canvasPanX.set(newPanX);
    this.canvasPanY.set(newPanY);
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
    if (this.showGrid()) {
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
    }

    if (level && this.showRoad()) {
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
    if (level && this.showMarks()) {
      this.drawMarksOnCanvas(ctx);
    }

    // Draw marking preview (blue dashed) when generating
    const preview = this.markingPreview();
    if (preview.length > 0) {
      ctx.save();
      ctx.strokeStyle = 'rgba(66,165,245,0.85)';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 3]);
      for (const m of preview) {
        const [x1, y1] = this.worldToCanvas(m.x1, m.y1);
        const [x2, y2] = this.worldToCanvas(m.x2, m.y2);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.restore();
    }

    // Draw barriers (road boundaries)
    if (level && this.showBarriers() && level.roadSegs.length > 0) {
      // Build a cache key: sample ~20 evenly-spaced segments plus zoom and quantised panY.
      // PanY is quantised to 8 world units to avoid rebuilding on every scroll pixel;
      // the BARRIER_CULL_MARGIN is large enough that 8-unit granularity is imperceptible.
      const segs = level.roadSegs;
      const N    = Math.max(1, Math.floor(segs.length / 20));
      const panYQ = Math.round(panY / 8) * 8;
      let barrierKey = `${segs.length}:${zoom.toFixed(2)}:${panYQ}`;
      for (let ki = 0; ki < segs.length; ki += N) {
        const s = segs[ki];
        barrierKey += `:${s.v0},${s.v1},${s.v2},${s.v3}`;
      }
      if (barrierKey !== this._lastBarriersSerialized) {
        this._lastBarriersSerialized = barrierKey;
        this.konva.setBarriers(segs, zoom, panY);
      }
    } else {
      if (this._lastBarriersSerialized !== '') {
        this._lastBarriersSerialized = '';
        this.konva.clearBarriers();
      }
    }

    // Draw objects
    const baseRadius = Math.min(20, Math.max(5, 8 * zoom));
    const labelFont = `${Math.max(9, 10 * zoom)}px monospace`;
    // When Konva is initialized it renders the same sprite images on top of the main canvas,
    // so we skip the ctx.drawImage() / arc() fills here to avoid redundant GPU work.
    // We still draw direction arrows, bounding-box outlines, labels, and selection rings
    // since those are NOT rendered by the Konva overlay.
    const konvaRendersSprites = this._konvaInitialized;
    const objsVisible = this.showObjects();
    for (let i = 0; i < objs.length; i++) {
      const obj = objs[i];
      const typeIdx = ((obj.typeRes % OBJ_PALETTE.length) + OBJ_PALETTE.length) % OBJ_PALETTE.length;
      const isFilteredOut = !visibleTypes.has(typeIdx) || !objsVisible;
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
          ctx.rotate(worldDirToCanvasRotationRad(obj.dir));
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
      const arrow = worldDirToCanvasForwardVector(obj.dir, arrowLen);
      ctx.lineTo(cx + arrow.dx, cy + arrow.dy);
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
    // Pass empty objects array when objects visibility is off
    const konvaObjs = this.showObjects() ? objs : [];
    this.konva.setObjects(konvaObjs, selIdx, visibleTypes, OBJ_PALETTE, getImgForType, zoom, panX, panY);

    // Update Konva track layer – respect showTrackUp / showTrackDown
    if (level && this.showTrackOverlay()) {
      const up   = this.showTrackUp()   ? this.editTrackUp()   as {x:number,y:number}[] : [];
      const down = this.showTrackDown() ? this.editTrackDown() as {x:number,y:number}[] : [];
      this.konva.setTrackWaypoints(up, down, zoom, panX, panY);
    } else {
      this.konva.clearTrackWaypoints();
    }

    // Update Konva marks layer – draggable endpoint handles
    if (level && this.showMarks()) {
      this.konva.setMarks(this.marks(), this.selectedMarkIndex(), zoom, panX, panY);
    } else {
      this.konva.clearMarks();
    }

    // ── SYNCHRONOUS flush ──────────────────────────────────────────────────
    // Draw all Konva layers NOW, in the same requestAnimationFrame callback
    // as the road canvas above.  This keeps both canvases in the same
    // compositor frame and eliminates the one-frame "objects trail behind
    // background" effect.
    this.konva.flush();
  }

  // ---- Mark segment editor ----

  addMark(): void {
    const ms = [...this.marks()];
    ms.push({ x1: -100, y1: 0, x2: 100, y2: 0 });
    this.marks.set(ms);
    this.selectedMarkIndex.set(ms.length - 1);
    this.scheduleMarkAutoSave();
  }

  startMarkCreateMode(): void {
    this.drawMode.set('none');
    this.markCreateMode.set(true);
    this._pendingMarkPoints = [];
    this.pendingMarkPointCount.set(0);
    this._markCreateHoverPoint = null;
    this.snackBar.open('Click points on the canvas to chain new markings. Click Confirm when done.', undefined, { duration: 2500 });
  }

  confirmMarkCreateMode(): void {
    this.markCreateMode.set(false);
    this._pendingMarkPoints = [];
    this.pendingMarkPointCount.set(0);
    this._markCreateHoverPoint = null;
    this.scheduleCanvasRedraw();
  }

  generateSideRoadMarks(roadSelection: MarkingRoadSelection, yStart: number, yEnd: number, inset: number): void {
    const level = this.selectedLevel();
    if (!level) return;
    const generated = generateSideMarkings(level.roadSegs, { roadSelection, yStart, yEnd, inset });
    this._appendGeneratedMarks(generated, 'side road');
  }

  generateCentreRoadMarks(roadSelection: MarkingRoadSelection, yStart: number, yEnd: number, dashFrequency: number): void {
    const level = this.selectedLevel();
    if (!level) return;
    const generated = generateCentreDashMarkings(level.roadSegs, { roadSelection, yStart, yEnd, dashFrequency });
    this._appendGeneratedMarks(generated, 'centre dashed');
  }

  previewSideRoadMarks(roadSelection: MarkingRoadSelection, yStart: number, yEnd: number, inset: number): void {
    const level = this.selectedLevel();
    if (!level) return;
    const generated = generateSideMarkings(level.roadSegs, { roadSelection, yStart, yEnd, inset });
    this.markingPreview.set(generated);
  }

  previewCentreRoadMarks(roadSelection: MarkingRoadSelection, yStart: number, yEnd: number, dashFrequency: number): void {
    const level = this.selectedLevel();
    if (!level) return;
    const generated = generateCentreDashMarkings(level.roadSegs, { roadSelection, yStart, yEnd, dashFrequency });
    this.markingPreview.set(generated);
  }

  removeSelectedMark(): void {
    const idx = this.selectedMarkIndex();
    if (idx === null) return;
    const ms = this.marks().filter((_, i) => i !== idx);
    this.marks.set(ms);
    this.selectedMarkIndex.set(ms.length > 0 ? Math.min(idx, ms.length - 1) : null);
    this.scheduleMarkAutoSave();
  }

  private _appendGeneratedMarks(generated: MarkSeg[], label: string): void {
    if (generated.length === 0) {
      this.snackBar.open(`No ${label} markings were generated for that range.`, undefined, { duration: 2000 });
      return;
    }
    this._pushUndo();
    const marks = [...this.marks(), ...generated];
    this.marks.set(marks);
    this.selectedMarkIndex.set(marks.length - 1);
    this.snackBar.open(`Added ${generated.length} ${label} marking segments.`, undefined, { duration: 2200 });
    this.scheduleMarkAutoSave();
  }

  private _addMarkCreatePoint(x: number, y: number): void {
    const last = this._pendingMarkPoints[this._pendingMarkPoints.length - 1];
    if (last) {
      this._pushUndo();
      const marks = [...this.marks(), { x1: last.x, y1: last.y, x2: x, y2: y }];
      this.marks.set(marks);
      this.selectedMarkIndex.set(marks.length - 1);
      this.scheduleMarkAutoSave();
    }
    this._pendingMarkPoints.push({ x, y });
    this.pendingMarkPointCount.set(this._pendingMarkPoints.length);
    this._markCreateHoverPoint = { x, y };
    this.scheduleCanvasRedraw();
  }

  /** Returns true if the selected mark has any endpoint colocated with another mark endpoint. */
  private _hasColocatedNubs(): boolean {
    const selIdx = this.selectedMarkIndex();
    if (selIdx === null) return false;
    const ms = this.marks();
    const sel = ms[selIdx];
    if (!sel) return false;
    for (let i = 0; i < ms.length; i++) {
      if (i === selIdx) continue;
      const other = ms[i];
      if (
        (other.x1 === sel.x1 && other.y1 === sel.y1) ||
        (other.x2 === sel.x1 && other.y2 === sel.y1) ||
        (other.x1 === sel.x2 && other.y1 === sel.y2) ||
        (other.x2 === sel.x2 && other.y2 === sel.y2)
      ) return true;
    }
    return false;
  }

  /**
   * Split colocated mark endpoints: for each endpoint of the selected mark that is
   * shared with another mark's endpoint, nudge the other endpoint(s) slightly so they
   * can be dragged independently. Press [S] to activate.
   */
  private _splitCollocatedMarkNubs(): void {
    const selIdx = this.selectedMarkIndex();
    if (selIdx === null) return;
    const ms = [...this.marks()];
    const sel = ms[selIdx];
    if (!sel) return;
    this._pushUndo();
    // Nudge offset (1 world unit) so they visually separate
    const NUDGE = 1;
    for (const ep of ['p1', 'p2'] as const) {
      const ox = ep === 'p1' ? sel.x1 : sel.x2;
      const oy = ep === 'p1' ? sel.y1 : sel.y2;
      let nudged = false;
      for (let i = 0; i < ms.length; i++) {
        if (i === selIdx) continue;
        if (ms[i].x1 === ox && ms[i].y1 === oy) {
          ms[i] = { ...ms[i], x1: ox + NUDGE, y1: oy + NUDGE };
          nudged = true;
        }
        if (ms[i].x2 === ox && ms[i].y2 === oy) {
          ms[i] = { ...ms[i], x2: ox + NUDGE, y2: oy + NUDGE };
          nudged = true;
        }
      }
      if (!nudged) {
        this.snackBar.open(`No colocated nubs found at ${ep}.`, undefined, { duration: 2000 });
      }
    }
    this.marks.set(ms);
    this.scheduleMarkAutoSave();
  }

  /**
   * Join adjacent mark endpoints: snap the closest endpoint from a DIFFERENT mark
   * to the last-dragged (or selected mark's first) endpoint within SNAP_R world units.
   */
  private _joinAdjacentMarkNubs(): void {
    const ms = [...this.marks()];
    if (ms.length < 2) return;
    const SNAP_R = 30; // world units

    // Determine source endpoint (last dragged, else any endpoint of selected mark)
    const selIdx = this.selectedMarkIndex();
    let srcX: number, srcY: number, srcI: number;
    if (this._lastDraggedNubKey && this._lastDraggedNubKey.markIdx < ms.length) {
      const { markIdx, endpoint } = this._lastDraggedNubKey;
      srcI = markIdx;
      srcX = endpoint === 'p1' ? ms[markIdx].x1 : ms[markIdx].x2;
      srcY = endpoint === 'p1' ? ms[markIdx].y1 : ms[markIdx].y2;
    } else if (selIdx !== null && selIdx < ms.length) {
      srcI = selIdx;
      srcX = ms[selIdx].x1;
      srcY = ms[selIdx].y1;
    } else {
      this.snackBar.open('Select a mark first.', undefined, { duration: 2000 });
      return;
    }

    let bestDist = SNAP_R;
    let bestJ = -1;
    let bestJEpX: 'x1' | 'x2' = 'x1';

    for (let j = 0; j < ms.length; j++) {
      if (j === srcI) continue;
      for (const epX of ['x1', 'x2'] as const) {
        const epY = epX === 'x1' ? 'y1' as const : 'y2' as const;
        const dx = srcX - ms[j][epX]; const dy = srcY - ms[j][epY];
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > 0 && d < bestDist) {
          bestDist = d;
          bestJ = j;
          bestJEpX = epX;
        }
      }
    }

    if (bestJ < 0) {
      this.snackBar.open('No nearby mark endpoints to join (within 30 world units).', undefined, { duration: 2500 });
      return;
    }
    this._pushUndo();
    const bestJEpY = bestJEpX === 'x1' ? 'y1' as const : 'y2' as const;
    ms[bestJ] = { ...ms[bestJ], [bestJEpX]: srcX, [bestJEpY]: srcY };
    this.marks.set(ms);
    this.snackBar.open('Joined nearest mark endpoints.', undefined, { duration: 2000 });
    this.scheduleMarkAutoSave();
  }

  /** Valid field names: 'x1' | 'y1' | 'x2' | 'y2' */
  onMarkFieldInput(markIdx: number, field: 'x1' | 'y1' | 'x2' | 'y2', event: Event): void {
    const target = event.target as EventTarget & { value?: string };
    const val = Number.parseInt(target?.value ?? '', 10);
    if (Number.isNaN(val)) return;
    const ms = [...this.marks()];
    ms[markIdx] = { ...ms[markIdx], [field]: val };
    this.marks.set(ms);
    this.scheduleMarkAutoSave();
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
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Save failed';
      this.editorError.set(msg);
    } finally {
      this.workerBusy.set(false);
    }
  }

  /** Debounce auto-save for marks: fires 800 ms after the last mark mutation. */
  private scheduleMarkAutoSave(): void {
    if (this._markAutoSaveTimer !== null) clearTimeout(this._markAutoSaveTimer);
    this._markAutoSaveTimer = setTimeout(() => {
      this._markAutoSaveTimer = null;
      if (!this.workerBusy()) this.saveMarks();
    }, 800);
  }

  private _handleCurveDrawClick(wx: number, wy: number): void {
    if (!this._curveStartPoint) {
      this._curveStartPoint = { wx, wy };
      this._curveEndPoint = null;
      this.konva.setBarrierDrawPreview([wx, -wy]);
      this.konva.flush();
      this.snackBar.open('Curve start set. Click the curve end point next.', undefined, { duration: 1500 });
      return;
    }
    if (!this._curveEndPoint) {
      this._curveEndPoint = { wx, wy };
      this._updateCurvePreview(wx, wy);
      this.snackBar.open('Curve end set. Move to adjust the bend, then click again to apply.', undefined, { duration: 1800 });
      return;
    }

    const points = sampleQuadraticBezier(
      { x: this._curveStartPoint.wx, y: this._curveStartPoint.wy },
      { x: wx, y: wy },
      { x: this._curveEndPoint.wx, y: this._curveEndPoint.wy },
    );
    this._barrierDrawPath = points.map((point) => ({ wx: point.x, wy: point.y }));
    this._applyBarrierDrawPath();
    this._curveStartPoint = null;
    this._curveEndPoint = null;
    this.konva.clearBarrierDrawPreview();
  }

  private _updateCurvePreview(wx: number, wy: number): void {
    if (!this._curveStartPoint) return;
    if (!this._curveEndPoint) {
      this.konva.setBarrierDrawPreview([this._curveStartPoint.wx, -this._curveStartPoint.wy, wx, -wy]);
      this.konva.flush();
      return;
    }
    const preview = sampleQuadraticBezier(
      { x: this._curveStartPoint.wx, y: this._curveStartPoint.wy },
      { x: wx, y: wy },
      { x: this._curveEndPoint.wx, y: this._curveEndPoint.wy },
      24,
    );
    const pts: number[] = [];
    for (const point of preview) pts.push(point.x, -point.y);
    this.konva.setBarrierDrawPreview(pts);
    this.konva.flush();
  }

  /**
   * Apply the current barrier draw path to road segments.
   *
   * For each road segment whose Y position falls within the Y range covered by
   * the drawn path, the barrier value for the selected side (v0/v1/v2/v3) is
   * set to the X value of the drawn path at that segment's Y position.
   *
   * The drawn path is a sequence of world-space {wx, wy} points collected during
   * the mouse gesture.  We linearly interpolate between consecutive points to
   * compute the exact x at each segment's y.
   */
  private _applyBarrierDrawPath(): void {
    const path = this._barrierDrawPath;
    this._barrierDrawPath = [];
    if (path.length < 2) return;
    const level = this.selectedLevel();
    if (!level || level.roadSegs.length === 0) return;

    const side = this.barrierDrawSide();

    // Build a lookup: for each Y in the path, what's the X?
    // Sort path by wy so we can binary-search.
    const sorted = [...path].sort((a, b) => a.wy - b.wy);
    const minWy = sorted[0].wy;
    const maxWy = sorted[sorted.length - 1].wy;

    /**
     * Linear-interpolate the X of the drawn path at a given worldY.
     * Uses the sorted array and finds the two surrounding points.
     */
    const xAtY = (wy: number): number => {
      if (wy <= sorted[0].wy)    return sorted[0].wx;
      if (wy >= sorted[sorted.length - 1].wy) return sorted[sorted.length - 1].wx;
      let lo = 0, hi = sorted.length - 1;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (sorted[mid].wy < wy) lo = mid; else hi = mid;
      }
      const t = (wy - sorted[lo].wy) / (sorted[hi].wy - sorted[lo].wy);
      return sorted[lo].wx + t * (sorted[hi].wx - sorted[lo].wx);
    };

    this._pushUndo();
    const segs = level.roadSegs.map((seg, i) => {
      const segWy = i * 2;  // world Y of segment i
      if (segWy < minWy || segWy > maxWy) return seg;
      const newX = Math.round(xAtY(segWy));
      return clampBarrierPoint(seg as RoadSeg, side, newX);
    });

    this.parsedLevels.update((levels) =>
      levels.map((l) => l.resourceId === level.resourceId ? { ...l, roadSegs: segs } : l)
    );
    this._lastBarriersSerialized = '';
    this._roadOffscreenKey = '';
    this.roadSegsVersion.update((v) => v + 1);
    this.scheduleCanvasRedraw();
    this.snackBar.open(`✓ Barrier draw applied to ${side}.`, undefined, { duration: 1500 });
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
      if (!this.markCreateMode() || this._pendingMarkPoints.length === 0) return;
    }

    const boundsSource = ms.length > 0
      ? ms
      : [{ x1: this._pendingMarkPoints[0].x, y1: this._pendingMarkPoints[0].y, x2: this._pendingMarkPoints[0].x, y2: this._pendingMarkPoints[0].y }];
    const { minX, minY, rangeX, rangeY } = this.markBounds(boundsSource);

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

    if (this.markCreateMode() && this._pendingMarkPoints.length > 0) {
      const last = this._pendingMarkPoints[this._pendingMarkPoints.length - 1];
      const [lx, ly] = toC(last.x, last.y);
      ctx.fillStyle = '#00e5ff';
      ctx.beginPath();
      ctx.arc(lx, ly, 6, 0, Math.PI * 2);
      ctx.fill();
      if (this._markCreateHoverPoint) {
        const [hx, hy] = toC(this._markCreateHoverPoint.x, this._markCreateHoverPoint.y);
        ctx.strokeStyle = 'rgba(0, 229, 255, 0.7)';
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(lx, ly);
        ctx.lineTo(hx, hy);
        ctx.stroke();
        ctx.setLineDash([]);
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
      this.availableTypeIds.set([...this.objectTypeDefinitions.keys()].sort((a, b) => a - b));

      // Clear previews — fresh ones will arrive shortly from DECODE_SPRITE_PREVIEWS
      this.objectSpritePreviews.clear();
      this._spritePreviewDataUrls.clear();

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
      // Populate audio tab entries.
      void this.loadAudioEntries();
      // Populate screens/HUD icon entries.
      void this.loadIconEntries();
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
        this._spritePreviewDataUrls.delete(typeRes);
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
   * Also decodes ALL tiles for the Tiles tab viewer.
   */
  private async decodeRoadTexturesInBackground(): Promise<void> {
    try {
      type RoadTexResult = {
        roadInfoArr: [number, RoadInfoData][];
        textures: { texId: number; width: number; height: number; pixels: ArrayBuffer }[];
      };
      type AllTilesResult = {
        textures: { texId: number; width: number; height: number; pixels: ArrayBuffer }[];
      };

      // Run both requests in parallel.
      const [result, allTilesResult] = await Promise.all([
        this.dispatchWorker<RoadTexResult>('DECODE_ROAD_TEXTURES'),
        this.dispatchWorker<AllTilesResult>('DECODE_ALL_ROAD_TEXTURES'),
      ]);

      // Rebuild road info map
      this.roadInfoDataMap.clear();
      for (const [id, ri] of result.roadInfoArr) {
        this.roadInfoDataMap.set(id, ri);
      }

      // Helper: build canvas from decoded texture
      const buildCanvas = (texId: number, width: number, height: number, pixels: ArrayBuffer): HTMLCanvasElement | null => {
        const clamped = new Uint8ClampedArray(pixels);
        const tc = document.createElement('canvas');
        tc.width = width;
        tc.height = height;
        const tctx = tc.getContext('2d');
        if (!tctx) return null;
        tctx.putImageData(new ImageData(clamped, width, height), 0, 0);
        return tc;
      };

      // Store road-rendering textures (subset needed for road preview patterns)
      for (const { texId, width, height, pixels } of result.textures) {
        const tc = buildCanvas(texId, width, height, pixels);
        if (tc) this.roadTextureCanvases.set(texId, tc);
      }

      // Store ALL tiles (superset) and populate tile viewer entries
      const tileEntries: { texId: number; width: number; height: number }[] = [];
      for (const { texId, width, height, pixels } of allTilesResult.textures) {
        const tc = buildCanvas(texId, width, height, pixels);
        if (tc) this.roadTextureCanvases.set(texId, tc);
        tileEntries.push({ texId, width, height });
      }
      // If all-tiles returned nothing, fall back to the road-info subset
      if (tileEntries.length === 0) {
        for (const { texId, width, height } of result.textures) {
          tileEntries.push({ texId, width, height });
        }
      }
      this.tileTileEntries.set(tileEntries);
      // Bump version to trigger canvas redraw with real textures
      this.roadTexturesVersion.update((v) => v + 1);
      this._roadOffscreenKey = '';
      this.scheduleCanvasRedraw();
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

  /** Return a data URL for a road texture tile by its texId. */
  getTileDataUrl(texId: number): string | null {
    const canvas = this.roadTextureCanvases.get(texId) ?? null;
    if (!canvas) return null;
    try { return canvas.toDataURL(); } catch { return null; }
  }

  /** Return "WxH px" label for a tile by texId, or '?' if not found. */
  getTileDimensions(texId: number): string {
    const entry = this.tileTileEntries().find((t) => t.texId === texId);
    if (!entry) return '?';
    return `${entry.width}×${entry.height} px`;
  }

  // ---- Tile editor (reuses SpriteEditorComponent) ----

  /** Decoded tile frame data cached for the editor, keyed by texId. */
  private tileDecodedFrames = new Map<number, DecodedSpriteFrame>();

  /** Open the pixel editor for a kPackTx16 tile. */
  openTileEditor(texId: number): void {
    const canvas = this.roadTextureCanvases.get(texId);
    const entry = this.tileTileEntries().find((t) => t.texId === texId);
    if (!canvas || !entry) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const imageData = ctx.getImageData(0, 0, entry.width, entry.height);
    const pixels = new Uint8ClampedArray(imageData.data);
    const frame: DecodedSpriteFrame = {
      frameId: texId,
      width: entry.width,
      height: entry.height,
      pixels,
      bitDepth: 16,
    };
    this.tileDecodedFrames.set(texId, frame);
    this._editingTileId = texId; // mark that we're editing a tile
    this.spriteEditorFrame.set({ ...frame, pixels: pixels.slice() as Uint8ClampedArray });
    this.spriteEditorOpen.set(true);
  }

  /** Export a tile canvas as a PNG download. */
  exportTilePng(texId: number): void {
    const canvas = this.roadTextureCanvases.get(texId);
    if (!canvas) return;
    try {
      const url = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url;
      a.download = `tile-${texId}.png`;
      a.click();
    } catch { /* security error */ }
  }

  /** Handle PNG file upload to replace a kPackTx16 tile. */
  async onTilePngUpload(event: Event, texId: number): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    input.value = '';
    const entry = this.tileTileEntries().find((t) => t.texId === texId);
    if (!entry) { this.editorError.set('Tile not found'); return; }
    try {
      const url = URL.createObjectURL(file);
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = reject;
        i.src = url;
      });
      URL.revokeObjectURL(url);
      const offscreen = document.createElement('canvas');
      offscreen.width  = entry.width;
      offscreen.height = entry.height;
      const ctx = offscreen.getContext('2d')!;
      ctx.drawImage(img, 0, 0, entry.width, entry.height);
      const imageData = ctx.getImageData(0, 0, entry.width, entry.height);
      await this._applyTilePixels(texId, new Uint8ClampedArray(imageData.data));
    } catch (err) {
      this.editorError.set(err instanceof Error ? err.message : 'Tile PNG upload failed');
    }
  }

  /** Handle save from the sprite pixel editor when editing a tile. */
  async onTileEditorSaved(event: { frameId: number; pixels: Uint8ClampedArray }): Promise<void> {
    this.spriteEditorOpen.set(false);
    await this._applyTilePixels(event.frameId, event.pixels);
  }

  private async _applyTilePixels(texId: number, pixels: Uint8ClampedArray): Promise<void> {
    try {
      this.workerBusy.set(true);
      await this.dispatchWorker<Record<string, never>>('APPLY_TILE16_PIXELS', { texId, pixels });
      // Re-decode ALL road textures so the canvas and tile grid refresh.
      await this.decodeRoadTexturesInBackground();
      this.resourcesStatus.set(`Tile #${texId} replaced.`);
    } catch (err) {
      this.editorError.set(err instanceof Error ? err.message : 'Tile save failed');
    } finally {
      this.workerBusy.set(false);
    }
  }

  // ---- Audio editor ----

  /** All kPackSnds entries: { id, sizeBytes, durationMs? } */
  audioEntries = signal<{ id: number; sizeBytes: number; durationMs?: number }[]>([]);
  /** Currently selected audio entry ID for the audio editor. */
  selectedAudioId = signal<number | null>(null);
  /** Raw bytes of the selected audio resource (for playback/export/preview). */
  selectedAudioBytes = signal<Uint8Array | null>(null);
  /** Parsed snd metadata for the currently selected audio entry. */
  readonly selectedAudioSndInfo = computed<SndInfo | null>(() => {
    const bytes = this.selectedAudioBytes();
    if (!bytes || bytes.length < 4) return null;
    return parseSndHeader(bytes);
  });

  /** Load the list of all kPackSnds entries from the worker, then populate durations. */
  async loadAudioEntries(): Promise<void> {
    try {
      type EntriesResult = { entries: { id: number; size: number }[] | null };
      const result = await this.dispatchWorker<EntriesResult>('LIST_PACK_ENTRIES', { packId: 134 });
      const entries = result.entries ?? [];
      // Initial list without duration
      this.audioEntries.set(entries.map((e) => ({ id: e.id, sizeBytes: e.size })));
      if (entries.length > 0 && this.selectedAudioId() === null) {
        this.selectedAudioId.set(entries[0].id);
        await this.loadSelectedAudioBytes(entries[0].id);
      }
      // Populate durations in background — load bytes for each entry and parse header
      void this._loadAudioDurations(entries.map((e) => e.id));
    } catch { /* non-fatal */ }
  }

  /** Load bytes for each audio entry and compute duration from the snd header. */
  private async _loadAudioDurations(ids: number[]): Promise<void> {
    type RawResult = { bytes: ArrayBuffer | null };
    for (const id of ids) {
      try {
        const result = await this.dispatchWorker<RawResult>('GET_PACK_ENTRY_RAW', { packId: 134, entryId: id });
        if (!result.bytes) continue;
        const info = parseSndHeader(new Uint8Array(result.bytes));
        if (!info || info.sampleRate <= 0) continue;
        const durationMs = (info.numFrames / info.sampleRate) * 1000;
        // Patch the durationMs into the matching entry
        this.audioEntries.update((prev) =>
          prev.map((e) => e.id === id ? { ...e, durationMs } : e),
        );
      } catch { /* ignore individual failures */ }
    }
  }

  async selectAudioEntry(id: number): Promise<void> {
    this.selectedAudioId.set(id);
    // Stop any current playback and clear the cached buffer so the next play
    // decodes the newly selected sound, not the previous one.
    this.stopAudio();
    this._lastAudioBuffer = null;
    this.audioCurrentTime.set(0);
    this.audioDuration.set(0);
    await this.loadSelectedAudioBytes(id);
  }

  private async loadSelectedAudioBytes(id: number): Promise<void> {
    try {
      type RawResult = { bytes: ArrayBuffer | null };
      const result = await this.dispatchWorker<RawResult>('GET_PACK_ENTRY_RAW', { packId: 134, entryId: id });
      this.selectedAudioBytes.set(result.bytes ? new Uint8Array(result.bytes) : null);
    } catch { this.selectedAudioBytes.set(null); }
  }

  /** Download the selected audio entry as a WAV file. */
  exportAudioWav(): void {
    const id = this.selectedAudioId();
    const bytes = this.selectedAudioBytes();
    if (id === null || !bytes) return;
    const wavBytes = this._sndToWav(bytes);
    const blob = new Blob([new Uint8Array(wavBytes).buffer], { type: 'audio/wav' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sound-${id}.wav`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /** Play the currently selected audio entry. */
  async playAudioEntry(): Promise<void> {
    const bytes = this.selectedAudioBytes();
    if (!bytes) return;
    this._ensureAudioCtx();
    const ctx = this._audioCtx!;
    if (ctx.state === 'suspended') {
      try { await ctx.resume(); } catch { /* ignore */ }
    }
    if (ctx.state === 'suspended') {
      this.snackBar.open('⚠ Click/interact with the page first to allow audio playback.', 'OK', { duration: 4000 });
      return;
    }
    try {
      // Pack 134 entries use a custom tSound layout. Prefer the parser / converter
      // that understands those entries and produces a WAV blob which the Audio
      // API can decode. Fall back to the generic tryPlaySndResource parser for
      // legacy Mac 'snd ' resource layouts.
      const sndInfo = parseSndHeader(bytes);
      if (sndInfo) {
        // Convert to WAV then ask the AudioContext to decode it.
        const wavBytes = this._sndToWav(bytes);
        try {
          // decodeAudioData expects an ArrayBuffer; guard against SharedArrayBuffer
          const ab = wavBytes.buffer.slice(wavBytes.byteOffset, wavBytes.byteOffset + wavBytes.byteLength) as ArrayBuffer;
          const audioBuf = await ctx.decodeAudioData(ab);
          // Use managed playback: store decoded AudioBuffer and start via helpers
          this._lastAudioBuffer = audioBuf;
          this._startAudioBuffer(audioBuf, 0);
          } catch (err) {
            // Some browsers reject decodeAudioData for raw WAV blobs; fall back to
            // the legacy player which may handle raw PCM directly. Mark that
            // advanced controls are unavailable when falling back.
            this._lastAudioBuffer = null;
            const played = tryPlaySndResource(bytes, ctx);
            if (!played) throw err ?? new Error('Unsupported snd format');
            // Inform the user that we're in one-shot fallback mode
            this.snackBar.open('Playing using legacy one-shot player — pause/seek unavailable.', 'OK', { duration: 4000 });
          }
      } else {
        const played = tryPlaySndResource(bytes, ctx);
        if (!played) {
          this.snackBar.open('⚠ Cannot play: compressed or unsupported snd format', 'OK', { duration: 4000 });
        }
      }
    } catch (e) {
      this.snackBar.open(`⚠ Audio error: ${e instanceof Error ? e.message : String(e)}`, 'OK', { duration: 4000 });
    }
  }

  /** Replace the selected audio entry from a WAV file upload. */
  async onAudioWavUpload(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    input.value = '';
    const id = this.selectedAudioId();
    if (id === null) return;
    try {
      this.workerBusy.set(true);
      const arrBuf = await file.arrayBuffer();
      // Convert uploaded WAV to raw Mac 'snd ' Format 1 resource bytes.
      const sndBytes = this._wavToSnd(new Uint8Array(arrBuf));
      await this.dispatchWorker<Record<string, never>>(
        'PUT_PACK_ENTRY_RAW', { packId: 134, entryId: id, bytes: sndBytes.buffer },
      );
      await this.loadSelectedAudioBytes(id);
      this.resourcesStatus.set(`Sound #${id} replaced from WAV.`);
    } catch (err) {
      this.editorError.set(err instanceof Error ? err.message : 'WAV upload failed');
    } finally {
      this.workerBusy.set(false);
    }
  }

  /**
   * Convert a Mac OS 'snd ' resource to PCM WAV.
   * Only handles uncompressed 8-bit mono (encode=0).
   */
  private _sndToWav(bytes: Uint8Array): Uint8Array {
    const info = parseSndHeader(bytes);
    if (!info) {
      // Fallback: wrap raw bytes as 8-bit mono 22050 Hz WAV
      return buildWav(bytes, 22050, 1, 8);
    }
    // IMA4 compressed (encode=0xFE) - decode to 16-bit PCM
    if (info.encode === 0xFE) {
      const dataStart = info.pcmOffset;
      const pktsAvail = Math.floor((bytes.length - dataStart) / 34);
      if (pktsAvail > 0) {
        const f32 = decodeIMA4(bytes.subarray(dataStart), pktsAvail);
        const pcm16 = new Int16Array(f32.length);
        for (let s = 0; s < f32.length; s++) pcm16[s] = Math.max(-32768, Math.min(32767, Math.round(f32[s] * 32768)));
        return buildWav(new Uint8Array(pcm16.buffer), Math.round(info.sampleRate), info.numChannels, 16);
      }
      return buildWav(bytes, Math.round(info.sampleRate), 1, 8);
    }
    // Use the pcmOffset from SndInfo directly (works for both stdSH and extSH)
    const pcmStart = Math.min(info.pcmOffset, bytes.length);
    const pcmData = bytes.slice(pcmStart);
    return buildWav(pcmData, Math.round(info.sampleRate), info.numChannels, info.sampleSize);
  }

  /**
   * Convert a WAV file to a minimal Mac OS 'snd ' Format 1 resource.
   * Only handles 8-bit mono PCM WAV (converts stereo/16-bit if needed).
   */
  private _wavToSnd(wav: Uint8Array): Uint8Array {
    // Parse WAV header (RIFF/WAVE)
    if (wav.length < 44) throw new Error('WAV file too short');
    const wavView = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
    const sampleRate = wavView.getUint32(24, true);
    const numChannels = wavView.getUint16(22, true);
    const bitsPerSample = wavView.getUint16(34, true);
    // Find 'data' chunk
    let dataOff = 12;
    let dataLen = 0;
    while (dataOff + 8 <= wav.length) {
      const chunkId = String.fromCharCode(wav[dataOff], wav[dataOff+1], wav[dataOff+2], wav[dataOff+3]);
      const chunkLen = wavView.getUint32(dataOff + 4, true);
      if (chunkId === 'data') { dataOff += 8; dataLen = chunkLen; break; }
      dataOff += 8 + chunkLen;
    }
    if (dataLen === 0) throw new Error('No data chunk in WAV');
    let pcm = wav.slice(dataOff, dataOff + dataLen);
    // Convert 16-bit signed → 8-bit unsigned FIRST (before stereo down-mix)
    // so that the stereo down-mix always works on 8-bit unsigned samples.
    if (bitsPerSample === 16) {
      const pcmView = new DataView(pcm.buffer, pcm.byteOffset, pcm.byteLength);
      const pcm8 = new Uint8Array(pcm.length / 2);
      for (let i = 0; i < pcm8.length; i++) {
        pcm8[i] = ((pcmView.getInt16(i * 2, true) >> 8) + 128) & 0xff;
      }
      pcm = pcm8;
    }
    // Convert stereo → mono (average of left+right channels)
    if (numChannels === 2) {
      const mono = new Uint8Array(pcm.length / 2);
      for (let i = 0; i < mono.length; i++) {
        mono[i] = ((pcm[i * 2] + pcm[i * 2 + 1]) / 2) | 0;
      }
      pcm = mono;
    }
    // Build minimal 'snd ' Format 1 resource:
    // [format=1(u16)] [numTypes=1(u16)] [soundType=0x0005(u16)=sampledSynth] [initOption=0x80(u32)]
    // [numCmds=1(u16)] [bufferCmd 0x8051 param1=0 param2=headerOff(u32)]
    // [SoundHeader: samplePtr(u32=0) length(u32) sampleRate(4.16fp u32) loopStart(u32=0)
    //               loopEnd(u32=0) encode(u8=0) baseFreq(u8=60=middle-C)]
    // [PCM data]
    const headerOff = 20; // offset of SoundHeader from start of resource
    const out = new Uint8Array(headerOff + 22 + pcm.length);
    const dv = new DataView(out.buffer);
    dv.setUint16(0, 1, false);          // format=1
    dv.setUint16(2, 1, false);          // numSynthTypes=1
    dv.setUint16(4, 5, false);          // sampledSynth
    dv.setUint32(6, 0x80, false);       // initOption (stereoMask)
    dv.setUint16(10, 1, false);         // numCmds=1
    dv.setUint16(12, 0x8051, false);    // bufferCmd
    dv.setUint16(14, 0, false);         // param1=0
    dv.setUint32(16, headerOff, false); // param2 = offset of header
    // SoundHeader at headerOff
    dv.setUint32(headerOff + 0, 0, false);                         // samplePtr=0
    dv.setUint32(headerOff + 4, pcm.length, false);                // length
    dv.setUint32(headerOff + 8, sampleRate * 65536, false);        // sampleRate (4.16 fixed-point)
    dv.setUint32(headerOff + 12, 0, false);                        // loopStart
    dv.setUint32(headerOff + 16, 0, false);                        // loopEnd
    dv.setUint8(headerOff + 20, 0);                                // encode=0 (stdSH)
    dv.setUint8(headerOff + 21, 60);                               // baseFreq=middle-C
    out.set(pcm, headerOff + 22);
    return out;
  }

  // ---- HUD / Screens tab ----

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
    return this.iconEntries().find((e) => e.id === id && e.type === type)?.label ?? `${type} #${id}`;
  });

  /** Load list of all screen-image resource types (ICN#, icl8, ics8, PICT). */
  async loadIconEntries(): Promise<void> {
    try {
      type ListResult = { entries: { type: string; id: number; size: number }[] };
      const result = await this.dispatchWorker<ListResult>('LIST_RESOURCES');
      const SCREEN_TYPES = new Set(['ICN#', 'icl8', 'ics8', 'PICT']);
      const entries = result.entries
        .filter((e) => SCREEN_TYPES.has(e.type))
        .map((e) => ({ type: e.type, id: e.id, label: this._iconLabel(e.type, e.id), sizeBytes: e.size }));
      this.iconEntries.set(entries);
      if (entries.length > 0 && this.selectedIconId() === null) {
        this.selectIconEntry(entries[0].type, entries[0].id);
      }
      void this.loadAllIconThumbnails();
    } catch { /* non-fatal */ }
  }

  async selectIconEntry(type: string, id: number): Promise<void> {
    this.selectedIconId.set(id);
    this.selectedIconType.set(type);
    this.iconPreviewCanvas.set(null);
    if (type === 'PICT') {
      try {
        type RawResult = { bytes: ArrayBuffer | null };
        const result = await this.dispatchWorker<RawResult>('GET_RESOURCE_RAW', { type, id });
        if (result.bytes) {
          const bytes = new Uint8Array(result.bytes);
          const canvas = this._renderPictBytes(bytes);
          if (canvas) {
            this.iconPreviewCanvas.set(canvas);
            this.iconCanvasMap.set(`${type}:${id}`, canvas);
          }
        }
      } catch { /* non-fatal */ }
      return;
    }
    try {
      type RawResult = { bytes: ArrayBuffer | null };
      const result = await this.dispatchWorker<RawResult>('GET_RESOURCE_RAW', { type, id });
      if (result.bytes) {
        const bytes = new Uint8Array(result.bytes);
        let canvas: HTMLCanvasElement | null = null;
        if (type === 'ICN#' || type === 'ics#') {
          canvas = this._renderIconBytes(bytes);
        } else if (type === 'icl8') {
          canvas = this._renderIcl8Bytes(bytes);
        } else if (type === 'ics8') {
          canvas = this._renderIcs8Bytes(bytes);
        }
        this.iconPreviewCanvas.set(canvas);
        if (canvas) {
          this.iconCanvasMap.set(`${type}:${id}`, canvas);
        }
      }
    } catch { this.iconPreviewCanvas.set(null); }
  }

  /** Export the selected icon/screen resource as a PNG file. */
  exportIconPng(): void {
    const canvas = this.iconPreviewCanvas();
    const id = this.selectedIconId();
    const type = this.selectedIconType();
    if (!canvas || id === null) return;
    try {
      const url = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url;
      a.download = `${type.trim()}-${id}.png`;
      a.click();
    } catch { /* security */ }
  }

  /** Export PICT resource as raw bytes. */
  exportIconRaw(): void {
    const id = this.selectedIconId();
    const type = this.selectedIconType();
    if (id === null) return;
    void (async () => {
      try {
        type RawResult = { bytes: ArrayBuffer | null };
        const result = await this.dispatchWorker<RawResult>('GET_RESOURCE_RAW', { type, id });
        if (result.bytes) {
          this.triggerBytesDownload(new Uint8Array(result.bytes), `${type.trim()}-${id}.bin`);
        }
      } catch { /* ignore */ }
    })();
  }

  /** Upload a PNG to replace the selected image resource. */
  async onIconPngUpload(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    input.value = '';
    const id = this.selectedIconId();
    const type = this.selectedIconType();
    if (id === null) return;
    try {
      this.workerBusy.set(true);
      const url = URL.createObjectURL(file);
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = reject;
        i.src = url;
      });
      URL.revokeObjectURL(url);

      let iconBytes: Uint8Array;
      if (type === 'icl8') {
        // Scale to 32×32 and convert to 8-bit Mac palette
        const offscreen = document.createElement('canvas');
        offscreen.width = 32; offscreen.height = 32;
        const ctx = offscreen.getContext('2d')!;
        ctx.drawImage(img, 0, 0, 32, 32);
        iconBytes = this._imageDataToIcl8(ctx.getImageData(0, 0, 32, 32).data);
      } else if (type === 'ics8') {
        // Scale to 16×16 and convert to 8-bit Mac palette
        const offscreen = document.createElement('canvas');
        offscreen.width = 16; offscreen.height = 16;
        const ctx = offscreen.getContext('2d')!;
        ctx.drawImage(img, 0, 0, 16, 16);
        iconBytes = this._imageDataToIcl8(ctx.getImageData(0, 0, 16, 16).data);
      } else {
        // ICN# or ics#: 32×32 1-bit
        const offscreen = document.createElement('canvas');
        offscreen.width = 32; offscreen.height = 32;
        const ctx = offscreen.getContext('2d')!;
        ctx.drawImage(img, 0, 0, 32, 32);
        iconBytes = this._imageDataToIconHash(ctx.getImageData(0, 0, 32, 32).data);
      }
      await this.dispatchWorker<Record<string, never>>('PUT_RESOURCE_RAW', { type, id, bytes: iconBytes.buffer });
      await this.selectIconEntry(type, id);
      this.resourcesStatus.set(`${type} #${id} replaced.`);
    } catch (err) {
      this.editorError.set(err instanceof Error ? err.message : 'Image upload failed');
    } finally {
      this.workerBusy.set(false);
    }
  }

  private _iconLabel(type: string, id: number): string {
    const iconLabels: Record<number, string> = {
      128: 'Application Icon',
      129: 'Main Menu / Home Screen',
      130: 'Game Over',
      131: 'HUD',
      132: 'Level Complete',
    };
    const pictLabels: Record<number, string> = {
      128: 'Title Screen',
      129: 'Game Over Screen',
      130: 'About Box',
    };
    if (type === 'ICN#' || type === 'ics#') return iconLabels[id] ?? `ICN# #${id}`;
    if (type === 'icl8') return iconLabels[id] ?? `icl8 #${id} (32×32 color)`;
    if (type === 'ics8') return iconLabels[id] ?? `ics8 #${id} (16×16 color)`;
    if (type === 'PICT') return pictLabels[id] ?? `PICT #${id}`;
    return `${type} #${id}`;
  }

  /** Return a data URL for a cached icon thumbnail, or null if not yet rendered. */
  getIconThumbDataUrl(type: string, id: number): string | null {
    const canvas = this.iconCanvasMap.get(`${type}:${id}`);
    if (!canvas) return null;
    try { return canvas.toDataURL(); } catch { return null; }
  }

  /** Load thumbnails for all icon entries in the background to populate iconCanvasMap. */
  private async loadAllIconThumbnails(): Promise<void> {
    for (const entry of this.iconEntries()) {
      const key = `${entry.type}:${entry.id}`;
      if (this.iconCanvasMap.has(key)) continue;
      try {
        type RawResult = { bytes: ArrayBuffer | null };
        const result = await this.dispatchWorker<RawResult>('GET_RESOURCE_RAW', { type: entry.type, id: entry.id });
        if (!result.bytes) continue;
        const bytes = new Uint8Array(result.bytes);
        let canvas: HTMLCanvasElement | null = null;
        if (entry.type === 'PICT') {
          canvas = this._renderPictBytes(bytes);
        } else if (entry.type === 'ICN#' || entry.type === 'ics#') {
          canvas = this._renderIconBytes(bytes);
        } else if (entry.type === 'icl8') {
          canvas = this._renderIcl8Bytes(bytes);
        } else if (entry.type === 'ics8') {
          canvas = this._renderIcs8Bytes(bytes);
        }
        if (canvas) {
          this.iconCanvasMap.set(key, canvas);
        }
      } catch { /* ignore */ }
      // Yield to keep UI responsive
      await new Promise<void>(r => setTimeout(r, 0));
    }
  }

  /** Render an ICN# resource (32×32 1-bit) to an HTMLCanvasElement. */
  private _renderIconBytes(bytes: Uint8Array): HTMLCanvasElement | null {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const imgData = ctx.createImageData(32, 32);
    // ICN# = 32×32 1-bit big-endian bitmap (128 bytes for icon + 128 bytes for mask)
    for (let row = 0; row < 32; row++) {
      const rowByte = Math.floor(row * 4); // 4 bytes per row
      for (let col = 0; col < 32; col++) {
        const byteIdx = rowByte + Math.floor(col / 8);
        const bitIdx = 7 - (col % 8);
        const bit = byteIdx < bytes.length ? (bytes[byteIdx] >> bitIdx) & 1 : 0;
        const i = (row * 32 + col) * 4;
        imgData.data[i]     = bit ? 0 : 255;
        imgData.data[i + 1] = bit ? 0 : 255;
        imgData.data[i + 2] = bit ? 0 : 255;
        imgData.data[i + 3] = 255;
      }
    }
    ctx.putImageData(imgData, 0, 0);
    return canvas;
  }

  /** Convert RGBA8888 32×32 image data to ICN# 1-bit big-endian bitmap (256 bytes). */
  private _imageDataToIconHash(rgba: Uint8ClampedArray): Uint8Array {
    const out = new Uint8Array(256); // 128 bytes icon + 128 bytes mask (all 1s)
    for (let row = 0; row < 32; row++) {
      for (let byteInRow = 0; byteInRow < 4; byteInRow++) {
        let b = 0;
        let mask = 0xff;
        for (let bit = 0; bit < 8; bit++) {
          const col = byteInRow * 8 + bit;
          const i = (row * 32 + col) * 4;
          const lum = rgba[i] * 0.299 + rgba[i+1] * 0.587 + rgba[i+2] * 0.114;
          if (lum < 128) b |= (1 << (7 - bit)); // dark pixel → 1 (black)
        }
        out[row * 4 + byteInRow] = b;
        out[128 + row * 4 + byteInRow] = mask;
      }
    }
    return out;
  }

  /** Render a Mac icl8 (32×32 8-bit palette-indexed) resource to canvas. */
  private _renderIcl8Bytes(bytes: Uint8Array): HTMLCanvasElement | null {
    return this._renderPalettedIcon(bytes, 32, 32);
  }

  /** Render a Mac ics8 (16×16 8-bit palette-indexed) resource to canvas. */
  private _renderIcs8Bytes(bytes: Uint8Array): HTMLCanvasElement | null {
    return this._renderPalettedIcon(bytes, 16, 16);
  }

  /** Render a Mac PICT v2 image (DirectBitsRect with 16-bit RGB555 pixels). */
  private _renderPictBytes(bytes: Uint8Array): HTMLCanvasElement | null {
    if (typeof document === 'undefined' || bytes.length < 14) return null;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    // PICT header: 2-byte size + 8-byte bounding rect (top, left, bottom, right)
    let pos = 2; // skip 'size' field
    const picTop    = view.getInt16(pos,     false); pos += 2;
    const picLeft   = view.getInt16(pos,     false); pos += 2;
    const picBottom = view.getInt16(pos,     false); pos += 2;
    const picRight  = view.getInt16(pos,     false); pos += 2;
    const picW = picRight  - picLeft;
    const picH = picBottom - picTop;
    if (picW <= 0 || picH <= 0 || picW > 4096 || picH > 4096) return null;

    const canvas = document.createElement('canvas');
    canvas.width = picW; canvas.height = picH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // Detect PICT version
    let isV2 = false;
    if (pos + 2 <= bytes.length && view.getUint16(pos, false) === 0x0011) {
      pos += 2; // version opcode
      if (pos + 2 <= bytes.length && view.getUint16(pos, false) === 0x02FF) {
        isV2 = true; pos += 2;
      }
    }

    // Scan for image-bearing opcodes
    let rendered = false;
    outer: while (pos + (isV2 ? 2 : 1) <= bytes.length) {
      let opcode: number;
      if (isV2) {
        if (pos % 2 !== 0) pos++; // align to even byte
        if (pos + 2 > bytes.length) break;
        opcode = view.getUint16(pos, false); pos += 2;
      } else {
        opcode = view.getUint8(pos++);
      }

      switch (opcode) {
        case 0x0000: break; // NOP
        case 0x00FF: break outer; // EndOfPicture
        case 0x0001: { // ClipRgn
          if (pos + 2 > bytes.length) break outer;
          const rgnSize = view.getUint16(pos, false); pos += rgnSize; break;
        }
        case 0x0003: pos += 2; break; // TxFont
        case 0x0004: pos += 2; break; // TxFace
        case 0x0005: pos += 2; break; // TxMode
        case 0x0006: pos += 4; break; // SpExtra
        case 0x0007: pos += 4; break; // PnSize
        case 0x0008: pos += 2; break; // PnMode
        case 0x0009: pos += 8; break; // PnPat
        case 0x000A: pos += 8; break; // FillPat
        case 0x000B: pos += 4; break; // OvSize
        case 0x000C: pos += 4; break; // Origin
        case 0x000D: pos += 2; break; // TxSize
        case 0x000E: pos += 4; break; // FgColor (long)
        case 0x000F: pos += 4; break; // BkColor (long)
        case 0x0010: pos += 8; break; // TxRatio
        case 0x001A: pos += 6; break; // RGBFgCol
        case 0x001B: pos += 6; break; // RGBBkCol
        case 0x001C: break;           // HiliteMode (no data)
        case 0x001D: pos += 6; break; // HiliteColor
        case 0x001E: break; // DefHilite (no data)
        case 0x001F: pos += 6; break; // OpColor
        case 0x0C00: pos += 24; break; // HeaderOp (v2)
        case 0x0098: case 0x0099: // PackBitsRect / PackBitsRgn
        case 0x009A: case 0x009B: { // DirectBitsRect / DirectBitsRgn
          const isDirect = (opcode === 0x009A || opcode === 0x009B);
          if (isDirect && pos + 4 <= bytes.length) pos += 4; // skip baseAddr

          if (pos + 2 > bytes.length) break outer;
          const rowBytesRaw = view.getUint16(pos, false); pos += 2;
          const rowBytes    = rowBytesRaw & 0x3FFF;
          const isPixMap    = (rowBytesRaw & 0x8000) !== 0 || isDirect;

          // Bounds rect
          if (pos + 8 > bytes.length) break outer;
          const bTop    = view.getInt16(pos, false); pos += 2;
          const bLeft   = view.getInt16(pos, false); pos += 2;
          const bBottom = view.getInt16(pos, false); pos += 2;
          const bRight  = view.getInt16(pos, false); pos += 2;
          const imgW = bRight - bLeft;
          const imgH = bBottom - bTop;
          if (imgW <= 0 || imgH <= 0 || imgW > 4096 || imgH > 4096) break outer;

          let pixelSize = 1;
          let packType = 0;
          let colorTable: number[] | null = null;

          if (isPixMap) {
            if (pos + 2 > bytes.length) break outer;
            pos += 2; // pmVersion
            if (pos + 2 > bytes.length) break outer;
            packType = view.getUint16(pos, false); pos += 2;
            if (pos + 4 > bytes.length) break outer;
            pos += 4; // packSize
            if (pos + 8 > bytes.length) break outer;
            pos += 8; // hRes + vRes (Fixed 16.16)
            if (pos + 2 > bytes.length) break outer;
            pos += 2; // pixelType
            if (pos + 2 > bytes.length) break outer;
            pixelSize = view.getUint16(pos, false); pos += 2;
            if (pos + 6 > bytes.length) break outer;
            pos += 6; // cmpCount + cmpSize + planeBytes
            if (pos + 4 > bytes.length) break outer;
            pos += 4; // pmTable (ignored, read below for 8-bit)
            if (pos + 4 > bytes.length) break outer;
            pos += 4; // pmReserved

            // Color table (only for indexed PixMaps, pixelSize ≤ 8)
            if (!isDirect && pixelSize <= 8) {
              if (pos + 8 > bytes.length) break outer;
              pos += 4; // ctSeed
              pos += 2; // ctFlags
              const ctSize = view.getInt16(pos, false) + 1; pos += 2;
              colorTable = [];
              for (let ci = 0; ci < ctSize; ci++) {
                if (pos + 8 > bytes.length) break outer;
                pos += 2; // index (ignored)
                const r = view.getUint16(pos, false) >> 8; pos += 2;
                const g = view.getUint16(pos, false) >> 8; pos += 2;
                const b = view.getUint16(pos, false) >> 8; pos += 2;
                colorTable.push(r, g, b);
              }
            }
          }

          // srcRect + dstRect + mode
          if (pos + 18 > bytes.length) break outer;
          pos += 8; // srcRect
          pos += 8; // dstRect
          pos += 2; // mode

          // If PackBitsRgn / DirectBitsRgn, skip region
          if (opcode === 0x0099 || opcode === 0x009B) {
            if (pos + 2 > bytes.length) break outer;
            const rgnSize = view.getUint16(pos, false); pos += rgnSize;
          }

          // Decode pixel rows
          const imgData = ctx.createImageData(imgW, imgH);
          const isPacked = rowBytes > 250 || (packType !== 1 && pixelSize !== 1);

          for (let row = 0; row < imgH; row++) {
            let rowData: Uint8Array;
            const bytesPerRow = rowBytes;
            if (isPacked) {
              if (pos + (bytesPerRow > 250 ? 2 : 1) > bytes.length) break outer;
              const compLen = bytesPerRow > 250
                ? (view.getUint16(pos, false) + (pos += 2, 0))
                : (view.getUint8(pos++) + 0);
              if (pos + compLen > bytes.length) break outer;
              rowData = decodePackBits(bytes.subarray(pos, pos + compLen), bytesPerRow);
              pos += compLen;
            } else {
              if (pos + bytesPerRow > bytes.length) break outer;
              rowData = bytes.subarray(pos, pos + bytesPerRow);
              pos += bytesPerRow;
            }

            // Write pixels
            for (let col = 0; col < imgW; col++) {
              const di = (row * imgW + col) * 4;
              if (pixelSize === 16) {
                // 16-bit RGB555
                const pixOff = col * 2;
                if (pixOff + 2 > rowData.length) break;
                const pixel = (rowData[pixOff]! << 8) | rowData[pixOff + 1]!;
                imgData.data[di]     = ((pixel >> 10) & 0x1F) * 255 / 31;
                imgData.data[di + 1] = ((pixel >>  5) & 0x1F) * 255 / 31;
                imgData.data[di + 2] =  (pixel        & 0x1F) * 255 / 31;
                imgData.data[di + 3] = 255;
              } else if (pixelSize === 32) {
                // 32-bit ARGB
                const pixOff = col * 4;
                if (pixOff + 4 > rowData.length) break;
                imgData.data[di]     = rowData[pixOff + 1]!;
                imgData.data[di + 1] = rowData[pixOff + 2]!;
                imgData.data[di + 2] = rowData[pixOff + 3]!;
                imgData.data[di + 3] = rowData[pixOff]! || 255; // alpha (or 255 if 0)
              } else if (pixelSize === 8) {
                // 8-bit indexed or grayscale
                const idx = rowData[col] ?? 0;
                if (colorTable && colorTable.length >= (idx + 1) * 3) {
                  imgData.data[di]     = colorTable[idx * 3]!;
                  imgData.data[di + 1] = colorTable[idx * 3 + 1]!;
                  imgData.data[di + 2] = colorTable[idx * 3 + 2]!;
                } else {
                  imgData.data[di] = imgData.data[di + 1] = imgData.data[di + 2] = idx;
                }
                imgData.data[di + 3] = 255;
              } else {
                // Unknown format; fill grey
                imgData.data[di] = imgData.data[di + 1] = imgData.data[di + 2] = 128;
                imgData.data[di + 3] = 255;
              }
            }
          }
          ctx.putImageData(imgData, 0, 0);
          rendered = true;
          break outer;
        }
        default: {
          // PICT v2 opcode data-length rules:
          //   0x0100–0x7FFF: (opcode >> 8) * 2 bytes of inline data
          //   0x8000–0x80FF: no data
          //   0x8100–0xFFFF: next 4 bytes give data length (longword)
          // For genuinely unknown low-range (0x0000–0x00FF) opcodes we stop.
          if (isV2 && opcode >= 0x0100 && opcode <= 0x7FFF) {
            pos += (opcode >> 8) * 2;
          } else if (isV2 && opcode >= 0x8000 && opcode <= 0x80FF) {
            // no data
          } else if (isV2 && opcode >= 0x8100) {
            if (pos + 4 > bytes.length) break outer;
            const longLen = view.getUint32(pos, false); pos += 4 + longLen;
          } else {
            break outer; // Truly unknown low-range opcode; stop
          }
          break;
        }
      }
    }

    return rendered ? canvas : null;
  }

  /** Render a Mac 8-bit palette-indexed icon to an HTMLCanvasElement. */
  private _renderPalettedIcon(bytes: Uint8Array, w: number, h: number): HTMLCanvasElement | null {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const imgData = ctx.createImageData(w, h);
    const pal = MAC_8BIT_PALETTE;
    const palLen = pal.length / 3; // number of palette entries
    for (let i = 0; i < w * h; i++) {
      const idx = i < bytes.length ? bytes[i] : 0;
      const pi = (idx < palLen ? idx : palLen - 1) * 3;
      const di = i * 4;
      imgData.data[di]     = pal[pi]     ?? 0;
      imgData.data[di + 1] = pal[pi + 1] ?? 0;
      imgData.data[di + 2] = pal[pi + 2] ?? 0;
      imgData.data[di + 3] = 255;
    }
    ctx.putImageData(imgData, 0, 0);
    return canvas;
  }

  /** Lazily built RGB quantization lookup table (r×g×b → nearest palette index). */
  private _mac8bitLUT: Map<number, number> | null = null;

  /**
   * Build (or return cached) a 3-component RGB → nearest Mac palette index lookup.
   * Keys are packed as (r >> 3) << 10 | (g >> 3) << 5 | (b >> 3), giving a
   * 32×32×32 = 32768 entry table that amortises the per-pixel search to O(1).
   */
  private _getMac8bitLUT(): Map<number, number> {
    if (this._mac8bitLUT) return this._mac8bitLUT;
    const pal = MAC_8BIT_PALETTE;
    const palLen = pal.length / 3;
    const lut = new Map<number, number>();
    for (let rq = 0; rq < 32; rq++) {
      for (let gq = 0; gq < 32; gq++) {
        for (let bq = 0; bq < 32; bq++) {
          const r = rq * 8; const g = gq * 8; const b = bq * 8;
          let bestIdx = 0; let bestDist = Infinity;
          for (let p = 0; p < palLen; p++) {
            const dr = r - (pal[p * 3] ?? 0); const dg = g - (pal[p * 3 + 1] ?? 0); const db = b - (pal[p * 3 + 2] ?? 0);
            const dist = dr * dr + dg * dg + db * db;
            if (dist < bestDist) { bestDist = dist; bestIdx = p; }
          }
          lut.set((rq << 10) | (gq << 5) | bq, bestIdx);
        }
      }
    }
    this._mac8bitLUT = lut;
    return lut;
  }

  /** Convert RGBA8888 image data to Mac 8-bit palette-indexed format (icl8/ics8). */
  private _imageDataToIcl8(rgba: Uint8ClampedArray): Uint8Array {
    const pixelCount = rgba.length / 4;
    const out = new Uint8Array(pixelCount);
    const lut = this._getMac8bitLUT();
    for (let i = 0; i < pixelCount; i++) {
      const rq = rgba[i * 4]     >> 3;
      const gq = rgba[i * 4 + 1] >> 3;
      const bq = rgba[i * 4 + 2] >> 3;
      out[i] = lut.get((rq << 10) | (gq << 5) | bq) ?? 0;
    }
    return out;
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
    this._editingTileId = null; // clear any tile edit marker
    this.spriteEditorFrame.set({ ...frame, pixels: frame.pixels.slice() as Uint8ClampedArray });
    this.spriteEditorOpen.set(true);
  }

  /**
   * Handle PNG file upload to replace a sprite frame.
   * The PNG is scaled to the sprite's existing dimensions and converted to RGB555.
   */
  async onSpritePngUpload(event: Event, frameId: number): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    input.value = ''; // reset so same file can be re-selected

    const frame = this.packSpriteDecodedFrames.get(frameId);
    if (!frame) { this.editorError.set('Sprite frame not found'); return; }

    try {
      // Load the PNG into an Image
      const url = URL.createObjectURL(file);
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = reject;
        i.src = url;
      });
      URL.revokeObjectURL(url);

      // Draw it scaled to the frame's dimensions on an offscreen canvas
      const canvas = document.createElement('canvas');
      canvas.width  = frame.width;
      canvas.height = frame.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, frame.width, frame.height);
      const imageData = ctx.getImageData(0, 0, frame.width, frame.height);

      // Apply using the same path as the pixel editor
      this.workerBusy.set(true);
      const result = await this.dispatchWorker<{ levels: ParsedLevel[] }>(
        'APPLY_SPRITE_PACK_PIXELS',
        { frameId, pixels: imageData.data },
      );
      this.applyLevelsResult(result.levels);
      this.decodePackSpritesInBackground();
      this.resourcesStatus.set(`Sprite frame #${frameId} replaced from PNG.`);
    } catch (err) {
      this.editorError.set(err instanceof Error ? err.message : 'PNG upload failed');
    } finally {
      this.workerBusy.set(false);
    }
  }

  /** Handle save event from sprite editor – route to tile or sprite save. */
  async onSpriteEditorSaved(event: { frameId: number; pixels: Uint8ClampedArray }): Promise<void> {
    this.spriteEditorOpen.set(false);
    const tileId = this._editingTileId;
    this._editingTileId = null;
    if (tileId !== null) {
      // Was editing a tile – apply to kPackTx16
      await this.onTileEditorSaved(event);
      return;
    }
    // Was editing a sprite – apply to kPackSp16
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
    // Preserve in-memory road segments: barrier drags update parsedLevels directly (in-memory)
    // but are NOT flushed to the worker until download time. If the worker returns stale levels
    // (e.g., after a sprite/tile edit), we must keep the locally-edited road segs.
    const existingById = new Map(this.parsedLevels().map(l => [l.resourceId, l]));
    const merged = levels.map(l => {
      const cur = existingById.get(l.resourceId);
      return cur ? { ...l, roadSegs: cur.roadSegs } : l;
    });
    this.parsedLevels.set(merged);
    this._roadOffscreenKey = ''; // road segs may have changed; invalidate the road cache
    this.roadSegsVersion.update((v) => v + 1);
    const curId = this.selectedLevelId();
    if (curId !== null && merged.some((l) => l.resourceId === curId)) {
      this.selectLevel(curId);
    } else if (merged.length > 0) {
      this.selectLevel(merged[0].resourceId);
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

    // Check for cross-origin isolation required by SharedArrayBuffer / pthreads WASM.
    // Without COOP + COEP headers the browser will not set window.crossOriginIsolated
    // and the Emscripten runtime will fail with "Import #0 env: module is not an object".
    if (typeof window.crossOriginIsolated !== 'undefined' && !window.crossOriginIsolated) {
      this.statusText.set(
        'Cross-origin isolation unavailable – the WASM game requires SharedArrayBuffer. ' +
        'The server must send Cross-Origin-Opener-Policy: same-origin and ' +
        'Cross-Origin-Embedder-Policy: require-corp headers. ' +
        'Run `npm start` from the angular-site directory (the built-in dev server already ' +
        'sets these headers). The level editor will still work without the game.',
      );
      console.error(
        '[Angular] window.crossOriginIsolated is false – WASM with SharedArrayBuffer will fail. ' +
        'Use `npm start` (ng serve) which sets COOP/COEP headers automatically.',
      );
    }

    window.Module = {
      // locateFile lets Emscripten find .wasm and .data files relative to base href,
      // which is critical when the Angular app is deployed under a sub-path.
      locateFile: (path: string) => this.assetUrl(path),
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
        this.syncGameLoopWithActiveTab();
        // Reload WASM filesystem if a custom resources.dat was queued before init finished
        if (this._pendingCustomResources) {
          this._mountCustomResourcesFs(this._pendingCustomResources);
          this._pendingCustomResources = null;
        }
      },
      preRun: [
        // Inject custom resources.dat from IndexedDB (if present) before the game's
        // main() runs.  This is the correct injection point: the FS is initialised but
        // the game has not yet opened resources.dat, so writing here takes effect on
        // first load.  We use addRunDependency / removeRunDependency to pause module
        // startup while the async IndexedDB read completes.
        () => {
          const mod = window.Module;
          if (!mod?.addRunDependency || typeof indexedDB === 'undefined') return;
          mod.addRunDependency('customResourcesDat');
          App._loadCustomResourcesDb().then((entry) => {
            if (entry) {
              const FS = (window as unknown as Record<string, unknown>)['FS'] as {
                writeFile: (path: string, data: Uint8Array) => void;
              } | undefined;
              if (FS) {
                try {
                  FS.writeFile('/resources.dat', entry.bytes);
                  console.log(`[Angular] Injected custom resources.dat (${Math.round(entry.bytes.length / 1024)} KB) from IndexedDB`);
                } catch (err) {
                  console.warn('[Angular] Failed to inject custom resources.dat into MEMFS', err);
                }
              }
            }
          }).catch((err) => {
            console.warn('[Angular] Failed to read custom resources.dat from IndexedDB', err);
          }).finally(() => {
            window.Module?.removeRunDependency?.('customResourcesDat');
          });
        },
      ],
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
    // roadSegsVersion is bumped whenever road segment data changes so that barrier
    // drags and merge/split operations invalidate the cached road bitmap automatically.
    const staticKey = `${level.resourceId}|${W}|${H}|${zoom.toFixed(3)}|${panX.toFixed(0)}|${this.roadTexturesVersion()}|${this.roadSegsVersion()}`;

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
        let renderOk = false;
        try {
          this.drawObjectRoadPreview(offCtx, level, theme, panX, panY, zoom, W, H, OVERHANG);
          renderOk = true;
        } catch (err) {
          console.error('[road render]', err);
          // Fill offscreen with a plain background so partial draws don't show garbage.
          offCtx.fillStyle = theme.bg;
          offCtx.fillRect(0, 0, W, offH);
        }
        // Only cache the key on successful render; on failure leave the key stale so
        // the next frame retries.  This prevents a permanent blank background when an
        // intermittent exception occurs (e.g. browser resource exhaustion).
        if (renderOk) {
          this._roadOffscreenKey = staticKey;
        }
      }
    }

    // Blit the slice of the oversized offscreen that corresponds to the current viewport.
    if (this._roadOffscreen) {
      const offscreenSrcY = offscreenCentreCanvasY - (panY - this._roadOffscreenPanY) * zoom - H / 2;
      // Clamp srcY to valid range to avoid drawImage throwing on out-of-bounds source rect.
      if (offscreenSrcY >= 0 && offscreenSrcY + H <= offH) {
        ctx.drawImage(this._roadOffscreen, 0, offscreenSrcY, W, H, 0, 0, W, H);
      } else {
        // srcY out of range – fall back to a plain background colour this frame.
        ctx.fillStyle = theme.bg;
        ctx.fillRect(0, 0, W, H);
      }
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
     * @param anchorWorldX – optional world X to anchor the pattern's left edge to (default 0).
     *                       Pass the outer edge of the kerb strip so the texture is attached
     *                       to the road boundary rather than the global world origin.
     */
    const makePattern = (texId: number, texWorldSize: number, anchorWorldX = 0): CanvasPattern | string | null => {
      const tc = this.roadTextureCanvases.get(texId);
      if (!tc) return null;
      try {
        const pat = ctx.createPattern(tc, 'repeat');
        if (!pat) return null;
        // scale: maps texture pixels → canvas pixels so one full texture width = texWorldSize world units
        const scale = texWorldSize * zoom / tc.width;
        const tileW = texWorldSize * zoom; // = tc.width * scale
        const tileH = tc.height * scale;
        // Anchor the pattern's U=0 to anchorWorldX (for kerbs: the outer road edge).
        // This makes the texture track the road boundary instead of the world X origin,
        // so the kerb visually bends with the road rather than tiling globally.
        const tx = ((W / 2 + (anchorWorldX - panX) * zoom) % tileW + tileW) % tileW;
        const ty = (((H / 2 + yOverhang) + panY * zoom) % tileH + tileH) % tileH;
        pat.setTransform(new DOMMatrix([scale, 0, 0, scale, tx, ty]));
        return pat;
      } catch {
        return null;
      }
    };

    // Obtain patterns (fall back to theme colours if textures not yet loaded).
    // Background and road surface use world-origin alignment (large 128-unit tiles).
    const bgPat = ri ? (makePattern(ri.backgroundTex, 128) ?? theme.bg) : theme.bg;
    const fgPat = ri ? (makePattern(ri.foregroundTex, 128) ?? theme.road) : theme.road;
    // Kerb patterns use 16-world-unit tiles, anchored to world origin for seamless tiling.
    const KERB_TEX_WORLD = 16;
    const lbPat = ri ? (makePattern(ri.roadLeftBorder,  KERB_TEX_WORLD) ?? theme.kerbA) : theme.kerbA;
    const rbPat = ri ? (makePattern(ri.roadRightBorder, KERB_TEX_WORLD) ?? theme.kerbB) : theme.kerbB;
    // Centre line: cyan for water, yellow for asphalt
    const CENTRE_COLOUR = theme.water ? 'rgba(80, 255, 180, 0.85)' : 'rgba(255, 248, 140, 0.85)';

    /** Append quad canvas coords to a batch array. */
    const addQuad = (
      batch: number[],
      x0: number, y0: number, x1: number, y1: number,
      x2: number, y2: number, x3: number, y3: number,
    ): void => {
      const [ax0, ay0] = wtc(x0, y0);
      const [ax1, ay1] = wtc(x1, y1);
      const [ax2, ay2] = wtc(x2, y2);
      const [ax3, ay3] = wtc(x3, y3);
      if (ay0 < 0 && ay1 < 0 && ay2 < 0 && ay3 < 0) return;
      if (ay0 > canvasH && ay1 > canvasH && ay2 > canvasH && ay3 > canvasH) return;
      batch.push(ax0, ay0, ax1, ay1, ax2, ay2, ax3, ay3);
    };

    /** Draw accumulated quad batch using a single fill() call. */
    const flushBatch = (fill: CanvasPattern | string, batch: number[]): void => {
      if (batch.length === 0) return;
      ctx.fillStyle = fill as string;
      ctx.beginPath();
      for (let j = 0; j < batch.length; j += 8) {
        ctx.moveTo(batch[j],     batch[j + 1]);
        ctx.lineTo(batch[j + 2], batch[j + 3]);
        ctx.lineTo(batch[j + 4], batch[j + 5]);
        ctx.lineTo(batch[j + 6], batch[j + 7]);
        ctx.closePath();
      }
      ctx.fill();
    };

    // Draw road geometry using actual textures – only render segments visible in viewport.
    const visibleWorldMinY = panY - (H / 2 + yOverhang) / zoom - 4;
    const visibleWorldMaxY = panY + (H / 2 + yOverhang) / zoom + 4;
    const firstSeg = Math.max(0, Math.floor(visibleWorldMinY / 2));
    const lastSeg  = Math.min(level.roadSegs.length - 2, Math.ceil(visibleWorldMaxY / 2));

    // Adaptive step: merge adjacent segments at low zoom for performance.
    const step = Math.max(1, Math.ceil(1.5 / zoom));

    // Compute world extents at canvas edges for background fill
    const worldMinX = panX - W / (2 * zoom) - 200;
    const worldMaxX = panX + W / (2 * zoom) + 200;

    const bgBatch: number[] = [];
    const fgBatch: number[] = [];
    const lbBatch: number[] = [];
    const rbBatch: number[] = [];
    for (let index = firstSeg; index <= lastSeg; index += step) {
      const cur = level.roadSegs[index];
      const nxtIdx = Math.min(index + step, level.roadSegs.length - 1);
      const nxt = level.roadSegs[nxtIdx];
      const y0  = index * 2;
      const y1  = nxtIdx * 2;

      // Off-road (background texture) – extend to canvas edges
      addQuad(bgBatch, worldMinX, y0,  cur.v0 - KERB_WIDTH, y0,  nxt.v0 - KERB_WIDTH, y1,  worldMinX, y1);

      // Left border/kerb
      addQuad(lbBatch, cur.v0 - KERB_WIDTH, y0,  cur.v0, y0,  nxt.v0, y1,  nxt.v0 - KERB_WIDTH, y1);

      // Left road lane: v0 to v1 (road surface)
      addQuad(fgBatch, cur.v0, y0,  cur.v1, y0,  nxt.v1, y1,  nxt.v0, y1);

      // Median / center gap: v1 to v2 (background with kerbs on both edges)
      const medianW = Math.min(cur.v2 - cur.v1, nxt.v2 - nxt.v1);
      if (medianW > 0) {
        const halfKerb = Math.min(KERB_WIDTH, medianW / 2);
        addQuad(rbBatch, cur.v1, y0,  cur.v1 + halfKerb, y0,  nxt.v1 + halfKerb, y1,  nxt.v1, y1);
        if (medianW > halfKerb * 2) {
          addQuad(bgBatch, cur.v1 + halfKerb, y0,  cur.v2 - halfKerb, y0,  nxt.v2 - halfKerb, y1,  nxt.v1 + halfKerb, y1);
        }
        addQuad(lbBatch, cur.v2 - halfKerb, y0,  cur.v2, y0,  nxt.v2, y1,  nxt.v2 - halfKerb, y1);
      }

      // Right road lane: v2 to v3 (road surface)
      addQuad(fgBatch, cur.v2, y0,  cur.v3, y0,  nxt.v3, y1,  nxt.v2, y1);

      // Right border/kerb
      addQuad(rbBatch, cur.v3, y0,  cur.v3 + KERB_WIDTH, y0,  nxt.v3 + KERB_WIDTH, y1,  nxt.v3, y1);

      // Off-road far right – extend to canvas edges
      addQuad(bgBatch, cur.v3 + KERB_WIDTH, y0,  worldMaxX, y0,  worldMaxX, y1,  nxt.v3 + KERB_WIDTH, y1);
    }

    // ─── Flush layers in back-to-front order ────────────────────────────────────
    // 1. Background (grass/off-road) – painted first
    flushBatch(bgPat, bgBatch);
    // 2. Kerb strips – painted over background
    flushBatch(lbPat, lbBatch);
    flushBatch(rbPat, rbBatch);
    // 3. Road surface (top layer)
    flushBatch(fgPat, fgBatch);

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
    const dragWp   = this.dragTrackWaypoint();
    const hoverWp  = this.hoverTrackWaypoint();
    const hoverMid = this.hoverTrackMidpoint();

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

      // Midpoint diamond handles (only draw hovered one prominently; draw all when zoomed in)
      const showAllMids = zoom > 0.5 && segs.length <= 80;
      for (let i = 0; i < segs.length - 1; i++) {
        const isHovMid = hoverMid?.track === track && hoverMid.segIdx === i;
        if (!isHovMid && !showAllMids) continue;
        const mx = (segs[i].x + segs[i + 1].x) / 2;
        const my = (segs[i].y + segs[i + 1].y) / 2;
        const [cx, cy] = this.worldToCanvas(mx, my);
        if (cx < -10 || cx > W + 10 || cy < -10 || cy > H + 10) continue;
        const size = isHovMid ? 9 : 5;
        ctx.fillStyle = isHovMid ? '#ffdd00' : 'rgba(255,255,255,0.35)';
        ctx.strokeStyle = isHovMid ? 'rgba(0,0,0,0.7)' : 'rgba(0,0,0,0.2)';
        ctx.lineWidth = isHovMid ? 1.5 : 0.8;
        ctx.beginPath();
        ctx.moveTo(cx,        cy - size);
        ctx.lineTo(cx + size, cy);
        ctx.lineTo(cx,        cy + size);
        ctx.lineTo(cx - size, cy);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
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
    // When Konva is active, endpoint circles are drawn by the Konva marks layer
    // (draggable). We only draw the connecting line here.
    const konvaActive = this._konvaInitialized;
    marks.forEach((m, i) => {
      const [x1, y1] = this.worldToCanvas(m.x1, m.y1);
      const [x2, y2] = this.worldToCanvas(m.x2, m.y2);
      const isSel = i === selMark;
      // Road markings are solid white lines in the actual game (painted road marking
      // textures from kPackTxtR).  Use solid white with a cyan highlight when selected.
      ctx.strokeStyle = isSel ? '#00e5ff' : '#ffd600';
      ctx.lineWidth = isSel ? 3 : 2;
      ctx.setLineDash(isSel ? [] : [8, 4]);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      // Only draw endpoint dots when Konva is NOT rendering them
      if (!konvaActive) {
        ctx.fillStyle = isSel ? '#00e5ff' : '#ffd600';
        [[x1, y1], [x2, y2]].forEach(([px, py]) => {
          ctx.beginPath(); ctx.arc(px, py, isSel ? 12 : 8, 0, Math.PI * 2); ctx.fill();
        });
      }
    });

    if (this.markCreateMode() && this._pendingMarkPoints.length > 0) {
      const last = this._pendingMarkPoints[this._pendingMarkPoints.length - 1];
      const [px, py] = this.worldToCanvas(last.x, last.y);
      ctx.fillStyle = '#00e5ff';
      ctx.beginPath();
      ctx.arc(px, py, 8, 0, Math.PI * 2);
      ctx.fill();
      if (this._markCreateHoverPoint) {
        const [hx, hy] = this.worldToCanvas(this._markCreateHoverPoint.x, this._markCreateHoverPoint.y);
        ctx.strokeStyle = 'rgba(0,229,255,0.8)';
        ctx.lineWidth = 2;
        ctx.setLineDash([10, 6]);
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(hx, hy);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
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
  private _spritePreviewDataUrls = new Map<number, string>();
  getSpritePreviewDataUrl(typeRes: number): string | null {
    const cached = this._spritePreviewDataUrls.get(typeRes);
    if (cached) return cached;
    const canvas = this.objectSpritePreviews.get(typeRes) ?? null;
    if (!canvas) return null;
    try {
      const url = canvas.toDataURL();
      this._spritePreviewDataUrls.set(typeRes, url);
      return url;
    } catch {
      return null;
    }
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

  /**
   * Keep the game loop aligned with the visible app tab.
   * The game should pause while the editor is active so it does not keep running
   * in the background behind the editor UI.
   */
  private syncGameLoopWithActiveTab(): void {
    const mod = window.Module;
    if (!mod) return;
    try {
      if (this.activeTab() === 'editor') {
        mod.pauseMainLoop?.();
      } else {
        mod.resumeMainLoop?.();
      }
    } catch {
      // Emscripten's main loop may not be initialised yet (e.g. during
      // onRuntimeInitialized, before C main() starts the loop).  Ignore.
    }
  }

  /**
   * Handle file selection for custom resources.dat in the game tab.
   * Reads the file and mounts it in the Emscripten MEMFS, then attempts an
   * in-place game restart (no full page reload needed).
   */
  async onCustomResourcesFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      this.customResourcesName.set(file.name);
      const mod = window.Module;
      if (!mod) {
        // WASM not yet initialized – queue for when it finishes
        this._pendingCustomResources = bytes;
        this.statusText.set('Custom resources.dat queued – waiting for WASM to initialize…');
      } else {
        this._mountCustomResourcesFs(bytes);
      }
    } catch (e) {
      console.error('[Angular] Failed to read custom resources.dat', e);
    }
    // Reset input so same file can be selected again
    input.value = '';
  }

  /** True while a game restart triggered by custom resources is in progress. */
  gameRestarting = signal(false);

  /**
   * Restart the game by reloading the page so the custom resources.dat is
   * applied cleanly.  The bytes are already persisted in IndexedDB by
   * _mountCustomResourcesFs(), so the Emscripten preRun hook will inject them
   * into MEMFS before the game's main() runs on the next page load.
   *
   * Note: callMain() cannot be used here because the game is compiled with
   * Emscripten ASYNCIFY, which does not support re-entering main() while a
   * previous ASYNCIFY suspend/resume context is still active.  Attempting to
   * do so causes the game to hang at the first blocking C call (loading screen).
   */
  restartGameWithCustomResources(): void {
    this.gameRestarting.set(true);
    this.statusText.set('Reloading page to apply custom resources.dat…');
    // Small delay so the status text is rendered before the reload.
    setTimeout(() => window.location.reload(), 150);
  }

  /**
   * Mount a custom resources.dat into the Emscripten MEMFS at /resources.dat
   * (the path the WASM game reads from, set by RESOURCES_DAT_PATH at build time).
   * Also persists the bytes in IndexedDB so the preRun hook can re-inject them
   * on the next page load triggered by restartGameWithCustomResources().
   */
  private _mountCustomResourcesFs(bytes: Uint8Array): void {
    // Persist in IndexedDB so the custom resources survive a page reload.
    const name = this.customResourcesName() ?? 'resources.dat';
    if (typeof indexedDB !== 'undefined') {
      App._saveCustomResourcesDb(bytes, name).catch((err) => {
        console.warn('[Angular] Failed to save custom resources.dat to IndexedDB', err);
      });
    }

    // Write into the live MEMFS so the current session reflects the update.
    try {
      const FS = (window as unknown as Record<string, unknown>)['FS'] as {
        writeFile: (path: string, data: Uint8Array) => void;
      } | undefined;
      if (!FS) {
        console.warn('[Angular] Emscripten FS not available yet – bytes will be injected on next page load via IndexedDB');
        this._pendingCustomResources = bytes;
        return;
      }
      // The WASM build sets RESOURCES_DAT_PATH="/resources.dat" (no sub-directory).
      FS.writeFile('/resources.dat', bytes);
      console.log('[Angular] Custom resources.dat written to MEMFS at /resources.dat');
    } catch (e) {
      console.warn('[Angular] Could not write custom resources.dat to live MEMFS (will take effect on page reload)', e);
    }

    this.customResourcesLoaded.set(true);
    this.statusText.set(
      `Custom resources.dat loaded (${Math.round(bytes.length / 1024)} KB). ` +
      'Click "Restart Game" to reload the page with the new resources.',
    );
  }

  /** Remove any persisted custom resources.dat from IndexedDB and reset UI state. */
  clearCustomResources(): void {
    App._clearCustomResourcesDb().catch(() => { /* ignore */ });
    this.customResourcesLoaded.set(false);
    this.customResourcesName.set(null);
    this.statusText.set('Custom resources.dat cleared — game will use default resources on next reload.');
  }
}
