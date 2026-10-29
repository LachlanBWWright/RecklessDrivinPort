import { blankLevelData, manageLevels } from './level-management';
import { LevelEditorService } from './level-editor.service';
import { encodePackHandle, parsePackHandle } from './pack-parser.service';
import { parseLevelScriptBindings, serializeLevelScriptBindings } from './script-format';
import { serializeLevelRoadSegs } from './level-editor-binary-codecs';
import { ResourceDatService } from './resource-dat.service';
import type { ResourceDatEntry } from './resource-dat.service';

function fixture(count: number): ResourceDatEntry[] {
  return Array.from({ length: count }, (_, index) => ({
    type: 'Pack',
    id: 140 + index,
    data: encodePackHandle(
      [
        {
          id: 1,
          data: serializeLevelRoadSegs(
            blankLevelData(128 + index),
            Array.from({ length: 3001 }, () => ({
              v0: -200 - index,
              v1: -120,
              v2: 120,
              v3: 200 + index,
            })),
          ),
        },
        { id: 2, data: new Uint8Array(16).fill(index) },
        { id: 7, data: new Uint8Array(700).map((_, position) => (position * 17 + index) % 256) },
      ],
      140 + index,
    ),
  }));
}

describe('level management', () => {
  it('saves an arbitrary order with complete packs, scripts, and selected-level identity', () => {
    const resources = [
      ...fixture(4),
      {
        type: 'ScLv',
        id: 128,
        data: serializeLevelScriptBindings([{ levelResourceId: 142, scriptId: 9, flags: 0 }]),
      },
    ];
    const result = manageLevels(resources, {
      resourceId: 142,
      operation: { order: [143, 141, 140, 142] },
    });
    expect(result.isOk()).toBe(true);
    if (result.isErr()) return;
    const dat = new ResourceDatService();
    const saved = dat.serialize(result.value.resources).andThen((bytes) => dat.parse(bytes));
    expect(saved.isOk()).toBe(true);
    if (saved.isErr()) return;
    expect(
      new LevelEditorService()
        .extractParsedLevels(saved.value)
        .map((level) => level.properties.roadInfo),
    ).toEqual([131, 129, 128, 130]);
    expect(result.value.selectedLevelId).toBe(143);
    for (const [slot, source] of [143, 141, 140, 142].entries()) {
      const before = resources.find((entry) => entry.id === source);
      const after = saved.value.find((entry) => entry.type === 'Pack' && entry.id === 140 + slot);
      expect(before).toBeDefined();
      expect(after).toBeDefined();
      if (!before || !after) return;
      expect(parsePackHandle(after.data, after.id)).toEqual(
        parsePackHandle(before.data, before.id),
      );
    }
    const bindings = saved.value.find((entry) => entry.type === 'ScLv');
    expect(bindings && parseLevelScriptBindings(bindings.data)._unsafeUnwrap()).toEqual([
      { levelResourceId: 143, scriptId: 9, flags: 0 },
    ]);
    expect(
      manageLevels(resources, {
        resourceId: 142,
        operation: { order: [140, 140, 142, 143] },
      }).isErr(),
    ).toBe(true);
    expect(
      manageLevels(resources, { resourceId: 142, operation: { order: [140, 141] } }).isErr(),
    ).toBe(true);
  });

  it('moves complete packs across the encryption boundary and round trips resources.dat', () => {
    const resources = fixture(4);
    const result = manageLevels(resources, { operation: 'later', resourceId: 142 });
    expect(result.isOk()).toBe(true);
    if (result.isErr()) return;
    const dat = new ResourceDatService();
    const roundTrip = dat.serialize(result.value.resources).andThen((bytes) => dat.parse(bytes));
    expect(roundTrip.isOk()).toBe(true);
    if (roundTrip.isErr()) return;
    const levels = new LevelEditorService().extractParsedLevels(roundTrip.value);
    expect(levels.map((level) => level.roadSegs[0].v0)).toEqual([-200, -201, -203, -202]);
    expect(levels.map((level) => level.properties.roadInfo)).toEqual([128, 129, 131, 130]);
    for (const [source, destination] of [
      [142, 143],
      [143, 142],
    ]) {
      const before = resources.find((resource) => resource.id === source);
      const after = result.value.resources.find((resource) => resource.id === destination);
      expect(before).toBeDefined();
      expect(after).toBeDefined();
      if (!before || !after) return;
      expect(parsePackHandle(after.data, destination)).toEqual(
        parsePackHandle(before.data, source),
      );
    }
    expect(result.value.selectedLevelId).toBe(143);
  });

  it('duplicates and deletes bindings with their level while retaining the global script', () => {
    const resources = [
      ...fixture(3),
      {
        type: 'ScLv',
        id: 128,
        data: serializeLevelScriptBindings([
          { levelResourceId: 0, scriptId: 1, flags: 0 },
          { levelResourceId: 141, scriptId: 2, flags: 3 },
          { levelResourceId: 142, scriptId: 3, flags: 4 },
        ]),
      },
    ];
    const copied = manageLevels(resources, { operation: 'duplicate', resourceId: 141 });
    expect(copied.isOk()).toBe(true);
    if (copied.isErr()) return;
    const bindingData = copied.value.resources.find((resource) => resource.type === 'ScLv');
    if (!bindingData) return;
    expect(parseLevelScriptBindings(bindingData.data)._unsafeUnwrap()).toEqual([
      { levelResourceId: 0, scriptId: 1, flags: 0 },
      { levelResourceId: 141, scriptId: 2, flags: 3 },
      { levelResourceId: 142, scriptId: 2, flags: 3 },
      { levelResourceId: 143, scriptId: 3, flags: 4 },
    ]);
    const removed = manageLevels(copied.value.resources, { operation: 'delete', resourceId: 141 });
    expect(removed.isOk()).toBe(true);
    if (removed.isErr()) return;
    const remaining = removed.value.resources.find((resource) => resource.type === 'ScLv');
    if (!remaining) return;
    expect(parseLevelScriptBindings(remaining.data)._unsafeUnwrap()).toEqual(
      parseLevelScriptBindings(resources[3].data)._unsafeUnwrap(),
    );
  });

  it('creates a blank, runnable level with inherited road assets but no objects or scripts', () => {
    const result = manageLevels(fixture(1), { operation: 'new', resourceId: 140 });
    expect(result.isOk()).toBe(true);
    if (result.isErr()) return;
    const level = new LevelEditorService().extractParsedLevels(result.value.resources)[1];
    expect(level.properties.roadInfo).toBe(128);
    expect(level.properties.time).toBe(120);
    expect(level.roadSegCount * 2).toBeGreaterThan(level.properties.levelEnd + 1000);
    expect(level.objects).toEqual([]);
    expect(level.marks).toEqual([]);
    expect(level.trackUp.length).toBe(2);
    expect(level.trackDown.length).toBe(2);
  });

  it('rejects capacity limits, nonconsecutive slots, and corrupt packs without mutating input', () => {
    expect(manageLevels(fixture(10), { operation: 'duplicate', resourceId: 140 }).isErr()).toBe(
      true,
    );
    expect(manageLevels(fixture(1), { operation: 'delete', resourceId: 140 }).isErr()).toBe(true);
    expect(
      manageLevels(
        fixture(3).filter((entry) => entry.id !== 141),
        { operation: 'new', resourceId: 140 },
      ).isErr(),
    ).toBe(true);
    const corrupt = [{ type: 'Pack', id: 140, data: new Uint8Array() }];
    expect(manageLevels(corrupt, { operation: 'new', resourceId: 140 }).isErr()).toBe(true);
    expect(corrupt[0].data.length).toBe(0);
  });
});
