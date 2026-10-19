import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import type { ScriptDefinition } from '../level-editor.service';

@Component({
  selector: 'app-properties-level-script-field',
  template: `<mat-form-field appearance="outline" class="w-full min-w-0"
    ><mat-label>Global level script</mat-label
    ><mat-select [value]="value" [disabled]="disabled" (valueChange)="valueChange.emit($event)"
      ><mat-select-trigger>{{ label }}</mat-select-trigger
      ><mat-option [value]="null">None</mat-option>
      @for (script of scripts; track script.id) {
        <mat-option [value]="script.id">#{{ script.id }} · {{ script.name }}</mat-option>
      }
    </mat-select></mat-form-field>`,
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PropertiesLevelScriptFieldComponent {
  @Input() value: number | null = null;
  @Input() scripts: ScriptDefinition[] = [];
  @Input() disabled = false;
  @Input() label = '';
  @Output() valueChange = new EventEmitter<number | null>();
}
