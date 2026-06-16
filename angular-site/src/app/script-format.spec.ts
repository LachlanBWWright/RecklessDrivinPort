import {
  SCRIPT_FORMAT_VERSION,
  parseLevelScriptBindings,
  parseScriptBindings,
  parseScriptDefinition,
  serializeLevelScriptBindings,
  serializeScriptBindings,
  serializeScriptDefinition,
  validateScripts,
} from './script-format';
import type { LevelScriptBinding, ScriptBinding, ScriptDefinition } from './level-editor.types';

describe('script-format', () => {
  it('round-trips a script definition', () => {
    const script: ScriptDefinition = {
      id: 200,
      version: SCRIPT_FORMAT_VERSION,
      name: 'Roadside Ambush',
      source: 'function onTick(self, ctx)\n  self:setInput(1.0, 0.65)\nend\n',
    };

    const parsed = parseScriptDefinition(script.id, serializeScriptDefinition(script));
    expect(parsed.isOk()).toBe(true);
    expect(parsed._unsafeUnwrap()).toEqual(script);
  });

  it('round-trips bindings', () => {
    const bindings: ScriptBinding[] = [
      { objectTypeId: 200, scriptId: 128, flags: 0 },
      { objectTypeId: 201, scriptId: 129, flags: 0 },
    ];

    const parsed = parseScriptBindings(serializeScriptBindings(bindings));
    expect(parsed.isOk()).toBe(true);
    expect(parsed._unsafeUnwrap()).toEqual(bindings);
  });

  it('round-trips level bindings', () => {
    const bindings: LevelScriptBinding[] = [
      { levelResourceId: 0, scriptId: 128, flags: 0 },
      { levelResourceId: 140, scriptId: 129, flags: 0 },
    ];

    const parsed = parseLevelScriptBindings(serializeLevelScriptBindings(bindings));
    expect(parsed.isOk()).toBe(true);
    expect(parsed._unsafeUnwrap()).toEqual(bindings);
  });

  it('rejects unsupported level binding versions', () => {
    const bytes = serializeLevelScriptBindings([{ levelResourceId: 140, scriptId: 129, flags: 0 }]);
    new DataView(bytes.buffer).setUint16(4, SCRIPT_FORMAT_VERSION + 1, false);

    const parsed = parseLevelScriptBindings(bytes);
    expect(parsed.isErr()).toBe(true);
    expect(parsed._unsafeUnwrapErr()).toContain('Unsupported level script bindings version');
  });

  it('reports missing references during validation', () => {
    const issues = validateScripts(
      [
        {
          id: 128,
          version: SCRIPT_FORMAT_VERSION,
          name: '',
          source: 'function onDeath(self, ctx)\n  ctx:spawnObjectType(999, self:x(), self:y(), 1, 12)\n  ctx:playSound(777)\n  os.execute("bad")\nend\n',
        },
      ],
      [{ objectTypeId: 555, scriptId: 777, flags: 0 }],
      {
        availableObjectTypeIds: [200],
        availableSoundIds: [129],
      },
    );

    expect(issues.some((issue) => issue.message.includes('missing script 777'))).toBe(true);
    expect(issues.some((issue) => issue.message.includes('missing object type 999'))).toBe(true);
    expect(issues.some((issue) => issue.message.includes('missing sound 777'))).toBe(true);
    expect(issues.some((issue) => issue.message.includes("Lua API 'os'"))).toBe(true);
  });

  it('rejects invalid script definitions', () => {
    const validBytes = serializeScriptDefinition({
      id: 200,
      version: SCRIPT_FORMAT_VERSION,
      name: 'Test',
      source: 'print("hello")',
    });

    // 1. Truncated header
    const truncated = validBytes.slice(0, 10);
    const parsedTruncated = parseScriptDefinition(200, truncated);
    expect(parsedTruncated.isErr()).toBe(true);
    expect(parsedTruncated._unsafeUnwrapErr()).toContain('truncated');

    // 2. Invalid magic
    const invalidMagic = new Uint8Array(validBytes);
    invalidMagic[0] = 0;
    const parsedMagic = parseScriptDefinition(200, invalidMagic);
    expect(parsedMagic.isErr()).toBe(true);
    expect(parsedMagic._unsafeUnwrapErr()).toContain('invalid magic');

    // 3. Unsupported version
    const invalidVersion = new Uint8Array(validBytes);
    new DataView(invalidVersion.buffer).setUint16(4, 999, false);
    const parsedVersion = parseScriptDefinition(200, invalidVersion);
    expect(parsedVersion.isErr()).toBe(true);
    expect(parsedVersion._unsafeUnwrapErr()).toContain('Unsupported script version');

    // 4. Payload overrun (source length claims to be huge)
    const overrun = new Uint8Array(validBytes);
    new DataView(overrun.buffer).setUint32(12, 1000000, false);
    const parsedOverrun = parseScriptDefinition(200, overrun);
    expect(parsedOverrun.isErr()).toBe(true);
    expect(parsedOverrun._unsafeUnwrapErr()).toContain('payload overruns resource');
  });

  it('flags all disallowed Lua globals during validation', () => {
    const globals = ['io', 'os', 'debug', 'package', 'require', 'dofile', 'loadfile', 'load'];
    for (const glob of globals) {
      let code = '';
      if (['require', 'dofile', 'loadfile', 'load'].includes(glob)) {
        code = `${glob}("something")`;
      } else {
        code = `${glob}.something()`;
      }
      const issues = validateScripts(
        [
          {
            id: 100,
            version: SCRIPT_FORMAT_VERSION,
            name: 'Test',
            source: `function onSpawn(self, ctx)\n  ${code}\nend`,
          },
        ],
        [],
      );
      expect(issues.some((issue) => issue.message.includes(`Lua API '${glob}'`))).toBe(true);
    }
  });
});
