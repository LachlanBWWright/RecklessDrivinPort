import {
  LUA_CTX_COMPLETIONS,
  LUA_HOOK_COMPLETIONS,
  LUA_SELF_COMPLETIONS,
  LUA_SNIPPET_COMPLETIONS,
  type LuaApiCompletion,
} from './lua-script-api';

export interface LuaResourceOption {
  readonly id: number;
  readonly label: string;
  readonly description: string;
}

export interface LuaCompletionRequest {
  readonly source: string;
  readonly position: number;
  readonly objectTypes: readonly LuaResourceOption[];
  readonly sounds: readonly LuaResourceOption[];
  readonly spriteFrames: readonly LuaResourceOption[];
}

export interface LuaCompletionResult {
  readonly from: number;
  readonly options: readonly LuaApiCompletion[];
}

function wordStart(source: string, position: number): number {
  let cursor = Math.max(0, Math.min(position, source.length));
  while (cursor > 0 && /[\w]/.test(source[cursor - 1] ?? '')) {
    cursor -= 1;
  }
  return cursor;
}

function resourceCompletion(resource: LuaResourceOption, detailPrefix: string): LuaApiCompletion {
  return {
    label: String(resource.id),
    type: 'constant',
    detail: `${detailPrefix} ${resource.id} · ${resource.label}`,
    documentation: resource.description,
    apply: String(resource.id),
  };
}

function resourceContext(source: string, position: number): 'objectType' | 'sound' | 'spriteFrame' | null {
  const beforeCursor = source.slice(Math.max(0, position - 80), position);
  if (/ctx:spawnObjectType\s*\([^)]*$/.test(beforeCursor)) return 'objectType';
  if (/ctx:fireWeapon\s*\([^)]*$/.test(beforeCursor)) return 'objectType';
  if (/ctx:playSound\s*\([^)]*$/.test(beforeCursor)) return 'sound';
  if (/self:setFrame\s*\([^)]*$/.test(beforeCursor)) return 'spriteFrame';
  return null;
}

export function completeLuaHostApi(source: string, position: number): LuaCompletionResult | null {
  const from = wordStart(source, position);
  const prefix = source.slice(Math.max(0, from - 5), from);
  if (prefix.endsWith('self:')) {
    return { from, options: LUA_SELF_COMPLETIONS };
  }
  if (prefix.endsWith('ctx:')) {
    return { from, options: LUA_CTX_COMPLETIONS };
  }
  if (/\bfunction\s+$/.test(source.slice(Math.max(0, position - 16), position))) {
    return { from, options: LUA_HOOK_COMPLETIONS };
  }
  return { from, options: [...LUA_HOOK_COMPLETIONS, ...LUA_SNIPPET_COMPLETIONS] };
}

export function completeLuaResourceReferences(request: LuaCompletionRequest): LuaCompletionResult | null {
  const context = resourceContext(request.source, request.position);
  if (context === null) return null;
  const from = wordStart(request.source, request.position);
  if (context === 'objectType') {
    return {
      from,
      options: request.objectTypes.map((resource) =>
        resourceCompletion(resource, 'object typeId'),
      ),
    };
  }
  if (context === 'sound') {
    return {
      from,
      options: request.sounds.map((resource) =>
        resourceCompletion(resource, 'soundId'),
      ),
    };
  }
  return {
    from,
    options: request.spriteFrames.map((resource) =>
      resourceCompletion(resource, 'sprite frameId'),
    ),
  };
}

export function completeLuaScript(request: LuaCompletionRequest): LuaCompletionResult | null {
  return completeLuaResourceReferences(request) ?? completeLuaHostApi(request.source, request.position);
}
