import { err, ok, type Result } from 'neverthrow';
import { parse as parseLua } from 'luaparse';
import type { Expression, Node } from 'luaparse';
import type {
  LevelScriptBinding,
  ScriptBinding,
  ScriptDefinition,
  ScriptHookId,
  ScriptValidationIssue,
} from './level-editor.types';

export const SCRIPT_RESOURCE_TYPE = 'Scrp';
export const SCRIPT_BINDINGS_RESOURCE_TYPE = 'ScMp';
export const SCRIPT_BINDINGS_RESOURCE_ID = 128;
export const LEVEL_SCRIPT_BINDINGS_RESOURCE_TYPE = 'ScLv';
export const LEVEL_SCRIPT_BINDINGS_RESOURCE_ID = 128;
export const SCRIPT_FORMAT_VERSION = 1;

const SCRIPT_MAGIC = 0x53435250; // SCRP
const SCRIPT_BINDINGS_MAGIC = 0x53434d50; // SCMP
const LEVEL_SCRIPT_BINDINGS_MAGIC = 0x53434c56; // SCLV
const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder();

const LUA_HOOKS: readonly ScriptHookId[] = [
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
  'onPickup',
  'onLevelStart',
  'onLevelTick',
  'onLevelComplete',
  'onPlayerRespawn',
  'onAddOnAward',
];

const DISALLOWED_LUA_GLOBALS = new Set(['io', 'os', 'debug', 'package']);
const DISALLOWED_LUA_FUNCTIONS = new Set(['require', 'dofile', 'loadfile', 'load']);
const OBJECT_TYPE_RESOURCE_METHODS = new Set([
  'spawnObjectType', 'spawnAt', 'spawnRelative', 'spawnNearPlayer',
  'spawnOnTrack', 'spawnTrackside', 'fireWeapon',
]);

function rootIdentifier(expression: Expression): string | null {
  switch (expression.type) {
    case 'Identifier':
      return expression.name;
    case 'MemberExpression':
    case 'IndexExpression':
      return rootIdentifier(expression.base);
    default:
      return null;
  }
}

function disallowedApiUse(node: Node): { label: string; line: number | null } | null {
  if (node.type === 'MemberExpression' || node.type === 'IndexExpression') {
    const root = rootIdentifier(node);
    if (root && DISALLOWED_LUA_GLOBALS.has(root)) {
      return { label: root, line: node.loc?.start.line ?? null };
    }
  }
  if (
    (node.type === 'CallExpression' || node.type === 'TableCallExpression' || node.type === 'StringCallExpression') &&
    node.base.type === 'Identifier' && DISALLOWED_LUA_FUNCTIONS.has(node.base.name)
  ) {
    return { label: node.base.name, line: node.loc?.start.line ?? null };
  }
  return null;
}

function numericValue(expression: Expression): number | null {
  if (expression.type === 'NumericLiteral') return expression.value;
  if (expression.type === 'UnaryExpression' && expression.operator === '-' && expression.argument.type === 'NumericLiteral') {
    return -expression.argument.value;
  }
  return null;
}

function resourceReference(node: Node): { kind: 'object type' | 'sound'; method: string; id: number; line: number | null } | null {
  if (node.type !== 'CallExpression') return null;
  const member = node.base.type === 'MemberExpression' ? node.base : null;
  if (member && (member.indexer !== ':' || member.base.type !== 'Identifier' || member.base.name !== 'ctx')) return null;
  const method = member?.identifier.name ?? (node.base.type === 'Identifier' ? node.base.name : null);
  const kind = method === 'playSound' ? 'sound' : OBJECT_TYPE_RESOURCE_METHODS.has(method ?? '') ? 'object type' : null;
  if (!kind) return null;
  const id = node.arguments[0] ? numericValue(node.arguments[0]) : null;
  return id === null ? null : { kind, method: method ?? '', id, line: node.loc?.start.line ?? null };
}

function isLifecycleHook(node: Node): boolean {
  if (node.type !== 'FunctionDeclaration' || node.isLocal) return false;
  const identifier = node.identifier;
  return identifier?.type === 'Identifier' && LUA_HOOKS.some((hook) => hook === identifier.name);
}

export function serializeScriptDefinition(script: ScriptDefinition): Uint8Array {
  const nameBytes = TEXT_ENCODER.encode(script.name);
  const sourceBytes = TEXT_ENCODER.encode(script.source);
  const bytes = new Uint8Array(16 + nameBytes.length + sourceBytes.length);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, SCRIPT_MAGIC, false);
  view.setUint16(4, script.version, false);
  view.setUint16(6, 0, false);
  view.setUint16(8, nameBytes.length, false);
  view.setUint16(10, 0, false);
  view.setUint32(12, sourceBytes.length, false);
  bytes.set(nameBytes, 16);
  bytes.set(sourceBytes, 16 + nameBytes.length);
  return bytes;
}

