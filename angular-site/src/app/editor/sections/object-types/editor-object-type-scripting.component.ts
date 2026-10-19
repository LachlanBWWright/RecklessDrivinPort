import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import type { FormArray, FormControl } from '@angular/forms';
import type {
  ScriptBinding,
  ScriptDefinition,
  ScriptValidationIssue,
} from '../../../level-editor.service';
import { FLAG_OPTIONS } from './object-type-form-options';

@Component({
  selector: 'app-editor-object-type-scripting',
  templateUrl: './editor-object-type-scripting.component.html',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditorObjectTypeScriptingComponent {
  @Input() typeRes = 0;
  @Input() scripts: ScriptDefinition[] = [];
  @Input() scriptBindings: ScriptBinding[] = [];
  @Input() scriptIssues: ScriptValidationIssue[] = [];
  @Input() workerBusy = false;
  @Input() flagOptions = FLAG_OPTIONS;
  @Input() flagForms!: {
    flags: FormArray<FormControl<boolean>>;
    flags2: FormArray<FormControl<boolean>>;
  };
  @Output() scriptBindingChange = new EventEmitter<{ typeRes: number; scriptId: number | null }>();
  @Output() createScript = new EventEmitter<number>();
  @Output() openScript = new EventEmitter<number>();

  get selectedScriptBinding(): ScriptBinding | null {
    return this.scriptBindings.find((binding) => binding.objectTypeId === this.typeRes) ?? null;
  }
  get selectedScript(): ScriptDefinition | null {
    const id = this.selectedScriptBinding?.scriptId;
    return id === null || id === undefined
      ? null
      : (this.scripts.find((script) => script.id === id) ?? null);
  }
  get scriptList(): ScriptDefinition[] {
    return this.scripts;
  }
  getScriptLabel(scriptId: number): string {
    const script = this.scripts.find((item) => item.id === scriptId);
    return script ? `#${script.id} · ${script.name || 'Unnamed script'}` : `#${scriptId}`;
  }
  getSelectedScriptValidationLabel(): string {
    const issues = this.scriptIssues.filter((issue) => issue.scriptId === this.selectedScript?.id);
    if (issues.some((issue) => issue.severity === 'error')) return 'Errors';
    return issues.length > 0 ? 'Warnings' : 'OK';
  }
  getSelectedScriptHookLabels(): string[] {
    const script = this.selectedScript;
    if (!script) return [];
    const hooks = [
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
    ];
    return hooks.filter((hook) => new RegExp(`\\bfunction\\s+${hook}\\s*\\(`).test(script.source));
  }
  getIssuesForSelectedScript(): ScriptValidationIssue[] {
    return this.scriptIssues.filter((issue) => issue.scriptId === this.selectedScript?.id);
  }
}
