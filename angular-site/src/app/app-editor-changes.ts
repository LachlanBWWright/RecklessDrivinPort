import type { AppStateResources } from './app-state-resources';

/** A semantic checkpoint, independent of worker autosaves and canvas navigation. */
export interface EditorChangeSnapshot {
  readonly parts: readonly string[];
  readonly resourceRevision: number;
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item: unknown) => canonicalValue(item));
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalValue(item)]),
    );
  }
  return value;
}

/** Immutable editor arrays retain their encoding across unrelated changes. */
export class EditorChangeEncoder {
  private readonly cache = new WeakMap<object, string>();

  encode(value: unknown): string {
    if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? '';
    const cached = this.cache.get(value);
    if (cached !== undefined) return cached;
    const encoded = JSON.stringify(canonicalValue(value));
    this.cache.set(value, encoded);
    return encoded;
  }
}

export function sameEditorChanges(
  left: EditorChangeSnapshot,
  right: EditorChangeSnapshot,
): boolean {
  return (
    left.resourceRevision === right.resourceRevision &&
    left.parts.length === right.parts.length &&
    left.parts.every((part, index) => part === right.parts[index])
  );
}

export function captureEditorChanges(
  app: AppStateResources,
  encoder: EditorChangeEncoder,
  resourceRevision: number,
): EditorChangeSnapshot {
  const encode = (value: unknown) => encoder.encode(value);
  const selectedId = app.selectedLevelId();
  const parts: string[] = [];
  for (const level of app.parsedLevels()) {
    const selected = level.resourceId === selectedId;
    const properties = level.properties;
    parts.push(
      String(level.resourceId),
      encode(selected ? app.objects() : level.objects),
      encode(selected ? app.marks() : level.marks),
      encode(selected ? app.editTrackUp() : level.trackUp),
      encode(selected ? app.editTrackDown() : level.trackDown),
      encode(level.roadSegs),
      encode(selected ? app.editObjectGroups() : level.objectGroups),
      JSON.stringify(
        selected
          ? [app.editRoadInfo(), app.editTime(), app.editXStartPos(), app.editLevelEnd()]
          : [properties.roadInfo, properties.time, properties.xStartPos, properties.levelEnd],
      ),
    );
  }
  parts.push(
    encode(app.objectTypeDefinitions()),
    encode(app.objectGroupDefinitions()),
    encode(app.scriptDefinitions()),
    encode(app.scriptBindings()),
    encode(app.levelScriptBindings()),
  );
  // This version changes for actual definition edits and background decoding alike;
  // compare the definitions themselves so thumbnail creation never dirties a file.
  app.roadInfoVersion();
  for (const [id, data] of [...app.roadInfoDataMap].sort(([left], [right]) => left - right)) {
    parts.push(String(id), encode(data));
  }
  return { parts, resourceRevision };
}

/** Dedicated content writes only: APPLY_* level commands also run during previews. */
export function changesOpaqueResource(command: string): boolean {
  return (
    command === 'PUT_RESOURCE_RAW' ||
    command === 'PUT_PACK_ENTRY_RAW' ||
    command === 'PUT_STR_LIST' ||
    command === 'APPLY_SPRITE_BYTE' ||
    command === 'APPLY_SPRITE_PACK_PIXELS' ||
    command === 'APPLY_TILE16_PIXELS' ||
    command === 'REMOVE_TILE16_TEXTURE'
  );
}
