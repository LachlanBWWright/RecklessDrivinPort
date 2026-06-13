import { Component, ChangeDetectionStrategy, EventEmitter, Input, Output } from '@angular/core';
import type {
  ObjectGroupDefinition,
  ObjectTypeDefinition,
  ParsedLevel,
  LevelScriptBinding,
  ObjectGroupRef,
  RoadInfoData,
  RoadInfoOption,
  ScriptDefinition,
} from '../../../level-editor.service';
import type { LuaScriptEditorDialogResult } from '../../lua-script-editor-dialog.component';

interface SpriteFrameInfo {
  id: number;
  bitDepth: 8 | 16;
  width: number;
  height: number;
}

interface AudioEntryInfo {
  id: number;
  sizeBytes: number;
  durationMs?: number;
}

@Component({
  selector: 'app-editor-properties-section',
  templateUrl: './editor-properties-section.component.html',
  host: {
    class: 'flex min-h-0 flex-1 flex-col w-full',
  },
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditorPropertiesSectionComponent {
  @Input() selectedLevel: ParsedLevel | null = null;
  @Input() levelNum = 0;
  @Input() editRoadInfo = 0;
  @Input() roadInfoOptions: RoadInfoOption[] = [];
  @Input() roadInfoData: RoadInfoData | null = null;
  @Input() editObjectGroups: ObjectGroupRef[] = [];
  @Input() objectGroupDefinitions: ObjectGroupDefinition[] = [];
  @Input() getSpriteUrl: (typeRes: number) => string | null = () => null;
  @Input() propertiesDirty = false;
  @Input() workerBusy = false;
  @Input() scripts: ScriptDefinition[] | undefined = [];
  @Input() levelScriptBindings: LevelScriptBinding[] | undefined = [];
  @Input() objectTypes: ObjectTypeDefinition[] = [];
  @Input() spriteFrames: SpriteFrameInfo[] = [];
  @Input() audioEntries: AudioEntryInfo[] = [];

  @Output() roadInfoChange = new EventEmitter<number>();
  @Output() roadInfoInput = new EventEmitter<{
    field: Exclude<keyof RoadInfoData, 'id'>;
    value: number | boolean;
  }>();
  @Output() objGroupInput = new EventEmitter<{
    index: number;
    field: 'resID' | 'numObjs';
    value: number;
  }>();
  @Output() levelScriptBindingChange = new EventEmitter<{
    levelResourceId: number;
    scriptId: number | null;
  }>();
  @Output() createLevelScript = new EventEmitter<number>();
  @Output() scriptSave = new EventEmitter<LuaScriptEditorDialogResult>();
}
