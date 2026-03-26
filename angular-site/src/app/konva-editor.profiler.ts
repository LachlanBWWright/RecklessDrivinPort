/** Lightweight profiler helpers for KonvaEditorService.
 * Usage: const t = profiler.start('setObjects'); ... t.end();
 */
let enabled = true;

class ProfilerTimer {
  private name: string;
  private startMs: number;
  constructor(name: string) {
    this.name = name;
    this.startMs = performance.now();
  }
  end(): number {
    const dur = performance.now() - this.startMs;
    console.debug(`[profiler] ${this.name}: ${dur.toFixed(2)}ms`);
    return dur;
  }
}

export const profiler = {
  start(name: string) {
    if (!enabled)
      return {
        end() {
          return 0;
        },
      } as const;
    return new ProfilerTimer(name);
  },
  setEnabled(v: boolean) {
    enabled = v;
  },
  get enabled() {
    return enabled;
  },
};
