import { signal } from '@angular/core';
export interface LuaRuntimeEntry {
  readonly id: number;
  readonly scriptId: number | null;
  readonly hook: string | null;
  readonly line: number | null;
  readonly message: string;
  readonly time: number;
  readonly error: boolean;
}
export const luaRuntimeEntries = signal<readonly LuaRuntimeEntry[]>([]);
let nextId = 0;
export function captureLuaRuntimeMessage(text: string): void {
  let entry: Omit<LuaRuntimeEntry, 'id' | 'time'> | null = null;
  if (text.startsWith('RECKLESS_LUA_ERROR ')) {
    try {
      const payload: unknown = JSON.parse(text.slice('RECKLESS_LUA_ERROR '.length));
      if (typeof payload !== 'object' || payload === null || !('scriptId' in payload) || !('hook' in payload) || !('message' in payload) ||
        typeof payload.scriptId !== 'number' || typeof payload.hook !== 'string' || typeof payload.message !== 'string') return;
      const location = payload.message.match(/(?:Scrp #\d+[^\n]*?|\[string "[^"\n]*"\]):(\d+):/);
      entry = { scriptId: payload.scriptId, hook: payload.hook, message: payload.message, line: location ? Number(location[1]) : null, error: true };
    } catch { return; }
  } else if (text.includes('[Lua]')) entry = { scriptId: null, hook: null, line: null, message: text, error: false };
  else {
    const legacy = text.match(/Lua script #(\d+) (\w+) error: (.*)/);
    if (legacy) entry = { scriptId: Number(legacy[1]), hook: legacy[2] ?? null, line: Number(legacy[3]?.match(/:(\d+):/)?.[1]) || null,
      message: legacy[3] ?? text, error: true };
  }
  if (!entry) return;
  const last = luaRuntimeEntries().at(-1);
  if (last?.message === entry.message && Date.now() - last.time < 1000) return;
  const item = { ...entry, id: ++nextId, time: Date.now() };
  luaRuntimeEntries.update((entries) => [...entries.slice(-199), item]);
}
