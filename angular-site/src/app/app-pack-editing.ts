import type { ObjectGroupDefinition, ObjectGroupEntryData, ObjectTypeDefinition } from './level-editor.service';
import type { App } from './app';
import { decodeSpritePreviewsInBackground } from './app-loaders';
import { resultFromPromise } from './result-helpers';

export function cloneObjectGroupDefinitions(app: App, groups = app.objectGroupDefinitions()): ObjectGroupDefinition[] {
  return groups.map((group: ObjectGroupDefinition) => ({
    id: group.id,
    entries: group.entries.map((entry) => ({ ...entry })),
  }));
}

export function nextObjectGroupId(app: App, groups = app.objectGroupDefinitions()): number {
  const used = new Set(groups.map((group: ObjectGroupDefinition) => group.id));
  let candidate = 128;
  while (used.has(candidate)) candidate++;
  return candidate;
}

export function defaultObjectGroupEntry(app: App): ObjectGroupEntryData {
  return {
    typeRes: app.availableTypeIds()[0] ?? 128,
    minOffs: 0,
    maxOffs: 0,
    probility: 1,
    dir: 0,
  };
}

export function selectedObjectGroup(app: App): ObjectGroupDefinition | null {
  const id = app.selectedObjectGroupId();
  if (id === null) return null;
  return app.objectGroupDefinitions().find((group: ObjectGroupDefinition) => group.id === id) ?? null;
}

export function selectObjectGroup(app: App, groupId: number): void {
  app.selectedObjectGroupId.set(groupId);
}

export function addObjectGroup(app: App, duplicateSelected = false): void {
  const groups = cloneObjectGroupDefinitions(app);
  const selected = duplicateSelected ? selectedObjectGroup(app) : null;
  const id = nextObjectGroupId(app, groups);
  groups.push({
    id,
    entries: selected ? selected.entries.map((entry) => ({ ...entry })) : [defaultObjectGroupEntry(app)],
  });
  app.objectGroupDefinitions.set(groups);
  app.selectedObjectGroupId.set(id);
  app.markObjectGroupsDirty();
}

export function deleteObjectGroup(app: App, groupId: number): void {
  const groups = cloneObjectGroupDefinitions(app).filter((group: ObjectGroupDefinition) => group.id !== groupId);
  app.objectGroupDefinitions.set(groups);
  app.selectedObjectGroupId.set(groups[0]?.id ?? null);
  app.markObjectGroupsDirty();
}

export function addObjectGroupEntry(app: App, groupId: number): void {
  const groups = cloneObjectGroupDefinitions(app);
  const group = groups.find((item: ObjectGroupDefinition) => item.id === groupId);
  if (!group) return;
  group.entries.push(defaultObjectGroupEntry(app));
  app.objectGroupDefinitions.set(groups);
  app.markObjectGroupsDirty();
}

export function deleteObjectGroupEntry(app: App, groupId: number, entryIndex: number): void {
  const groups = cloneObjectGroupDefinitions(app);
  const group = groups.find((item: ObjectGroupDefinition) => item.id === groupId);
  if (!group) return;
  group.entries.splice(entryIndex, 1);
  app.objectGroupDefinitions.set(groups);
  app.markObjectGroupsDirty();
}

export function onObjectGroupEntryInput(
  app: App,
  groupId: number,
  entryIndex: number,
  field: keyof ObjectGroupEntryData,
  value: number,
): void {
  const groups = cloneObjectGroupDefinitions(app);
  const group = groups.find((item: ObjectGroupDefinition) => item.id === groupId);
  if (!group) return;
  const entry = group.entries[entryIndex];
  if (!entry) return;
  group.entries[entryIndex] = { ...entry, [field]: value };
  app.objectGroupDefinitions.set(groups);
  app.markObjectGroupsDirty();
}

