import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import type { LevelScriptBinding, ScriptDefinition } from '../level-editor.service';

@Component({
  selector: 'app-level-scripting-panel',
  templateUrl: './level-scripting-panel.component.html',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LevelScriptingPanelComponent {
  @Input() levelNum = 0;
  @Input() resourceId: number | null = null;
  @Input() scripts: ScriptDefinition[] = [];
  @Input() binding: LevelScriptBinding | undefined;
  @Input() workerBusy = false;
  @Output() bindingChange = new EventEmitter<number | null>();
  @Output() createScript = new EventEmitter<void>();
  @Output() openScript = new EventEmitter<void>();

  get scriptName(): string {
    const script = this.scripts.find((item) => item.id === this.binding?.scriptId);
    return script ? '#' + script.id + ' · ' + script.name : 'None';
  }
}
