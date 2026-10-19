import { unzipSync, zipSync, strToU8 } from 'fflate';
import { err, ok, type Result } from 'neverthrow';
import type { LevelScriptBinding, ScriptBinding, ScriptDefinition } from './level-editor.types';
import { SCRIPT_FORMAT_VERSION, validateScripts } from './script-format';
import { LUA_LUA_LS_CONTRACT } from './lua-script-api';

export const LUA_PROJECT_VERSION = 2;
const MAX_ARCHIVE_BYTES = 16 * 1024 * 1024;
const MAX_ARCHIVE_FILES = 512;
const MAX_ARCHIVE_FILE_BYTES = 2 * 1024 * 1024;
const MAX_ARCHIVE_EXPANDED_BYTES = 20 * 1024 * 1024;
const MAX_SCRIPT_FILES = 256;
const MAX_PROJECT_SCRIPT_NAME_BYTES = 4096;
const PROJECT_TEXT_ENCODER = new TextEncoder();

export interface LuaProjectInput {
  readonly scripts: readonly ScriptDefinition[];
  readonly scriptBindings: readonly ScriptBinding[];
  readonly levelScriptBindings: readonly LevelScriptBinding[];
  readonly objectTypeIds?: readonly number[];
  readonly soundIds?: readonly number[];
  readonly selectedLevelResourceId?: number | null;
  readonly resourceSourceName?: string;
}

export interface LuaProjectData extends LuaProjectInput {
  readonly version: 2;
}

interface LuaProjectManifest {
  readonly format: 'reckless-drivin-lua-project';
  readonly version: 2;
  readonly scriptFormatVersion: number;
  readonly resource: {
    readonly objectTypeIds: readonly number[];
    readonly soundIds: readonly number[];
    readonly sourceName: string;
  };
  readonly editor: {
    readonly selectedLevelResourceId: number | null;
  };
  readonly scripts: readonly {
    readonly id: number;
    readonly name: string;
    readonly file: string;
  }[];
  readonly scriptBindings: readonly ScriptBinding[];
  readonly levelScriptBindings: readonly LevelScriptBinding[];
}

function jsonBytes(value: unknown): Uint8Array {
  return strToU8(JSON.stringify(value, null, 2) + '\n');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && Number.isFinite(value);
}

function isInRange(value: number, min: number, max: number): boolean {
  return value >= min && value <= max;
}

function isNullableLevelId(value: unknown): value is number | null {
  return value === null || (isNumber(value) && isInRange(value, 0, 65535));
}

function isNumberArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every(isNumber);
}

function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

function isScriptBinding(value: unknown): value is ScriptBinding {
  return isRecord(value) && isNumber(value['objectTypeId']) && isInRange(value['objectTypeId'], -32768, 32767) &&
    isNumber(value['scriptId']) && isInRange(value['scriptId'], 0, 32767) &&
    isNumber(value['flags']) && isInRange(value['flags'], 0, 65535);
}

function isLevelScriptBinding(value: unknown): value is LevelScriptBinding {
  return isRecord(value) && isNumber(value['levelResourceId']) && isInRange(value['levelResourceId'], 0, 65535) &&
    isNumber(value['scriptId']) && isInRange(value['scriptId'], 0, 65535) &&
    isNumber(value['flags']) && isInRange(value['flags'], 0, 65535);
}

interface ManifestScript {
  readonly id: number;
  readonly name: string;
  readonly file: string;
}

function isManifestScript(value: unknown): value is ManifestScript {
  return isRecord(value) && isNumber(value['id']) && isInRange(value['id'], 0, 32767) &&
    typeof value['name'] === 'string' && PROJECT_TEXT_ENCODER.encode(value['name']).byteLength <= MAX_PROJECT_SCRIPT_NAME_BYTES &&
    typeof value['file'] === 'string';
}

function isSafeScriptFile(file: string): boolean {
  return /^scripts\/[A-Za-z0-9_-]+\.lua$/.test(file);
}

function parseJson(bytes: Uint8Array, filename: string): Result<unknown, string> {
  try {
    const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    return ok(value);
  } catch {
    return err(`${filename} is not valid JSON.`);
  }
}

