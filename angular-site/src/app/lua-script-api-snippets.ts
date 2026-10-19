import type { LuaApiCompletion } from './lua-script-api.types';

export const LUA_SNIPPET_COMPLETIONS: readonly LuaApiCompletion[] = [
  {
    label: 'proximityHazard',
    type: 'snippet',
    detail: 'simple proximity-triggered hazard',
    documentation: 'Damages or removes the object when the player is nearby.',
    apply:
      'function onTick(self, ctx)\n  if ctx:playerDistance() < 96 then\n    self:kill()\n  end\nend',
  },
  {
    label: 'pickup',
    type: 'snippet',
    detail: 'simple pickup script',
    documentation: 'Adds score and removes the object on collision.',
    apply: 'function onCollision(self, ctx, other)\n  ctx:addScore(100)\n  self:remove()\nend',
  },
  {
    label: 'delayedSpawn',
    type: 'snippet',
    detail: 'timer-triggered spawn',
    documentation: 'Starts a timer on spawn and creates an object when it expires.',
    apply:
      'function onSpawn(self, ctx)\n  ctx:setTimer("spawn", 1.0)\nend\n\nfunction onTimer(self, ctx, name)\n  if name == "spawn" then\n    ctx:spawnRelative(typeId, 0, 32, 0, 0)\n  end\nend',
  },
  {
    label: 'proximityTrigger',
    type: 'snippet',
    detail: 'player proximity trigger',
    documentation: 'Runs code when the player enters a configured radius.',
    apply:
      'function onSpawn(self, ctx)\n  ctx:setPlayerNearRadius(160)\nend\n\nfunction onPlayerNear(self, ctx, distance)\n  ctx:playSound(soundId)\nend',
  },
];
