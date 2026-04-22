/**
 * Object type and object group binary codec helpers.
 *
 * Parses and serializes tObjectType (Pack 128) and object group (Pack 130) structs.
 * All functions are pure with no Angular dependencies.
 */
import type { ResourceDatEntry } from './resource-dat.service';
import type { ObjectTypeDefinition, ObjectGroupDefinition, ObjectGroupEntryData } from './level-editor.types';
import { parsePackHandle, encodePackHandle } from './pack-parser.service';

export const OBJECT_TYPES_PACK_ID  = 128;
export const OBJECT_GROUP_PACK_ID  = 130;
const OBJECT_TYPE_SIZE  = 64;

// tObjectType struct offsets (all big-endian)
const OT = {
  MASS: 0, MAX_ENGINE_FORCE: 4, MAX_NEG_ENGINE_FORCE: 8, FRICTION: 12,
  FLAGS: 16, DEATH_OBJ: 18, FRAME: 20, NUM_FRAMES: 22, FRAME_DURATION: 24,
  WHEEL_WIDTH: 28, WHEEL_LENGTH: 32, STEERING: 36, WIDTH: 40, LENGTH: 44,
  SCORE: 48, FLAGS2: 50, CREATION_SOUND: 52, OTHER_SOUND: 54,
  MAX_DAMAGE: 56, WEAPON_OBJ: 60, WEAPON_INFO: 62,
} as const;

function parseObjectTypeDefinition(data: Uint8Array): ObjectTypeDefinition | null {
  if (data.length < OBJECT_TYPE_SIZE) return null;
  const v = new DataView(data.buffer, data.byteOffset, data.byteLength);
  return {
    typeRes: 0,
    mass:              v.getFloat32(OT.MASS, false),
    maxEngineForce:    v.getFloat32(OT.MAX_ENGINE_FORCE, false),
    maxNegEngineForce: v.getFloat32(OT.MAX_NEG_ENGINE_FORCE, false),
    friction:          v.getFloat32(OT.FRICTION, false),
    flags:             v.getUint16(OT.FLAGS, false),
    deathObj:          v.getInt16(OT.DEATH_OBJ, false),
    frame:             v.getInt16(OT.FRAME, false),
    numFrames:         v.getUint16(OT.NUM_FRAMES, false),
    frameDuration:     v.getFloat32(OT.FRAME_DURATION, false),
    wheelWidth:        v.getFloat32(OT.WHEEL_WIDTH, false),
    wheelLength:       v.getFloat32(OT.WHEEL_LENGTH, false),
    steering:          v.getFloat32(OT.STEERING, false),
    width:             v.getFloat32(OT.WIDTH, false),
    length:            v.getFloat32(OT.LENGTH, false),
    score:             v.getUint16(OT.SCORE, false),
    flags2:            v.getUint16(OT.FLAGS2, false),
    creationSound:     v.getInt16(OT.CREATION_SOUND, false),
    otherSound:        v.getInt16(OT.OTHER_SOUND, false),
    maxDamage:         v.getFloat32(OT.MAX_DAMAGE, false),
    weaponObj:         v.getInt16(OT.WEAPON_OBJ, false),
    weaponInfo:        v.getInt16(OT.WEAPON_INFO, false),
  };
}

function serializeObjectTypeDefinition(def: ObjectTypeDefinition, baseData?: Uint8Array): Uint8Array {
  const out = baseData && baseData.length >= OBJECT_TYPE_SIZE
    ? baseData.slice(0, OBJECT_TYPE_SIZE)
    : new Uint8Array(OBJECT_TYPE_SIZE);
  const v = new DataView(out.buffer, out.byteOffset, out.byteLength);
  v.setFloat32(OT.MASS, def.mass, false);
  v.setFloat32(OT.MAX_ENGINE_FORCE, def.maxEngineForce, false);
  v.setFloat32(OT.MAX_NEG_ENGINE_FORCE, def.maxNegEngineForce, false);
  v.setFloat32(OT.FRICTION, def.friction, false);
  v.setUint16(OT.FLAGS, def.flags, false);
  v.setInt16(OT.DEATH_OBJ, def.deathObj, false);
  v.setInt16(OT.FRAME, def.frame, false);
  v.setUint16(OT.NUM_FRAMES, def.numFrames, false);
  v.setFloat32(OT.FRAME_DURATION, def.frameDuration, false);
  v.setFloat32(OT.WHEEL_WIDTH, def.wheelWidth, false);
  v.setFloat32(OT.WHEEL_LENGTH, def.wheelLength, false);
  v.setFloat32(OT.STEERING, def.steering, false);
  v.setFloat32(OT.WIDTH, def.width, false);
  v.setFloat32(OT.LENGTH, def.length, false);
  v.setUint16(OT.SCORE, def.score, false);
  v.setUint16(OT.FLAGS2, def.flags2, false);
  v.setInt16(OT.CREATION_SOUND, def.creationSound, false);
  v.setInt16(OT.OTHER_SOUND, def.otherSound, false);
  v.setFloat32(OT.MAX_DAMAGE, def.maxDamage, false);
  v.setInt16(OT.WEAPON_OBJ, def.weaponObj, false);
  v.setInt16(OT.WEAPON_INFO, def.weaponInfo, false);
  return out;
}

