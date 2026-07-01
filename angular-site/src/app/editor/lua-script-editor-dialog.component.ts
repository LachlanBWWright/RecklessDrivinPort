import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  OnDestroy,
  ViewChild,
} from '@angular/core';
import { FormControl } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { autocompletion, type Completion, type CompletionContext } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { StreamLanguage } from '@codemirror/language';
import { linter, type Diagnostic } from '@codemirror/lint';
import { searchKeymap } from '@codemirror/search';
import { EditorState, type Extension } from '@codemirror/state';
import { EditorView, keymap, lineNumbers } from '@codemirror/view';
import { lua } from '@codemirror/legacy-modes/mode/lua';
import type {
  ObjectTypeDefinition,
  ScriptDefinition,
  ScriptValidationIssue,
} from '../level-editor.service';
import { LUA_API_GROUPS, type LuaApiCompletion } from '../lua-script-api';
import { completeLuaScript, type LuaResourceOption } from '../lua-script-completions';
import { validateScripts } from '../script-format';

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
  readonly objectTypeId: number;
  readonly objectTypes: readonly ObjectTypeDefinition[];
  readonly spriteFrames: readonly SpriteFrameInfo[];
  readonly audioEntries: readonly AudioEntryInfo[];
  readonly issues: readonly ScriptValidationIssue[];
}

export interface LuaScriptEditorDialogResult {
  readonly scriptId: number;
  readonly name: string;
  readonly source: string;
}

function completionType(completion: LuaApiCompletion): string {
  if (completion.type === 'hook' || completion.type === 'snippet') return 'function';
  if (completion.type === 'constant') return 'constant';
  if (completion.type === 'property') return 'property';
  return 'function';
}

function toCompletion(completion: LuaApiCompletion): Completion {
  return {
    label: completion.label,
    type: completionType(completion),
    detail: completion.detail,
    info: completion.documentation,
    apply: completion.apply ?? completion.label,
  };
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
  standalone: false,
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

  private readonly dialogRef = inject<MatDialogRef<LuaScriptEditorDialogComponent, LuaScriptEditorDialogResult>>(MatDialogRef);
  readonly data = inject<LuaScriptEditorDialogData>(MAT_DIALOG_DATA);
  readonly nameControl = new FormControl(this.data.script.name, { nonNullable: true });
  readonly apiGroups = LUA_API_GROUPS;
  readonly boundObjectTypeLabel = this.objectTypeLabel(this.data.objectTypeId);
  currentSource = this.data.script.source;
  currentIssues: readonly ScriptValidationIssue[] = this.data.issues;
  private editorView: EditorView | null = null;
  private dirty = false;

  ngAfterViewInit(): void {
    const host = this.editorHost?.nativeElement;
    if (!host) return;
    this.editorView = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: this.currentSource,
        extensions: this.editorExtensions(),
      }),
    });
    this.editorView.focus();
  }

  ngOnDestroy(): void {
    this.editorView?.destroy();
  }

  get hasIssues(): boolean {
    return this.currentIssues.length > 0;
  }

  get validationLabel(): string {
    if (this.currentIssues.some((issue) => issue.severity === 'error')) return 'Errors';
    if (this.currentIssues.length > 0) return 'Warnings';
    return 'OK';
  }

  save(): void {
    const result = this.result();
    this.dirty = false;
    this.dialogRef.close(result);
  }

  cancel(): void {
    if (this.dirty && !window.confirm('Discard unsaved Lua script changes?')) return;
    this.dialogRef.close();
  }

  useSnippet(source: string | undefined): void {
    if (!source || !this.editorView) return;
    const selection = this.editorView.state.selection.main;
    this.editorView.dispatch({
      changes: { from: selection.from, to: selection.to, insert: source },
      selection: { anchor: selection.from + source.length },
    });
    this.markDirty(this.editorView.state.doc.toString());
    this.editorView.focus();
  }

  private result(): LuaScriptEditorDialogResult {
    return {
      scriptId: this.data.script.id,
      name: this.nameControl.value,
      source: this.editorView?.state.doc.toString() ?? this.currentSource,
    };
  }

  private editorExtensions(): Extension[] {
    return [
      lineNumbers(),
      history(),
      StreamLanguage.define(lua),
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
        indentWithTab,
        ...defaultKeymap,
        ...historyKeymap,
        ...searchKeymap,
      ]),
      autocompletion({
        override: [
          (context: CompletionContext) => {
            const result = completeLuaScript({
              source: context.state.doc.toString(),
              position: context.pos,
              objectTypes: this.objectTypeOptions(),
              sounds: this.soundOptions(),
              spriteFrames: this.spriteFrameOptions(),
            });
            if (!result) return null;
            return { from: result.from, options: result.options.map(toCompletion) };
          },
        ],
      }),
      linter((view) => this.diagnosticsFor(view.state.doc.toString())),
      EditorView.updateListener.of((update) => {
        if (!update.docChanged) return;
        this.markDirty(update.state.doc.toString());
      }),
    ];
  }

  private markDirty(source: string): void {
    this.dirty = true;
    this.currentSource = source;
    this.currentIssues = validateScripts(
      [{ ...this.data.script, name: this.nameControl.value, source }],
      [],
      {
        availableObjectTypeIds: this.data.objectTypes.map((type) => type.typeRes),
        availableSoundIds: this.data.audioEntries.map((sound) => sound.id),
      },
    );
  }

  private diagnosticsFor(source: string): Diagnostic[] {
    return this.currentIssues.map((issue) => {
      const from = issue.line === null ? 0 : lineStartOffset(source, issue.line);
      const line = source.slice(from).split('\n', 1)[0] ?? '';
      return {
        from,
        to: Math.min(source.length, from + Math.max(1, line.length)),
        severity: issue.severity,
        message: issue.message,
      };
    });
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
      label: sound.durationMs === undefined
        ? `${sound.sizeBytes} bytes`
        : `${(sound.durationMs / 1000).toFixed(1)}s · ${sound.sizeBytes} bytes`,
      description: sound.durationMs === undefined
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

  private objectTypeLabel(typeRes: number): string {
    const type = this.data.objectTypes.find((item) => item.typeRes === typeRes);
    return type ? `Type #${type.typeRes} · Frame #${type.frame}` : `Type #${typeRes}`;
  }
}
