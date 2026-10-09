import { analyzeLua, visibleLuaSymbols, luaReceiverType, luaSignatureAt, isLuaCodeAt } from './lua-language';
import { completeLuaScript, luaWorkspaceFunctionCompletions } from './lua-script-completions';

describe('browser Lua language analysis', () => {
  it('resolves shadowed variables and does not leak function parameters', () => {
    const source = 'local target = 3\nfunction onTick(self, ctx)\n  local target = ctx:player()\n  target:x()\nend\nlocal outside = target';
    const inside = source.indexOf('target:x');
    expect(luaReceiverType(source, inside, 'target')).toBe('object');
    expect(luaReceiverType(source, source.length, 'target')).toBe('number');
    expect(visibleLuaSymbols(source, source.length).some((symbol) => symbol.name === 'ctx')).toBe(false);
  });

  it('recognizes aliases and custom hook parameter names while typing', () => {
    const source = 'function onTick(car, game, dt)\n  local player = game:player()\n  local alias = player\n  alias:';
    expect(luaReceiverType(source, source.length, 'alias')).toBe('object');
    expect(luaReceiverType(source, source.length, 'car')).toBe('object');
    expect(luaReceiverType(source, source.length, 'game')).toBe('context');
  });

  it('does not expose a local before its declaration or outside its block', () => {
    const source = 'function onTick(self, ctx)\n  local before = 1\n  do\n    local inside = 2\n    print(inside)\n  end\n  print(before)\nend';
    expect(visibleLuaSymbols(source, source.indexOf('local before')).some((symbol) => symbol.name === 'before')).toBe(false);
    expect(visibleLuaSymbols(source, source.lastIndexOf('print')).some((symbol) => symbol.name === 'inside')).toBe(false);
  });

  it('keeps globals in other script states out of completion', () => {
    expect(luaWorkspaceFunctionCompletions([{ id: 1, name: 'Other', source: 'function unrelated() end' },
      { id: 2, name: 'Active', source: 'function own() end' }], 2).map((completion) => completion.label)).toEqual(['own']);
    const result = completeLuaScript({ source: 'function onTick(self, ctx)\n  local speed = 2\n  spe', position: 63,
      objectTypes: [], sounds: [], spriteFrames: [], workspaceSymbols: [{ label: 'unrelated', type: 'function', detail: '', documentation: '' }] });
    expect(result?.options.some((completion) => completion.label === 'unrelated')).toBe(false);
  });

  it('tracks active call arguments without counting nested calls, strings, or tables', () => {
    const source = 'function onTick(self, ctx)\n  ctx:spawnAt(3, math.max(1, 2), {"a,b", 4}, ';
    const signature = luaSignatureAt(source, source.length);
    expect(signature?.name).toBe('ctx:spawnAt');
    expect(signature?.activeParameter).toBe(3);
    expect(signature?.parameters).toEqual(['typeId', 'x', 'y', 'direction', 'speed']);
  });

  it('shows signatures for local functions and standard library functions', () => {
    const source = 'local function helper(first, second) end\nhelper(1, ';
    expect(luaSignatureAt(source, source.length)?.parameters).toEqual(['first', 'second']);
    expect(luaSignatureAt('math.max(1, ', 12)?.activeParameter).toBe(1);
  });

  it('preserves UTF-16 offsets when masking comments and strings', () => {
    const source = 'local text = "🚗"\n--[=[ comment\nctx:player()\n]=]\nprint(text)';
    expect(isLuaCodeAt(source, source.indexOf('ctx:') + 4)).toBe(false);
    expect(isLuaCodeAt(source, source.indexOf('print') + 3)).toBe(true);
    expect(analyzeLua(source).symbols[0]?.from).toBe(source.indexOf('text'));
  });
});