export async function saveObjectGroups(app: App): Promise<void> {
  const groups = app.objectGroupDefinitions();
  if (!app.objectGroupsDirty()) return;
  const saveRevision = app.objectGroupsEditRevision;
  if (app.workerBusy()) {
    app.scheduleObjectGroupsAutoSave();
    return;
  }
  app.workerBusy.set(true);
  const result = await resultFromPromise(
    app.runtime.dispatchWorker<{ objectGroups: ObjectGroupDefinition[] }>('APPLY_OBJECT_GROUPS', { objectGroups: groups }),
    'Object group save failed',
  );
  result.match(
    (data) => {
      app.objectGroupDefinitions.set(data.objectGroups);
      if (!data.objectGroups.some((group: ObjectGroupDefinition) => group.id === app.selectedObjectGroupId())) {
        app.selectedObjectGroupId.set(data.objectGroups[0]?.id ?? null);
      }
      if (app.objectGroupsEditRevision === saveRevision) {
        app.objectGroupsDirty.set(false);
        app.resourcesStatus.set(`Saved ${data.objectGroups.length} object group(s).`);
        app.snackBar.open(`✓ Object groups saved`, 'OK', { duration: 3000, panelClass: 'snack-success' });
      } else {
        app.markObjectGroupsDirty();
        app.scheduleObjectGroupsAutoSave();
      }
    },
    (msg) => {
      app.editorError.set(msg);
      app.snackBar.open(`✗ ${msg}`, 'Dismiss', { duration: 5000, panelClass: 'snack-error' });
    },
  );
  app.workerBusy.set(false);
}

export function cloneObjectTypeDefinitions(app: App, defs = app.objectTypeDefinitions()): ObjectTypeDefinition[] {
  return defs.map((def: ObjectTypeDefinition) => ({ ...def }));
}

export function syncObjectTypeLookup(app: App, defs = app.objectTypeDefinitions()): void {
  app.objectTypeDefinitionMap.clear();
  for (const def of defs) app.objectTypeDefinitionMap.set(def.typeRes, def);
  app.availableTypeIds.set(defs.map((def: ObjectTypeDefinition) => def.typeRes).sort((a: number, b: number) => a - b));
}

export function nextObjectTypeId(app: App, defs = app.objectTypeDefinitions()): number {
  const used = new Set(defs.map((def: ObjectTypeDefinition) => def.typeRes));
  let candidate = 128;
  while (used.has(candidate)) candidate++;
  return candidate;
}

export function selectedObjectType(app: App): ObjectTypeDefinition | null {
  const id = app.selectedObjectTypeId();
  if (id === null) return null;
  return app.objectTypeDefinitions().find((def: ObjectTypeDefinition) => def.typeRes === id) ?? null;
}

export function scheduleObjectTypesAutoSave(app: App): void {
  if (app.objectTypesSaveTimer !== null) clearTimeout(app.objectTypesSaveTimer);
  app.objectTypesSaveTimer = setTimeout(() => {
    app.objectTypesSaveTimer = null;
    void saveObjectTypes(app);
  }, 300);
}

export function markObjectTypesDirty(app: App, defs: ObjectTypeDefinition[]): void {
  app.objectTypeDefinitions.set(defs);
  syncObjectTypeLookup(app, defs);
  app.objectTypesDirty.set(true);
  app.objectTypesEditRevision += 1;
  scheduleObjectTypesAutoSave(app);
}

export function defaultObjectTypeDefinition(
  app: App,
  typeRes: number,
  source?: ObjectTypeDefinition | null,
): ObjectTypeDefinition {
  const frameId = source?.frame ?? app.packSpriteFrames()[0]?.id ?? 128;
  return {
    typeRes,
    mass: source?.mass ?? 1,
    maxEngineForce: source?.maxEngineForce ?? 0,
    maxNegEngineForce: source?.maxNegEngineForce ?? 0,
    friction: source?.friction ?? 1,
    flags: source?.flags ?? 0,
    deathObj: source?.deathObj ?? -1,
    frame: frameId,
    numFrames: source?.numFrames ?? 1,
    frameDuration: source?.frameDuration ?? 0,
    wheelWidth: source?.wheelWidth ?? 0,
    wheelLength: source?.wheelLength ?? 0,
    steering: source?.steering ?? 0,
    width: source?.width ?? 0,
    length: source?.length ?? 0,
    score: source?.score ?? 0,
    flags2: source?.flags2 ?? 0,
    creationSound: source?.creationSound ?? -1,
    otherSound: source?.otherSound ?? -1,
    maxDamage: source?.maxDamage ?? 0,
    weaponObj: source?.weaponObj ?? -1,
    weaponInfo: source?.weaponInfo ?? -1,
  };
}

export function selectObjectType(app: App, typeRes: number): void {
  app.selectedObjectTypeId.set(typeRes);
}

