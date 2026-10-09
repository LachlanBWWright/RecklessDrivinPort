import { previewLuaImport, validateLuaWorkspace } from './lua-workspace';
import { exportLuaProject, importLuaProject } from './lua-project';
import { LuaAnalysisEngine } from './lua-analysis';
import { captureLuaRuntimeMessage, luaRuntimeEntries } from './lua-runtime-log';

describe('Lua workspace safety', () => {
  const script = { id: 1, version: 1, name: 'One', source: 'function onTick(self, ctx) end\r\n' };
  const project = { scripts: [script], scriptBindings: [{ objectTypeId: 5, scriptId: 1, flags: 9 }], levelScriptBindings: [], objectTypeIds: [5], soundIds: [] };

  it('can recover malformed Lua as a draft while ordinary imports reject it', () => {
    const bytes = exportLuaProject({ ...project, scripts: [{ ...script, source: 'function broken(' }] });
    expect(importLuaProject(bytes).isErr()).toBe(true);
    const recovered = importLuaProject(bytes, { allowInvalidLua: true });
    expect(recovered.isOk()).toBe(true);
    recovered.match((draft) => expect(validateLuaWorkspace(draft).some((issue) => issue.severity === 'error')).toBe(true), () => {});
  });

  it('still rejects dangling bindings during draft recovery', () => {
    const bytes = exportLuaProject({ ...project, scripts: [] });
    expect(importLuaProject(bytes, { allowInvalidLua: true }).isErr()).toBe(true);
  });

  it('preserves source bytes, names, IDs, and binding flags through exchange', () => {
    importLuaProject(exportLuaProject(project)).match((data) => {
      expect(data.scripts).toEqual(project.scripts); expect(data.scriptBindings).toEqual(project.scriptBindings);
    }, (error) => { throw new Error(error); });
  });

  it('previews removed scripts, binding changes, and missing resource IDs', () => {
    const preview = previewLuaImport(project, { ...project, scripts: [{ ...script, id: 2, name: 'Two' }],
      scriptBindings: [{ objectTypeId: 5, scriptId: 2, flags: 9 }], objectTypeIds: [5, 8], soundIds: [12] });
    expect(preview.scripts.map((entry) => entry.action)).toEqual(['removed', 'added']);
    expect(preview.bindings[0]).toContain('script #1 (flags 9) → script #2 (flags 9)');
    expect(preview.warnings.length).toBe(2);
  });

  it('keeps unchanged analyses and removes deleted files in incremental requests', () => {
    const engine = new LuaAnalysisEngine();
    const request = { revision: 1, scripts: [script], removedIds: [], bindings: [], levelBindings: [], objectTypeIds: [5], soundIds: [] };
    const first = engine.run(request);
    const second = engine.run({ ...request, revision: 2, scripts: [] });
    expect(second.analyses[0]?.analysis).toBe(first.analyses[0]?.analysis);
    expect(engine.run({ ...request, revision: 3, scripts: [], removedIds: [1] }).analyses).toEqual([]);
  });

  it('maps a structured runtime error and preserves its stack trace', () => {
    luaRuntimeEntries.set([]);
    captureLuaRuntimeMessage('RECKLESS_LUA_ERROR ' + JSON.stringify({ scriptId: 1, hook: 'onTick', message: '[string "Scrp #1"]:3: failure\nstack traceback:\n\t[string "Scrp #1"]:3: in function onTick' }));
    expect(luaRuntimeEntries()[0]?.line).toBe(3);
    expect(luaRuntimeEntries()[0]?.message).toContain('stack traceback:');
    luaRuntimeEntries.set([]);
  });
});
