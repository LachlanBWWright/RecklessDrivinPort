export type LuaApiCompletionType =
  | 'function'
  | 'method'
  | 'property'
  | 'hook'
  | 'constant'
  | 'snippet';

export interface LuaApiCompletion {
  readonly label: string;
  readonly type: LuaApiCompletionType;
  readonly detail: string;
  readonly documentation: string;
  readonly apply?: string;
}

export interface LuaApiGroup {
  readonly id: string;
  readonly label: string;
  readonly completions: readonly LuaApiCompletion[];
}

export const LUA_HOOK_COMPLETIONS: readonly LuaApiCompletion[] = [
  {
    label: 'onSpawn',
    type: 'hook',
    detail: 'function onSpawn(self, ctx)',
    documentation: 'Runs when the object is created.',
    apply: 'function onSpawn(self, ctx)\n  \nend',
  },
  {
    label: 'onTick',
    type: 'hook',
    detail: 'function onTick(self, ctx)',
    documentation: 'Runs on each object update tick.',
    apply: 'function onTick(self, ctx)\n  \nend',
  },
  {
    label: 'onCollision',
    type: 'hook',
    detail: 'function onCollision(self, ctx, other)',
    documentation: 'Runs when this object collides with another object.',
    apply: 'function onCollision(self, ctx, other)\n  \nend',
  },
  {
    label: 'onDamage',
    type: 'hook',
    detail: 'function onDamage(self, ctx, amount)',
    documentation: 'Runs when this object receives damage.',
    apply: 'function onDamage(self, ctx, amount)\n  \nend',
  },
  {
    label: 'onDeath',
    type: 'hook',
    detail: 'function onDeath(self, ctx)',
    documentation: 'Runs before this object is removed by death logic.',
    apply: 'function onDeath(self, ctx)\n  \nend',
  },
  {
    label: 'onAnimationEnd',
    type: 'hook',
    detail: 'function onAnimationEnd(self, ctx)',
    documentation: 'Runs when the object animation reaches its end.',
    apply: 'function onAnimationEnd(self, ctx)\n  \nend',
  },
  {
    label: 'onOffscreen',
    type: 'hook',
    detail: 'function onOffscreen(self, ctx)',
    documentation: 'Runs when off-screen object handling is reached.',
    apply: 'function onOffscreen(self, ctx)\n  \nend',
  },
];

export const LUA_SELF_COMPLETIONS: readonly LuaApiCompletion[] = [
  { label: 'x', type: 'method', detail: 'self:x()', documentation: 'Current x position.', apply: 'x()' },
  { label: 'y', type: 'method', detail: 'self:y()', documentation: 'Current y position.', apply: 'y()' },
  {
    label: 'setPosition',
    type: 'method',
    detail: 'self:setPosition(x, y)',
    documentation: 'Moves the object to an absolute position.',
    apply: 'setPosition(x, y)',
  },
  {
    label: 'velocityX',
    type: 'method',
    detail: 'self:velocityX()',
    documentation: 'Current x velocity.',
    apply: 'velocityX()',
  },
  {
    label: 'velocityY',
    type: 'method',
    detail: 'self:velocityY()',
    documentation: 'Current y velocity.',
    apply: 'velocityY()',
  },
  {
    label: 'setVelocity',
    type: 'method',
    detail: 'self:setVelocity(x, y)',
    documentation: 'Sets the object velocity.',
    apply: 'setVelocity(x, y)',
  },
  {
    label: 'addVelocity',
    type: 'method',
    detail: 'self:addVelocity(x, y)',
    documentation: 'Adds to the current object velocity.',
    apply: 'addVelocity(x, y)',
  },
  {
    label: 'direction',
    type: 'method',
    detail: 'self:direction()',
    documentation: 'Current direction in radians.',
    apply: 'direction()',
  },
  {
    label: 'setDirection',
    type: 'method',
    detail: 'self:setDirection(radians)',
    documentation: 'Sets the object direction in radians.',
    apply: 'setDirection(radians)',
  },
  { label: 'frame', type: 'method', detail: 'self:frame()', documentation: 'Current sprite frame.', apply: 'frame()' },
  {
    label: 'setFrame',
    type: 'method',
    detail: 'self:setFrame(frame)',
    documentation: 'Sets the current sprite frame.',
    apply: 'setFrame(frame)',
  },
  { label: 'damage', type: 'method', detail: 'self:damage()', documentation: 'Current damage value.', apply: 'damage()' },
  {
    label: 'setDamage',
    type: 'method',
    detail: 'self:setDamage(value)',
    documentation: 'Sets the object damage value.',
    apply: 'setDamage(value)',
  },
  { label: 'typeId', type: 'method', detail: 'self:typeId()', documentation: 'Object type resource ID.', apply: 'typeId()' },
  {
    label: 'setInput',
    type: 'method',
    detail: 'self:setInput(throttle, steering)',
    documentation: 'Sets AI-style throttle and steering inputs.',
    apply: 'setInput(throttle, steering)',
  },
  {
    label: 'setControl',
    type: 'method',
    detail: 'self:setControl(mode)',
    documentation: 'Changes the script control mode.',
    apply: 'setControl(mode)',
  },
  { label: 'kill', type: 'method', detail: 'self:kill()', documentation: 'Kills this object.', apply: 'kill()' },
  { label: 'remove', type: 'method', detail: 'self:remove()', documentation: 'Removes this object.', apply: 'remove()' },
];

