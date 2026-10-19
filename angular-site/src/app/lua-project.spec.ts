import { exportLuaProject, importLuaProject } from './lua-project';
import { strToU8, unzipSync, zipSync } from 'fflate';
import { SCRIPT_FORMAT_VERSION } from './script-format';

describe('lua project exchange', () => {
  it('round-trips scripts, names, and bindings through a ZIP project', () => {
    const project = {
      scripts: [
        {
          id: 128,
          version: SCRIPT_FORMAT_VERSION,
          name: 'Traffic Controller',
          source: 'function onTick(self, ctx, dt)\n  ctx:log(dt)\nend\n',
        },
      ],
      scriptBindings: [{ objectTypeId: 140, scriptId: 128, flags: 0 }],
      levelScriptBindings: [{ levelResourceId: 140, scriptId: 128, flags: 0 }],
      objectTypeIds: [140],
      soundIds: [128],
      selectedLevelResourceId: 140,
      resourceSourceName: 'resources.dat',
    };

    const imported = importLuaProject(exportLuaProject(project));
    expect(imported.isOk()).toBe(true);
    expect(imported._unsafeUnwrap()).toEqual({ version: 2, ...project });
  });

  it('rejects malformed Lua before it reaches the editor state', () => {
    const bytes = exportLuaProject({
      scripts: [{ id: 128, version: SCRIPT_FORMAT_VERSION, name: 'Broken', source: 'function onTick(\n' }],
      scriptBindings: [],
      levelScriptBindings: [],
    });

    const imported = importLuaProject(bytes);
    expect(imported.isErr()).toBe(true);
    expect(imported._unsafeUnwrapErr()).toContain('invalid Lua');
  });

  it('exports a complete IDE project layout and exact contract', () => {
    const archive = unzipSync(
      exportLuaProject({
        scripts: [{ id: 7, version: SCRIPT_FORMAT_VERSION, name: 'A/B: Patrol', source: 'function onTick(self, ctx) end\n' }],
        scriptBindings: [],
        levelScriptBindings: [],
      }),
    );

    expect(Object.keys(archive).sort()).toEqual([
      '.luarc.json',
      '.reckless-api/reckless.d.lua',
      '.vscode/extensions.json',
      '.vscode/settings.json',
      'README.md',
      'project.json',
      'scripts/7.lua',
    ]);
    expect(new TextDecoder().decode(archive['.luarc.json'])).toContain('checkThirdParty');
    expect(new TextDecoder().decode(archive['.reckless-api/reckless.d.lua'])).toContain('RecklessObject');
  });

  it.each([
    ['not a zip', new Uint8Array([1, 2, 3]), 'valid Lua project ZIP'],
    ['missing manifest', zipSync({ 'README.md': strToU8('empty') }), 'missing project.json'],
  ])('rejects %s archives without mutating state', (_label, archive, message) => {
    const imported = importLuaProject(archive);
    expect(imported.isErr()).toBe(true);
    expect(imported._unsafeUnwrapErr()).toContain(message);
  });

  it('rejects a project whose manifest points outside the scripts directory', () => {
    const archive = unzipSync(
      exportLuaProject({ scripts: [], scriptBindings: [], levelScriptBindings: [] }),
    );
    const manifest = JSON.parse(new TextDecoder().decode(archive['project.json'])) as Record<string, unknown>;
    manifest['scripts'] = [{ id: 1, name: 'Escape', file: '../escape.lua' }];
    archive['project.json'] = strToU8(JSON.stringify(manifest));
    const imported = importLuaProject(zipSync(archive));
    expect(imported.isErr()).toBe(true);
    expect(imported._unsafeUnwrapErr()).toContain('invalid script entry');
  });

  it('rejects level bindings that reference missing scripts', () => {
    const archive = unzipSync(
      exportLuaProject({ scripts: [], scriptBindings: [], levelScriptBindings: [] }),
    );
    const manifest = JSON.parse(new TextDecoder().decode(archive['project.json'])) as Record<string, unknown>;
    manifest['levelScriptBindings'] = [{ levelResourceId: 140, scriptId: 999, flags: 0 }];
    archive['project.json'] = strToU8(JSON.stringify(manifest));
    const imported = importLuaProject(zipSync(archive));
    expect(imported.isErr()).toBe(true);
    expect(imported._unsafeUnwrapErr()).toContain('level binding');
  });
});
