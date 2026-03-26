import { Component, ChangeDetectionStrategy, EventEmitter, Input, Output } from '@angular/core';
import type { ParsedLevel, LevelProperties, ObjectGroupRef } from '../../../level-editor.service';

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
  @Input() editTime = 0;
  @Input() editLevelEnd = 0;
  @Input() editObjectGroups: ObjectGroupRef[] = [];
  @Input() propertiesDirty = false;
  @Input() workerBusy = false;

  @Output() propsInput = new EventEmitter<{ field: keyof LevelProperties; event: Event }>();
  @Output() objGroupInput = new EventEmitter<{ index: number; field: 'resID' | 'numObjs'; event: Event }>();
  @Output() saveProperties = new EventEmitter<void>();
}
