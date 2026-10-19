import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import type { ScriptDefinition, ScriptValidationIssue } from '../../../level-editor.service';

@Component({
  selector: 'app-editor-object-type-script-diagnostics',
  templateUrl: './editor-object-type-script-diagnostics.component.html',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditorObjectTypeScriptDiagnosticsComponent {
  @Input() script: ScriptDefinition | null = null;
  @Input() hooks: string[] = [];
  @Input() issues: ScriptValidationIssue[] = [];
}
