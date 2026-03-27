import { Component, ChangeDetectionStrategy, EventEmitter, Input, Output } from '@angular/core';
import type { ParsedLevel, ObjectGroupRef, RoadInfoData, TextureTileEntry } from '../../../level-editor.service';

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
  @Input() roadInfoData: RoadInfoData | null = null;
  @Input() editObjectGroups: ObjectGroupRef[] = [];
  @Input() tileTileEntries: TextureTileEntry[] = [];
  @Input() audioEntries: { id: number; sizeBytes: number; durationMs?: number }[] = [];
  @Input() getTileDataUrl: (texId: number) => string | null = () => null;
  @Input() propertiesDirty = false;
  @Input() workerBusy = false;

  @Output() roadInfoInput = new EventEmitter<{ field: Exclude<keyof RoadInfoData, 'id'>; event: Event }>();
  @Output() objGroupInput = new EventEmitter<{ index: number; field: 'resID' | 'numObjs'; event: Event }>();
  @Output() saveProperties = new EventEmitter<void>();
}
