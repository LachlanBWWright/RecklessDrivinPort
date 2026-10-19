import {
  LUA_CTX_COMPLETIONS,
  LUA_HOOK_COMPLETIONS,
  LUA_CONSTANT_COMPLETIONS,
  LUA_SELF_COMPLETIONS,
  LUA_SNIPPET_COMPLETIONS,
  type LuaApiCompletion,
} from './lua-script-api';
import { isLuaCodeAt, luaReceiverType, visibleLuaSymbols, luaSymbolCompletion, LUA_STANDARD_COMPLETIONS } from './lua-language';

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
  readonly workspaceSymbols?: readonly LuaApiCompletion[];
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

function longBracketEnd(source: string, start: number): { contentStart: number; close: string } | null {
  if (source[start] !== '[') return null;
  let cursor = start + 1;
  while (source[cursor] === '=') cursor += 1;
  if (source[cursor] !== '[') return null;
  return { contentStart: cursor + 1, close: `]${'='.repeat(cursor - start - 1)}]` };
}

type ResourceKind = 'objectType' | 'sound' | 'spriteFrame';

interface ResourceContext {
  readonly kind: ResourceKind;
  readonly argumentIndex: number;
}

function argumentIndexAt(source: string, openParen: number, position: number): number | null {
  let parenDepth = 0;
  let braceDepth = 0;
  let bracketDepth = 0;
  let argumentIndex = 0;
  let quote: 'single' | 'double' | null = null;
  let comment = false;

  for (let index = openParen + 1; index < position; index += 1) {
    const character = source[index] ?? '';
    const next = source[index + 1] ?? '';
    if (comment) {
      if (character === '\n') comment = false;
      continue;
    }
    if (quote !== null) {
      if (character === '\\') {
        index += 1;
      } else if ((quote === 'single' && character === "'") || (quote === 'double' && character === '"')) {
        quote = null;
      }
      continue;
    }
    if (character === '-' && next === '-') {
      const longComment = longBracketEnd(source, index + 2);
      if (longComment) {
        const closeAt = source.indexOf(longComment.close, longComment.contentStart);
        if (closeAt < 0 || closeAt >= position) return null;
        index = closeAt + longComment.close.length - 1;
      } else {
        comment = true;
        index += 1;
      }
    } else if (character === "'") {
      quote = 'single';
    } else if (character === '"') {
      quote = 'double';
    } else if (character === '[' && longBracketEnd(source, index) !== null) {
      const longString = longBracketEnd(source, index);
      if (!longString) return null;
      const closeAt = source.indexOf(longString.close, longString.contentStart);
      if (closeAt < 0 || closeAt >= position) return null;
      index = closeAt + longString.close.length - 1;
    } else if (character === '(') {
      parenDepth += 1;
    } else if (character === ')') {
      if (parenDepth === 0 && braceDepth === 0 && bracketDepth === 0) return null;
      if (parenDepth > 0) parenDepth -= 1;
    } else if (character === '{') {
      braceDepth += 1;
    } else if (character === '}') {
      if (braceDepth > 0) braceDepth -= 1;
    } else if (character === '[') {
      bracketDepth += 1;
    } else if (character === ']') {
      if (bracketDepth > 0) bracketDepth -= 1;
    } else if (character === ',' && parenDepth === 0 && braceDepth === 0 && bracketDepth === 0) {
      argumentIndex += 1;
    }
  }
  return quote === null && !comment && parenDepth === 0 && braceDepth === 0 && bracketDepth === 0
    ? argumentIndex
    : null;
}

function resourceContext(
  source: string,
  position: number,
): ResourceContext | null {
  const functions: readonly { name: string; kind: ResourceKind }[] = [
    { name: 'spawnObjectType', kind: 'objectType' },
    { name: 'spawnAt', kind: 'objectType' },
    { name: 'spawnRelative', kind: 'objectType' },
    { name: 'spawnNearPlayer', kind: 'objectType' },
    { name: 'spawnOnTrack', kind: 'objectType' },
    { name: 'spawnTrackside', kind: 'objectType' },
    { name: 'fireWeapon', kind: 'objectType' },
    { name: 'objectTypeExists', kind: 'objectType' },
    { name: 'findNearestObject', kind: 'objectType' },
    { name: 'countObjects', kind: 'objectType' },
    { name: 'playSound', kind: 'sound' },
    { name: 'soundExists', kind: 'sound' },
    { name: 'setFrame', kind: 'spriteFrame' },
    { name: 'frameExists', kind: 'spriteFrame' },
  ];
  let best: ResourceContext | null = null;
  let bestOpenParen = -1;
  for (const functionInfo of functions) {
    const pattern = new RegExp(`\\b([A-Za-z_]\\w*)\\s*:\\s*${functionInfo.name}\\s*\\(`, 'g');
    for (const match of source.matchAll(pattern)) {
      const receiver = match[1] ?? '';
      const symbol = visibleLuaSymbols(source, position).find((candidate) => candidate.name === receiver);
      const expected = functionInfo.name === 'setFrame' ? 'object' : 'context';
      if (symbol ? symbol.type !== expected : receiver !== (expected === 'object' ? 'self' : 'ctx')) continue;
      const openParen = (match.index ?? 0) + match[0].lastIndexOf('(');
      if (openParen >= position || openParen < bestOpenParen || !isLuaCodeAt(source, match.index ?? 0)) continue;
      const argumentIndex = argumentIndexAt(source, openParen, position);
      if (argumentIndex === null) continue;
      if (openParen > bestOpenParen) {
        bestOpenParen = openParen;
        best = { kind: functionInfo.kind, argumentIndex };
      }
    }
  }
  return best?.argumentIndex === 0 ? best : null;
}

