import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  inject,
  OnDestroy,
  ViewChild,
} from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { LuaScriptApiPanelComponent } from './lua-script-api-panel.component';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { acceptCompletion, autocompletion, snippet, snippetCompletion, closeBrackets, closeBracketsKeymap, type Completion, type CompletionContext } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap, indentWithTab, toggleComment } from '@codemirror/commands';
import { bracketMatching, defaultHighlightStyle, syntaxHighlighting, indentUnit, StreamLanguage } from '@codemirror/language';
import { forceLinting, lintGutter, linter, type Diagnostic } from '@codemirror/lint';
import { highlightSelectionMatches, search, searchKeymap } from '@codemirror/search';
import { EditorState, type Extension } from '@codemirror/state';
import { EditorView, highlightActiveLine, highlightActiveLineGutter, hoverTooltip, keymap, lineNumbers } from '@codemirror/view';
import { lua } from '@codemirror/legacy-modes/mode/lua';
import { Subscription } from 'rxjs';
import type {
  ObjectTypeDefinition,
  ScriptDefinition,
  ScriptValidationIssue,
} from '../level-editor.service';
import { LUA_API_GROUPS, type LuaApiCompletion } from '../lua-script-api';
import { completeLuaScript, type LuaResourceOption } from '../lua-script-completions';
import { SCRIPT_FORMAT_VERSION } from '../script-format';
import type { ScriptBinding, LevelScriptBinding } from '../level-editor.types';
import { analyzeLua, isLuaCodeAt, visibleLuaSymbols, luaSymbolCompletion, luaSignatureAt, type LuaAnalysis, type LuaSignature } from '../lua-language';
import { LuaAnalysisEngine, type LuaAnalysisRequest, type LuaAnalysisResponse } from '../lua-analysis';
import { luaDraftBaseline, loadLuaDraft, saveLuaDraft, removeLuaDraft, type LuaDraft, type LuaDraftView } from '../lua-drafts';
import { exportLuaProject, importLuaProject, type LuaProjectInput } from '../lua-project';
import { validateLuaWorkspace, previewLuaImport, downloadLuaBytes, type LuaImportPreview } from '../lua-workspace';
import { luaRuntimeEntries, type LuaRuntimeEntry } from '../lua-runtime-log';

interface SpriteFrameInfo {
  readonly id: number;
  readonly bitDepth: 8 | 16;
  readonly width: number;
  readonly height: number;
}

interface AudioEntryInfo {
  readonly id: number;
  readonly sizeBytes: number;
  readonly durationMs?: number;
}

export interface LuaScriptEditorDialogData {
  readonly script: ScriptDefinition;
  readonly scripts?: readonly ScriptDefinition[];
  readonly scriptBindings?: readonly { readonly objectTypeId: number; readonly scriptId: number; readonly flags: number }[];
  readonly levelScriptBindings?: readonly LevelScriptBinding[];
  readonly levelResourceIds?: readonly number[];
  readonly initialProject?: LuaProjectInput;
  readonly resourceSourceName?: string;
  readonly selectedLevelResourceId?: number | null;
  readonly objectTypeId: number;
  readonly objectTypes: readonly ObjectTypeDefinition[];
  readonly spriteFrames: readonly SpriteFrameInfo[];
  readonly audioEntries: readonly AudioEntryInfo[];
  readonly issues: readonly ScriptValidationIssue[];
}

export interface LuaScriptEditorChange {
  readonly workspace?: LuaProjectInput;
  readonly testDriveLevelId?: number;
  readonly scriptId: number;
  readonly name: string;
  readonly source: string;
}

export interface LuaScriptEditorDialogResult extends LuaScriptEditorChange {
  readonly changes?: readonly LuaScriptEditorChange[];
}

function completionType(completion: LuaApiCompletion): string {
  if (completion.type === 'hook' || completion.type === 'snippet') return 'function';
  if (completion.type === 'constant') return 'constant';
  if (completion.type === 'property') return 'property';
  if (completion.type === 'variable') return 'variable';
  return 'function';
}

function toCompletion(completion: LuaApiCompletion): Completion {
  const option: Completion = {
    label: completion.label,
    type: completionType(completion),
    detail: completion.detail,
    info: completion.documentation,
    apply: completion.apply ?? completion.label,
  };
  const insertion = completion.apply;
  if ((completion.type === 'method' || completion.type === 'function') && insertion) {
    const call = insertion.match(/^([A-Za-z_][A-Za-z0-9_.]*)\(([^()]*)\)$/);
    if (call) {
      const argumentsText = call[2] ?? '';
      const fields = argumentsText.trim().length === 0 ? '' : argumentsText.split(',')
        .map((parameter) => '${' + parameter.trim() + '}').join(', ');
      return snippetCompletion(`${call[1]}(${fields})` + '${}', option);
    }
  }
  if (completion.type === 'hook' && insertion) {
    return snippetCompletion(insertion.replace('\n  \n', '\n  ${}\n'), option);
  }
  return option;
}

function lineStartOffset(source: string, line: number): number {
  if (line <= 1) return 0;
  let currentLine = 1;
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === '\n') {
      currentLine += 1;
      if (currentLine === line) return index + 1;
    }
  }
  return source.length;
}