function parseObjectGroupDefinition(data: Uint8Array): ObjectGroupDefinition | null {
  if (data.length < 4) return null;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const numEntries = view.getUint32(0, false);
  if (numEntries > 1000) return null;
  const entries: ObjectGroupEntryData[] = [];
  let pos = 4;
  for (let i = 0; i < numEntries && pos + 12 <= data.length; i++) {
    entries.push({
      typeRes: view.getInt16(pos, false), minOffs: view.getInt16(pos + 2, false),
      maxOffs: view.getInt16(pos + 4, false), probility: view.getInt16(pos + 6, false),
      dir: view.getFloat32(pos + 8, false),
    });
    pos += 12;
  }
  return { id: 0, entries };
}

function serializeObjectGroupDefinition(group: ObjectGroupDefinition): Uint8Array {
  const buf = new Uint8Array(4 + group.entries.length * 12);
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  view.setUint32(0, group.entries.length, false);
  for (let i = 0; i < group.entries.length; i++) {
    const pos = 4 + i * 12;
    const e = group.entries[i];
    view.setInt16(pos, e.typeRes, false);
    view.setInt16(pos + 2, e.minOffs, false);
    view.setInt16(pos + 4, e.maxOffs, false);
    view.setInt16(pos + 6, e.probility, false);
    view.setFloat32(pos + 8, e.dir, false);
  }
  return buf;
}

// ── public API ─────────────────────────────────────────────────────────────

export function extractObjectTypeDefinitions(
  resources: ResourceDatEntry[],
): Map<number, ObjectTypeDefinition> {
  const pack = resources.find((e) => e.type === 'Pack' && e.id === OBJECT_TYPES_PACK_ID);
  const defs = new Map<number, ObjectTypeDefinition>();
  if (!pack) return defs;
  try {
    for (const entry of parsePackHandle(pack.data, pack.id)) {
      const def = parseObjectTypeDefinition(entry.data);
      if (def) defs.set(entry.id, { ...def, typeRes: entry.id });
    }
  } catch (e) {
    console.warn('[LevelEditor] failed to parse object types:', e);
  }
  return defs;
}

export function applyObjectTypeDefinitions(
  resources: ResourceDatEntry[],
  objectTypes: ObjectTypeDefinition[],
): ResourceDatEntry[] {
  return resources.map((res) => {
    if (res.type !== 'Pack' || res.id !== OBJECT_TYPES_PACK_ID) return res;
    try {
      const packEntries = parsePackHandle(res.data, res.id);
      const existingById = new Map(packEntries.map((e) => [e.id, e.data] as const));
      const newEntries = [...objectTypes]
        .sort((a, b) => a.typeRes - b.typeRes)
        .map((def) => ({ id: def.typeRes, data: serializeObjectTypeDefinition(def, existingById.get(def.typeRes)) }));
      return { ...res, data: encodePackHandle(newEntries, OBJECT_TYPES_PACK_ID) };
    } catch (e) {
      console.error('[LevelEditor] applyObjectTypeDefinitions error:', e);
      return res;
    }
  });
}

export function extractObjectGroupDefinitions(
  resources: ResourceDatEntry[],
): ObjectGroupDefinition[] {
  const pack = resources.find((e) => e.type === 'Pack' && e.id === OBJECT_GROUP_PACK_ID);
  if (!pack) return [];
  try {
    return parsePackHandle(pack.data, pack.id)
      .map((entry) => {
        const parsed = parseObjectGroupDefinition(entry.data);
        return parsed ? { id: entry.id, entries: parsed.entries } : null;
      })
      .filter((e): e is ObjectGroupDefinition => e !== null)
      .sort((a, b) => a.id - b.id);
  } catch (e) {
    console.warn('[LevelEditor] failed to parse object groups:', e);
    return [];
  }
}

export function applyObjectGroupDefinitions(
  resources: ResourceDatEntry[],
  groups: ObjectGroupDefinition[],
): ResourceDatEntry[] {
  return resources.map((res) => {
    if (res.type !== 'Pack' || res.id !== OBJECT_GROUP_PACK_ID) return res;
    try {
      const newEntries = [...groups]
        .sort((a, b) => a.id - b.id)
        .map((group) => ({ id: group.id, data: serializeObjectGroupDefinition(group) }));
      return { ...res, data: encodePackHandle(newEntries, OBJECT_GROUP_PACK_ID) };
    } catch (e) {
      console.warn('[LevelEditor] applyObjectGroupDefinitions error:', e);
      return res;
    }
  });
}
