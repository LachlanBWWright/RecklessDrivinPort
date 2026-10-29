import { TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { App } from './app';
import { LevelEditorService } from './level-editor.service';
import { blankLevelData } from './level-management';
import { encodePackHandle } from './pack-parser.service';
import { flushTrackEdits } from './app-track-saving';
import { afterEach, vi } from 'vitest';
import { err, ok, type Result } from 'neverthrow';
import { TrackSaveQueue, type TrackSaveSnapshot } from './app-track-saving';

const snapshot = (resourceId: number, speed: number): TrackSaveSnapshot => ({
  resourceId,
  trackUp: [{ x: 10, y: 20, flags: 8, velo: speed }],
  trackDown: [],
});

afterEach(() => vi.useRealTimers());

describe('automatic track saving', () => {
  it('keeps rapid edits made during an in-flight save and saves every changed level', async () => {
    let finishFirst: ((result: Result<void, string>) => void) | undefined;
    const firstSave = new Promise<Result<void, string>>((resolve) => {
      finishFirst = resolve;
    });
    const saved: TrackSaveSnapshot[] = [];
    const queue = new TrackSaveQueue(
      async (value) => {
        saved.push(value);
        return saved.length === 1 ? firstSave : ok(undefined);
      },
      () => false,
      () => undefined,
    );
    queue.enqueue(snapshot(140, 10));
    const saving = queue.flush();
    queue.enqueue(snapshot(140, 20));
    queue.enqueue(snapshot(140, 30));
    queue.enqueue(snapshot(141, 40));
    finishFirst?.(ok(undefined));
    expect((await saving).isOk()).toBe(true);
    expect(saved.map((value) => [value.resourceId, value.trackUp[0].velo])).toEqual([
      [140, 10],
      [140, 30],
      [141, 40],
    ]);
    queue.dispose();
  });

  it('retains failed edits for retry and replaces them with the latest edit', async () => {
    let fail = true;
    const saved: TrackSaveSnapshot[] = [];
    const errors: string[] = [];
    const queue = new TrackSaveQueue(
      async (value) => {
        saved.push(value);
        return fail ? err('Worker unavailable') : ok(undefined);
      },
      () => false,
      (message) => errors.push(message),
    );
    queue.enqueue(snapshot(140, 10));
    expect((await queue.flush()).isErr()).toBe(true);
    expect(errors).toEqual(['Worker unavailable']);
    queue.enqueue(snapshot(140, 25));
    fail = false;
    expect((await queue.flush()).isOk()).toBe(true);
    expect(saved.map((value) => value.trackUp[0].velo)).toEqual([10, 25]);
    queue.dispose();
  });

  it('waits while the worker is busy without losing queued edits', async () => {
    vi.useFakeTimers();
    let busy = true;
    const saved: TrackSaveSnapshot[] = [];
    const queue = new TrackSaveQueue(
      async (value) => {
        saved.push(value);
        return ok(undefined);
      },
      () => busy,
      () => undefined,
    );
    queue.enqueue(snapshot(140, 10));
    await vi.advanceTimersByTimeAsync(500);
    expect(saved).toEqual([]);
    queue.enqueue(snapshot(140, 25));
    busy = false;
    await vi.advanceTimersByTimeAsync(250);
    expect(saved.map((value) => value.trackUp[0].velo)).toEqual([25]);
    queue.dispose();
  });
});

it('keeps waypoint edits when switching levels immediately and ignores stale worker responses', async () => {
  await TestBed.configureTestingModule({
    declarations: [App],
    schemas: [NO_ERRORS_SCHEMA],
  }).compileComponents();
  const app = TestBed.createComponent(App).componentInstance;
  const levels = new LevelEditorService().extractParsedLevels(
    [140, 141].map((id) => ({
      type: 'Pack',
      id,
      data: encodePackHandle([{ id: 1, data: blankLevelData(128) }], id),
    })),
  );
  app.parsedLevels.set(levels);
  app.selectLevel(140);
  const dispatch = vi.spyOn(app.runtime, 'dispatchWorker').mockResolvedValue({ levels });
  app.applyWaypointEdit({ track: 'up', index: 0, velo: 34, flags: 10 });
  expect(app.parsedLevels()[0].trackUp[0].velo).toBe(34);
  app.selectLevel(141);
  app.applyWaypointEdit({ track: 'down', index: 0, velo: 18, flags: 8 });
  app.selectLevel(140);
  expect(app.editTrackUp()[0].velo).toBe(34);
  expect((await flushTrackEdits(app)).isOk()).toBe(true);
  expect(
    dispatch.mock.calls
      .filter(([command]) => command === 'APPLY_TRACK')
      .map(([, payload]) => payload),
  ).toEqual([
    expect.objectContaining({
      resourceId: 140,
      trackUp: expect.arrayContaining([expect.objectContaining({ velo: 34, flags: 10 })]),
    }),
    expect.objectContaining({
      resourceId: 141,
      trackDown: expect.arrayContaining([expect.objectContaining({ velo: 18, flags: 8 })]),
    }),
  ]);
  app.applyLevelsResult(levels, { preserveCanvasView: true, refreshSelectedLevelState: false });
  expect(app.parsedLevels()[0].trackUp[0].velo).toBe(34);
  app.selectLevel(141);
  expect(app.editTrackDown()[0].velo).toBe(18);
});
