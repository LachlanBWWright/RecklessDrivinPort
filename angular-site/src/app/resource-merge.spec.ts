import { describe, expect, it } from 'vitest';
import type { ResourceDatEntry } from './resource-dat.service';
import { mergeResourceEntries, type ResourceMergeOptions } from './resource-merge';

const allDisabled: ResourceMergeOptions = {
  levels: false,
  levelResourceIds: [],
  objectTypes: false,
  objectGroups: false,
  roadInfo: false,
  sprites: false,
  tiles: false,
  audio: false,
  screens: false,
  strings: false,
  other: false,
};

function entry(type: string, id: number, bytes: number[]): ResourceDatEntry {
  return { type, id, data: new Uint8Array(bytes) };
}

describe('mergeResourceEntries', () => {
  it('overrides selected level packs and keeps unselected categories', () => {
    const base = [
      entry('Pack', 140, [1]),
      entry('Pack', 128, [2]),
      entry('STR#', 128, [3]),
    ];
    const incoming = [
      entry('Pack', 140, [9]),
      entry('Pack', 128, [8]),
      entry('STR#', 128, [7]),
    ];

    const result = mergeResourceEntries(base, incoming, {
      ...allDisabled,
      levels: true,
      levelResourceIds: [140],
    });

    expect(result.overwritten).toBe(1);
    expect(result.added).toBe(0);
    expect(result.entries.find((e) => e.type === 'Pack' && e.id === 140)?.data[0]).toBe(9);
    expect(result.entries.find((e) => e.type === 'Pack' && e.id === 128)?.data[0]).toBe(2);
    expect(result.entries.find((e) => e.type === 'STR#' && e.id === 128)?.data[0]).toBe(3);
  });

  it('merges only selected level IDs when level list is provided', () => {
    const base = [entry('Pack', 140, [1]), entry('Pack', 141, [2])];
    const incoming = [entry('Pack', 140, [9]), entry('Pack', 141, [8])];

    const result = mergeResourceEntries(base, incoming, {
      ...allDisabled,
      levels: true,
      levelResourceIds: [141],
    });

    expect(result.entries.find((e) => e.type === 'Pack' && e.id === 140)?.data[0]).toBe(1);
    expect(result.entries.find((e) => e.type === 'Pack' && e.id === 141)?.data[0]).toBe(8);
  });

  it('adds new entries when selected category is enabled', () => {
    const base = [entry('Pack', 140, [1])];
    const incoming = [entry('PICT', 900, [4, 5, 6])];

    const result = mergeResourceEntries(base, incoming, {
      ...allDisabled,
      screens: true,
    });

    expect(result.overwritten).toBe(0);
    expect(result.added).toBe(1);
    expect(result.entries.some((e) => e.type === 'PICT' && e.id === 900)).toBe(true);
  });

  it('treats unknown resources as other', () => {
    const base = [entry('TEST', 1, [1])];
    const incoming = [entry('TEST', 1, [2])];

    const disabledResult = mergeResourceEntries(base, incoming, allDisabled);
    expect(disabledResult.entries[0]?.data[0]).toBe(1);

    const enabledResult = mergeResourceEntries(base, incoming, {
      ...allDisabled,
      other: true,
    });
    expect(enabledResult.entries[0]?.data[0]).toBe(2);
  });
});