export function parseScriptDefinition(
  scriptId: number,
  bytes: Uint8Array,
): Result<ScriptDefinition, string> {
  if (bytes.length < 16) return err(`Script ${scriptId} is truncated`);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, false) !== SCRIPT_MAGIC) {
    return err(`Script ${scriptId} has invalid magic`);
  }
  const version = view.getUint16(4, false);
  if (version !== SCRIPT_FORMAT_VERSION) {
    return err(`Unsupported script version ${version} for script ${scriptId}`);
  }
  const nameLength = view.getUint16(8, false);
  const sourceLength = view.getUint32(12, false);
  const nameStart = 16;
  const sourceStart = nameStart + nameLength;
  const sourceEnd = sourceStart + sourceLength;
  if (sourceEnd > bytes.length) return err(`Script ${scriptId} payload overruns resource`);
  return ok({
    id: scriptId,
    version,
    name: TEXT_DECODER.decode(bytes.slice(nameStart, sourceStart)),
    source: TEXT_DECODER.decode(bytes.slice(sourceStart, sourceEnd)),
  });
}

export function serializeScriptBindings(bindings: ScriptBinding[]): Uint8Array {
  const size = 8 + bindings.length * 8;
  const bytes = new Uint8Array(size);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, SCRIPT_BINDINGS_MAGIC, false);
  view.setUint16(4, SCRIPT_FORMAT_VERSION, false);
  view.setUint16(6, bindings.length, false);
  let offset = 8;
  for (const binding of [...bindings].sort((a, b) => a.objectTypeId - b.objectTypeId)) {
    view.setInt16(offset, binding.objectTypeId, false);
    view.setInt16(offset + 2, binding.scriptId, false);
    view.setUint16(offset + 4, binding.flags, false);
    view.setUint16(offset + 6, 0, false);
    offset += 8;
  }
  return bytes;
}

export function parseScriptBindings(bytes: Uint8Array): Result<ScriptBinding[], string> {
  if (bytes.length === 0) return ok([]);
  if (bytes.length < 8) return err('Script bindings payload is truncated');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, false) !== SCRIPT_BINDINGS_MAGIC) {
    return err('Script bindings payload has invalid magic');
  }
  const version = view.getUint16(4, false);
  if (version !== SCRIPT_FORMAT_VERSION) {
    return err(`Unsupported script bindings version ${version}`);
  }
  const count = view.getUint16(6, false);
  const expectedLength = 8 + count * 8;
  if (expectedLength > bytes.length) return err('Script bindings payload is truncated');
  const bindings: ScriptBinding[] = [];
  let offset = 8;
  for (let index = 0; index < count; index += 1) {
    bindings.push({
      objectTypeId: view.getInt16(offset, false),
      scriptId: view.getInt16(offset + 2, false),
      flags: view.getUint16(offset + 4, false),
    });
    offset += 8;
  }
  return ok(bindings);
}

export function serializeLevelScriptBindings(bindings: LevelScriptBinding[]): Uint8Array {
  const size = 8 + bindings.length * 8;
  const bytes = new Uint8Array(size);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, LEVEL_SCRIPT_BINDINGS_MAGIC, false);
  view.setUint16(4, SCRIPT_FORMAT_VERSION, false);
  view.setUint16(6, bindings.length, false);
  let offset = 8;
  for (const binding of [...bindings].sort((a, b) => a.levelResourceId - b.levelResourceId)) {
    view.setUint16(offset, binding.levelResourceId, false);
    view.setUint16(offset + 2, binding.scriptId, false);
    view.setUint16(offset + 4, binding.flags, false);
    view.setUint16(offset + 6, 0, false);
    offset += 8;
  }
  return bytes;
}

export function parseLevelScriptBindings(bytes: Uint8Array): Result<LevelScriptBinding[], string> {
  if (bytes.length === 0) return ok([]);
  if (bytes.length < 8) return err('Level script bindings payload is truncated');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, false) !== LEVEL_SCRIPT_BINDINGS_MAGIC) {
    return err('Level script bindings payload has invalid magic');
  }
  const version = view.getUint16(4, false);
  if (version !== SCRIPT_FORMAT_VERSION) {
    return err(`Unsupported level script bindings version ${version}`);
  }
  const count = view.getUint16(6, false);
  const expectedLength = 8 + count * 8;
  if (expectedLength > bytes.length) return err('Level script bindings payload is truncated');
  const bindings: LevelScriptBinding[] = [];
  let offset = 8;
  for (let index = 0; index < count; index += 1) {
    bindings.push({
      levelResourceId: view.getUint16(offset, false),
      scriptId: view.getUint16(offset + 2, false),
      flags: view.getUint16(offset + 4, false),
    });
    offset += 8;
  }
  return ok(bindings);
}

export interface ScriptValidationContext {
  availableObjectTypeIds?: readonly number[];
  availableSoundIds?: readonly number[];
}

function columnForError(value: unknown): number | null {
  if (!(value instanceof Error)) return null;
  const location = value.message.match(/^\[(\d+):(\d+)\]/);
  if (!location) return null;
  return Number(location[2]) + 1;
}

