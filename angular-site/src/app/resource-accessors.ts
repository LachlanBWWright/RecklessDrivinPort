import type { ResourceDatEntry } from './resource-dat.service';
import { encodePackHandle, parsePackHandle } from './pack-parser.service';

/** Return a copy of one resource's raw bytes, or null when it is missing. */
export function getRawResource(
  resources: ResourceDatEntry[],
  type: string,
  id: number,
): Uint8Array | null {
  const entry = resources.find((resource) => resource.type === type && resource.id === id);
  return entry?.data.slice() ?? null;
}

/** Replace or append one resource without mutating the input collection. */
export function putRawResource(
  resources: ResourceDatEntry[],
  type: string,
  id: number,
  data: Uint8Array,
): ResourceDatEntry[] {
  const index = resources.findIndex((resource) => resource.type === type && resource.id === id);
  const nextEntry: ResourceDatEntry = { type, id, data: data.slice() };
  if (index < 0) return [...resources, nextEntry];
  return resources.map((resource, resourceIndex) =>
    resourceIndex === index ? nextEntry : resource,
  );
}

/** Return resource metadata without exposing payload bytes. */
export function listResources(
  resources: ResourceDatEntry[],
): { type: string; id: number; size: number }[] {
  return resources.map((resource) => ({
    type: resource.type,
    id: resource.id,
    size: resource.data.byteLength,
  }));
}

/** Parse a Mac OS STR# resource into Pascal strings. */
export function parseStrList(data: Uint8Array): string[] {
  if (data.length < 2) return [];

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const count = view.getUint16(0, false);
  const strings: string[] = [];
  let offset = 2;

  for (let index = 0; index < count && offset < data.length; index += 1) {
    const length = data[offset++] ?? 0;
    const bytes = data.slice(offset, offset + length);
    let value = '';
    for (const byte of bytes) value += String.fromCharCode(byte);
    strings.push(value);
    offset += length;
  }

  return strings;
}

/** Encode strings as a Mac OS STR# resource. */
export function encodeStrList(strings: string[]): Uint8Array {
  const totalBytes = strings.reduce((total, value) => total + 1 + Math.min(255, value.length), 2);
  const buffer = new Uint8Array(totalBytes);
  const view = new DataView(buffer.buffer);
  view.setUint16(0, strings.length, false);

  let offset = 2;
  for (const value of strings) {
    const length = Math.min(255, value.length);
    buffer[offset++] = length;
    for (let index = 0; index < length; index += 1) {
      buffer[offset++] = value.charCodeAt(index) & 0xff;
    }
  }

  return buffer;
}

function getPack(resources: ResourceDatEntry[], packId: number): ResourceDatEntry | null {
  return resources.find((resource) => resource.type === 'Pack' && resource.id === packId) ?? null;
}

function parsePackEntries(resources: ResourceDatEntry[], packId: number) {
  const pack = getPack(resources, packId);
  return pack ? parsePackHandle(pack.data, packId) : null;
}

/** List the entry IDs and byte sizes within a Pack resource. */
export function listPackEntries(
  resources: ResourceDatEntry[],
  packId: number,
): { id: number; size: number }[] | null {
  try {
    return (
      parsePackEntries(resources, packId)?.map((entry) => ({
        id: entry.id,
        size: entry.data.byteLength,
      })) ?? null
    );
  } catch {
    return null;
  }
}

/** Return a copy of one Pack entry's raw bytes. */
export function getPackEntryRaw(
  resources: ResourceDatEntry[],
  packId: number,
  entryId: number,
): Uint8Array | null {
  try {
    const entry = parsePackEntries(resources, packId)?.find(
      (candidate) => candidate.id === entryId,
    );
    return entry?.data.slice() ?? null;
  } catch {
    return null;
  }
}

/** Replace or append one entry inside a Pack resource. */
export function putPackEntryRaw(
  resources: ResourceDatEntry[],
  packId: number,
  entryId: number,
  data: Uint8Array,
): ResourceDatEntry[] {
  const pack = getPack(resources, packId);
  if (!pack) return resources;

  try {
    const entries = parsePackHandle(pack.data, packId);
    const nextEntries = entries.some((entry) => entry.id === entryId)
      ? entries.map((entry) => (entry.id === entryId ? { ...entry, data: data.slice() } : entry))
      : [...entries, { id: entryId, data: data.slice() }];
    const nextData = encodePackHandle(nextEntries, packId);
    return resources.map((resource) =>
      resource.type === 'Pack' && resource.id === packId
        ? { ...resource, data: nextData }
        : resource,
    );
  } catch {
    return resources;
  }
}

/** Remove one entry from a Pack resource. */
export function removePackEntryRaw(
  resources: ResourceDatEntry[],
  packId: number,
  entryId: number,
): ResourceDatEntry[] {
  const pack = getPack(resources, packId);
  if (!pack) return resources;

  try {
    const entries = parsePackHandle(pack.data, packId);
    if (!entries.some((entry) => entry.id === entryId)) return resources;
    const nextData = encodePackHandle(
      entries.filter((entry) => entry.id !== entryId),
      packId,
    );
    return resources.map((resource) =>
      resource.type === 'Pack' && resource.id === packId
        ? { ...resource, data: nextData }
        : resource,
    );
  } catch {
    return resources;
  }
}
