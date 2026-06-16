import { LUA_API_GROUPS, LUA_HOOK_COMPLETIONS, LUA_SELF_COMPLETIONS, LUA_CTX_COMPLETIONS } from './lua-script-api';
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

  it('suggests constants after constant table dots', () => {
    const result = completeLuaHostApi('self:setControl(Control.', 'self:setControl(Control.'.length);
    expect(result?.options.some((completion) => completion.label === 'Control.Cop')).toBe(true);
    expect(result?.options.some((completion) => completion.label === 'Addon.Turbo')).toBe(false);

    const trackResult = completeLuaHostApi('ctx:spawnOnTrack(typeId, Track.', 'ctx:spawnOnTrack(typeId, Track.'.length);
    expect(trackResult?.options.some((completion) => completion.label === 'Track.Up')).toBe(true);
    expect(trackResult?.options.some((completion) => completion.label === 'RoadSide.Left')).toBe(false);

    const sideResult = completeLuaHostApi('ctx:spawnTrackside(typeId, RoadSide.', 'ctx:spawnTrackside(typeId, RoadSide.'.length);
    expect(sideResult?.options.some((completion) => completion.label === 'RoadSide.Right')).toBe(true);
    expect(sideResult?.options.some((completion) => completion.label === 'Track.Down')).toBe(false);
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

  it('suggests object type ids inside spawnRelative', () => {
    const source = 'ctx:spawnRelative(';
    const result = completeLuaResourceReferences({
      source,
      position: source.length,
      objectTypes: [{ id: 201, label: 'Frame #20 · 1 frame', description: 'Object typeId 201.' }],
      sounds: [{ id: 128, label: '0.5s · 4000 bytes', description: 'Sound soundId 128.' }],
      spriteFrames: [{ id: 300, label: '16x16 · 8-bit', description: 'Sprite frameId 300.' }],
    });
    expect(result?.options[0]?.apply).toBe('201');
    expect(result?.options[0]?.detail).toBe('object typeId 201 · Frame #20 · 1 frame');
  });

  it('suggests object type ids inside deterministic spawn helpers', () => {
    for (const source of ['ctx:spawnAt(', 'ctx:spawnNearPlayer(', 'ctx:spawnOnTrack(', 'ctx:spawnTrackside(']) {
      const result = completeLuaResourceReferences({
        source,
        position: source.length,
        objectTypes: [{ id: 202, label: 'Frame #30 · 1 frame', description: 'Object typeId 202.' }],
        sounds: [{ id: 129, label: '0.3s · 1200 bytes', description: 'Sound soundId 129.' }],
        spriteFrames: [{ id: 301, label: '32x32 · 16-bit', description: 'Sprite frameId 301.' }],
      });
      expect(result?.options[0]?.apply).toBe('202');
    }
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

  it('suggests resource ids inside existence checks', () => {
    const objectSource = 'ctx:objectTypeExists(';
    const objectResult = completeLuaResourceReferences({
      source: objectSource,
      position: objectSource.length,
      objectTypes: [{ id: 202, label: 'Frame #30 · 1 frame', description: 'Object typeId 202.' }],
      sounds: [{ id: 129, label: '0.3s · 1200 bytes', description: 'Sound soundId 129.' }],
      spriteFrames: [{ id: 301, label: '32x32 · 16-bit', description: 'Sprite frameId 301.' }],
    });
    expect(objectResult?.options[0]?.apply).toBe('202');

    const soundSource = 'ctx:soundExists(';
    const soundResult = completeLuaResourceReferences({
      source: soundSource,
      position: soundSource.length,
      objectTypes: [{ id: 202, label: 'Frame #30 · 1 frame', description: 'Object typeId 202.' }],
      sounds: [{ id: 129, label: '0.3s · 1200 bytes', description: 'Sound soundId 129.' }],
      spriteFrames: [{ id: 301, label: '32x32 · 16-bit', description: 'Sprite frameId 301.' }],
    });
    expect(soundResult?.options[0]?.apply).toBe('129');

    const frameSource = 'ctx:frameExists(';
    const frameResult = completeLuaResourceReferences({
      source: frameSource,
      position: frameSource.length,
      objectTypes: [{ id: 202, label: 'Frame #30 · 1 frame', description: 'Object typeId 202.' }],
      sounds: [{ id: 129, label: '0.3s · 1200 bytes', description: 'Sound soundId 129.' }],
      spriteFrames: [{ id: 301, label: '32x32 · 16-bit', description: 'Sprite frameId 301.' }],
    });
    expect(frameResult?.options[0]?.apply).toBe('301');
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

  it('covers all runtime hooks in LUA_HOOK_COMPLETIONS', () => {
    const expectedHooks = [
      'onSpawn',
      'onTick',
      'onCollision',
      'onDamage',
      'onDeath',
      'onDespawn',
      'onScriptChanged',
      'onSpawnedChild',
      'onSpawnedBy',
      'onSchedule',
      'onTimer',
      'onPlayerNear',
      'onPlayerFar',
      'onAnimationEnd',
      'onOffscreen',
      'onLevelStart',
      'onLevelTick',
    ];
    for (const hookName of expectedHooks) {
      const completion = LUA_HOOK_COMPLETIONS.find((h) => h.label === hookName);
      expect(completion).toBeDefined();
      expect(completion?.type).toBe('hook');
      expect(completion?.apply).toContain(`function ${hookName}(`);
    }
  });

  it('covers all expected self API methods', () => {
    const expectedSelfMethods = [
      'x', 'y', 'setPosition', 'velocityX', 'velocityY', 'setVelocity', 'addVelocity',
      'direction', 'setDirection', 'frame', 'setFrame', 'setFrameDuration', 'damage', 'setDamage',
      'typeId', 'maxDamage', 'scoreValue', 'mass', 'width', 'length', 'flags', 'flags2',
      'control', 'layer', 'setLayer', 'isPlayer', 'exists', 'isOnScreen', 'distanceTo', 'angleTo',
      'setInput', 'setControl', 'kill', 'remove', 'getState', 'setState', 'addChild', 'removeChild',
      'childCount'
    ];
    for (const name of expectedSelfMethods) {
      const completion = LUA_SELF_COMPLETIONS.find((c) => c.label === name);
      expect(completion).toBeDefined();
      expect(completion?.type).toBe('method');
    }
  });

  it('covers all expected ctx API methods', () => {
    const expectedCtxMethods = [
      'playerDistance', 'levelTime', 'levelNumber', 'levelResourceId', 'levelEndY',
      'player', 'playerX', 'playerY', 'playerSpeed', 'playerDamage',
      'teleportPlayer', 'teleportPlayerRelative', 'objectTypeExists', 'soundExists', 'frameExists',
      'findNearestObject', 'countObjects', 'spawnObjectType', 'spawnAt', 'spawnNearPlayer',
      'spawnOnTrack', 'spawnTrackside', 'spawnRelative', 'despawnChildren', 'playSound',
      'addScore', 'fireWeapon', 'getScriptState', 'setScriptState', 'getLevelState', 'setLevelState',
      'setTimer', 'getTimer', 'clearTimer', 'timerRemaining', 'after', 'every', 'cancelSchedule',
      'setPlayerNearRadius'
    ];
    for (const name of expectedCtxMethods) {
      const completion = LUA_CTX_COMPLETIONS.find((c) => c.label === name);
      expect(completion).toBeDefined();
      expect(completion?.type).toBe('method');
    }
  });
});
