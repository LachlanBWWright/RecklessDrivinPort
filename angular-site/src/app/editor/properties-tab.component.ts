import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
  OnChanges,
  SimpleChanges,
} from '@angular/core';
import { FormArray, FormControl, FormGroup } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import type {
  ObjectGroupDefinition,
  ParsedLevel,
  ObjectGroupRef,
  RoadInfoData,
  RoadInfoOption,
} from '../level-editor.service';

type RoadField = Exclude<keyof RoadInfoData, 'id'>;
type RoadFieldValue = number | boolean;
type RoadInfoFormField = Exclude<keyof RoadInfoFormModel, 'water'>;

type RoadInfoFormModel = {
  friction: FormControl<number | null>;
  airResistance: FormControl<number | null>;
  backResistance: FormControl<number | null>;
  tolerance: FormControl<number | null>;
  deathOffs: FormControl<number | null>;
  water: FormControl<boolean>;
  xDrift: FormControl<number | null>;
  yDrift: FormControl<number | null>;
  xFrontDrift: FormControl<number | null>;
  yFrontDrift: FormControl<number | null>;
  trackSlide: FormControl<number | null>;
  dustSlide: FormControl<number | null>;
  dustColor: FormControl<number | null>;
  filler: FormControl<number | null>;
  filler2: FormControl<number | null>;
  slideFriction: FormControl<number | null>;
};

/**
 * Level Properties tab — extracted from app.html for better component separation.
 * Lets the user choose the level road and edit non-texture road fields.
 */