@Component({
  selector: 'app-lua-script-editor-dialog',
  templateUrl: './lua-script-editor-dialog.component.html',
  standalone: true,
  imports: [ReactiveFormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatIconModule, LuaScriptApiPanelComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      :host {
        display: block;
        height: 100%;
      }

      .lua-editor-host {
        flex: 1 1 auto;
        height: 100%;
        min-height: 0;
        min-width: 0;
        overflow: hidden;
      }
    `,
  ],
})
export class LuaScriptEditorDialogComponent implements AfterViewInit, OnDestroy {
  @ViewChild('editorHost', { static: true }) private editorHost?: ElementRef<HTMLElement>;

  private readonly dialogRef =
    inject<MatDialogRef<LuaScriptEditorDialogComponent, LuaScriptEditorDialogResult>>(MatDialogRef);
  readonly data = inject<LuaScriptEditorDialogData>(MAT_DIALOG_DATA);
  readonly nameControl = new FormControl(this.data.script.name, { nonNullable: true });
  readonly apiGroups = LUA_API_GROUPS;
  readonly scripts: ScriptDefinition[] = this.initialScripts();
  activeScriptId = this.data.script.id;
  currentSource = this.data.script.source;
  currentIssues: readonly ScriptValidationIssue[] = this.data.issues;
  readonly runtimeEntries = luaRuntimeEntries;
  readonly changeDetector = inject(ChangeDetectorRef);
  bindings: ScriptBinding[] = (this.data.scriptBindings ?? []).map((binding) => ({ ...binding }));
  levelBindings: LevelScriptBinding[] = (this.data.levelScriptBindings ?? []).map((binding) => ({ ...binding }));
  allIssues: readonly ScriptValidationIssue[] = this.data.issues;
  signature: LuaSignature | null = null;
  panel: 'api' | 'problems' | 'outline' | 'search' | 'bindings' | 'console' = 'api';
  panelVisible = true;
  searchQuery = '';
  status = '';
  draftStatus = '';
  availableDraft: LuaDraft | null = null;
  importPreview: LuaImportPreview | null = null;
  pendingImport: LuaProjectInput | null = null;
  pendingDelete = false;
  testLevelId = this.data.selectedLevelResourceId ?? this.data.levelResourceIds?.[0] ?? null;
  analysisPending = false;
  private worker: Worker | null = null;
  private readonly fallbackEngine = new LuaAnalysisEngine();
  private readonly sentScripts = new Map<number, string>();
  private readonly analyses = new Map<number, LuaAnalysis>();
  private revision = 0;
  private draftTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly subscriptions = new Subscription();
  private readonly scrollPositions = new Map<number, { top: number; left: number }>();
  private readonly baseline = luaDraftBaseline(this.projectSnapshot());
  private draftQueue: Promise<void> = Promise.resolve();
  private destroyed = false;
  private readonly unloadHandler = (event: BeforeUnloadEvent): void => { if (this.isDirty) { event.preventDefault(); event.returnValue = ''; } };
  private editorView: EditorView | null = null;
  private readonly editorStates = new Map<number, EditorState>();
  private dirty = false;
  private validationTimer: ReturnType<typeof setTimeout> | null = null;

  ngAfterViewInit(): void {
    const host = this.editorHost?.nativeElement;
    if (!host) return;
    this.editorView = new EditorView({ parent: host, state: EditorState.create({ doc: this.currentSource, extensions: this.editorExtensions() }) });
    this.editorStates.set(this.activeScriptId, this.editorView.state);
    this.subscriptions.add(this.nameControl.valueChanges.subscribe(() => {
      this.syncActiveScript(false);
      this.scheduleDraft();
      this.changeDetector.markForCheck();
    }));
    try {
      if (typeof Worker !== 'undefined') {
        this.worker = new Worker(new URL('../lua-analysis.worker', import.meta.url), { type: 'module' });
        this.worker.onmessage = (event: MessageEvent<LuaAnalysisResponse>) => this.acceptAnalysis(event.data);
        this.worker.onerror = () => {
          this.worker?.terminate(); this.worker = null; this.sentScripts.clear(); this.requestAnalysis();
        };
      }
    } catch { this.worker = null; }
    window.addEventListener('beforeunload', this.unloadHandler);
    this.requestAnalysis();
    if (this.data.initialProject) this.stageImport(this.data.initialProject);
    void loadLuaDraft(this.baseline).then((result) => {
      if (this.destroyed) return;
      result.match((draft) => { this.availableDraft = draft; }, (error) => { this.draftStatus = error; });
      this.changeDetector.markForCheck();
    });
    this.editorView.focus();
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    if (this.validationTimer !== null) clearTimeout(this.validationTimer);
    if (this.draftTimer !== null) { clearTimeout(this.draftTimer); void this.persistDraft(); }
    this.subscriptions.unsubscribe();
    this.worker?.terminate();
    window.removeEventListener('beforeunload', this.unloadHandler);
    this.editorView?.destroy();
  }

  get hasIssues(): boolean {
    return this.allIssues.length > 0;
  }

  get validationLabel(): string {
    const errorCount = this.allIssues.filter((issue) => issue.severity === 'error').length;
    if (errorCount > 0) return `${errorCount} project error${errorCount === 1 ? '' : 's'}`;
    if (this.allIssues.length > 0) return `${this.allIssues.length} project warning${this.allIssues.length === 1 ? '' : 's'}`;
    return 'OK';
  }

  get canSave(): boolean {
    return ![...this.allIssues, ...this.currentIssues].some((issue) => issue.severity === 'error');
  }

  get isDirty(): boolean {
    return this.dirty || luaDraftBaseline(this.projectSnapshot()) !== this.baseline || this.scripts.some((script) => this.scriptHasChanges(script));
  }

  save(testDrive = false): void {
    this.syncActiveScript(false);
    // Apply always checks the latest text, independent of the debounced worker.
    this.allIssues = validateLuaWorkspace(this.projectSnapshot());
    this.currentIssues = this.allIssues.filter((issue) => issue.scriptId === this.activeScriptId);
    if (!this.canSave) { this.panel = 'problems'; this.panelVisible = true; this.status = 'Fix errors before applying. Your draft can still be saved.'; return; }
    const result = { ...this.result(), workspace: this.projectSnapshot(), ...(testDrive && this.testLevelId !== null ? { testDriveLevelId: this.testLevelId } : {}) };
    this.dirty = false;
    if (this.draftTimer !== null) { clearTimeout(this.draftTimer); this.draftTimer = null; }
    // Queue deletion after outstanding writes so an applied draft cannot reappear.
    this.draftQueue = this.draftQueue.then(async () => { await removeLuaDraft(this.baseline); });
    this.dialogRef.close(result);
  }

  async saveDraftAndClose(): Promise<void> {
    this.syncActiveScript(false);
    if (await this.persistDraft()) { this.dirty = false; this.dialogRef.close(); }
  }

  cancel(): void {
    const discardDraft = this.isDirty;
    if (discardDraft && !window.confirm('Discard unapplied Lua changes and the saved draft?')) return;
    if (this.draftTimer !== null) { clearTimeout(this.draftTimer); this.draftTimer = null; }
    this.dirty = false;
    if (discardDraft) this.draftQueue = this.draftQueue.then(async () => { await removeLuaDraft(this.baseline); });
    this.dialogRef.close();
  }

  useSnippet(source: string | undefined): void {
    if (!source || !this.editorView || this.scripts.length === 0) return;
    const api = this.apiGroups.flatMap((group) => group.completions).find((completion) => completion.apply === source);
    const selection = this.editorView.state.selection.main;
    const text = this.editorView.state.doc.toString();
    if (api) {
      const context = completeLuaScript({ source: text, position: selection.from, objectTypes: [], sounds: [], spriteFrames: [] });
      const contextualOption = context?.options.find((completion) => completion.label === api.label);
      const completion = toCompletion(contextualOption ?? api);
      const desiredType = this.apiGroups.find((group) => group.completions.includes(api))?.id === 'ctx' ? 'context' : 'object';
      const receiver = visibleLuaSymbols(text, selection.from).find((symbol) => symbol.type === desiredType);
      if (api.type === 'method' && !contextualOption && !receiver) {
        this.status = 'Insert this method inside a hook that provides its object or context parameter.'; return;
      }
      const prefix = api.type === 'method' && !contextualOption ? `${receiver?.name}:` : '';
      let from = contextualOption ? context?.from ?? selection.from : selection.from;
      const insertion = completion.apply;
      if (prefix) {
        this.editorView.dispatch({ changes: { from, to: selection.to, insert: prefix }, selection: { anchor: from + prefix.length } });
        from += prefix.length;
      }
      if (typeof insertion === 'function') insertion(this.editorView, completion, from, prefix ? from : selection.to);
      else snippet(insertion ?? completion.label)(this.editorView, completion, from, prefix ? from : selection.to);
    } else snippet(source)(this.editorView, null, selection.from, selection.to);
    this.editorView.focus();
  }

  selectScript(scriptId: number): void {
    if (scriptId === this.activeScriptId || !this.editorView) return;
    this.syncActiveScript(false);
    this.editorStates.set(this.activeScriptId, this.editorView.state);
    this.scrollPositions.set(this.activeScriptId, { top: this.editorView.scrollDOM.scrollTop, left: this.editorView.scrollDOM.scrollLeft });
    const script = this.scripts.find((candidate) => candidate.id === scriptId);
    if (!script) return;
    this.activeScriptId = scriptId;
    this.currentSource = script.source;
    this.nameControl.setValue(script.name, { emitEvent: false });
    const state = this.editorStates.get(scriptId) ?? EditorState.create({ doc: script.source, extensions: this.editorExtensions() });
    this.editorStates.set(scriptId, state);
    this.editorView.setState(state);
    const scroll = this.scrollPositions.get(scriptId);
    this.editorView.scrollDOM.scrollTop = scroll?.top ?? 0;
    this.editorView.scrollDOM.scrollLeft = scroll?.left ?? 0;
    this.signature = luaSignatureAt(script.source, state.selection.main.head);
    this.currentIssues = this.allIssues.filter((issue) => issue.scriptId === scriptId);
    this.requestAnalysis();
    this.editorView.focus();
  }

  scriptHasChanges(script: ScriptDefinition): boolean {
    const original = this.initialScript(script.id);
    return original === null || (original.name !== script.name || original.source !== script.source ||
      (script.id === this.activeScriptId && this.nameControl.value !== original.name));
  }

  scriptHasIssues(script: ScriptDefinition): boolean {
    return this.allIssues.some((issue) => issue.scriptId === script.id && issue.severity === 'error');
  }

  scriptTabName(script: ScriptDefinition): string {
    return script.id === this.activeScriptId ? this.nameControl.value || `Script ${script.id}` : script.name || `Script ${script.id}`;
  }

  private result(): LuaScriptEditorDialogResult {
    const active = this.activeScript();
    return {
      scriptId: active.id,
      name: this.nameControl.value,
      source: this.editorView?.state.doc.toString() ?? this.currentSource,
    };
  }

  private initialScripts(): ScriptDefinition[] {
    const scripts = (this.data.scripts ?? []).map((script) => ({ ...script }));
    const selectedIndex = scripts.findIndex((script) => script.id === this.data.script.id);
    if (selectedIndex < 0) scripts.push({ ...this.data.script });
    else scripts[selectedIndex] = { ...this.data.script };
    return scripts.sort((a, b) => a.id - b.id);
  }

  private initialScript(scriptId: number): ScriptDefinition | null {
    return (this.data.scripts?.length ? this.data.scripts : [this.data.script])
      .find((script) => script.id === scriptId) ?? null;
  }

  private activeScript(): ScriptDefinition {
    return this.scripts.find((script) => script.id === this.activeScriptId) ?? this.data.script;
  }

  private syncActiveScript(validate = true): void {
    const index = this.scripts.findIndex((script) => script.id === this.activeScriptId);
    if (index < 0) return;
    const current = this.scripts[index];
    if (!current) return;
    const editorSource = this.editorView?.state.doc.toString() ?? this.currentSource;
    // Preserve original line endings when a document has not actually changed.
    const source = editorSource === current.source.replace(/\r\n?|\n/g, '\n') ? current.source : editorSource;
    this.scripts[index] = { ...current, name: this.nameControl.value, source };
    this.currentSource = this.scripts[index]?.source ?? this.currentSource;
    if (validate) this.requestAnalysis();
    else this.scheduleValidation();
  }

  private scheduleValidation(): void {
    if (this.validationTimer !== null) clearTimeout(this.validationTimer);
    this.revision += 1;
    this.analysisPending = true;
    this.validationTimer = setTimeout(() => {
      this.validationTimer = null;
      this.requestAnalysis();
    }, 180);
  }

  private requestAnalysis(): void {
    if (this.validationTimer !== null) { clearTimeout(this.validationTimer); this.validationTimer = null; }
    const removedIds = [...this.sentScripts.keys()].filter((id) => !this.scripts.some((script) => script.id === id));
    for (const id of removedIds) this.sentScripts.delete(id);
    const changed = this.scripts.filter((script) => this.sentScripts.get(script.id) !== JSON.stringify([script.name, script.source]));
    for (const script of changed) this.sentScripts.set(script.id, JSON.stringify([script.name, script.source]));
    const request: LuaAnalysisRequest = { revision: ++this.revision, scripts: changed, removedIds,
      bindings: this.bindings, levelBindings: this.levelBindings, objectTypeIds: this.data.objectTypes.map((type) => type.typeRes), soundIds: this.data.audioEntries.map((sound) => sound.id) };
    this.analysisPending = true;
    if (this.worker) this.worker.postMessage(request);
    else this.acceptAnalysis(this.fallbackEngine.run(request));
  }

  private acceptAnalysis(response: LuaAnalysisResponse): void {
    if (this.destroyed || response.revision !== this.revision) return;
    this.analysisPending = false;
    this.allIssues = response.issues;
    this.currentIssues = response.issues.filter((issue) => issue.scriptId === this.activeScriptId);
    this.analyses.clear();
    for (const item of response.analyses) this.analyses.set(item.id, item.analysis);
    if (this.editorView) forceLinting(this.editorView);
    this.changeDetector.markForCheck();
  }

  private editorExtensions(): Extension[] {
    return [
      EditorState.readOnly.of(this.scripts.length === 0),
      lineNumbers(),
      highlightActiveLine(),
      highlightActiveLineGutter(),
      history(),
      StreamLanguage.define(lua),
      syntaxHighlighting(defaultHighlightStyle),
      EditorView.contentAttributes.of({ 'aria-label': 'Lua source code' }),
      indentUnit.of('  '),
      bracketMatching(),
      closeBrackets(),
      lintGutter(),
      EditorView.lineWrapping,
      search(),
      highlightSelectionMatches(),
      EditorView.theme({
        '&': {
          height: '100%',
          border: '1px solid rgba(255, 255, 255, 0.14)',
          borderRadius: '8px',
          backgroundColor: 'var(--surface)',
          color: 'var(--text)',
        },
        '.cm-content': {
          caretColor: 'var(--accent)',
        },
        '&.cm-focused .cm-cursor': {
          borderLeftColor: 'var(--accent)',
        },
        '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
          backgroundColor: 'rgba(66, 165, 245, 0.32)',
        },
        '.cm-gutters': {
          backgroundColor: 'var(--surface2)',
          borderRightColor: 'rgba(255, 255, 255, 0.12)',
          color: 'var(--muted)',
        },
        '.cm-activeLine, .cm-activeLineGutter': {
          backgroundColor: 'rgba(255, 255, 255, 0.06)',
        },
        '.cm-scroller': {
          fontFamily:
            "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace",
          fontSize: '0.86rem',
          lineHeight: '1.55',
        },
        '.cm-tooltip': {
          backgroundColor: 'var(--surface2)',
          borderColor: 'rgba(255, 255, 255, 0.16)',
          color: 'var(--text)',
        },
        '.cm-tooltip-autocomplete ul li[aria-selected]': {
          backgroundColor: 'var(--accent)',
          color: 'white',
        },
        '.cm-completionLabel, .cm-completionDetail, .cm-completionInfo': {
          color: 'var(--text)',
        },
        '.cm-completionMatchedText': {
          color: 'var(--accent)',
          textDecoration: 'none',
        },
        '.cm-lua-api-hover': {
          display: 'grid',
          gap: '0.35rem',
          maxWidth: 'min(520px, 70vw)',
          padding: '0.65rem 0.8rem',
          whiteSpace: 'normal',
        },
        '.cm-diagnostic': {
          color: 'var(--text)',
        },
      }),
      keymap.of([
        {
          key: 'Mod-s',
          run: () => {
            this.save();
            return true;
          },
        },
        { key: 'F12', run: () => this.goToDefinition() },
        { key: 'Mod-/', run: toggleComment },
        { key: 'Mod-Shift-s', run: () => { void this.persistDraft(); return true; } },
        { key: 'Mod-Shift-f', run: () => { this.panel = 'search'; this.panelVisible = true; this.changeDetector.markForCheck(); return true; } },
        { key: 'Alt-ArrowRight', run: () => this.cycleScript(1) },
        { key: 'Alt-ArrowLeft', run: () => this.cycleScript(-1) },
        ...closeBracketsKeymap,
        { key: 'Tab', run: acceptCompletion },
        indentWithTab,
        ...defaultKeymap,
        ...historyKeymap,
        ...searchKeymap,
      ]),
      autocompletion({
        override: [(context: CompletionContext) => this.completeAt(context)],
      }),
      hoverTooltip((view, position) => this.hoverAt(view, position)),
      linter((view) => this.diagnosticsFor(view.state.doc.toString())),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          this.editorStates.set(this.activeScriptId, update.state);
          this.markDirty(update.state.doc.toString());
          this.scheduleDraft();
        }
        if (update.docChanged || update.selectionSet) {
          this.signature = luaSignatureAt(update.state.doc.toString(), update.state.selection.main.head);
          this.changeDetector.markForCheck();
        }
      }),
    ];
  }

  private completeAt(context: CompletionContext): { from: number; options: Completion[] } | null {
    const result = completeLuaScript({
      source: context.state.doc.toString(),
      position: context.pos,
      objectTypes: this.objectTypeOptions(),
      sounds: this.soundOptions(),
      spriteFrames: this.spriteFrameOptions(),
    });
    if (!result) return null;
    return { from: result.from, options: result.options.map(toCompletion) };
  }

  private hoverAt(view: EditorView, position: number): { pos: number; above: true; create: () => { dom: HTMLElement } } | null {
    const line = view.state.doc.lineAt(position);
    let from = Math.max(line.from, Math.min(position, line.to));
    let to = from;
    while (from > line.from && /[A-Za-z0-9_]/.test(view.state.doc.sliceString(from - 1, from))) from -= 1;
    while (to < line.to && /[A-Za-z0-9_]/.test(view.state.doc.sliceString(to, to + 1))) to += 1;
    if (from === to) return null;
    const name = view.state.doc.sliceString(from, to);
    const source = view.state.doc.toString();
    if (!isLuaCodeAt(source, position)) return null;
    const completion = completeLuaScript({ source, position: to, objectTypes: [], sounds: [], spriteFrames: [] })?.options
      .find((item) => item.label === name || item.label.endsWith(`.${name}`))
      ?? visibleLuaSymbols(source, position).filter((symbol) => symbol.name === name).map(luaSymbolCompletion)[0];
    if (!completion) return null;
    return {
      pos: from,
      above: true,
      create: () => {
        const dom = document.createElement('div');
        dom.className = 'cm-lua-api-hover';
        const signature = document.createElement('strong');
        signature.textContent = completion.detail;
        const description = document.createElement('div');
        description.textContent = completion.documentation;
        dom.append(signature, description);
        return { dom };
      },
    };
  }

  private goToDefinition(): boolean {
    if (!this.editorView) return false;
    const source = this.editorView.state.doc.toString();
    const position = this.editorView.state.selection.main.head;
    const token = source.slice(0, position).match(/[A-Za-z_0-9]*$/)?.[0] ?? '';
    const rest = source.slice(position).match(/^[A-Za-z_0-9]*/)?.[0] ?? '';
    if (!isLuaCodeAt(source, position) || /[.:]\s*$/.test(source.slice(0, position - token.length))) return false;
    const symbol = visibleLuaSymbols(source, position).find((candidate) => candidate.name === token + rest);
    if (!symbol) return false;
    this.jumpTo(this.activeScriptId, symbol.from, 0, true);
    return true;
  }

  private markDirty(source: string): void {
    this.dirty = true;
    this.currentSource = source;
    this.syncActiveScript(false);
  }

  private diagnosticsFor(source: string): Diagnostic[] {
    return this.currentIssues.map((issue) => {
      const from = issue.line === null ? 0 : lineStartOffset(source, issue.line);
      const line = source.slice(from).split(/\r\n|\n|\r/, 1)[0] ?? '';
      const columnOffset = issue.column === null || issue.column === undefined ? 0 : issue.column - 1;
      const diagnosticFrom = Math.min(source.length, from + Math.max(0, columnOffset));
      return {
        from: diagnosticFrom,
        to: Math.min(source.length, Math.max(diagnosticFrom + 1, from + Math.max(1, line.length))),
        severity: issue.severity,
        message: issue.message,
      };
    });
  }

  projectSnapshot(): LuaProjectInput {
    return { scripts: this.scripts.map((script) => ({ ...script })), scriptBindings: this.bindings.map((binding) => ({ ...binding })),
      levelScriptBindings: this.levelBindings.map((binding) => ({ ...binding })),
      objectTypeIds: this.data.objectTypes.map((type) => type.typeRes), soundIds: this.data.audioEntries.map((sound) => sound.id),
      resourceSourceName: this.data.resourceSourceName };
  }

  private scheduleDraft(): void {
    if (this.draftTimer !== null) clearTimeout(this.draftTimer);
    this.draftStatus = 'Draft pending…';
    this.draftTimer = setTimeout(() => { this.draftTimer = null; void this.persistDraft(); }, 600);
  }

  async persistDraft(): Promise<boolean> {
    if (this.availableDraft) { this.draftStatus = 'Restore or discard the previous draft before replacing it.'; return false; }
    this.syncActiveScript(false);
    if (this.draftTimer !== null) { clearTimeout(this.draftTimer); this.draftTimer = null; }
    const project = this.projectSnapshot();
    const activeId = this.activeScriptId;
    if (this.editorView) {
      this.editorStates.set(activeId, this.editorView.state);
      this.scrollPositions.set(activeId, { top: this.editorView.scrollDOM.scrollTop, left: this.editorView.scrollDOM.scrollLeft });
    }
    const views: LuaDraftView[] = [...this.editorStates].map(([id, state]) => ({ id, anchor: state.selection.main.anchor, head: state.selection.main.head,
      top: this.scrollPositions.get(id)?.top ?? 0, left: this.scrollPositions.get(id)?.left ?? 0 }));
    let saved = false;
    this.draftQueue = this.draftQueue.then(async () => {
      const result = await saveLuaDraft(this.baseline, project, activeId, views);
      result.match(() => { saved = true; this.draftStatus = 'Draft saved locally'; }, (error) => { this.draftStatus = error; });
      if (!this.destroyed) this.changeDetector.markForCheck();
    });
    await this.draftQueue;
    return saved;
  }

  restoreDraft(): void {
    if (!this.availableDraft) return;
    const draft = this.availableDraft;
    this.replaceWorkingProject(draft.project, draft.activeScriptId);
    for (const view of draft.views) {
      const script = this.scripts.find((item) => item.id === view.id); if (!script) continue;
      const state = EditorState.create({ doc: script.source, extensions: this.editorExtensions(),
        selection: { anchor: Math.min(script.source.length, view.anchor), head: Math.min(script.source.length, view.head) } });
      this.editorStates.set(view.id, state);
      this.scrollPositions.set(view.id, { top: view.top, left: view.left });
      if (view.id === this.activeScriptId && this.editorView) {
        this.editorView.setState(state); this.editorView.scrollDOM.scrollTop = view.top; this.editorView.scrollDOM.scrollLeft = view.left;
      }
    }
    this.availableDraft = null;
    this.draftStatus = 'Recovered saved draft';
  }

  async discardStoredDraft(): Promise<void> {
    this.draftQueue = this.draftQueue.then(async () => {
      const result = await removeLuaDraft(this.baseline);
      result.match(() => { this.availableDraft = null; }, (error) => { this.draftStatus = error; });
      this.changeDetector.markForCheck();
    });
    await this.draftQueue;
  }

  createScript(duplicate = false): void {
    this.syncActiveScript(false);
    if (this.scripts.length >= 256) { this.status = 'The project already contains 256 scripts.'; return; }
    let id = 1;
    const ids = new Set(this.scripts.map((script) => script.id));
    while (ids.has(id)) id += 1;
    const original = this.activeScript();
    const source = duplicate ? original.source : this.data.objectTypeId === 0 ? 'function onLevelTick(ctx, dt)\n  \nend\n' : 'function onTick(self, ctx, dt)\n  \nend\n';
    this.scripts.push({ id, version: SCRIPT_FORMAT_VERSION, name: duplicate ? `${original.name} copy` : `Script ${id}`, source });
    this.dirty = true;
    this.selectScript(id);
    this.scheduleDraft();
  }

  get activeBindingCount(): number {
    return this.bindings.filter((binding) => binding.scriptId === this.activeScriptId).length +
      this.levelBindings.filter((binding) => binding.scriptId === this.activeScriptId).length;
  }

  deleteActiveScript(): void {
    const id = this.activeScriptId;
    const remaining = this.scripts.filter((script) => script.id !== id);
    const project = { ...this.projectSnapshot(), scripts: remaining,
      scriptBindings: this.bindings.filter((binding) => binding.scriptId !== id),
      levelScriptBindings: this.levelBindings.filter((binding) => binding.scriptId !== id) };
    this.replaceWorkingProject(project, remaining[0]?.id ?? -1);
    this.pendingDelete = false;
  }

  setBinding(kind: 'object' | 'level', resourceId: number, event: Event): void {
    const value = event.target instanceof HTMLSelectElement ? event.target.value : '';
    const scriptId = value === '' ? null : Number(value);
    if (scriptId !== null && !this.scripts.some((script) => script.id === scriptId)) return;
    if (kind === 'object') {
      const old = this.bindings.find((binding) => binding.objectTypeId === resourceId);
      this.bindings = this.bindings.filter((binding) => binding.objectTypeId !== resourceId);
      if (scriptId !== null) this.bindings.push({ objectTypeId: resourceId, scriptId, flags: old?.flags ?? 0 });
    } else {
      const old = this.levelBindings.find((binding) => binding.levelResourceId === resourceId);
      this.levelBindings = this.levelBindings.filter((binding) => binding.levelResourceId !== resourceId);
      if (scriptId !== null) this.levelBindings.push({ levelResourceId: resourceId, scriptId, flags: old?.flags ?? 0 });
    }
    this.dirty = true; this.requestAnalysis(); this.scheduleDraft();
  }

  bindingValue(kind: 'object' | 'level', id: number): string {
    const binding = kind === 'object' ? this.bindings.find((item) => item.objectTypeId === id) : this.levelBindings.find((item) => item.levelResourceId === id);
    return binding ? String(binding.scriptId) : '';
  }

  get bindingLevelIds(): readonly number[] {
    return [...new Set([0, ...(this.data.levelResourceIds ?? []), ...this.levelBindings.map((binding) => binding.levelResourceId)])].sort((a, b) => a - b);
  }

  get outline(): LuaAnalysis['outline'] {
    return (this.analyses.get(this.activeScriptId) ?? analyzeLua(this.currentSource)).outline;
  }

  get searchResults(): readonly { scriptId: number; name: string; line: number; from: number; text: string }[] {
    if (!this.searchQuery.trim()) return [];
    const query = this.searchQuery.toLowerCase();
    const results: { scriptId: number; name: string; line: number; from: number; text: string }[] = [];
    for (const script of this.scripts) {
      let offset = 0;
      const lines = script.source.split('\n');
      for (let index = 0; index < lines.length && results.length < 200; index += 1) {
        const line = lines[index] ?? '';
        let column = line.toLowerCase().indexOf(query);
        while (column >= 0 && results.length < 200) {
          results.push({ scriptId: script.id, name: script.name, line: index + 1, from: offset + column, text: line });
          column = line.toLowerCase().indexOf(query, column + Math.max(1, query.length));
        }
        offset += line.length + 1;
      }
    }
    return results;
  }

  updateSearch(event: Event): void {
    if (event.target instanceof HTMLInputElement) this.searchQuery = event.target.value;
  }

  jumpTo(scriptId: number, position: number, length = 0, editorOffset = false): void {
    if (!this.scripts.some((script) => script.id === scriptId)) { this.status = `Script #${scriptId} is not in this project.`; return; }
    this.selectScript(scriptId);
    if (!this.editorView) return;
    const original = this.scripts.find((script) => script.id === scriptId)?.source ?? '';
    const normalized = editorOffset ? position : original.slice(0, position).replace(/\r\n?|\n/g, '\n').length;
    const anchor = Math.max(0, Math.min(normalized, this.editorView.state.doc.length));
    this.editorView.dispatch({ selection: { anchor, head: Math.min(anchor + length, this.editorView.state.doc.length) },
      effects: EditorView.scrollIntoView(anchor, { y: 'center' }) });
    this.editorView.focus();
  }

  jumpToIssue(issue: ScriptValidationIssue): void {
    const source = this.scripts.find((script) => script.id === issue.scriptId)?.source ?? '';
    this.jumpTo(issue.scriptId, lineStartOffset(source, issue.line ?? 1) + Math.max(0, (issue.column ?? 1) - 1));
  }

  jumpToRuntime(entry: LuaRuntimeEntry): void {
    if (entry.scriptId === null) return;
    const source = this.scripts.find((script) => script.id === entry.scriptId)?.source ?? '';
    this.jumpTo(entry.scriptId, lineStartOffset(source, entry.line ?? 1));
    this.status = 'Runtime locations refer to the code used for the last game run.';
  }

  issueCategory(issue: ScriptValidationIssue): string {
    if (issue.message.includes('not available')) return 'Game API';
    if (/resource|missing object|missing sound|Binding|binding/.test(issue.message)) return 'Resources';
    if (/game|colon/.test(issue.message)) return 'Game API';
    return 'Lua';
  }

  selectPanel(value: string): void {
    if (value === 'api' || value === 'problems' || value === 'outline' || value === 'search' || value === 'bindings' || value === 'console') this.panel = value;
  }

  cycleScript(direction: number): boolean {
    const index = this.scripts.findIndex((script) => script.id === this.activeScriptId);
    const script = this.scripts[(index + direction + this.scripts.length) % this.scripts.length];
    if (!script) return false;
    this.selectScript(script.id); return true;
  }

  onTabKey(event: KeyboardEvent): void {
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') { event.preventDefault(); this.cycleScript(event.key === 'ArrowRight' ? 1 : -1); }
    else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault(); const script = event.key === 'Home' ? this.scripts[0] : this.scripts.at(-1); if (script) this.selectScript(script.id);
    }
    if (['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) queueMicrotask(() => document.getElementById(`lua-tab-${this.activeScriptId}`)?.focus());
  }

  setTestLevel(event: Event): void {
    if (!(event.target instanceof HTMLSelectElement)) return;
    const id = Number(event.target.value);
    if (this.data.levelResourceIds?.includes(id)) this.testLevelId = id;
  }

  stageImport(project: LuaProjectInput): void {
    this.syncActiveScript(false);
    this.pendingImport = project;
    const preview = previewLuaImport(this.projectSnapshot(), project);
    const missingLevels = project.levelScriptBindings.filter((binding) => binding.levelResourceId !== 0 &&
      this.data.levelResourceIds && !this.data.levelResourceIds.includes(binding.levelResourceId));
    this.importPreview = { ...preview, warnings: [...preview.warnings, ...missingLevels.map((binding) => `Level #${binding.levelResourceId} is absent from the loaded pack.`)] };
  }

  acceptImport(): void {
    if (!this.pendingImport) return;
    this.replaceWorkingProject(this.pendingImport, this.pendingImport.scripts[0]?.id ?? -1);
    this.pendingImport = null; this.importPreview = null;
    this.status = 'Imported into the draft. Review Problems before applying.';
  }

  dismissImport(): void { this.pendingImport = null; this.importPreview = null; }

  private replaceWorkingProject(project: LuaProjectInput, activeId: number): void {
    this.scripts.splice(0, this.scripts.length, ...project.scripts.map((script) => ({ ...script })));
    this.bindings = project.scriptBindings.map((binding) => ({ ...binding }));
    this.levelBindings = project.levelScriptBindings.map((binding) => ({ ...binding }));
    this.editorStates.clear(); this.scrollPositions.clear();
    this.activeScriptId = -1;
    this.dirty = true;
    if (this.scripts.length) this.selectScript(this.scripts.some((script) => script.id === activeId) ? activeId : this.scripts[0]?.id ?? -1);
    else {
      this.currentSource = ''; this.nameControl.setValue('', { emitEvent: false });
      this.editorView?.setState(EditorState.create({ doc: '', extensions: this.editorExtensions() }));
      this.requestAnalysis();
    }
    this.scheduleDraft();
  }

  exportProject(): void {
    this.syncActiveScript(false);
    downloadLuaBytes(exportLuaProject(this.projectSnapshot()), 'reckless-drivin-lua-project.zip', 'application/zip');
    this.status = 'Exported the draft, including any unfinished Lua.';
  }

  exportFile(): void {
    this.syncActiveScript(false);
    const script = this.scripts.find((item) => item.id === this.activeScriptId);
    if (script) downloadLuaBytes(new TextEncoder().encode(script.source), `${script.id}.lua`, 'text/plain;charset=utf-8');
  }

  async importFile(event: Event): Promise<void> {
    const input = event.target instanceof HTMLInputElement ? event.target : null;
    const file = input?.files?.[0]; if (input) input.value = '';
    if (!file) return;
    const luaFile = /\.lua$/i.test(file.name);
    if (file.size > (luaFile ? 2 : 16) * 1024 * 1024) { this.status = 'The selected file exceeds the import size limit.'; return; }
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (luaFile) {
        if (!this.scripts.length) this.createScript();
        const source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
        this.stageImport({ ...this.projectSnapshot(), scripts: this.scripts.map((script) => script.id === this.activeScriptId ? { ...script, source } : script) });
      } else importLuaProject(bytes, { allowInvalidLua: true }).match((project) => this.stageImport(project), (error) => { this.status = error; });
    } catch { this.status = 'Could not read the file as a UTF-8 Lua file or Lua project ZIP.'; }
  }

  private objectTypeOptions(): LuaResourceOption[] {
    return this.data.objectTypes.map((type) => ({
      id: type.typeRes,
      label: `Frame #${type.frame} · ${type.numFrames} frame${type.numFrames === 1 ? '' : 's'}`,
      description: `Object typeId ${type.typeRes}. Base frame ${type.frame}. Max damage ${type.maxDamage}. Flags ${type.flags}.`,
    }));
  }

  private soundOptions(): LuaResourceOption[] {
    return this.data.audioEntries.map((sound) => ({
      id: sound.id,
      label:
        sound.durationMs === undefined
          ? `${sound.sizeBytes} bytes`
          : `${(sound.durationMs / 1000).toFixed(1)}s · ${sound.sizeBytes} bytes`,
      description:
        sound.durationMs === undefined
          ? `Sound soundId ${sound.id}. Size ${sound.sizeBytes} bytes.`
          : `Sound soundId ${sound.id}. Duration ${(sound.durationMs / 1000).toFixed(1)} seconds. Size ${sound.sizeBytes} bytes.`,
    }));
  }

  private spriteFrameOptions(): LuaResourceOption[] {
    return this.data.spriteFrames.map((frame) => ({
      id: frame.id,
      label: `${frame.width}x${frame.height} · ${frame.bitDepth}-bit`,
      description: `Sprite frameId ${frame.id}. ${frame.width}x${frame.height}, ${frame.bitDepth}-bit.`,
    }));
  }

}
