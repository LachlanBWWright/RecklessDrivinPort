import type { ScriptBinding, ScriptDefinition, ScriptValidationIssue, LevelScriptBinding } from './level-editor.types';
import { analyzeLua, luaHostIssues, type LuaAnalysis } from './lua-language';
import { validateScripts } from './script-format';

export interface LuaAnalysisRequest {
  readonly revision: number;
  readonly scripts: readonly ScriptDefinition[];
  readonly removedIds: readonly number[];
  readonly bindings: readonly ScriptBinding[];
  readonly levelBindings: readonly LevelScriptBinding[];
  readonly objectTypeIds: readonly number[];
  readonly soundIds: readonly number[];
}
export interface LuaAnalysisResponse {
  readonly revision: number;
  readonly issues: readonly ScriptValidationIssue[];
  readonly analyses: readonly { readonly id: number; readonly analysis: LuaAnalysis }[];
}

/** Stateful worker engine: parse/validate only changed files or changed resource context. */
export class LuaAnalysisEngine {
  private readonly scripts = new Map<number, ScriptDefinition>();
  private readonly results = new Map<number, { source: string; name: string; analysis: LuaAnalysis; issues: ScriptValidationIssue[] }>();
  private contextKey = '';
  run(request: LuaAnalysisRequest): LuaAnalysisResponse {
    for (const id of request.removedIds) { this.scripts.delete(id); this.results.delete(id); }
    for (const script of request.scripts) this.scripts.set(script.id, script);
    const contextKey = JSON.stringify([request.objectTypeIds, request.soundIds]);
    if (contextKey !== this.contextKey) { this.results.clear(); this.contextKey = contextKey; }
    const issues: ScriptValidationIssue[] = [];
    for (const script of this.scripts.values()) {
      const previous = this.results.get(script.id);
      if (!previous || previous.source !== script.source || previous.name !== script.name) {
        this.results.set(script.id, { source: script.source, name: script.name, analysis: analyzeLua(script.source),
          issues: [...validateScripts([script], [], { availableObjectTypeIds: request.objectTypeIds, availableSoundIds: request.soundIds }),
            ...luaHostIssues(script.source).map((issue): ScriptValidationIssue => ({ ...issue, severity: 'warning', scriptId: script.id, hook: null }))] });
      }
      issues.push(...(this.results.get(script.id)?.issues ?? []));
    }
    for (const binding of request.bindings) {
      if (!this.scripts.has(binding.scriptId)) issues.push({ severity: 'error', scriptId: binding.scriptId, hook: null, line: null,
        message: `Binding for object type ${binding.objectTypeId} references missing script ${binding.scriptId}.` });
      if (!request.objectTypeIds.includes(binding.objectTypeId)) issues.push({ severity: 'warning', scriptId: binding.scriptId, hook: null, line: null,
        message: `Binding references missing object type ${binding.objectTypeId}.` });
    }
    for (const binding of request.levelBindings) if (!this.scripts.has(binding.scriptId)) issues.push({ severity: 'error', scriptId: binding.scriptId, hook: null, line: null,
      message: `Level ${binding.levelResourceId} references missing script ${binding.scriptId}.` });
    return { revision: request.revision, issues, analyses: [...this.results].map(([id, result]) => ({ id, analysis: result.analysis })) };
  }
}
