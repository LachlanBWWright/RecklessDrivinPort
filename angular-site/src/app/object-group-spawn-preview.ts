import type {
  ObjectGroupDefinition,
  ObjectGroupEntryData,
  ObjectGroupSpawnPreviewObject,
  ObjectPos,
  RoadSeg,
  TrackSeg,
} from './level-editor.types';

const SCALE = 9;
const MIN_CAR_DIST = 25;
const MIN_TRACK_OBJECT_DIST_SQ = SCALE * SCALE * MIN_CAR_DIST * MIN_CAR_DIST;
const MAX_POSITION_ATTEMPTS = 512;

export const DEFAULT_OBJECT_GROUP_PREVIEW_START_Y = 500;

type ControlMode = ObjectGroupSpawnPreviewObject['control'];
type TrackControlMode = Extract<ControlMode, 'track-up' | 'track-down'>;
type OccupiedPoint = Pick<ObjectPos, 'x' | 'y'>;

export interface ObjectGroupPreviewSlotRequest {
  slotIndex: number;
  numObjs: number;
  seed: number;
  group: ObjectGroupDefinition;
}

export interface ObjectGroupSpawnPreviewInput {
  previewStartY: number;
  levelEnd: number;
  roadSegs: readonly RoadSeg[];
  trackUp: readonly TrackSeg[];
  trackDown: readonly TrackSeg[];
  occupiedObjects: readonly OccupiedPoint[];
  slots: readonly ObjectGroupPreviewSlotRequest[];
}

interface GeneratedPreviewPlacement {
  x: number;
  y: number;
  dir: number;
  control: ControlMode;
}

interface TrackInterpolation {
  x: number;
  targetIndex: number;
}

function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  if (state === 0) {
    state = 0x6d2b79f5;
  }
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

function ranFl(nextRandom: () => number, min: number, max: number): number {
  return nextRandom() * (max - min) + min;
}

function ranInt(nextRandom: () => number, min: number, max: number): number {
  if (max <= min) {
    return min;
  }
  return Math.floor(nextRandom() * (max - min) + min);
}

function ranProb(nextRandom: () => number, probability: number): boolean {
  return nextRandom() <= probability;
}

function clampPreviewStartY(previewStartY: number, levelEnd: number): number {
  if (!Number.isFinite(levelEnd) || levelEnd <= 0) {
    return 0;
  }
  if (!Number.isFinite(previewStartY)) {
    return Math.min(DEFAULT_OBJECT_GROUP_PREVIEW_START_Y, Math.floor(levelEnd));
  }
  return Math.max(0, Math.min(Math.round(previewStartY), Math.floor(levelEnd)));
}

function getRoadSegAtY(roadSegs: readonly RoadSeg[], y: number): RoadSeg | null {
  if (roadSegs.length === 0) {
    return null;
  }
  const index = Math.max(0, Math.min(roadSegs.length - 1, Math.floor(y / 2)));
  return roadSegs[index] ?? null;
}

function interpolateTrackX(
  track: readonly TrackSeg[],
  y: number,
  descending: boolean,
): TrackInterpolation | null {
  if (track.length === 0) {
    return null;
  }
  if (track.length === 1) {
    return { x: track[0].x, targetIndex: 0 };
  }

  let targetIndex = 1;
  if (descending) {
    while (targetIndex < track.length && track[targetIndex].y > y) {
      targetIndex += 1;
    }
  } else {
    while (targetIndex < track.length && track[targetIndex].y < y) {
      targetIndex += 1;
    }
  }

  const clampedTargetIndex = Math.min(targetIndex, track.length - 1);
  const startIndex = Math.max(0, clampedTargetIndex - 1);
  const start = track[startIndex];
  const end = track[clampedTargetIndex];
  const dy = end.y - start.y;
  if (dy === 0) {
    return { x: end.x, targetIndex: clampedTargetIndex };
  }

  const x = start.x + ((end.x - start.x) / dy) * (y - start.y);
  return { x, targetIndex: clampedTargetIndex };
}

function computeTrackAlignedDir(
  track: readonly TrackSeg[],
  targetIndex: number,
  x: number,
  y: number,
  control: TrackControlMode,
): number {
  const target = track[Math.max(0, Math.min(targetIndex, track.length - 1))];
  if (!target) {
    return control === 'track-up' ? 0 : Math.PI;
  }
  if (y === target.y) {
    return control === 'track-up' ? 0 : Math.PI;
  }
  const angle = Math.atan((x - target.x) / (y - target.y));
  return control === 'track-up' ? angle : Math.PI + angle;
}

function getClosestSqDistance(
  occupiedObjects: readonly OccupiedPoint[],
  x: number,
  y: number,
): number {
  let closestSqDistance = Number.POSITIVE_INFINITY;
  for (const object of occupiedObjects) {
    const dx = object.x - x;
    const dy = object.y - y;
    const sqDistance = dx * dx + dy * dy;
    if (sqDistance < closestSqDistance) {
      closestSqDistance = sqDistance;
    }
  }
  return closestSqDistance;
}

function buildProbabilityTable(group: ObjectGroupDefinition): number[] {
  const probabilityTable: number[] = [];
  group.entries.forEach((entry, entryIndex) => {
    const weight = Math.max(0, Math.floor(entry.probility));
    for (let count = 0; count < weight; count += 1) {
      probabilityTable.push(entryIndex);
    }
  });
  return probabilityTable;
}

