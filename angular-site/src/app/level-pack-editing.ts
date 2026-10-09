import type { ResourceDatEntry } from './resource-dat.service';
import { encodePackHandle, parsePackHandle, type PackEntry } from './pack-parser.service';

/** Apply one immutable update to a Pack resource, keeping parse/error handling in one place. */
export function updatePackResource(
  resources: ResourceDatEntry[],
  packId: number,
  operation: string,
  update: (entries: PackEntry[]) => PackEntry[] | null,
): ResourceDatEntry[] {
  return resources.map((resource) => {
    if (resource.type !== 'Pack' || resource.id !== packId) return resource;
    try {
      const entries = parsePackHandle(resource.data, packId);
      const updatedEntries = update(entries);
      if (updatedEntries === null) return resource;
      return { ...resource, data: encodePackHandle(updatedEntries, packId) };
    } catch (error) {
      console.error(`[LevelEditor] ${operation} failed for Pack #${packId}:`, error);
      return resource;
    }
  });
}

export function replacePackEntry(
  entries: PackEntry[],
  entryId: number,
  data: Uint8Array,
): PackEntry[] | null {
  if (!entries.some((entry) => entry.id === entryId)) return null;
  return entries.map((entry) => (entry.id === entryId ? { ...entry, data } : entry));
}
