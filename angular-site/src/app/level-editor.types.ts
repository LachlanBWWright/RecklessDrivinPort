/**
 * level-editor.types.ts
 *
 * Pure data-model interfaces shared between level-editor.service.ts, the web
 * worker, and all editor component/service consumers.
 *
 * These types carry no Angular dependencies and may be safely imported from
 * worker contexts.
 */

// ------------------------------------------------------------------
// Level geometry types
// ------------------------------------------------------------------

export interface ObjectGroupRef {
  resID: number; // SInt16
  numObjs: number; // SInt16
}

export interface ObjectGroupEntryData {
  typeRes: number; // SInt16
  minOffs: number; // SInt16
  maxOffs: number; // SInt16
  probility: number; // SInt16
  dir: number; // float
}

export interface ObjectGroupDefinition {
  id: number;
  entries: ObjectGroupEntryData[];
}

export interface ObjectGroupSpawnPreviewObject {
  slotIndex: number;
  groupId: number;
  entryIndex: number;
  typeRes: number;
  x: number;
  y: number;
  dir: number;
  control: 'track-up' | 'track-down' | 'road';
}

export interface TrackSeg {
  flags: number; // UInt16
  x: number; // SInt16
  y: number; // SInt32
  velo: number; // float (big-endian)
}

export interface ObjectPos {
  x: number; // SInt32
  y: number; // SInt32
  dir: number; // float
  typeRes: number; // SInt16
}

export interface RoadSeg {
  v0: number; // SInt16
  v1: number; // SInt16
  v2: number; // SInt16
  v3: number; // SInt16
}

export interface MarkSeg {
  x1: number; // SInt32
  y1: number; // SInt32
  x2: number; // SInt32
  y2: number; // SInt32
}

/** Identifies a single draggable or hovered track waypoint. */
export interface TrackWaypointRef {
  track: 'up' | 'down';
  segIdx: number;
}

/**
 * Identifies the midpoint of a segment between two consecutive track waypoints.
 * `segIdx` is the index of the first of the two waypoints (so the midpoint is
 * between waypoints[segIdx] and waypoints[segIdx+1]).
 */
export interface TrackMidpointRef {
  track: 'up' | 'down';
  /** Index of the first waypoint of the segment (midpoint is between [segIdx] and [segIdx+1]). */
  segIdx: number;
}

export interface LevelProperties {
  roadInfo: number; // SInt16 – index into kPackRoad
  time: number; // UInt16 – level time limit
  xStartPos: number; // SInt16 – player start X position
  levelEnd: number; // UInt16 – Y position of finish line
  objectGroups: ObjectGroupRef[]; // 10 slots
}

/** Full in-memory representation of a decoded level. */
export interface ParsedLevel {
  resourceId: number;
  properties: LevelProperties;
  objectGroups: ObjectGroupRef[]; // 10 entries
  trackUp: TrackSeg[];
  trackDown: TrackSeg[];
  objects: ObjectPos[];
  roadSegs: RoadSeg[];
  roadSegCount: number;
  marks: MarkSeg[];
  rawEntry1: Uint8Array;
  rawEntry2: Uint8Array;
  encrypted: boolean;
}

/** Legacy tile overlay kept for backward compatibility. */
export interface EditableLevel {
  resourceId: number;
  width: number;
  height: number;
  tiles: number[];
}

export interface EditableSpriteAsset {
  id: number;
  type: string;
  size: number;
}

export interface ObjectTypeDefinition {
  typeRes: number;
  mass: number;
  maxEngineForce: number;
  maxNegEngineForce: number;
  friction: number;
  flags: number;
  deathObj: number;
  frame: number;
  numFrames: number;
  frameDuration: number;
  wheelWidth: number;
  wheelLength: number;
  steering: number;
  width: number;
  length: number;
  score: number;
  flags2: number;
  creationSound: number;
  otherSound: number;
  maxDamage: number;
  weaponObj: number;
  weaponInfo: number;
}

export interface DecodedSpriteFrame {
  frameId: number;
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
  bitDepth: 8 | 16;
}

// ------------------------------------------------------------------
// Road texture data types (exported so the worker can transfer them)
// ------------------------------------------------------------------

/** Decoded info for a single tRoadInfo entry in kPackRoad. */
export interface RoadInfoData {
  /** tRoadInfo entry ID (= roadInfo field in level data, e.g. 128–136). */
  id: number;
  friction: number;
  airResistance: number;
  backResistance: number;
  tolerance: number;
  marks: number;
  deathOffs: number;
  /** Texture ID in kPackTx16 for the off-road / background fill. */
  backgroundTex: number;
  /** Texture ID in kPackTx16 for the driveable road surface. */
  foregroundTex: number;
  /** Texture ID in kPackTx16 for the left (inside) kerb border. */
  roadLeftBorder: number;
  /** Texture ID in kPackTx16 for the right (outside) kerb border. */
  roadRightBorder: number;
  tracks: number;
  skidSound: number;
  filler: number;
  xDrift: number;
  yDrift: number;
  xFrontDrift: number;
  yFrontDrift: number;
  trackSlide: number;
  dustSlide: number;
  dustColor: number;
  /** True for water levels (level 5 / roadInfo 133). */
  water: boolean;
  filler2: number;
  slideFriction: number;
}

/** Road-info picker entry used by the editor toolbar. */
export interface RoadInfoOption {
  id: number;
  label: string;
  previewUrl: string | null;
  water: boolean;
}

export interface TextureTileEntry {
  texId: number;
  width: number;
  height: number;
}

export interface RoadTileGroup {
  roadInfoId: number;
  label: string;
  tiles: TextureTileEntry[];
}

/** Decoded 16-bit RGB555 texture ready for ImageData. */
export interface DecodedRoadTexture {
  texId: number;
  width: number;
  height: number;
  /** Raw RGBA8888 pixel data (width × height × 4 bytes). */
  pixels: ArrayBuffer;
}
