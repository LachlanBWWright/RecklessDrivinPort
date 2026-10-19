import type { LuaProjectInput } from './lua-project';
import type { ScriptValidationIssue } from './level-editor.types';
import { validateScripts } from './script-format';
import { luaHostIssues } from './lua-language';

export interface LuaImportPreview {
  readonly scripts: readonly { readonly id: number; readonly name: string; readonly action: 'added' | 'changed' | 'removed' | 'unchanged' }[];
  readonly bindings: readonly string[];
  readonly warnings: readonly string[];
  readonly issues: readonly ScriptValidationIssue[];
}
export function validateLuaWorkspace(project: LuaProjectInput): ScriptValidationIssue[] {
  const issues = validateScripts([...project.scripts], [...project.scriptBindings], {
    availableObjectTypeIds: project.objectTypeIds, availableSoundIds: project.soundIds,
  });
  const ids = new Set(project.scripts.map((script) => script.id));
  for (const script of project.scripts) for (const issue of luaHostIssues(script.source)) issues.push({ ...issue, severity: 'warning', scriptId: script.id, hook: null });
  const checkBindings = (bindings: readonly { scriptId: number; flags: number }[], keys: readonly number[], label: string): void => {
    const seen = new Set<number>();
    bindings.forEach((binding, index) => {
      const key = keys[index] ?? 0;
      if (seen.has(key) || !ids.has(binding.scriptId) || !Number.isInteger(binding.flags) || binding.flags < 0 || binding.flags > 65535) {
        issues.push({ severity: 'error', scriptId: binding.scriptId, hook: null, line: null, message: `${label} ${key} has a duplicate or invalid binding.` });
      }
      seen.add(key);
    });
  };
  checkBindings(project.scriptBindings, project.scriptBindings.map((binding) => binding.objectTypeId), 'Object type');
  checkBindings(project.levelScriptBindings, project.levelScriptBindings.map((binding) => binding.levelResourceId), 'Level');
  return issues;
}

export function previewLuaImport(current: LuaProjectInput, incoming: LuaProjectInput): LuaImportPreview {
  const before = new Map(current.scripts.map((script) => [script.id, script]));
  const after = new Map(incoming.scripts.map((script) => [script.id, script]));
  const ids = [...new Set([...before.keys(), ...after.keys()])].sort((a, b) => a - b);
  const scripts: LuaImportPreview['scripts'] = ids.map((id) => {
    const oldScript = before.get(id); const newScript = after.get(id);
    const action = !oldScript ? 'added' : !newScript ? 'removed' : oldScript.name !== newScript.name || oldScript.source !== newScript.source ? 'changed' : 'unchanged';
    return { id, name: newScript?.name ?? oldScript?.name ?? '', action };
  });
  const bindings: string[] = [];
  const compare = (oldBindings: readonly { key: number; scriptId: number; flags: number }[], newBindings: readonly { key: number; scriptId: number; flags: number }[], label: string): void => {
    const oldMap = new Map(oldBindings.map((binding) => [binding.key, binding]));
    const newMap = new Map(newBindings.map((binding) => [binding.key, binding]));
    for (const key of new Set([...oldMap.keys(), ...newMap.keys()])) {
      const oldBinding = oldMap.get(key); const newBinding = newMap.get(key);
      if (oldBinding?.scriptId === newBinding?.scriptId && oldBinding?.flags === newBinding?.flags) continue;
      bindings.push(`${label} ${key}: ${oldBinding ? `script #${oldBinding.scriptId} (flags ${oldBinding.flags})` : 'unbound'} → ${newBinding ? `script #${newBinding.scriptId} (flags ${newBinding.flags})` : 'unbound'}`);
    }
  };
  compare(current.scriptBindings.map((binding) => ({ ...binding, key: binding.objectTypeId })), incoming.scriptBindings.map((binding) => ({ ...binding, key: binding.objectTypeId })), 'Object type');
  compare(current.levelScriptBindings.map((binding) => ({ ...binding, key: binding.levelResourceId })), incoming.levelScriptBindings.map((binding) => ({ ...binding, key: binding.levelResourceId })), 'Level');
  const warnings: string[] = [];
  const missingObjects = (incoming.objectTypeIds ?? []).filter((id) => !current.objectTypeIds?.includes(id));
  const missingSounds = (incoming.soundIds ?? []).filter((id) => !current.soundIds?.includes(id));
  if (missingObjects.length) warnings.push(`Object types absent from the loaded pack: ${missingObjects.join(', ')}.`);
  if (missingSounds.length) warnings.push(`Sounds absent from the loaded pack: ${missingSounds.join(', ')}.`);
  if (current.resourceSourceName && incoming.resourceSourceName && current.resourceSourceName !== incoming.resourceSourceName) warnings.push('This project was exported from a different resource source.');
  return { scripts, bindings, warnings, issues: validateLuaWorkspace({ ...incoming, objectTypeIds: current.objectTypeIds, soundIds: current.soundIds }) };
}

export function downloadLuaBytes(bytes: Uint8Array, filename: string, mimeType: string): void {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  const url = URL.createObjectURL(new Blob([buffer], { type: mimeType }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
