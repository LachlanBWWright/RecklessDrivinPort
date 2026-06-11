import { LUA_API_GROUPS, LUA_HOOK_COMPLETIONS } from './lua-script-api';
import { completeLuaHostApi, completeLuaResourceReferences } from './lua-script-completions';

describe('lua script completions', () => {
  it('keeps completion labels unique within each API group', () => {
    for (const group of LUA_API_GROUPS) {
      const labels = group.completions.map((completion) => completion.label);
      expect(new Set(labels).size).toBe(labels.length);
    }
  });

  it('provides Lua hook snippets', () => {
    for (const hook of LUA_HOOK_COMPLETIONS) {
      expect(hook.apply).toContain(`function ${hook.label}(`);
      expect(hook.apply).toContain('end');
    }
  });

  it('suggests self methods after self colon', () => {
    const source = 'function onTick(self, ctx)\n  self:';
    const result = completeLuaHostApi(source, source.length);
    expect(result?.options.some((completion) => completion.label === 'setVelocity')).toBe(true);
    expect(result?.options.some((completion) => completion.label === 'spawnObjectType')).toBe(false);
  });

  it('suggests ctx methods after ctx colon', () => {
    const source = 'function onTick(self, ctx)\n  ctx:';
    const result = completeLuaHostApi(source, source.length);
    expect(result?.options.some((completion) => completion.label === 'spawnObjectType')).toBe(true);
    expect(result?.options.some((completion) => completion.label === 'setVelocity')).toBe(false);
  });

  it('suggests object type ids inside spawnObjectType', () => {
    const source = 'ctx:spawnObjectType(';
    const result = completeLuaResourceReferences({
      source,
      position: source.length,
      objectTypes: [{ id: 200, label: 'Frame #12 · 3 frames', description: 'Object typeId 200. Base frame 12.' }],
      sounds: [{ id: 128, label: '0.5s · 4000 bytes', description: 'Sound soundId 128.' }],
      spriteFrames: [{ id: 300, label: '16x16 · 8-bit', description: 'Sprite frameId 300.' }],
    });
    expect(result?.options).toEqual([
      {
        label: '200',
        type: 'constant',
        detail: 'object typeId 200 · Frame #12 · 3 frames',
        documentation: 'Object typeId 200. Base frame 12.',
        apply: '200',
      },
    ]);
  });

  it('suggests sound ids inside playSound', () => {
    const source = 'ctx:playSound(';
    const result = completeLuaResourceReferences({
      source,
      position: source.length,
      objectTypes: [{ id: 200, label: 'Frame #12 · 3 frames', description: 'Object typeId 200.' }],
      sounds: [{ id: 128, label: '0.5s · 4000 bytes', description: 'Sound soundId 128.' }],
      spriteFrames: [{ id: 300, label: '16x16 · 8-bit', description: 'Sprite frameId 300.' }],
    });
    expect(result?.options[0]?.apply).toBe('128');
    expect(result?.options[0]?.detail).toBe('soundId 128 · 0.5s · 4000 bytes');
  });

  it('suggests sprite frame ids inside setFrame', () => {
    const source = 'self:setFrame(';
    const result = completeLuaResourceReferences({
      source,
      position: source.length,
      objectTypes: [{ id: 200, label: 'Frame #12 · 3 frames', description: 'Object typeId 200.' }],
      sounds: [{ id: 128, label: '0.5s · 4000 bytes', description: 'Sound soundId 128.' }],
      spriteFrames: [{ id: 300, label: '16x16 · 8-bit', description: 'Sprite frameId 300.' }],
    });
    expect(result?.options[0]?.apply).toBe('300');
    expect(result?.options[0]?.detail).toBe('sprite frameId 300 · 16x16 · 8-bit');
  });
});