function validateManifest(value: unknown): Result<LuaProjectManifest, string> {
  if (!isRecord(value)) return err('Project manifest must be an object.');
  if (value['format'] !== 'reckless-drivin-lua-project' || value['version'] !== LUA_PROJECT_VERSION) {
    return err('Unsupported Lua project format.');
  }
  if (!isNumber(value['scriptFormatVersion'])) return err('Project manifest has no script format version.');
  if (value['scriptFormatVersion'] !== SCRIPT_FORMAT_VERSION) return err('Unsupported script format version.');
  const scripts = value['scripts'];
  const bindings = value['scriptBindings'];
  const levelBindings = value['levelScriptBindings'];
  const resource = value['resource'];
  const editor = value['editor'];
  if (!isUnknownArray(scripts) || !isUnknownArray(bindings) || !isUnknownArray(levelBindings) || !isRecord(resource) || !isRecord(editor)) {
    return err('Project manifest has invalid script metadata.');
  }
  if (
    scripts.length > MAX_SCRIPT_FILES || !scripts.every(isManifestScript) ||
    !scripts.every((script) => isSafeScriptFile(script.file))
  ) {
    return err('Project manifest contains an invalid script entry.');
  }
  if (
    new Set(scripts.map((script) => script.id)).size !== scripts.length ||
    new Set(scripts.map((script) => script.file)).size !== scripts.length ||
    !bindings.every(isScriptBinding) || !levelBindings.every(isLevelScriptBinding)
  ) {
    return err('Project manifest contains duplicate scripts or invalid bindings.');
  }
  if (
    new Set(bindings.map((binding) => binding.objectTypeId)).size !== bindings.length ||
    new Set(levelBindings.map((binding) => binding.levelResourceId)).size !== levelBindings.length
  ) {
    return err('Project manifest contains duplicate bindings.');
  }
  const objectTypeIds = resource['objectTypeIds'];
  const soundIds = resource['soundIds'];
  const selectedLevelResourceId = editor['selectedLevelResourceId'];
  const sourceName = resource['sourceName'];
  if (
    !isNumberArray(objectTypeIds) || !objectTypeIds.every((id) => isInRange(id, -32768, 32767)) ||
    !isNumberArray(soundIds) || !soundIds.every((id) => isInRange(id, 0, 65535)) ||
    new Set(objectTypeIds).size !== objectTypeIds.length ||
    new Set(soundIds).size !== soundIds.length
  ) {
    return err('Project manifest contains invalid resource IDs.');
  }
  if (
    !isNullableLevelId(selectedLevelResourceId) ||
    typeof sourceName !== 'string' || sourceName.length > 1024
  ) {
    return err('Project manifest contains invalid editor or resource metadata.');
  }
  return ok({
    format: 'reckless-drivin-lua-project',
    version: LUA_PROJECT_VERSION,
    scriptFormatVersion: value['scriptFormatVersion'],
    resource: {
      objectTypeIds,
      soundIds,
      sourceName,
    },
    editor: { selectedLevelResourceId },
    scripts,
    scriptBindings: bindings,
    levelScriptBindings: levelBindings,
  });
}

export function exportLuaProject(input: LuaProjectInput): Uint8Array {
  const files: Record<string, Uint8Array> = {
    'README.md': strToU8(
      '# Reckless Drivin Lua project\n\n' +
        'Open this folder in VS Code with Lua Language Server enabled. The generated `.luarc.json` loads the game API definitions.\n' +
        'Edit the Lua files under `scripts/`, then import this ZIP back into the web editor. Filenames use stable script IDs.\n\n' +
        '`project.json` preserves script names, IDs, resource references, and object/level bindings. `.reckless-api/reckless.d.lua` is generated from the game API contract; do not edit that file by hand.\n',
    ),
    '.luarc.json': jsonBytes({
      runtime: { version: 'Lua 5.5', path: [] },
      workspace: { library: ['./.reckless-api'], checkThirdParty: false },
      diagnostics: { globals: ['onSpawn', 'onTick', 'onCollision', 'onDamage', 'onDeath', 'onDespawn', 'onScriptChanged', 'onSpawnedChild', 'onSpawnedBy', 'onSchedule', 'onTimer', 'onPlayerNear', 'onPlayerFar', 'onAnimationEnd', 'onOffscreen', 'onPickup', 'onLevelStart', 'onLevelTick', 'onLevelComplete', 'onPlayerRespawn', 'onAddOnAward'] },
      completion: { callSnippet: 'Replace' },
      hint: { enable: true },
    }),
    '.vscode/extensions.json': jsonBytes({ recommendations: ['sumneko.lua'] }),
    '.vscode/settings.json': jsonBytes({
      'files.encoding': 'utf8',
      'files.trimTrailingWhitespace': true,
      'editor.formatOnSave': false,
      'Lua.runtime.version': 'Lua 5.5',
    }),
    '.reckless-api/reckless.d.lua': strToU8(LUA_LUA_LS_CONTRACT),
  };
  const manifest: LuaProjectManifest = {
    format: 'reckless-drivin-lua-project',
    version: LUA_PROJECT_VERSION,
    scriptFormatVersion: SCRIPT_FORMAT_VERSION,
    resource: {
      objectTypeIds: [...(input.objectTypeIds ?? [])].sort((a, b) => a - b),
      soundIds: [...(input.soundIds ?? [])].sort((a, b) => a - b),
      sourceName: input.resourceSourceName ?? 'unknown resources.dat',
    },
    editor: { selectedLevelResourceId: input.selectedLevelResourceId ?? null },
    scripts: [...input.scripts].sort((a, b) => a.id - b.id).map((script) => ({ id: script.id, name: script.name, file: `scripts/${script.id}.lua` })),
    scriptBindings: [...input.scriptBindings].sort((a, b) => a.objectTypeId - b.objectTypeId),
    levelScriptBindings: [...input.levelScriptBindings].sort((a, b) => a.levelResourceId - b.levelResourceId),
  };
  files['project.json'] = jsonBytes(manifest);
  for (const entry of manifest.scripts) {
    const script = input.scripts.find((candidate) => candidate.id === entry.id);
    if (script) files[entry.file] = strToU8(script.source);
  }
  return zipSync(files, { level: 6 });
}

