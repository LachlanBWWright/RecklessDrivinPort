import { err, ok, type Result } from 'neverthrow';
import { exportLuaProject, importLuaProject, type LuaProjectInput, type LuaProjectData } from './lua-project';

export interface LuaDraft {
  readonly project: LuaProjectData;
  readonly activeScriptId: number;
  readonly savedAt: number;
  readonly baseline: string;
  readonly views: readonly LuaDraftView[];
}
export interface LuaDraftView { readonly id: number; readonly anchor: number; readonly head: number; readonly top: number; readonly left: number }
function readViews(value: unknown): LuaDraftView[] {
  if (!Array.isArray(value)) return [];
  const values: unknown[] = value;
  const views: LuaDraftView[] = [];
  for (const view of values.slice(0, 256)) {
    if (!record(view)) continue;
    const id = view['id']; const anchor = view['anchor']; const head = view['head']; const top = view['top']; const left = view['left'];
    if (typeof id === 'number' && typeof anchor === 'number' && typeof head === 'number' && typeof top === 'number' && typeof left === 'number' &&
      [id, anchor, head, top, left].every((number) => Number.isFinite(number) && number >= 0)) views.push({ id, anchor, head, top, left });
  }
  return views;
}
export function luaDraftBaseline(project: LuaProjectInput): string {
  return JSON.stringify({ scripts: [...project.scripts].sort((a, b) => a.id - b.id),
    bindings: project.scriptBindings, levels: project.levelScriptBindings,
    objects: project.objectTypeIds, sounds: project.soundIds });
}
function key(baseline: string): string {
  let hash = 2166136261;
  for (let index = 0; index < baseline.length; index += 1) hash = Math.imul(hash ^ baseline.charCodeAt(index), 16777619);
  return `lua-${hash >>> 0}`;
}
function record(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null; }
type StorageResponse<T> = { readonly value: T } | { readonly error: string };
function storageResult<T>(response: StorageResponse<T>): Result<T, string> {
  return 'error' in response ? err(response.error) : ok(response.value);
}
function openDatabase(): Promise<StorageResponse<IDBDatabase>> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') { resolve({ error: 'Draft storage is unavailable. Export your project to keep a backup.' }); return; }
      const request = indexedDB.open('reckless-lua-drafts', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('drafts');
      request.onsuccess = () => resolve({ value: request.result });
      request.onerror = () => resolve({ error: 'Could not open draft storage. Export your project to keep a backup.' });
      request.onblocked = () => resolve({ error: 'Draft storage is blocked by another tab.' });
    } catch { resolve({ error: 'Draft storage is unavailable. Export your project to keep a backup.' }); }
  });
}

export async function loadLuaDraft(baseline: string): Promise<Result<LuaDraft | null, string>> {
  const database = await openDatabase();
  if ('error' in database) return err(database.error);
  const db = database.value;
  const response = await new Promise<StorageResponse<LuaDraft | null>>((resolve) => {
    try {
      const transaction = db.transaction('drafts', 'readonly');
      const request = transaction.objectStore('drafts').get(key(baseline));
      request.onsuccess = () => {
        const value: unknown = request.result;
        if (!record(value) || value['baseline'] !== baseline) { resolve({ value: null }); return; }
        const bytes = value['bytes']; const activeScriptId = value['activeScriptId']; const savedAt = value['savedAt'];
        if (!(bytes instanceof Uint8Array) || typeof activeScriptId !== 'number' || typeof savedAt !== 'number') { resolve({ error: 'Stored Lua draft is malformed.' }); return; }
        importLuaProject(bytes, { allowInvalidLua: true }).match(
          (project) => resolve({ value: { project, activeScriptId, savedAt, baseline, views: readViews(value['views']) } }),
          (error) => resolve({ error }));
      };
      request.onerror = () => resolve({ error: 'Could not read the saved Lua draft.' });
      transaction.oncomplete = () => db.close();
      transaction.onabort = () => { db.close(); resolve({ error: 'Reading the saved Lua draft was interrupted.' }); };
    } catch { db.close(); resolve({ error: 'Could not read the saved Lua draft.' }); }
  });
  return storageResult(response);
}

export async function saveLuaDraft(baseline: string, project: LuaProjectInput, activeScriptId: number, views: readonly LuaDraftView[] = []): Promise<Result<number, string>> {
  let bytes: Uint8Array;
  try { bytes = exportLuaProject(project); }
  catch { return err('Could not package the draft. Export individual scripts to keep a backup.'); }
  const validationError = importLuaProject(bytes, { allowInvalidLua: true }).match(() => null, (error) => error);
  if (validationError) return err(`The draft exceeds a recoverable project limit: ${validationError}`);
  const database = await openDatabase();
  if ('error' in database) return err(database.error);
  const db = database.value;
  const savedAt = Date.now();
  const response = await new Promise<StorageResponse<number>>((resolve) => {
    try {
      const transaction = db.transaction('drafts', 'readwrite');
      transaction.objectStore('drafts').put({ baseline, bytes, activeScriptId, savedAt, views }, key(baseline));
      transaction.oncomplete = () => { db.close(); resolve({ value: savedAt }); };
      transaction.onabort = () => { db.close(); resolve({ error: 'Could not save the draft. Browser storage may be full; export a backup.' }); };
      transaction.onerror = () => { /* onabort reports the transaction failure. */ };
    } catch { db.close(); resolve({ error: 'Could not save the draft. Export a backup.' }); }
  });
  return storageResult(response);
}

export async function removeLuaDraft(baseline: string): Promise<Result<void, string>> {
  const database = await openDatabase();
  if ('error' in database) return err(database.error);
  const db = database.value;
  const response = await new Promise<StorageResponse<void>>((resolve) => {
    try {
      const transaction = db.transaction('drafts', 'readwrite');
      transaction.objectStore('drafts').delete(key(baseline));
      transaction.oncomplete = () => { db.close(); resolve({ value: undefined }); };
      transaction.onabort = () => { db.close(); resolve({ error: 'Could not remove the saved draft.' }); };
      transaction.onerror = () => { /* onabort reports the transaction failure. */ };
    } catch { db.close(); resolve({ error: 'Could not remove the saved draft.' }); }
  });
  return storageResult(response);
}
