import type { ResourceDatEntry } from './resource-dat.service';
import { parsePackHandle, encodePackHandle } from './pack-parser.service';
import {
  LEVEL_SCRIPT_BINDINGS_RESOURCE_ID,
  LEVEL_SCRIPT_BINDINGS_RESOURCE_TYPE,
  SCRIPT_BINDINGS_RESOURCE_ID,
  SCRIPT_BINDINGS_RESOURCE_TYPE,
  SCRIPT_RESOURCE_TYPE,
  serializeLevelScriptBindings,
  serializeScriptBindings,
  serializeScriptDefinition,
} from './script-format';
import type {
  LevelScriptBinding,
  MarkSeg,
  ObjectTypeDefinition,
  ScriptBinding,
  ScriptDefinition,
  ScriptValidationIssue,
} from './level-editor.types';
import { LevelEditorService } from './level-editor.service';
import { validateScripts } from './script-format';
import { OBJECT_TYPES_PACK_ID, serializeObjectTypeDefinition } from './level-editor-binary-codecs';

export interface ScriptResourceExtraction {
  scripts: ScriptDefinition[];
  bindings: ScriptBinding[];
  levelBindings: LevelScriptBinding[];
  issues: ScriptValidationIssue[];
}

export function extractScriptResources(resources: ResourceDatEntry[]): ScriptResourceExtraction {
  const service = new LevelEditorService();
  const scripts = [...service.extractScriptDefinitions(resources).values()].sort(
    (a, b) => a.id - b.id,
  );
  const bindings = service.extractScriptBindings(resources);
  const levelBindings = service.extractLevelScriptBindings(resources);
  const issues = validateScripts(scripts, bindings);
  return { scripts, bindings, levelBindings, issues };
}

export function applyObjectTypeDefinitions(
  resources: ResourceDatEntry[],
  objectTypes: ObjectTypeDefinition[],
): ResourceDatEntry[] {
  return resources.map((res) => {
    if (res.type !== 'Pack' || res.id !== OBJECT_TYPES_PACK_ID) return res;
    try {
      const packEntries = parsePackHandle(res.data, res.id);
      const existingById = new Map(packEntries.map((entry) => [entry.id, entry.data] as const));
      const newEntries = [...objectTypes]
        .sort((a, b) => a.typeRes - b.typeRes)
        .map((def) => ({
          id: def.typeRes,
          data: serializeObjectTypeDefinition(def, existingById.get(def.typeRes)),
        }));
      return { ...res, data: encodePackHandle(newEntries, OBJECT_TYPES_PACK_ID) };
    } catch (err) {
      console.error('[LevelEditor] applyObjectTypeDefinitions error:', err);
      return res;
    }
  });
}

export function applyScriptResources(
  resources: ResourceDatEntry[],
  scripts: ScriptDefinition[],
  bindings: ScriptBinding[],
  levelBindings: LevelScriptBinding[] = [],
): ResourceDatEntry[] {
  const nextResources = stripScriptResources(resources);

  for (const script of [...scripts].sort((a, b) => a.id - b.id)) {
    nextResources.push({
      type: SCRIPT_RESOURCE_TYPE,
      id: script.id,
      data: serializeScriptDefinition(script),
    });
  }

  nextResources.push({
    type: SCRIPT_BINDINGS_RESOURCE_TYPE,
    id: SCRIPT_BINDINGS_RESOURCE_ID,
    data: serializeScriptBindings(bindings),
  });

  if (levelBindings.length > 0) {
    nextResources.push({
      type: LEVEL_SCRIPT_BINDINGS_RESOURCE_TYPE,
      id: LEVEL_SCRIPT_BINDINGS_RESOURCE_ID,
      data: serializeLevelScriptBindings(levelBindings),
    });
  }

  return sortResourceEntries(nextResources);
}

export function stripScriptResources(resources: ResourceDatEntry[]): ResourceDatEntry[] {
  return resources.filter(
    (resource) =>
      resource.type !== SCRIPT_RESOURCE_TYPE &&
      !(
        resource.type === SCRIPT_BINDINGS_RESOURCE_TYPE &&
        resource.id === SCRIPT_BINDINGS_RESOURCE_ID
      ) &&
      !(
        resource.type === LEVEL_SCRIPT_BINDINGS_RESOURCE_TYPE &&
        resource.id === LEVEL_SCRIPT_BINDINGS_RESOURCE_ID
      ),
  );
}

function sortResourceEntries(resources: ResourceDatEntry[]): ResourceDatEntry[] {
  return resources.sort((a, b) => (a.type === b.type ? a.id - b.id : a.type.localeCompare(b.type)));
}

/** Serialize mark segments back to binary */
export function serializeMarkSegs(marks: MarkSeg[]): Uint8Array {
  const buf = new Uint8Array(marks.length * 16);
  const view = new DataView(buf.buffer);
  for (let i = 0; i < marks.length; i++) {
    const o = i * 16;
    // false = big-endian, matching parseMarkSegs deserialization (float x + float y)
    view.setFloat32(o, marks[i].x1, false);
    view.setFloat32(o + 4, marks[i].y1, false);
    view.setFloat32(o + 8, marks[i].x2, false);
    view.setFloat32(o + 12, marks[i].y2, false);
  }
  return buf;
}
