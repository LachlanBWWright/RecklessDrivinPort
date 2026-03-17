import Konva from 'konva';
import type { ObjectPos } from './level-editor.service';

export interface KonvaDragEndEvent {
  index: number;
  worldX: number;
  worldY: number;
}

export interface KonvaWaypointDragEndEvent {
  track: 'up' | 'down';
  segIdx: number;
  worldX: number;
  worldY: number;
}

export interface KonvaMarkDragEndEvent {
  markIdx: number;
  endpoint: 'p1' | 'p2';
  worldX: number;
  worldY: number;
}

export type KonvaWorldNode = Konva.Group | Konva.Circle;

export const WAYPOINT_WORLD_R = 10;
export const FALLBACK_CIRCLE_WORLD_R = 14;
export const MARK_ENDPOINT_WORLD_R = 12;

export const EMPTY_SET = new Set<number>();

export function setsEqual<T>(a: Set<T>, b: Set<T>): boolean {
  if (a.size !== b.size) return false;
  for (const item of a) { if (!b.has(item)) return false; }
  return true;
}

export type { ObjectPos };