function chooseTrackControl(
  nextRandom: () => number,
  hasTrackUp: boolean,
  hasTrackDown: boolean,
): TrackControlMode | null {
  if (!hasTrackUp && !hasTrackDown) {
    return null;
  }
  if (!hasTrackDown) {
    return 'track-up';
  }
  if (!hasTrackUp) {
    return 'track-down';
  }
  return ranProb(nextRandom, 0.5) ? 'track-up' : 'track-down';
}

function generatePlacement(
  entry: ObjectGroupEntryData,
  previewStartY: number,
  levelEnd: number,
  roadSegs: readonly RoadSeg[],
  trackUp: readonly TrackSeg[],
  trackDown: readonly TrackSeg[],
  occupiedObjects: readonly OccupiedPoint[],
  nextRandom: () => number,
): GeneratedPreviewPlacement | null {
  let fallbackPlacement: GeneratedPreviewPlacement | null = null;

  for (let attempt = 0; attempt < MAX_POSITION_ATTEMPTS; attempt += 1) {
    const y = ranFl(nextRandom, previewStartY, levelEnd);
    if (entry.dir === -1) {
      const control = chooseTrackControl(nextRandom, trackUp.length > 0, trackDown.length > 0);
      if (control === null) {
        return null;
      }

      const track = control === 'track-up' ? trackUp : trackDown;
      const interpolation = interpolateTrackX(track, y, control === 'track-down');
      if (interpolation === null) {
        continue;
      }

      const placement: GeneratedPreviewPlacement = {
        x: interpolation.x,
        y,
        dir: computeTrackAlignedDir(track, interpolation.targetIndex, interpolation.x, y, control),
        control,
      };
      fallbackPlacement = placement;
      if (
        getClosestSqDistance(occupiedObjects, placement.x, placement.y) > MIN_TRACK_OBJECT_DIST_SQ
      ) {
        return placement;
      }
      continue;
    }

    const road = getRoadSegAtY(roadSegs, y);
    if (road === null) {
      continue;
    }

    const border = ranInt(nextRandom, 0, 4);
    const xOffset = ranFl(nextRandom, entry.minOffs, entry.maxOffs);
    const { v0, v1, v2, v3 } = road;
    let x = 0;
    let ok = false;

    if (v1 === v2) {
      switch (border) {
        case 0:
        case 2:
          x = v0 + xOffset;
          ok = v3 >= x + entry.minOffs;
          break;
        default:
          x = v3 - xOffset;
          ok = v0 <= x - entry.minOffs;
          break;
      }
    } else {
      switch (border) {
        case 0:
        case 2: {
          const borderX = border === 0 ? v0 : v2;
          const inwardBorderX = border === 0 ? v1 : v3;
          x = borderX + xOffset;
          if (entry.minOffs >= 0) {
            ok = inwardBorderX >= x + entry.minOffs;
          } else {
            ok = border === 2 ? v1 <= x + entry.minOffs : true;
          }
          break;
        }
        default: {
          const borderX = border === 1 ? v1 : v3;
          const inwardBorderX = border === 1 ? v0 : v2;
          x = borderX - xOffset;
          if (entry.minOffs >= 0) {
            ok = inwardBorderX <= x - entry.minOffs;
          } else {
            ok = border === 1 ? v2 >= x - entry.minOffs : true;
          }
          break;
        }
      }
    }

    const placement: GeneratedPreviewPlacement = {
      x,
      y,
      dir: ranFl(nextRandom, -entry.dir, entry.dir),
      control: 'road',
    };
    fallbackPlacement = placement;
    if (ok) {
      return placement;
    }
  }

  return fallbackPlacement;
}

export function generateObjectGroupSpawnPreview(
  input: ObjectGroupSpawnPreviewInput,
): ObjectGroupSpawnPreviewObject[] {
  const previewStartY = clampPreviewStartY(input.previewStartY, input.levelEnd);
  if (input.levelEnd <= 0 || previewStartY > input.levelEnd) {
    return [];
  }

  const occupiedObjects: OccupiedPoint[] = input.occupiedObjects.map((object) => ({
    x: object.x,
    y: object.y,
  }));
  const previewObjects: ObjectGroupSpawnPreviewObject[] = [];

  const orderedSlots = [...input.slots]
    .filter((slot) => slot.numObjs > 0 && slot.group.entries.length > 0)
    .sort((left, right) => left.slotIndex - right.slotIndex);

  for (const slot of orderedSlots) {
    const probabilityTable = buildProbabilityTable(slot.group);
    if (probabilityTable.length === 0) {
      continue;
    }

    const nextRandom = createSeededRandom(slot.seed);
    for (let generatedCount = 0; generatedCount < slot.numObjs; generatedCount += 1) {
      const entryIndex = probabilityTable[ranInt(nextRandom, 0, probabilityTable.length)];
      const entry = slot.group.entries[entryIndex];
      if (!entry) {
        continue;
      }

      const placement = generatePlacement(
        entry,
        previewStartY,
        input.levelEnd,
        input.roadSegs,
        input.trackUp,
        input.trackDown,
        occupiedObjects,
        nextRandom,
      );
      if (placement === null) {
        continue;
      }

      const previewObject: ObjectGroupSpawnPreviewObject = {
        slotIndex: slot.slotIndex,
        groupId: slot.group.id,
        entryIndex,
        typeRes: entry.typeRes,
        x: placement.x,
        y: placement.y,
        dir: placement.dir,
        control: placement.control,
      };
      previewObjects.push(previewObject);
      occupiedObjects.push({ x: placement.x, y: placement.y });
    }
  }

  return previewObjects;
}