export function completeLuaHostApi(source: string, position: number): LuaCompletionResult | null {
  if (!isLuaCodeAt(source, position)) return null;
  const from = wordStart(source, position);
  const receiverMatch = source.slice(Math.max(0, from - 64), from).match(/([A-Za-z_][A-Za-z0-9_]*)\s*:\s*$/);
  if (receiverMatch) {
    const receiver = receiverMatch[1] ?? '';
    const receiverType = luaReceiverType(source, position, receiver);
    if (receiverType === 'object') return { from, options: LUA_SELF_COMPLETIONS };
    if (receiverType === 'context') return { from, options: LUA_CTX_COMPLETIONS };
  }
  const constantTable = source.slice(0, position).match(/\b(Control|ObjectFlag|Addon|Track|RoadSide)\.\w*$/);
  if (constantTable && !visibleLuaSymbols(source, position).some((symbol) => symbol.name === constantTable[1])) {
    const table = constantTable[1];
    return {
      from: position - constantTable[0].length,
      options: LUA_CONSTANT_COMPLETIONS.filter((completion) =>
        completion.label.startsWith(`${table}.`),
      ),
    };
  }
  const hookDeclaration = source.slice(0, position).match(/\bfunction[ \t]+[A-Za-z_0-9]*$/);
  if (hookDeclaration) {
    return {
      from,
      options: LUA_HOOK_COMPLETIONS.map((completion) => ({
        ...completion,
        apply: completion.apply?.replace(/^function\s+/, ''),
      })),
    };
  }
  const lineStart = source.lastIndexOf('\n', position - 1) + 1;
  if (source.slice(lineStart, position).trim().length === 0) {
    return { from, options: [...LUA_HOOK_COMPLETIONS, ...LUA_SNIPPET_COMPLETIONS] };
  }
  return null;
}

export function completeLuaResourceReferences(
  request: LuaCompletionRequest,
): LuaCompletionResult | null {
  if (!isLuaCodeAt(request.source, request.position)) return null;
  const context = resourceContext(request.source, request.position);
  if (context === null) return null;
  const from = wordStart(request.source, request.position);
  if (context?.kind === 'objectType') {
    return {
      from,
      options: request.objectTypes.map((resource) => resourceCompletion(resource, 'object typeId')),
    };
  }
  if (context?.kind === 'sound') {
    return {
      from,
      options: request.sounds.map((resource) => resourceCompletion(resource, 'soundId')),
    };
  }
  return {
    from,
    options: request.spriteFrames.map((resource) => resourceCompletion(resource, 'sprite frameId')),
  };
}

export function completeLuaScript(request: LuaCompletionRequest): LuaCompletionResult | null {
  if (!isLuaCodeAt(request.source, request.position)) return null;
  const host = completeLuaHostApi(request.source, request.position);
  const from = wordStart(request.source, request.position);
  const before = request.source.slice(0, from);
  const standardTable = before.match(/\b(math|string|table|coroutine|utf8)\.\s*$/);
  if (standardTable && !visibleLuaSymbols(request.source, request.position).some((symbol) => symbol.name === standardTable[1])) {
    const prefix = `${standardTable[1]}.`;
    return { from, options: LUA_STANDARD_COMPLETIONS.filter((completion) => completion.label.startsWith(prefix))
      .map((completion) => ({ ...completion, label: completion.label.slice(prefix.length), apply: completion.apply?.slice(prefix.length) })) };
  }
  if (/[.:]\s*$/.test(before)) return host;
  const resource = completeLuaResourceReferences(request);
  if (resource) return resource;
  if (host?.options.some((completion) => completion.type === 'hook')) return host;
  const visible = visibleLuaSymbols(request.source, request.position).map(luaSymbolCompletion);
  const options = new Map<string, LuaApiCompletion>();
  for (const completion of visible) options.set(completion.label, completion);
  for (const completion of LUA_STANDARD_COMPLETIONS.filter((item) => !item.label.includes('.'))) {
    if (!options.has(completion.label)) options.set(completion.label, completion);
  }
  for (const table of ['math', 'string', 'table', 'coroutine', 'utf8']) {
    if (!options.has(table)) options.set(table, { label: table, type: 'variable', detail: `${table}: Lua library`, documentation: 'Available in the game Lua runtime.' });
  }
  return { from, options: [...options.values()] };
}

export function luaWorkspaceFunctionCompletions(
  scripts: readonly { readonly id: number; readonly name: string; readonly source: string }[],
  activeScriptId: number,
): LuaApiCompletion[] {
  const script = scripts.find((candidate) => candidate.id === activeScriptId);
  return script ? visibleLuaSymbols(script.source, script.source.length).filter((symbol) => symbol.type === 'function').map(luaSymbolCompletion) : [];
}
