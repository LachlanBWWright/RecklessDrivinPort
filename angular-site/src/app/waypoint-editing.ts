import type { TrackSeg } from './level-editor.types';

export interface TrackWaypointEdit {
  track: 'up' | 'down';
  index: number;
  endIndex?: number;
  velo: number;
  flags: number;
}

export function isValidWaypointEdit(edit: TrackWaypointEdit): boolean {
  return (
    Number.isInteger(edit.index) &&
    edit.index >= 0 &&
    (edit.endIndex === undefined ||
      (Number.isInteger(edit.endIndex) && edit.endIndex >= edit.index)) &&
    Number.isFinite(edit.velo) &&
    edit.velo >= 0 &&
    Number.isFinite(Math.fround(edit.velo)) &&
    Number.isInteger(edit.flags) &&
    edit.flags >= 0 &&
    edit.flags <= 65535
  );
}

/** The destination's flags govern this stretch of the AI route. */
export function waypointBetween(from: TrackSeg, to: TrackSeg, x: number, y: number): TrackSeg {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const lengthSquared = dx * dx + dy * dy;
  const fraction =
    lengthSquared === 0
      ? 0.5
      : Math.max(0, Math.min(1, ((x - from.x) * dx + (y - from.y) * dy) / lengthSquared));
  return {
    x: Math.round(x),
    y: Math.round(y),
    flags: to.flags,
    velo: from.velo + (to.velo - from.velo) * fraction,
  };
}
