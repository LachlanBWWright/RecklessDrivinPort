import type { ObjectTypeDefinition } from './level-editor.service';
import type { App } from './app';

export function cloneObjectTypeDefinitions(
  app: App,
  defs = app.objectTypeDefinitions(),
): ObjectTypeDefinition[] {
  return defs.map((def) => ({ ...def }));
}

export function syncObjectTypeLookup(app: App, defs = app.objectTypeDefinitions()): void {
  app.objectTypeDefinitionMap.clear();
  for (const def of defs) app.objectTypeDefinitionMap.set(def.typeRes, def);
  app.availableTypeIds.set(defs.map((def) => def.typeRes).sort((a, b) => a - b));
}

export function nextObjectTypeId(app: App, defs = app.objectTypeDefinitions()): number {
  const used = new Set(defs.map((def) => def.typeRes));
  let candidate = 128;
  while (used.has(candidate)) candidate += 1;
  return candidate;
}

export function selectedObjectType(app: App): ObjectTypeDefinition | null {
  const id = app.selectedObjectTypeId();
  if (id === null) return null;
  return app.objectTypeDefinitions().find((def) => def.typeRes === id) ?? null;
}

export function defaultObjectTypeDefinition(
  app: App,
  typeRes: number,
  source?: ObjectTypeDefinition | null,
): ObjectTypeDefinition {
  return {
    typeRes,
    mass: source?.mass ?? 1,
    maxEngineForce: source?.maxEngineForce ?? 0,
    maxNegEngineForce: source?.maxNegEngineForce ?? 0,
    friction: source?.friction ?? 1,
    flags: source?.flags ?? 0,
    deathObj: source?.deathObj ?? -1,
    frame: source?.frame ?? app.packSpriteFrames()[0]?.id ?? 128,
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
