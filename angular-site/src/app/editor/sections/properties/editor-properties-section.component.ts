import { Component, ChangeDetectionStrategy, EventEmitter, Input, Output } from '@angular/core';
import type {
  ObjectGroupDefinition,
  ParsedLevel,
  ObjectGroupRef,
  RoadInfoData,
  RoadInfoOption,
} from '../../../level-editor.service';

@Component({
  selector: 'app-editor-properties-section',
  templateUrl: './editor-properties-section.component.html',
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

  @Output() roadInfoChange = new EventEmitter<number>();
  @Output() roadInfoInput = new EventEmitter<{ field: Exclude<keyof RoadInfoData, 'id'>; event: Event }>();
  @Output() objGroupInput = new EventEmitter<{ index: number; field: 'resID' | 'numObjs'; event: Event }>();
}
