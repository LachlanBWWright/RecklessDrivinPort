import { err, ok, type Result } from 'neverthrow';
import type { App } from './app';
import type { ParsedLevel, TrackSeg } from './level-editor.service';
import { resultFromPromise } from './result-helpers';

export interface TrackSaveSnapshot {
  resourceId: number;
  trackUp: TrackSeg[];
  trackDown: TrackSeg[];
}

/** Coalesces edits per level while keeping edits made during an in-flight write. */
export class TrackSaveQueue {
  readonly latest = new Map<number, TrackSaveSnapshot>();
  private pending = new Map<number, TrackSaveSnapshot>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running: Promise<Result<void, string>> | null = null;
  private disposed = false;

  constructor(
    private readonly save: (snapshot: TrackSaveSnapshot) => PromiseLike<Result<void, string>>,
    private readonly busy: () => boolean,
    private readonly reportError: (message: string) => void,
  ) {}

  enqueue(snapshot: TrackSaveSnapshot): void {
    this.latest.set(snapshot.resourceId, snapshot);
    this.pending.set(snapshot.resourceId, snapshot);
    this.schedule(250);
  }

  dispose(): void {
    this.disposed = true;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.pending.clear();
    this.latest.clear();
  }

  private schedule(delay: number): void {
    if (this.disposed) return;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      if (this.busy()) this.schedule(250);
      else void this.flush();
    }, delay);
  }

  async flush(): Promise<Result<void, string>> {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    while (this.running) {
      const running = this.running;
      const result = await running;
      if (this.running === running) this.running = null;
      if (result.isErr()) return result;
    }
    if (this.disposed || this.pending.size === 0) return ok(undefined);
    const running = this.process();
    this.running = running;
    const result = await running;
    if (this.running === running) this.running = null;
    if (result.isErr() && !this.disposed) {
      this.reportError(result.error);
      this.schedule(1000);
    }
    return result;
  }

  private async process(): Promise<Result<void, string>> {
    while (!this.disposed) {
      const snapshot = this.pending.values().next().value;
      if (!snapshot) return ok(undefined);
      const result = await this.save(snapshot);
      if (result.isErr()) return err(result.error);
      if (this.pending.get(snapshot.resourceId) === snapshot)
        this.pending.delete(snapshot.resourceId);
    }
    return ok(undefined);
  }
}

const queues = new WeakMap<App, TrackSaveQueue>();

function getQueue(app: App): TrackSaveQueue {
  const existing = queues.get(app);
  if (existing) return existing;
  const queue = new TrackSaveQueue(
    async (snapshot) =>
      await resultFromPromise(
        app.runtime.dispatchWorker('APPLY_TRACK', snapshot),
        'Could not save track changes',
      ).map<void>(() => undefined),
    () => app.workerBusy(),
    (message) => app.editorError.set(message),
  );
  queues.set(app, queue);
  return queue;
}

function sameTrack(a: readonly TrackSeg[], b: readonly TrackSeg[]): boolean {
  return (
    a.length === b.length &&
    a.every((point, index) => {
      const other = b[index];
      return (
        point.x === other.x &&
        point.y === other.y &&
        point.velo === other.velo &&
        point.flags === other.flags
      );
    })
  );
}

export function captureEditedTracks(app: App): void {
  const resourceId = app.selectedLevelId();
  const level = app.parsedLevels().find((item) => item.resourceId === resourceId);
  if (resourceId === null || !level) return;
  const trackUp = app.editTrackUp();
  const trackDown = app.editTrackDown();
  if (sameTrack(trackUp, level.trackUp) && sameTrack(trackDown, level.trackDown)) return;
  const snapshot = {
    resourceId,
    trackUp: trackUp.map((point) => ({ ...point })),
    trackDown: trackDown.map((point) => ({ ...point })),
  };
  app.parsedLevels.update((levels) =>
    levels.map((item) =>
      item.resourceId === resourceId
        ? { ...item, trackUp: snapshot.trackUp, trackDown: snapshot.trackDown }
        : item,
    ),
  );
  getQueue(app).enqueue(snapshot);
}

export function setTrackPoints(app: App, track: 'up' | 'down', points: TrackSeg[]): void {
  if (track === 'up') app.editTrackUp.set(points);
  else app.editTrackDown.set(points);
  captureEditedTracks(app);
}

export function preserveEditedTracks(app: App, level: ParsedLevel): ParsedLevel {
  const snapshot = queues.get(app)?.latest.get(level.resourceId);
  return snapshot ? { ...level, trackUp: snapshot.trackUp, trackDown: snapshot.trackDown } : level;
}

export function flushTrackEdits(app: App): Promise<Result<void, string>> {
  captureEditedTracks(app);
  return queues.get(app)?.flush() ?? Promise.resolve(ok(undefined));
}

export function resetTrackSaving(app: App): void {
  queues.get(app)?.dispose();
  queues.delete(app);
}
