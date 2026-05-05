import type { ResourceDatEntry } from './resource-dat.service';

export interface ResourceMergeOptions {
  levels: boolean;
  levelResourceIds?: number[];
  objectTypes: boolean;
  objectGroups: boolean;
  roadInfo: boolean;
  sprites: boolean;
  tiles: boolean;
  audio: boolean;
  screens: boolean;
  strings: boolean;
  other: boolean;
}

export interface ResourceMergeResult {
  entries: ResourceDatEntry[];
  overwritten: number;
  added: number;
}

function normalizedType(type: string): string {
  return type.trim().toUpperCase();
}

function keyForEntry(entry: ResourceDatEntry): string {
  return `${entry.type}\u0000${entry.id}`;
}

function isSelectedCategory(entry: ResourceDatEntry, options: ResourceMergeOptions): boolean {
  const type = normalizedType(entry.type);
  if (type === 'PACK') {
    if (entry.id >= 140 && entry.id <= 149) {
      if (!options.levels) return false;
      if (!options.levelResourceIds || options.levelResourceIds.length === 0) return true;
      return options.levelResourceIds.includes(entry.id);
    }
    if (entry.id === 128) return options.objectTypes;
    if (entry.id === 130) return options.objectGroups;
    if (entry.id === 135) return options.roadInfo;
    if (entry.id === 129 || entry.id === 137) return options.sprites;
    if (entry.id === 136) return options.tiles;
    if (entry.id === 134) return options.audio;
    return options.other;
  }

  if (type === 'STR#') return options.strings;

  if (
    type === 'PICT' ||
    type === 'PPIC' ||
    type === 'ICN#' ||
    type === 'ICS#' ||
    type === 'ICL8' ||
    type === 'ICS8'
  ) {
    return options.screens;
  }

  return options.other;
}

export function mergeResourceEntries(
  baseEntries: ResourceDatEntry[],
  incomingEntries: ResourceDatEntry[],
  options: ResourceMergeOptions,
): ResourceMergeResult {
  const merged = new Map<string, ResourceDatEntry>();
  for (const entry of baseEntries) {
    merged.set(keyForEntry(entry), entry);
  }

  let overwritten = 0;
  let added = 0;

  for (const entry of incomingEntries) {
    if (!isSelectedCategory(entry, options)) {
      continue;
    }
    const key = keyForEntry(entry);
    if (merged.has(key)) {
      overwritten += 1;
    } else {
      added += 1;
    }
    merged.set(key, entry);
  }

  return {
    entries: [...merged.values()],
    overwritten,
    added,
  };
}
