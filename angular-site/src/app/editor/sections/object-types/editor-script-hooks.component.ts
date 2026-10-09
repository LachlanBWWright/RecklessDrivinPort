import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
@Component({
  selector: 'app-editor-script-hooks',
  templateUrl: './editor-script-hooks.component.html',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditorScriptHooksComponent {
  @Input() hooks: string[] = [];
}
