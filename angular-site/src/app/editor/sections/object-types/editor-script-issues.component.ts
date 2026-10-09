import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import type { ScriptValidationIssue } from '../../../level-editor.service';
@Component({
  selector: 'app-editor-script-issues',
  templateUrl: './editor-script-issues.component.html',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditorScriptIssuesComponent {
  @Input() issues: ScriptValidationIssue[] = [];
}