export function addObjectType(app: App, duplicateSelected = false): void {
  const defs = cloneObjectTypeDefinitions(app);
  const selected = duplicateSelected ? selectedObjectType(app) : null;
  const typeRes = nextObjectTypeId(app, defs);
  defs.push(defaultObjectTypeDefinition(app, typeRes, selected));
  app.selectedObjectTypeId.set(typeRes);
  markObjectTypesDirty(app, defs);
}

export function deleteObjectType(app: App, typeRes: number): void {
  const defs = cloneObjectTypeDefinitions(app).filter((def: ObjectTypeDefinition) => def.typeRes !== typeRes);
  app.selectedObjectTypeId.set(defs[0]?.typeRes ?? null);
  markObjectTypesDirty(app, defs);
}

export function onObjectTypeFieldInput(
  app: App,
  typeRes: number,
  field: Exclude<keyof ObjectTypeDefinition, 'typeRes'>,
  value: number,
): void {
  if (field === 'numFrames') {
    console.log('[Frame Count] app-pack-editing.onObjectTypeFieldInput', { typeRes, field, value });
  }
  const defs = cloneObjectTypeDefinitions(app);
  const def = defs.find((item: ObjectTypeDefinition) => item.typeRes === typeRes);
  if (!def) return;
  def[field] = value;
  markObjectTypesDirty(app, defs);
}

export function onObjectTypeReferenceChange(
  app: App,
  typeRes: number,
  field: 'deathObj' | 'creationSound' | 'otherSound' | 'weaponObj',
  value: number,
): void {
  const defs = cloneObjectTypeDefinitions(app);
  const def = defs.find((item: ObjectTypeDefinition) => item.typeRes === typeRes);
  if (!def) return;
  def[field] = value;
  markObjectTypesDirty(app, defs);
}

export function onObjectTypeFlagToggle(
  app: App,
  typeRes: number,
  field: 'flags' | 'flags2',
  bit: number,
  checked: boolean,
): void {
  const defs = cloneObjectTypeDefinitions(app);
  const def = defs.find((item: ObjectTypeDefinition) => item.typeRes === typeRes);
  if (!def) return;
  def[field] = checked ? (def[field] | bit) : (def[field] & ~bit);
  markObjectTypesDirty(app, defs);
}

export function onObjectTypeFrameChange(app: App, typeRes: number, frame: number): void {
  const defs = cloneObjectTypeDefinitions(app);
  const def = defs.find((item: ObjectTypeDefinition) => item.typeRes === typeRes);
  if (!def) return;
  def.frame = frame;
  markObjectTypesDirty(app, defs);
}

export async function saveObjectTypes(app: App): Promise<void> {
  if (app.workerBusy()) {
    app.scheduleObjectTypesAutoSave();
    return;
  }
  const objectTypes = app.objectTypeDefinitions();
  const saveRevision = app.objectTypesEditRevision;
  app.workerBusy.set(true);
  const result = await resultFromPromise(
    app.runtime.dispatchWorker<{ objectTypesArr: [number, ObjectTypeDefinition][] }>('APPLY_OBJECT_TYPES', { objectTypes }),
    'Object type save failed',
  );
  result.match(
    (data) => {
      const defs: ObjectTypeDefinition[] = data.objectTypesArr
        .map(([, def]: [number, ObjectTypeDefinition]) => def)
        .filter((def: ObjectTypeDefinition | null): def is ObjectTypeDefinition => !!def);
      app.objectTypeDefinitions.set(defs);
      syncObjectTypeLookup(app, defs);
      if (!defs.some((def) => def.typeRes === app.selectedObjectTypeId())) {
        app.selectedObjectTypeId.set(defs[0]?.typeRes ?? null);
      }
      if (app.objectTypesEditRevision === saveRevision) {
        app.objectTypesDirty.set(false);
      } else {
        app.objectTypesDirty.set(true);
        app.scheduleObjectTypesAutoSave();
      }
      void decodeSpritePreviewsInBackground(app, data.objectTypesArr);
      app.resourcesStatus.set(`Saved ${defs.length} object type(s).`);
      app.snackBar.open(`✓ Object types saved`, 'OK', { duration: 3000, panelClass: 'snack-success' });
    },
    (msg) => {
      app.editorError.set(msg);
      app.snackBar.open(`✗ ${msg}`, 'Dismiss', { duration: 5000, panelClass: 'snack-error' });
    },
  );
  app.workerBusy.set(false);
}
