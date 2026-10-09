import { parse } from 'luaparse';
import type { Expression, Chunk, FunctionDeclaration, Identifier, Node, Statement } from 'luaparse';
import { LUA_CTX_COMPLETIONS, LUA_HOOK_COMPLETIONS, LUA_SELF_COMPLETIONS } from './lua-script-api';
import type { LuaApiCompletion } from './lua-script-api';

export type LuaValueType = 'object' | 'context' | 'number' | 'string' | 'boolean' | 'table' | 'function' | 'unknown';
export interface LuaSymbol {
  readonly name: string;
  readonly type: LuaValueType;
  readonly from: number;
  readonly availableFrom: number;
  readonly scopeFrom: number;
  readonly scopeTo: number;
  readonly depth: number;
  readonly parameters: readonly string[];
}
export interface LuaAnalysis {
  readonly symbols: readonly LuaSymbol[];
  readonly outline: readonly LuaSymbol[];
  readonly complete: boolean;
}

/** Mask strings/comments without moving offsets, including unfinished long brackets. */
export function luaCode(source: string): { mask: string; regions: readonly { from: number; to: number; closed: boolean }[] } {
  // Array.from splits surrogate pairs; use code units to keep CodeMirror offsets intact.
  const masked = source.split('');
  const regions: { from: number; to: number; closed: boolean }[] = [];
  let cursor = 0;
  while (cursor < source.length) {
    const start = cursor;
    const comment = source.startsWith('--', cursor);
    const bracketStart = comment ? cursor + 2 : cursor;
    const bracket = source.slice(bracketStart).match(/^\[(=*)\[/);
    let closed = true;
    if (bracket) {
      const delimiter = `]${bracket[1] ?? ''}]`;
      const end = source.indexOf(delimiter, bracketStart + bracket[0].length);
      closed = end >= 0;
      cursor = closed ? end + delimiter.length : source.length;
    } else if (comment) {
      const end = source.indexOf('\n', cursor);
      closed = end >= 0;
      cursor = closed ? end : source.length;
    } else if (source[cursor] === '"' || source[cursor] === "'") {
      const quote = source[cursor];
      cursor += 1;
      closed = false;
      while (cursor < source.length) {
        if (source[cursor] === '\\') cursor = Math.min(source.length, cursor + 2);
        else if (source[cursor++] === quote) { closed = true; break; }
      }
    } else { cursor += 1; continue; }
    regions.push({ from: start, to: cursor, closed });
    for (let index = start; index < cursor; index += 1) {
      if (masked[index] !== '\n' && masked[index] !== '\r') masked[index] = ' ';
    }
  }
  return { mask: masked.join(''), regions };
}

export function isLuaCodeAt(source: string, position: number): boolean {
  return !luaCode(source).regions.some((region) => position > region.from &&
    (position < region.to || (!region.closed && position === region.to)));
}

function repairedSource(source: string): string {
  let repaired = source.replace(/([A-Za-z_]\w*)[.:]\w*\s*$/, '$1:__completion__()');
  const masked = luaCode(repaired).mask;
  const stack: string[] = [];
  let pendingLoop = 0;
  for (const match of masked.matchAll(/\b(?:function|if|for|while|do|repeat|until|end)\b|[()[\]{}]/g)) {
    const token = match[0];
    if (token === 'for' || token === 'while') { stack.push('end'); pendingLoop += 1; }
    else if (token === 'do' && pendingLoop > 0) pendingLoop -= 1;
    else if (token === 'function' || token === 'if' || token === 'do') stack.push('end');
    else if (token === 'repeat') stack.push('until true');
    else if (token === '(') stack.push(')');
    else if (token === '[') stack.push(']');
    else if (token === '{') stack.push('}');
    else stack.pop();
  }
  if (/[,=]\s*$/.test(masked)) repaired += ' nil';
  repaired += '\n' + stack.reverse().join('\n');
  return repaired;
}

function parseTree(source: string): { tree: Chunk; complete: boolean } | null {
  try { return { tree: parse(source, { luaVersion: '5.3', locations: true }), complete: true }; }
  catch {
    const repaired = repairedSource(source);
    try { return { tree: parse(repaired, { luaVersion: '5.3', locations: true }), complete: false }; }
    catch {
      // Bare identifiers are a common transient statement while typing.
      try { return { tree: parse(repairedSource(source.replace(/\b([A-Za-z_]\w*)\s*$/, '$1()')), { luaVersion: '5.3', locations: true }), complete: false }; }
      catch { return null; }
    }
  }
}

const cache = new Map<string, LuaAnalysis>();

export function analyzeLua(source: string): LuaAnalysis {
  const previous = cache.get(source);
  if (previous) return previous;
  const parsed = parseTree(source);
  const symbols: LuaSymbol[] = [];
  const outline: LuaSymbol[] = [];
  const starts = [0];
  for (let index = 0; index < source.length; index += 1) if (source[index] === '\n') starts.push(index + 1);
  const offset = (node: Node, end = false): number => {
    const location = end ? node.loc?.end : node.loc?.start;
    return location ? Math.min(source.length, (starts[location.line - 1] ?? source.length) + location.column) : 0;
  };
  const visible = (name: string, position: number): LuaSymbol | undefined => symbols
    .filter((symbol) => symbol.name === name && symbol.availableFrom <= position && symbol.scopeFrom <= position && symbol.scopeTo >= position)
    .sort((a, b) => b.depth - a.depth || b.availableFrom - a.availableFrom)[0];
  function valueType(expression: Expression | undefined): LuaValueType {
    if (!expression) return 'unknown';
    if (expression.type === 'Identifier') return visible(expression.name, offset(expression))?.type ?? 'unknown';
    if (expression.type === 'NumericLiteral') return 'number';
    if (expression.type === 'StringLiteral') return 'string';
    if (expression.type === 'BooleanLiteral') return 'boolean';
    if (expression.type === 'TableConstructorExpression') return 'table';
    if (expression.type === 'FunctionDeclaration') return 'function';
    if (expression.type === 'CallExpression' && expression.base.type === 'MemberExpression' && expression.base.base.type === 'Identifier') {
      const receiver = visible(expression.base.base.name, offset(expression))?.type;
      if (receiver === 'context' || receiver === 'object') {
        const name = expression.base.identifier.name;
        const method = (receiver === 'context' ? LUA_CTX_COMPLETIONS : LUA_SELF_COMPLETIONS).find((api) => api.label === name);
        if (method?.documentation.includes('Returns: RecklessObject')) return 'object';
        if (method?.documentation.includes('Returns: number') || method?.documentation.includes('Returns: integer')) return 'number';
        if (method?.documentation.includes('Returns: boolean')) return 'boolean';
      }
    }
    return 'unknown';
  }
  function declare(identifier: Identifier, scopeFrom: number, scopeTo: number, depth: number, availableFrom: number,
    type: LuaValueType, parameters: readonly string[] = []): LuaSymbol {
    const symbol = { name: identifier.name, type, from: offset(identifier), availableFrom, scopeFrom, scopeTo, depth, parameters };
    symbols.push(symbol);
    return symbol;
  }
  function visitFunction(node: FunctionDeclaration, from: number, to: number, depth: number): void {
    const parameters = node.parameters.map((parameter) => parameter.type === 'Identifier' ? parameter.name : '...');
    if (node.identifier?.type === 'Identifier') {
      const symbol = declare(node.identifier, node.isLocal ? from : 0, node.isLocal ? to : source.length,
        node.isLocal ? depth : 0, node.isLocal ? offset(node) : 0, 'function', parameters);
      outline.push(symbol);
    }
    const functionFrom = offset(node);
    const functionTo = offset(node, true);
    const name = node.identifier?.type === 'Identifier' ? node.identifier.name : '';
    const hook = !node.isLocal ? LUA_HOOK_COMPLETIONS.find((api) => api.label === name) : undefined;
    const hookParameters = hook?.apply?.match(/\(([^)]*)\)/)?.[1]?.split(',').map((parameter) => parameter.trim()) ?? [];
    node.parameters.forEach((parameter, index) => {
      if (parameter.type !== 'Identifier') return;
      const role = hookParameters[index];
      const type = role === 'ctx' ? 'context' : ['self', 'other', 'player', 'child', 'parent', 'source'].includes(role ?? '') ? 'object' : 'unknown';
      declare(parameter, functionFrom, functionTo, depth + 1, functionFrom, type);
    });
    visit(node.body, functionFrom, functionTo, depth + 1);
  }
  function expressions(expression: Expression, from: number, to: number, depth: number): void {
    if (expression.type === 'FunctionDeclaration') visitFunction(expression, from, to, depth);
    else if (expression.type === 'TableConstructorExpression') expression.fields.forEach((field) => expressions(field.value, from, to, depth));
  }
  function visit(body: readonly Statement[], from: number, to: number, depth: number): void {
    for (const node of body) {
      if (node.type === 'LocalStatement') {
        const types = node.init.map(valueType);
        node.init.forEach((expression) => expressions(expression, from, to, depth));
        node.variables.forEach((identifier, index) => {
          const symbol = declare(identifier, from, to, depth, offset(node, true), types[index] ?? 'unknown',
            node.init[index]?.type === 'FunctionDeclaration' ? node.init[index].parameters.map((parameter) => parameter.type === 'Identifier' ? parameter.name : '...') : []);
          if (symbol.type === 'function') outline.push(symbol);
        });
      } else if (node.type === 'FunctionDeclaration') visitFunction(node, from, to, depth);
      else if (node.type === 'AssignmentStatement') {
        node.variables.forEach((identifier, index) => {
          if (identifier.type !== 'Identifier') return;
          const existing = visible(identifier.name, offset(node));
          declare(identifier, existing?.scopeFrom ?? 0, existing?.scopeTo ?? source.length, existing?.depth ?? 0,
            offset(node, true), valueType(node.init[index]));
        });
        node.init.forEach((expression) => expressions(expression, from, to, depth));
      } else if (node.type === 'IfStatement') {
        for (const clause of node.clauses) visit(clause.body, offset(clause), offset(clause, true), depth + 1);
      } else if (node.type === 'ForNumericStatement' || node.type === 'ForGenericStatement') {
        const variables = node.type === 'ForNumericStatement' ? [node.variable] : node.variables;
        const bodyFrom = node.body[0] ? offset(node.body[0]) : offset(node, true);
        variables.forEach((identifier) => declare(identifier, bodyFrom, offset(node, true), depth + 1, bodyFrom,
          node.type === 'ForNumericStatement' ? 'number' : 'unknown'));
        visit(node.body, bodyFrom, offset(node, true), depth + 1);
      } else if (node.type === 'WhileStatement' || node.type === 'RepeatStatement' || node.type === 'DoStatement') {
        visit(node.body, offset(node), offset(node, true), depth + 1);
      }
    }
  }
  if (parsed) visit(parsed.tree.body, 0, source.length, 0);
  const result = { symbols, outline, complete: parsed?.complete ?? false };
  cache.set(source, result);
  if (cache.size > 12) cache.delete(cache.keys().next().value ?? '');
  return result;
}

export function visibleLuaSymbols(source: string, position: number): readonly LuaSymbol[] {
  const analysis = analyzeLua(source);
  const effective = analysis.complete ? analysis : analyzeLua(source.slice(0, position));
  const byName = new Map<string, LuaSymbol>();
  const candidates = effective.symbols.filter((symbol) => symbol.scopeFrom <= position && symbol.scopeTo >= position && symbol.availableFrom <= position)
    .sort((a, b) => b.depth - a.depth || b.availableFrom - a.availableFrom);
  for (const symbol of candidates) if (!byName.has(symbol.name)) byName.set(symbol.name, symbol);
  return [...byName.values()];
}

export function luaSymbolCompletion(symbol: LuaSymbol): LuaApiCompletion {
  return {
    label: symbol.name, type: symbol.type === 'function' ? 'function' : 'variable',
    detail: symbol.type === 'function' ? `${symbol.name}(${symbol.parameters.join(', ')})` : `${symbol.name}: ${symbol.type}`,
    documentation: `Defined in this script. ${symbol.depth > 0 ? 'Local scope.' : 'Script scope.'}`,
    apply: symbol.name,
  };
}

export function luaReceiverType(source: string, position: number, receiver: string): LuaValueType {
  return visibleLuaSymbols(source, position).find((symbol) => symbol.name === receiver)?.type ?? 'unknown';
}

const standardDefinitions: readonly [string, string, string][] = [
  ['math.abs', 'x', 'Absolute value.'], ['math.min', '...', 'Smallest argument.'], ['math.max', '...', 'Largest argument.'],
  ['math.floor', 'x', 'Round down.'], ['math.ceil', 'x', 'Round up.'], ['math.sqrt', 'x', 'Square root.'],
  ['math.sin', 'x', 'Sine in radians.'], ['math.cos', 'x', 'Cosine in radians.'], ['math.atan', 'y, x', 'Angle in radians.'],
  ['math.random', 'min, max', 'Random value; bounds are optional.'], ['math.randomseed', 'seed', 'Set the random seed.'],
  ['string.format', 'format, ...', 'Format a string.'], ['string.len', 'text', 'String length in bytes.'],
  ['string.sub', 'text, first, last', 'Substring; last is optional.'], ['string.find', 'text, pattern, start, plain', 'Find a pattern; start and plain are optional.'],
  ['string.match', 'text, pattern, start', 'Match a pattern; start is optional.'], ['string.gsub', 'text, pattern, replacement, limit', 'Replace matches; limit is optional.'],
  ['string.lower', 'text', 'Lowercase string.'], ['string.upper', 'text', 'Uppercase string.'], ['string.rep', 'text, count, separator', 'Repeat a string; separator is optional.'],
  ['table.insert', 'list, value', 'Append a value; an optional position may precede value.'], ['table.remove', 'list, position', 'Remove a value; position is optional.'],
  ['table.sort', 'list, compare', 'Sort in place; compare is optional.'], ['table.concat', 'list, separator', 'Join values; separator is optional.'],
  ['table.unpack', 'list, first, last', 'Return list values; bounds are optional.'], ['table.pack', '...', 'Pack arguments into a table.'],
  ['pairs', 'table', 'Iterate table entries.'], ['ipairs', 'list', 'Iterate sequential integer keys.'], ['next', 'table, key', 'Next table entry; key is optional.'],
  ['type', 'value', 'Return the Lua type name.'], ['tostring', 'value', 'Convert a value to text.'], ['tonumber', 'value, base', 'Convert to a number; base is optional.'],
  ['assert', 'condition, message', 'Raise an error if condition is false; message is optional.'], ['error', 'message, level', 'Raise an error; level is optional.'],
  ['pcall', 'fn, ...', 'Call a function and catch errors.'], ['xpcall', 'fn, handler, ...', 'Call with an error handler.'],
  ['select', 'index, ...', 'Select arguments or count them using #.'], ['print', '...', 'Write to the game Lua console.'], ['log', '...', 'Write to the game Lua console.'],
  ['setmetatable', 'table, metatable', 'Set a table metatable.'], ['getmetatable', 'value', 'Read a metatable.'],
  ['rawget', 'table, key', 'Read a raw table entry.'], ['rawset', 'table, key, value', 'Write a raw table entry.'], ['rawequal', 'a, b', 'Compare without metamethods.'],
  ['coroutine.create', 'fn', 'Create a coroutine.'], ['coroutine.resume', 'thread, ...', 'Resume a coroutine.'], ['coroutine.yield', '...', 'Suspend the current coroutine.'],
  ['coroutine.status', 'thread', 'Get coroutine status.'], ['coroutine.wrap', 'fn', 'Wrap a coroutine as a function.'],
  ['utf8.len', 'text, first, last', 'Count UTF-8 characters; bounds are optional.'], ['utf8.char', '...', 'Encode code points.'], ['utf8.codes', 'text', 'Iterate UTF-8 code points.'],
  ['math.acos', 'x', 'Inverse cosine in radians.'], ['math.asin', 'x', 'Inverse sine in radians.'], ['math.tan', 'x', 'Tangent in radians.'],
  ['math.deg', 'radians', 'Convert radians to degrees.'], ['math.rad', 'degrees', 'Convert degrees to radians.'],
  ['math.exp', 'x', 'Exponential of x.'], ['math.log', 'x, base', 'Logarithm; base is optional.'], ['math.fmod', 'x, y', 'Remainder of division.'],
  ['math.modf', 'x', 'Return integer and fractional parts.'], ['math.tointeger', 'x', 'Convert an integral value to an integer.'],
  ['math.type', 'x', 'Return integer, float, or nil.'], ['math.ult', 'm, n', 'Compare integers as unsigned values.'],
  ['string.byte', 'text, first, last', 'Return byte codes; bounds are optional.'], ['string.char', '...', 'Build a string from byte codes.'],
  ['string.dump', 'fn, strip', 'Create binary function data; strip is optional. The sandbox cannot load this data.'],
  ['string.gmatch', 'text, pattern', 'Iterate pattern matches.'], ['string.reverse', 'text', 'Reverse string bytes.'],
  ['table.move', 'source, first, last, target, destination', 'Move a range; destination is optional.'],
  ['coroutine.running', '', 'Return the current coroutine and whether it is the main thread.'], ['coroutine.isyieldable', '', 'Whether the current coroutine can yield.'],
  ['utf8.codepoint', 'text, first, last', 'Return code points; bounds are optional.'], ['utf8.offset', 'text, count, start', 'Find a character byte offset; start is optional.'],
  ['collectgarbage', 'option, argument', 'Control Lua garbage collection; arguments are optional.'], ['rawlen', 'value', 'Length without metamethods.'],
];
export const LUA_STANDARD_COMPLETIONS: readonly LuaApiCompletion[] = [
  ...standardDefinitions.map(([name, parameters, documentation]): LuaApiCompletion => ({ label: name, type: 'function',
    detail: `${name}(${parameters})`, documentation, apply: `${name}(${parameters})` })),
  ...['math.pi', 'math.huge', 'math.maxinteger', 'math.mininteger', 'utf8.charpattern', '_VERSION'].map((name): LuaApiCompletion => ({ label: name, type: 'constant',
    detail: name, documentation: 'Lua math constant.', apply: name })),
];

export interface LuaSignature { readonly name: string; readonly parameters: readonly string[]; readonly activeParameter: number; readonly documentation: string }
export function luaSignatureAt(source: string, position: number): LuaSignature | null {
  if (!isLuaCodeAt(source, position)) return null;
  const mask = luaCode(source.slice(0, position)).mask;
  const stack: { open: number; commas: number; bracket: string }[] = [];
  for (let index = 0; index < mask.length; index += 1) {
    const char = mask[index];
    if (char === '(' || char === '{' || char === '[') stack.push({ open: index, commas: 0, bracket: char });
    else if (char === ')' || char === '}' || char === ']') stack.pop();
    else if (char === ',' && stack.length) { const top = stack[stack.length - 1]; if (top) top.commas += 1; }
  }
  const call = [...stack].reverse().find((item) => item.bracket === '(');
  if (!call) return null;
  const match = mask.slice(0, call.open).match(/([A-Za-z_]\w*)(?:([.:])([A-Za-z_]\w*))?\s*$/);
  if (!match || /\bfunction\s*$/.test(mask.slice(0, call.open - match[0].length))) return null;
  const receiver = match[1] ?? '';
  const member = match[3];
  const visible = visibleLuaSymbols(source, position);
  const receiverSymbol = visible.find((candidate) => candidate.name === receiver);
  const receiverType = receiverSymbol?.type;
  const api = member ? (receiverType === 'object' ? LUA_SELF_COMPLETIONS : receiverType === 'context' ? LUA_CTX_COMPLETIONS : receiverSymbol ? [] : LUA_STANDARD_COMPLETIONS)
    .find((completion) => completion.label === member || completion.label === `${receiver}.${member}`) :
    !receiverSymbol ? LUA_STANDARD_COMPLETIONS.find((completion) => completion.label === receiver) : undefined;
  const symbol = !member && receiverSymbol?.type === 'function' ? receiverSymbol : undefined;
  const parametersText = api?.apply?.match(/\(([^)]*)\)/)?.[1];
  const parameters = symbol?.parameters ?? (parametersText?.trim() ? parametersText.split(',').map((parameter) => parameter.trim()) : []);
  if (!api && !symbol) return null;
  return { name: member ? `${receiver}${match[2]}${member}` : receiver, parameters,
    activeParameter: call.commas, documentation: api?.documentation ?? 'Function defined in this script.' };
}

