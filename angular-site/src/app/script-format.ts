import { err, ok, type Result } from 'neverthrow';
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
  'onLevelStart',
  'onLevelTick',
];

const DISALLOWED_LUA_PATTERNS: readonly { pattern: RegExp; label: string }[] = [
  { pattern: /\bio\./, label: 'io' },
  { pattern: /\bos\./, label: 'os' },
  { pattern: /\bdebug\./, label: 'debug' },
  { pattern: /\bpackage\./, label: 'package' },
  { pattern: /\brequire\s*\(/, label: 'require' },
  { pattern: /\bdofile\s*\(/, label: 'dofile' },
  { pattern: /\bloadfile\s*\(/, label: 'loadfile' },
  { pattern: /\bload\s*\(/, label: 'load' },
];

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

function lineForIndex(source: string, index: number): number {
  return source.slice(0, Math.max(0, index)).split('\n').length;
}

export function validateScripts(
  scripts: readonly ScriptDefinition[],
  bindings: readonly ScriptBinding[],
  context?: ScriptValidationContext,
): ScriptValidationIssue[] {
  const issues: ScriptValidationIssue[] = [];
  const scriptIds = new Set<number>();
  const availableScriptIds = new Set<number>();
  const objectTypeIds = context?.availableObjectTypeIds ? new Set(context.availableObjectTypeIds) : null;
  const soundIds = context?.availableSoundIds ? new Set(context.availableSoundIds) : null;

  for (const script of scripts) {
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
    if (script.source.trim().length === 0) {
      issues.push({
        severity: 'error',
        scriptId: script.id,
        hook: null,
        line: null,
        message: 'Lua source is empty.',
      });
    }
    if (!LUA_HOOKS.some((hook) => new RegExp(`\\bfunction\\s+${hook}\\s*\\(`).test(script.source))) {
      issues.push({
        severity: 'warning',
        scriptId: script.id,
        hook: null,
        line: null,
        message: 'Script defines no lifecycle hook functions.',
      });
    }
    for (const { pattern, label } of DISALLOWED_LUA_PATTERNS) {
      const match = pattern.exec(script.source);
      if (match) {
        issues.push({
          severity: 'error',
          scriptId: script.id,
          hook: null,
          line: lineForIndex(script.source, match.index),
          message: `Lua API '${label}' is not available in game scripts.`,
        });
      }
    }
    for (const match of script.source.matchAll(/\bspawnObjectType\s*\(\s*(-?\d+)/g)) {
      const objectTypeId = Number.parseInt(match[1] ?? '', 10);
      if (objectTypeIds && !objectTypeIds.has(objectTypeId)) {
        issues.push({
          severity: 'warning',
          scriptId: script.id,
          hook: null,
          line: lineForIndex(script.source, match.index ?? 0),
          message: `spawnObjectType references missing object type ${objectTypeId}.`,
        });
      }
    }
    for (const match of script.source.matchAll(/\bplaySound\s*\(\s*(-?\d+)/g)) {
      const soundId = Number.parseInt(match[1] ?? '', 10);
      if (soundIds && !soundIds.has(soundId)) {
        issues.push({
          severity: 'warning',
          scriptId: script.id,
          hook: null,
          line: lineForIndex(script.source, match.index ?? 0),
          message: `playSound references missing sound ${soundId}.`,
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
