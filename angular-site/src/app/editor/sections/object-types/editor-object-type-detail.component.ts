import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import type {
  ObjectTypeDefinition,
  ScriptBinding,
  ScriptDefinition,
  ScriptValidationIssue,
} from '../../../level-editor.service';
import type { EditorObjectTypesSectionComponent } from './editor-object-types-section.component';

@Component({
  selector: 'app-editor-object-type-detail',
  templateUrl: './editor-object-type-detail.component.html',
  host: {
    class: 'flex h-full min-h-0 min-w-0 flex-1 flex-col',
  },
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditorObjectTypeDetailComponent {
  @Input({ required: true }) type!: ObjectTypeDefinition;
  @Input() workerBusy = false;
  @Input() getSpriteUrl: (frameId: number) => string | null = () => null;
  @Input() getPreviewFrameId: (type: ObjectTypeDefinition) => number = (value) => value.frame;
  @Input() hasPreviewFrameControls: (type: ObjectTypeDefinition) => boolean = () => false;
  @Input() getFrameLabel: (frameId: number) => string = (id) => `#${id}`;
  @Input() typeForm!: EditorObjectTypesSectionComponent['typeForm'];
  @Input() spriteFrames: EditorObjectTypesSectionComponent['spriteFrames'] = [];
  @Input({ required: true }) fieldTooltips!: EditorObjectTypesSectionComponent['fieldTooltips'];
  @Input() objectTypes: ObjectTypeDefinition[] = [];
  @Input() audioEntries: EditorObjectTypesSectionComponent['audioEntries'] = [];
  @Input() getObjectTypeLabel: (id: number) => string = (id) => `#${id}`;
  @Input() getSoundLabel: (id: number) => string = (id) => `#${id}`;
  @Input() scripts: ScriptDefinition[] = [];
  @Input() scriptBindings: ScriptBinding[] = [];
  @Input() scriptIssues: ScriptValidationIssue[] = [];
  @Input({ required: true }) flagOptions!: EditorObjectTypesSectionComponent['flagOptions'];
  @Input({ required: true }) flagForms!: EditorObjectTypesSectionComponent['flagForms'];
  @Output() addType = new EventEmitter<void>();
  @Output() deleteType = new EventEmitter<number>();
  @Output() frameStep = new EventEmitter<number>();
  @Output() scriptBindingChange = new EventEmitter<{ typeRes: number; scriptId: number | null }>();
  @Output() createScript = new EventEmitter<number>();
  @Output() openScript = new EventEmitter<void>();
}
