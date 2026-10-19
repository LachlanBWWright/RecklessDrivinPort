import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import type { ScriptDefinition } from '../level-editor.service';

@Component({
  selector: 'app-properties-script-select',
  templateUrl: './properties-script-select.component.html',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PropertiesScriptSelectComponent {
  @Input() scripts: ScriptDefinition[] = [];
  @Input() value: number | null = null;
  @Input() disabled = false;
  @Input() label = '';
  @Output() valueChange = new EventEmitter<number | null>();
}