export const LUA_CTX_COMPLETIONS: readonly LuaApiCompletion[] = [
  {
    label: 'playerDistance',
    type: 'method',
    detail: 'ctx:playerDistance()',
    documentation: 'Distance from this object to the player.',
    apply: 'playerDistance()',
  },
  {
    label: 'levelTime',
    type: 'method',
    detail: 'ctx:levelTime()',
    documentation: 'Current level time in seconds.',
    apply: 'levelTime()',
  },
  {
    label: 'spawnObjectType',
    type: 'method',
    detail: 'ctx:spawnObjectType(typeId, x, y, direction, speed)',
    documentation: 'Spawns an object type at the requested position.',
    apply: 'spawnObjectType(typeId, x, y, direction, speed)',
  },
  {
    label: 'playSound',
    type: 'method',
    detail: 'ctx:playSound(soundId)',
    documentation: 'Plays a sound resource.',
    apply: 'playSound(soundId)',
  },
  {
    label: 'addScore',
    type: 'method',
    detail: 'ctx:addScore(points)',
    documentation: 'Adds points to the player score.',
    apply: 'addScore(points)',
  },
  {
    label: 'fireWeapon',
    type: 'method',
    detail: 'ctx:fireWeapon(typeId)',
    documentation: 'Fires an object type as a weapon.',
    apply: 'fireWeapon(typeId)',
  },
  {
    label: 'setTimer',
    type: 'method',
    detail: 'ctx:setTimer(name, seconds)',
    documentation: 'Stores a named timer value.',
    apply: 'setTimer(name, seconds)',
  },
  {
    label: 'getTimer',
    type: 'method',
    detail: 'ctx:getTimer(name)',
    documentation: 'Reads a named timer value.',
    apply: 'getTimer(name)',
  },
];

export const LUA_SNIPPET_COMPLETIONS: readonly LuaApiCompletion[] = [
  {
    label: 'proximityHazard',
    type: 'snippet',
    detail: 'simple proximity-triggered hazard',
    documentation: 'Damages or removes the object when the player is nearby.',
    apply: 'function onTick(self, ctx)\n  if ctx:playerDistance() < 96 then\n    self:kill()\n  end\nend',
  },
  {
    label: 'pickup',
    type: 'snippet',
    detail: 'simple pickup script',
    documentation: 'Adds score and removes the object on collision.',
    apply: 'function onCollision(self, ctx, other)\n  ctx:addScore(100)\n  self:remove()\nend',
  },
];

export const LUA_API_GROUPS: readonly LuaApiGroup[] = [
  { id: 'hooks', label: 'Lifecycle Hooks', completions: LUA_HOOK_COMPLETIONS },
  { id: 'self', label: 'self Methods', completions: LUA_SELF_COMPLETIONS },
  { id: 'ctx', label: 'ctx Methods', completions: LUA_CTX_COMPLETIONS },
  { id: 'snippets', label: 'Snippets', completions: LUA_SNIPPET_COMPLETIONS },
];
