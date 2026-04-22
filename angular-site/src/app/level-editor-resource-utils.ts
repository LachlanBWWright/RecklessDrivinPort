/**
 * Raw resource and pack entry accessor helpers.
 *
 * Provides CRUD-like utilities for ResourceDatEntry arrays and Pack sub-entries.
 * All functions are pure with no Angular dependencies.
 */
import type { ResourceDatEntry } from './resource-dat.service';
import { parsePackHandle, encodePackHandle } from './pack-parser.service';

export function getRawResource(
  resources: ResourceDatEntry[], type: string, id: number,
): Uint8Array | null {
  return resources.find((e) => e.type === type && e.id === id)?.data.slice() ?? null;
}

export function putRawResource(
  resources: ResourceDatEntry[], type: string, id: number, data: Uint8Array,
): ResourceDatEntry[] {
  const idx = resources.findIndex((e) => e.type === type && e.id === id);
  const newEntry: ResourceDatEntry = { type, id, data: data.slice() };
  return idx === -1
    ? [...resources, newEntry]
    : resources.map((e, i) => (i === idx ? newEntry : e));
}

export function listResources(
  resources: ResourceDatEntry[],
): { type: string; id: number; size: number }[] {
  return resources.map((e) => ({ type: e.type, id: e.id, size: e.data.byteLength }));
}

/**
 * Parse a Mac OS 'STR#' resource into an array of Pascal strings.
 * Format: UInt16BE count, then `count` Pascal strings (UInt8 length prefix + bytes).
 */
export function parseStrList(data: Uint8Array): string[] {
  if (data.length < 2) return [];
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const count = view.getUint16(0, false);
  const strings: string[] = [];
  let offset = 2;
  for (let i = 0; i < count; i++) {
    if (offset >= data.length) break;
    const len = data[offset++];
    let s = '';
    for (let j = 0; j < len; j++) s += String.fromCharCode(data[offset + j]);
    strings.push(s);
    offset += len;
  }
  return strings;
}

/** Encode an array of strings back into Mac OS 'STR#' binary format. */
export function encodeStrList(strings: string[]): Uint8Array {
  let totalBytes = 2;
  for (const s of strings) totalBytes += 1 + Math.min(255, s.length);
  const buf = new Uint8Array(totalBytes);
  const view = new DataView(buf.buffer);
  view.setUint16(0, strings.length, false);
  let offset = 2;
  for (const s of strings) {
    const len = Math.min(255, s.length);
    buf[offset++] = len;
    for (let i = 0; i < len; i++) buf[offset++] = s.charCodeAt(i) & 0xff;
  }
  return buf;
}

export function listPackEntries(
  resources: ResourceDatEntry[], packId: number,
): { id: number; size: number }[] | null {
  const pack = resources.find((e) => e.type === 'Pack' && e.id === packId);
  if (!pack) return null;
  try {
    return parsePackHandle(pack.data, packId).map((e) => ({ id: e.id, size: e.data.byteLength }));
  } catch { return null; }
}

export function getPackEntryRaw(
  resources: ResourceDatEntry[], packId: number, entryId: number,
): Uint8Array | null {
  const pack = resources.find((e) => e.type === 'Pack' && e.id === packId);
  if (!pack) return null;
  try {
    return parsePackHandle(pack.data, packId).find((e) => e.id === entryId)?.data.slice() ?? null;
  } catch { return null; }
}

export function putPackEntryRaw(
  resources: ResourceDatEntry[], packId: number, entryId: number, data: Uint8Array,
): ResourceDatEntry[] {
  const pack = resources.find((e) => e.type === 'Pack' && e.id === packId);
  if (!pack) return resources;
  try {
    const entries = parsePackHandle(pack.data, packId);
    const newEntries = entries.some((e) => e.id === entryId)
      ? entries.map((e) => (e.id === entryId ? { ...e, data: data.slice() } : e))
      : [...entries, { id: entryId, data: data.slice() }];
    const newPackData = encodePackHandle(newEntries, packId);
    return resources.map((e) => e.type === 'Pack' && e.id === packId ? { ...e, data: newPackData } : e);
  } catch { return resources; }
}

export function removePackEntryRaw(
  resources: ResourceDatEntry[], packId: number, entryId: number,
): ResourceDatEntry[] {
  const pack = resources.find((e) => e.type === 'Pack' && e.id === packId);
  if (!pack) return resources;
  try {
    const entries = parsePackHandle(pack.data, packId);
    if (!entries.some((e) => e.id === entryId)) return resources;
    const newPackData = encodePackHandle(entries.filter((e) => e.id !== entryId), packId);
    return resources.map((e) => e.type === 'Pack' && e.id === packId ? { ...e, data: newPackData } : e);
  } catch { return resources; }
}
