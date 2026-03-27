import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import type {
  ObjectGroupDefinition,
  ParsedLevel,
  ObjectGroupRef,
  RoadInfoData,
  RoadInfoOption,
} from '../level-editor.service';

type RoadField = Exclude<keyof RoadInfoData, 'id'>;

/**
 * Level Properties tab — extracted from app.html for better component separation.
 * Lets the user choose the level road and edit non-texture road fields.
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
  @Input() roadInfoOptions: RoadInfoOption[] = [];
  @Input() roadInfoData: RoadInfoData | null = null;
  @Input() editObjectGroups: ObjectGroupRef[] = [];
  @Input() objectGroupDefinitions: ObjectGroupDefinition[] = [];
  @Input() getSpriteUrl: (typeRes: number) => string | null = () => null;
  @Input() propertiesDirty = false;
  @Input() workerBusy = false;

  @Output() roadInfoChange = new EventEmitter<number>();
  @Output() roadInfoInput = new EventEmitter<{ field: RoadField; event: Event }>();
  @Output() objGroupInput = new EventEmitter<{ index: number; field: 'resID' | 'numObjs'; event: Event }>();

  getRoadInfoOption(roadInfoId: number): RoadInfoOption | undefined {
    return this.roadInfoOptions.find((option) => option.id === roadInfoId);
  }

  getRoadValue(field: RoadField): number {
    return Number(this.roadInfoData?.[field] ?? 0);
  }

  setRoadValue(field: RoadField, value: number): void {
    this.roadInfoInput.emit({
      field,
      event: { target: { value: String(value) } } as unknown as Event,
    });
  }

  getObjectGroupLabel(resId: number): string {
    if (resId === 0) return '0 · empty slot';
    const group = this.objectGroupDefinitions.find((item) => item.id === resId);
    return group ? `#${group.id}` : `#${resId} (custom)`;
  }

  hasObjectGroupDefinition(resId: number): boolean {
    return this.objectGroupDefinitions.some((item) => item.id === resId);
  }

  getObjectGroupSprites(resId: number): number[] {
    const group = this.objectGroupDefinitions.find((item) => item.id === resId);
    return group?.entries.map((entry) => entry.typeRes) ?? [];
  }

  setObjectGroupValue(index: number, resId: number): void {
    this.objGroupInput.emit({
      index,
      field: 'resID',
      event: { target: { value: String(resId) } } as unknown as Event,
    });
  }
}