function lineForError(value: unknown): number | null {
  if (!(value instanceof Error)) return null;
  const location = value.message.match(/^\[(\d+):(\d+)\]/);
  if (!location) return null;
  return Number(location[1]);
}

function messageForError(value: unknown): string {
  return value instanceof Error ? value.message : 'Lua syntax error.';
}

export function validateScripts(
  scripts: readonly ScriptDefinition[],
  bindings: readonly ScriptBinding[],
  context?: ScriptValidationContext,
): ScriptValidationIssue[] {
  const issues: ScriptValidationIssue[] = [];
  const scriptIds = new Set<number>();
  const availableScriptIds = new Set<number>();
  const objectTypeIds = context?.availableObjectTypeIds
    ? new Set(context.availableObjectTypeIds)
    : null;
  const soundIds = context?.availableSoundIds ? new Set(context.availableSoundIds) : null;

  for (const script of scripts) {
    if (!Number.isInteger(script.id) || script.id < 0 || script.id > 32767) {
      issues.push({
        severity: 'error',
        scriptId: script.id,
        hook: null,
        line: null,
        message: `Script id ${script.id} is outside the supported 16-bit range.`,
      });
    }
    if (scriptIds.has(script.id)) {
      issues.push({
        severity: 'error',
        scriptId: script.id,
        hook: null,
        line: null,
        message: `Duplicate script id ${script.id}.`,
      });
    }
    scriptIds.add(script.id);
    availableScriptIds.add(script.id);

    if (script.name.trim().length === 0) {
      issues.push({
        severity: 'warning',
        scriptId: script.id,
        hook: null,
        line: null,
        message: 'Script name is empty.',
      });
    }
    if (TEXT_ENCODER.encode(script.name).byteLength > 65535) {
      issues.push({
        severity: 'error',
        scriptId: script.id,
        hook: null,
        line: null,
        message: 'Script name exceeds the 65535-byte resource format limit.',
      });
    }
    if (script.source.trim().length === 0) {
      issues.push({
        severity: 'error',
        scriptId: script.id,
        hook: null,
        line: null,
        message: 'Lua source is empty.',
      });
    }
    if (script.source.trim().length > 0) {
      try {
        const disallowedUses: Array<{ label: string; line: number | null }> = [];
        const resourceUses: Array<{ kind: 'object type' | 'sound'; method: string; id: number; line: number | null }> = [];
        const seenDisallowedUses = new Set<string>();
        let hasLifecycleHook = false;
        parseLua(script.source, {
          luaVersion: '5.3',
          locations: true,
          onCreateNode: (node) => {
            const use = disallowedApiUse(node);
            if (use) {
              const key = `${use.label}:${use.line ?? 0}`;
              if (!seenDisallowedUses.has(key)) {
                seenDisallowedUses.add(key);
                disallowedUses.push(use);
              }
            }
            const resourceUse = resourceReference(node);
            if (resourceUse) resourceUses.push(resourceUse);
            if (isLifecycleHook(node)) hasLifecycleHook = true;
          },
        });
        for (const use of disallowedUses) {
          issues.push({
            severity: 'error',
            scriptId: script.id,
            hook: null,
            line: use.line,
            message: `Lua API '${use.label}' is not available in game scripts.`,
          });
        }
        if (!hasLifecycleHook) {
          issues.push({
            severity: 'warning',
            scriptId: script.id,
            hook: null,
            line: null,
            message: 'Script defines no lifecycle hook functions.',
          });
        }
        for (const use of resourceUses) {
          if (use.kind === 'object type' && objectTypeIds && !objectTypeIds.has(use.id)) {
            issues.push({
              severity: 'warning',
              scriptId: script.id,
              hook: null,
              line: use.line,
              message: `${use.method} references missing object type ${use.id}.`,
            });
          }
          if (use.kind === 'sound' && soundIds && !soundIds.has(use.id)) {
            issues.push({
              severity: 'warning',
              scriptId: script.id,
              hook: null,
              line: use.line,
              message: `${use.method} references missing sound ${use.id}.`,
            });
          }
        }
      } catch (error: unknown) {
        issues.push({
          severity: 'error',
          scriptId: script.id,
          hook: null,
          line: lineForError(error),
          column: columnForError(error),
          message: messageForError(error),
        });
      }
    }
  }

  for (const binding of bindings) {
    if (!availableScriptIds.has(binding.scriptId)) {
      issues.push({
        severity: 'error',
        scriptId: binding.scriptId,
        hook: null,
        line: null,
        message: `Binding for object type ${binding.objectTypeId} references missing script ${binding.scriptId}.`,
      });
    }
    if (objectTypeIds && !objectTypeIds.has(binding.objectTypeId)) {
      issues.push({
        severity: 'warning',
        scriptId: binding.scriptId,
        hook: null,
        line: null,
        message: `Binding references missing object type ${binding.objectTypeId}.`,
      });
    }
  }

  return issues;
}