export function importLuaProject(bytes: Uint8Array, options: { readonly allowInvalidLua?: boolean } = {}): Result<LuaProjectData, string> {
  if (bytes.byteLength > MAX_ARCHIVE_BYTES) return err('Lua project ZIP exceeds the 16 MiB import limit.');
  let files: Record<string, Uint8Array>;
  const archiveNames = new Set<string>();
  let expandedBytes = 0;
  let archiveError: string | null = null;
  try {
    files = unzipSync(bytes, {
      filter: (entry) => {
        if (archiveNames.has(entry.name)) {
          archiveError = `Lua project contains duplicate archive entry ${entry.name}.`;
          return false;
        }
        archiveNames.add(entry.name);
        const pathSegments = entry.name.split('/');
        if (entry.name.endsWith('/')) pathSegments.pop();
        if (entry.name.length === 0 || entry.name.startsWith('/') || entry.name.includes('\\') ||
          /[\u0000-\u001f\u007f]/.test(entry.name) ||
          pathSegments.some((segment) => segment.length === 0 || segment.includes(':') || segment === '..' || segment === '.' || segment === '__proto__' || segment === 'constructor' || segment === 'prototype')) {
          archiveError = 'Lua project contains an unsafe archive path.';
          return false;
        }
        if (archiveNames.size > MAX_ARCHIVE_FILES || entry.originalSize > MAX_ARCHIVE_FILE_BYTES) {
          archiveError = 'Lua project exceeds the file count or per-file size limit.';
          return false;
        }
        expandedBytes += entry.originalSize;
        if (expandedBytes > MAX_ARCHIVE_EXPANDED_BYTES) {
          archiveError = 'Lua project expands beyond the 20 MiB import limit.';
          return false;
        }
        return true;
      },
    });
  } catch {
    return err(archiveError ?? 'The selected file is not a valid Lua project ZIP.');
  }
  if (archiveError) return err(archiveError);
  const manifestBytes = files['project.json'];
  if (!manifestBytes) return err('Lua project is missing project.json.');
  const parsedManifest = parseJson(manifestBytes, 'project.json').match(
    (value) => ({ ok: true as const, value }),
    (error) => ({ ok: false as const, error }),
  );
  if (!parsedManifest.ok) return err(parsedManifest.error);
  const manifestResult = validateManifest(parsedManifest.value).match(
    (value) => ({ ok: true as const, value }),
    (error) => ({ ok: false as const, error }),
  );
  if (!manifestResult.ok) return err(manifestResult.error);
  const manifest = manifestResult.value;
  const listedScriptFiles = new Set(manifest.scripts.map((script) => script.file));
  const unlistedLuaFile = Object.keys(files).find((filename) =>
    filename.startsWith('scripts/') && filename.endsWith('.lua') && !listedScriptFiles.has(filename),
  );
  if (unlistedLuaFile) return err(`Lua project contains an unlisted script file: ${unlistedLuaFile}.`);
  const scripts: ScriptDefinition[] = [];
  for (const entry of manifest.scripts) {
    const sourceBytes = files[entry.file];
    if (!sourceBytes) return err(`Lua project is missing ${entry.file}.`);
    try {
      scripts.push({ id: entry.id, version: manifest.scriptFormatVersion, name: entry.name, source: new TextDecoder('utf-8', { fatal: true }).decode(sourceBytes) });
    } catch {
      return err(`Lua project file ${entry.file} is not valid UTF-8.`);
    }
  }
  const issues = validateScripts(scripts, manifest.scriptBindings, {
    availableObjectTypeIds: [],
    availableSoundIds: [],
  });
  const scriptIds = new Set(scripts.map((script) => script.id));
  if (manifest.scriptBindings.some((binding) => !scriptIds.has(binding.scriptId))) {
    return err('Project contains an object binding for a missing script.');
  }
  if (manifest.levelScriptBindings.some((binding) => !scriptIds.has(binding.scriptId))) {
    return err('Project contains a level binding for a missing script.');
  }
  const firstError = issues.find((issue) => issue.severity === 'error');
  if (firstError && !options.allowInvalidLua) return err(`Project contains invalid Lua: ${firstError.message}`);
  return ok({
    version: LUA_PROJECT_VERSION,
    scripts,
    scriptBindings: manifest.scriptBindings,
    levelScriptBindings: manifest.levelScriptBindings,
    objectTypeIds: manifest.resource.objectTypeIds,
    soundIds: manifest.resource.soundIds,
    selectedLevelResourceId: manifest.editor.selectedLevelResourceId,
    resourceSourceName: manifest.resource.sourceName,
  });
}
