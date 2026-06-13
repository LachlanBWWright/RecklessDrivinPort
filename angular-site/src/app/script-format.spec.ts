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
});