export function luaHostIssues(source: string): readonly { readonly line: number; readonly column: number; readonly message: string }[] {
  const analysis = analyzeLua(source);
  if (!analysis.complete) return [];
  const starts = [0];
  for (let index = 0; index < source.length; index += 1) if (source[index] === '\n') starts.push(index + 1);
  const issues: { line: number; column: number; message: string }[] = [];
  try {
    parse(source, { luaVersion: '5.3', locations: true, onCreateNode: (node) => {
      if (node.type !== 'CallExpression' || node.base.type !== 'MemberExpression' || node.base.base.type !== 'Identifier' || !node.loc) return;
      const member = node.base;
      const receiver = node.base.base.name;
      const position = (starts[node.loc.start.line - 1] ?? 0) + node.loc.start.column;
      const type = luaReceiverType(source, position, receiver);
      if (type !== 'object' && type !== 'context') return;
      const api = (type === 'object' ? LUA_SELF_COMPLETIONS : LUA_CTX_COMPLETIONS).find((completion) => completion.label === member.identifier.name);
      if (!api) issues.push({ line: node.loc.start.line, column: node.loc.start.column + 1,
        message: `Unknown game ${type} method '${member.identifier.name}'.` });
      else if (member.indexer !== ':') issues.push({ line: node.loc.start.line, column: node.loc.start.column + 1,
        message: `Call '${receiver}:${member.identifier.name}' with a colon so the receiver is passed to the game API.` });
    } });
  } catch { /* Syntax diagnostics are provided by the strict validator. */ }
  return issues;
}
