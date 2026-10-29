import { err, ok, type Result } from 'neverthrow';
import type { ResourceDatEntry } from './resource-dat.service';
import { encodePackHandle, parsePackHandle } from './pack-parser.service';
import {
  parseLevelEntry,
  serializeLevelProperties,
  serializeLevelRoadSegs,
  serializeLevelTrack,
} from './level-editor-binary-codecs';
import {
  parseLevelScriptBindings,
  serializeLevelScriptBindings,
  LEVEL_SCRIPT_BINDINGS_RESOURCE_ID,
  LEVEL_SCRIPT_BINDINGS_RESOURCE_TYPE,
} from './script-format';
import { resultFromThrowable } from './result-helpers';

export type LevelOperation =
  | 'new'
  | 'duplicate'
  | 'delete'
  | 'earlier'
  | 'later'
  | { order: number[] };

function isLevelOperation(value: unknown): value is LevelOperation {
  if (typeof value === 'string')
    return ['new', 'duplicate', 'delete', 'earlier', 'later'].includes(value);
  return (
    typeof value === 'object' &&
    value !== null &&
    'order' in value &&
    Array.isArray(value.order) &&
    value.order.every((id: unknown) => typeof id === 'number' && Number.isInteger(id))
  );
}
export interface LevelManagementRequest {
  operation: LevelOperation;
  resourceId: number;
}
export interface LevelManagementResult {
  resources: ResourceDatEntry[];
  selectedLevelId: number;
}
export function isLevelManagementRequest(value: unknown): value is LevelManagementRequest {
  return (
    typeof value === 'object' &&
    value !== null &&
    'operation' in value &&
    isLevelOperation(value.operation) &&
    'resourceId' in value &&
    typeof value.resourceId === 'number'
  );
}

/** Empty traffic and scenery on a straight road; retain a valid road-info resource reference. */
export function blankLevelData(roadInfo: number): Uint8Array {
  const groups = Array.from({ length: 10 }, () => ({ resID: 0, numObjs: 0 }));
  let bytes = serializeLevelProperties(new Uint8Array(64), {
    roadInfo,
    time: 120,
    xStartPos: 0,
    levelEnd: 4000,
    objectGroups: groups,
  });
  bytes = serializeLevelTrack(
    bytes,
    [
      { x: -60, y: 0, velo: 20, flags: 0 },
      { x: -60, y: 6000, velo: 20, flags: 0 },
    ],
    [
      { x: 60, y: 6000, velo: 20, flags: 0 },
      { x: 60, y: 0, velo: 20, flags: 0 },
    ],
  );
  return serializeLevelRoadSegs(
    bytes,
    Array.from({ length: 3001 }, () => ({ v0: -200, v1: -120, v2: 120, v3: 200 })),
  );
}

/** Rebuild every destination pack with its destination encryption, preserving opaque entries. */
export function manageLevels(
  resources: ResourceDatEntry[],
  request: LevelManagementRequest,
): Result<LevelManagementResult, string> {
  const levels = resources
    .filter((entry) => entry.type === 'Pack' && entry.id >= 140 && entry.id <= 149)
    .sort((a, b) => a.id - b.id);
  if (levels.length === 0) return err('Load a valid level before managing levels.');
  if (levels.some((level, index) => level.id !== 140 + index))
    return err('Level management requires consecutive level slots starting at level 1.');
  const index = levels.findIndex((level) => level.id === request.resourceId);
  if (index < 0) return err('Select a level first.');
  if ((request.operation === 'new' || request.operation === 'duplicate') && levels.length >= 10)
    return err('The game supports at most ten levels. Delete a level to make space.');
  if (request.operation === 'delete' && levels.length <= 1) return err('Keep at least one level.');
  const operation = request.operation;
  if (
    typeof operation === 'object' &&
    (operation.order.length !== levels.length ||
      new Set(operation.order).size !== levels.length ||
      operation.order.some((id) => !levels.some((level) => level.id === id)))
  )
    return err('The level order must include every level exactly once.');
  const target = index + (request.operation === 'earlier' ? -1 : 1);
  if (
    (request.operation === 'earlier' || request.operation === 'later') &&
    (target < 0 || target >= levels.length)
  )
    return err('This level is already at the end of the list.');
  return resultFromThrowable(() => {
    const decoded = levels.map((level) => ({
      sourceId: level.id,
      entries: parsePackHandle(level.data, level.id),
    }));
    for (const level of decoded) {
      const data = level.entries.find((entry) => entry.id === 1)?.data;
      if (!data || parseLevelEntry(data).unwrapOr(null) === null)
        return err('A level pack is invalid; no levels were changed.');
    }
    const selected = decoded[index];
    let nextSelection = index;
    if (typeof operation === 'object') {
      decoded.sort(
        (a, b) => operation.order.indexOf(a.sourceId) - operation.order.indexOf(b.sourceId),
      );
      nextSelection = decoded.indexOf(selected);
    }
    switch (request.operation) {
      case 'new': {
        const template = selected.entries.find((entry) => entry.id === 1);
        if (!template) return err('Selected level has no level data.');
        const parsed = parseLevelEntry(template.data).unwrapOr(null);
        if (parsed === null) return err('Selected level data is invalid.');
        decoded.splice(index + 1, 0, {
          sourceId: -1,
          entries: [
            { id: 1, data: blankLevelData(parsed.properties.roadInfo) },
            { id: 2, data: new Uint8Array() },
          ],
        });
        nextSelection = index + 1;
        break;
      }
      case 'duplicate':
        decoded.splice(index + 1, 0, selected);
        nextSelection = index + 1;
        break;
      case 'delete':
        decoded.splice(index, 1);
        nextSelection = Math.min(index, decoded.length - 1);
        break;
      case 'earlier':
      case 'later':
        decoded.splice(index, 1);
        decoded.splice(target, 0, selected);
        nextSelection = target;
        break;
    }
    const next = resources.filter(
      (entry) => !(entry.type === 'Pack' && entry.id >= 140 && entry.id <= 149),
    );
    for (const [slot, level] of decoded.entries())
      next.push({
        type: 'Pack',
        id: 140 + slot,
        data: encodePackHandle(level.entries, 140 + slot),
      });
    const bindingResource = next.find(
      (entry) =>
        entry.type === LEVEL_SCRIPT_BINDINGS_RESOURCE_TYPE &&
        entry.id === LEVEL_SCRIPT_BINDINGS_RESOURCE_ID,
    );
    if (bindingResource) {
      const parsedBindings = parseLevelScriptBindings(bindingResource.data).unwrapOr(null);
      if (parsedBindings === null) return err('Level script bindings are invalid.');
      const bindings = parsedBindings.flatMap((binding) =>
        binding.levelResourceId === 0
          ? [binding]
          : decoded.flatMap((level, slot) =>
              level.sourceId === binding.levelResourceId
                ? [{ ...binding, levelResourceId: 140 + slot }]
                : [],
            ),
      );
      const position = next.indexOf(bindingResource);
      next[position] = { ...bindingResource, data: serializeLevelScriptBindings(bindings) };
    }
    return ok({ resources: next, selectedLevelId: 140 + nextSelection });
  }, 'Could not rebuild level packs')().andThen((result) => result);
}
