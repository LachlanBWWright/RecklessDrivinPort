import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import type { ParsedLevel, LevelProperties, ObjectGroupRef } from '../level-editor.service';

/**
 * Level Properties tab — extracted from app.html for better component separation.
 * Displays and edits road info, time limit, level end Y, and object group references.
 */
@Component({
  selector: 'app-properties-tab',
  templateUrl: './properties-tab.component.html',
  styleUrl: './properties-tab.component.scss',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PropertiesTabComponent {
  @Input() selectedLevel: ParsedLevel | null = null;
  @Input() levelNum = 0;
  @Input() editRoadInfo = 0;
  @Input() editTime = 0;
  @Input() editLevelEnd = 0;
  @Input() editObjectGroups: ObjectGroupRef[] = [];
  @Input() propertiesDirty = false;
  @Input() workerBusy = false;

  @Output() propsInput     = new EventEmitter<{ field: keyof LevelProperties; event: Event }>();
  @Output() objGroupInput  = new EventEmitter<{ index: number; field: 'resID' | 'numObjs'; event: Event }>();
  @Output() saveProperties = new EventEmitter<void>();
}
