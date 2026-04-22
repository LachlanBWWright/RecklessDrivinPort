/**
 * Level data binary serializers.
 *
 * Converts structured level data back to Uint8Array for storage in Pack entries.
 * All functions are pure with no Angular dependencies.
 */
import type { ObjectPos, LevelProperties } from './level-editor.types';

const LEVEL_DATA_SIZE = 48;
const TRACK_SEG_SIZE  = 12;
const OBJECT_POS_SIZE = 16;
const ROAD_SEG_SIZE   = 8;

function writeBigFloat32(view: DataView, offset: number, v: number): void {
  view.setFloat32(offset, v, false);
}

export function serializeLevelProperties(rawEntry1: Uint8Array, props: LevelProperties): Uint8Array {
  const out  = rawEntry1.slice();
  const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
  view.setInt16(0, props.roadInfo, false);
  view.setUint16(2, props.time, false);
  for (let i = 0; i < 10; i++) {
    const grp = props.objectGroups[i];
    if (grp) {
      view.setInt16(4 + i * 4, grp.resID, false);
      view.setInt16(4 + i * 4 + 2, grp.numObjs, false);
    }
  }
  view.setInt16(44, props.xStartPos, false);
  view.setUint16(46, props.levelEnd, false);
  return out;
}

export function serializeLevelTrack(
  rawEntry1: Uint8Array,
  trackUp: { x: number; y: number; flags: number; velo: number }[],
  trackDown: { x: number; y: number; flags: number; velo: number }[],
): Uint8Array {
  const view = new DataView(rawEntry1.buffer, rawEntry1.byteOffset, rawEntry1.byteLength);
  let pos = LEVEL_DATA_SIZE;
  const oldUpCount = view.getUint32(pos, false);
  pos = LEVEL_DATA_SIZE + 4 + oldUpCount * TRACK_SEG_SIZE;
  const oldDownCount = view.getUint32(pos, false);
  const after  = rawEntry1.slice(pos + 4 + oldDownCount * TRACK_SEG_SIZE);
  const before = rawEntry1.slice(0, LEVEL_DATA_SIZE);

  const writeTrack = (segs: { x: number; y: number; flags: number; velo: number }[]): Uint8Array => {
    const buf = new Uint8Array(4 + segs.length * TRACK_SEG_SIZE);
    const bv  = new DataView(buf.buffer);
    bv.setUint32(0, segs.length, false);
    for (let i = 0; i < segs.length; i++) {
      const o = 4 + i * TRACK_SEG_SIZE;
      bv.setUint16(o, segs[i].flags, false);
      bv.setInt16(o + 2, segs[i].x, false);
      bv.setInt32(o + 4, segs[i].y, false);
      writeBigFloat32(bv, o + 8, segs[i].velo);
    }
    return buf;
  };

  const upBuf  = writeTrack(trackUp);
  const downBuf = writeTrack(trackDown);
  const result = new Uint8Array(before.length + upBuf.length + downBuf.length + after.length);
  result.set(before, 0);
  result.set(upBuf, before.length);
  result.set(downBuf, before.length + upBuf.length);
  result.set(after, before.length + upBuf.length + downBuf.length);
  return result;
}

export function serializeLevelObjects(rawEntry1: Uint8Array, objects: ObjectPos[]): Uint8Array {
  const view = new DataView(rawEntry1.buffer, rawEntry1.byteOffset, rawEntry1.byteLength);
  let pos = LEVEL_DATA_SIZE;
  const upCount   = view.getUint32(pos, false);  pos += 4 + upCount   * TRACK_SEG_SIZE;
  const downCount = view.getUint32(pos, false);  pos += 4 + downCount * TRACK_SEG_SIZE;
  const objStart  = pos;
  const oldObjCount = pos + 4 <= rawEntry1.length ? view.getUint32(pos, false) : 0;

  const block = new Uint8Array(4 + objects.length * OBJECT_POS_SIZE);
  const bv = new DataView(block.buffer);
  bv.setUint32(0, objects.length, false);
  for (let i = 0; i < objects.length; i++) {
    const o = 4 + i * OBJECT_POS_SIZE;
    bv.setInt32(o, objects[i].x, false);
    bv.setInt32(o + 4, objects[i].y, false);
    writeBigFloat32(bv, o + 8, objects[i].dir);
    bv.setInt16(o + 12, objects[i].typeRes, false);
    bv.setInt16(o + 14, 0, false);
  }
  const before = rawEntry1.slice(0, objStart);
  const after  = rawEntry1.slice(objStart + 4 + oldObjCount * OBJECT_POS_SIZE);
  const result = new Uint8Array(before.length + block.length + after.length);
  result.set(before, 0);
  result.set(block, before.length);
  result.set(after, before.length + block.length);
  return result;
}

export function serializeLevelRoadSegs(
  rawEntry1: Uint8Array,
  roadSegs: { v0: number; v1: number; v2: number; v3: number }[],
): Uint8Array {
  const view = new DataView(rawEntry1.buffer, rawEntry1.byteOffset, rawEntry1.byteLength);
  let pos = LEVEL_DATA_SIZE;
  const upCount   = view.getUint32(pos, false);  pos += 4 + upCount   * TRACK_SEG_SIZE;
  const downCount = view.getUint32(pos, false);  pos += 4 + downCount * TRACK_SEG_SIZE;
  const objCount  = view.getUint32(pos, false);  pos += 4 + objCount  * OBJECT_POS_SIZE;
  const roadStart = pos;
  const oldRoadCount = pos + 4 <= rawEntry1.length ? view.getUint32(pos, false) : 0;

  const block = new Uint8Array(4 + roadSegs.length * ROAD_SEG_SIZE);
  const bv = new DataView(block.buffer);
  bv.setUint32(0, roadSegs.length, false);
  for (let i = 0; i < roadSegs.length; i++) {
    const o = 4 + i * ROAD_SEG_SIZE;
    bv.setInt16(o, roadSegs[i].v0, false);
    bv.setInt16(o + 2, roadSegs[i].v1, false);
    bv.setInt16(o + 4, roadSegs[i].v2, false);
    bv.setInt16(o + 6, roadSegs[i].v3, false);
  }
  const before = rawEntry1.slice(0, roadStart);
  const after  = rawEntry1.slice(roadStart + 4 + oldRoadCount * ROAD_SEG_SIZE);
  const result = new Uint8Array(before.length + block.length + after.length);
  result.set(before, 0);
  result.set(block, before.length);
  result.set(after, before.length + block.length);
  return result;
}