@Component({
  selector: 'app-properties-tab',
  templateUrl: './properties-tab.component.html',
  host: {
    class: 'flex min-h-0 w-full flex-1 flex-col',
  },
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PropertiesTabComponent implements OnChanges {
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
  @Output() roadInfoInput = new EventEmitter<{ field: RoadField; value: RoadFieldValue }>();
  @Output() objGroupInput = new EventEmitter<{
    index: number;
    field: 'resID' | 'numObjs';
    value: number;
  }>();

  readonly roadInfoForm = new FormGroup<RoadInfoFormModel>({
    friction: new FormControl<number | null>(null),
    airResistance: new FormControl<number | null>(null),
    backResistance: new FormControl<number | null>(null),
    tolerance: new FormControl<number | null>(null),
    deathOffs: new FormControl<number | null>(null),
    water: new FormControl(false, { nonNullable: true }),
    xDrift: new FormControl<number | null>(null),
    yDrift: new FormControl<number | null>(null),
    xFrontDrift: new FormControl<number | null>(null),
    yFrontDrift: new FormControl<number | null>(null),
    trackSlide: new FormControl<number | null>(null),
    dustSlide: new FormControl<number | null>(null),
    dustColor: new FormControl<number | null>(null),
    filler: new FormControl<number | null>(null),
    filler2: new FormControl<number | null>(null),
    slideFriction: new FormControl<number | null>(null),
  });

  readonly objectGroupNumObjsForm = new FormArray<FormControl<number>>([]);
  private syncingObjectGroupNumObjsForm = false;

  readonly roadFieldTooltips: Record<string, string> = {
    friction: 'tRoadInfo.friction: base road grip, multiplied with object friction in physics.',
    airResistance: 'tRoadInfo.airResistance: velocity-proportional drag term in CalcWheelForce().',
    backResistance: 'tRoadInfo.backResistance: marked obsolete in headers/roads.h.',
    tolerance: 'tRoadInfo.tolerance: off-road threshold in CalcBackCollision().',
    deathOffs: 'tRoadInfo.deathOffs: offset added to deathObj/sink death variants.',
    water: 'tRoadInfo.water: enables water handling paths (boat behavior, drift, sounds).',
    xDrift: 'tRoadInfo.xDrift: global lateral drift accumulator per frame.',
    yDrift: 'tRoadInfo.yDrift: global longitudinal drift accumulator per frame.',
    xFrontDrift: 'tRoadInfo.xFrontDrift: front-wheel lateral drift component.',
    yFrontDrift: 'tRoadInfo.yFrontDrift: front-wheel longitudinal drift component.',
    trackSlide: 'tRoadInfo.trackSlide: slide multiplier for track-surface behavior.',
    dustSlide: 'tRoadInfo.dustSlide: slide multiplier for dust/off-road behavior.',
    dustColor: 'tRoadInfo.dustColor: palette color index for dust effects.',
    filler: 'tRoadInfo.filler: compatibility filler field kept in struct layout.',
    filler2: 'tRoadInfo.filler2: compatibility filler field kept in struct layout.',
    slideFriction: 'tRoadInfo.slideFriction: scales grip loss while sliding.',
  };

  readonly objectGroupTooltips: Record<'resID' | 'numObjs', string> = {
    resID: 'tObjectGroupReference.resID: object-group definition id looked up by InsertObjectGroup().',
    numObjs: 'tObjectGroupReference.numObjs: number of objects spawned for this slot.',
  };

  constructor() {
    this.roadInfoForm.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      this.emitRoadInfoChanges();
    });
    this.objectGroupNumObjsForm.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      this.emitObjectGroupNumObjsChanges();
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['roadInfoData']) {
      this.syncRoadInfoForm();
    }
    if (changes['editObjectGroups']) {
      this.syncObjectGroupNumObjsForm();
    }
    if (changes['workerBusy']) {
      if (this.workerBusy) {
        this.objectGroupNumObjsForm.disable({ emitEvent: false });
      } else {
        this.objectGroupNumObjsForm.enable({ emitEvent: false });
      }
    }
  }

  getRoadInfoOption(roadInfoId: number): RoadInfoOption | undefined {
    return this.roadInfoOptions.find((option) => option.id === roadInfoId);
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
      value: resId,
    });
  }

  private syncRoadInfoForm(): void {
    if (!this.roadInfoData) {
      return;
    }
    this.roadInfoForm.patchValue(
      {
        friction: this.roadInfoData.friction,
        airResistance: this.roadInfoData.airResistance,
        backResistance: this.roadInfoData.backResistance,
        tolerance: this.roadInfoData.tolerance,
        deathOffs: this.roadInfoData.deathOffs,
        water: this.roadInfoData.water,
        xDrift: this.roadInfoData.xDrift,
        yDrift: this.roadInfoData.yDrift,
        xFrontDrift: this.roadInfoData.xFrontDrift,
        yFrontDrift: this.roadInfoData.yFrontDrift,
        trackSlide: this.roadInfoData.trackSlide,
        dustSlide: this.roadInfoData.dustSlide,
        dustColor: this.roadInfoData.dustColor,
        filler: this.roadInfoData.filler,
        filler2: this.roadInfoData.filler2,
        slideFriction: this.roadInfoData.slideFriction,
      },
      { emitEvent: false },
    );
  }

  private emitRoadInfoChanges(): void {
    if (!this.roadInfoData) return;
    const next = this.roadInfoForm.getRawValue();
    const numericFields: RoadInfoFormField[] = [
      'friction',
      'airResistance',
      'backResistance',
      'tolerance',
      'deathOffs',
      'xDrift',
      'yDrift',
      'xFrontDrift',
      'yFrontDrift',
      'trackSlide',
      'dustSlide',
      'dustColor',
      'filler',
      'filler2',
      'slideFriction',
    ];

    for (const field of numericFields) {
      const current = next[field];
      if (current === null) continue;
      const updated = Number(current);
      if (updated !== this.roadInfoData[field]) {
        this.roadInfoInput.emit({ field, value: updated });
      }
    }

    if (next.water !== this.roadInfoData.water) {
      this.roadInfoInput.emit({ field: 'water', value: next.water });
    }
  }

  private syncObjectGroupNumObjsForm(): void {
    this.syncingObjectGroupNumObjsForm = true;
    try {
      while (this.objectGroupNumObjsForm.length > this.editObjectGroups.length) {
        this.objectGroupNumObjsForm.removeAt(this.objectGroupNumObjsForm.length - 1);
      }
      while (this.objectGroupNumObjsForm.length < this.editObjectGroups.length) {
        this.objectGroupNumObjsForm.push(new FormControl(0, { nonNullable: true }));
      }
      for (let i = 0; i < this.editObjectGroups.length; i += 1) {
        this.objectGroupNumObjsForm
          .at(i)
          .setValue(this.editObjectGroups[i].numObjs, { emitEvent: false });
      }
    } finally {
      this.syncingObjectGroupNumObjsForm = false;
    }
  }

  private emitObjectGroupNumObjsChanges(): void {
    if (this.syncingObjectGroupNumObjsForm) return;
    for (let i = 0; i < this.editObjectGroups.length; i += 1) {
      const next = this.objectGroupNumObjsForm.at(i).value;
      if (next === null) continue;
      if (next !== this.editObjectGroups[i].numObjs) {
        this.objGroupInput.emit({ index: i, field: 'numObjs', value: next });
      }
    }
  }
}
