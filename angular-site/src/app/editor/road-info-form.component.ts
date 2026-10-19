import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { FormControl, FormGroup } from '@angular/forms';
import type { RoadInfoData } from '../level-editor.service';

export type RoadField = Exclude<keyof RoadInfoData, 'id'>;

export type RoadInfoFormModel = {
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

type RoadFieldGroup = {
  label: string;
  fields: RoadField[];
};

@Component({
  selector: 'app-road-info-form',
  templateUrl: './road-info-form.component.html',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RoadInfoFormComponent {
  @Input({ required: true }) form!: FormGroup<RoadInfoFormModel>;
  @Input() tooltips: Record<string, string> = {};

  readonly groups: RoadFieldGroup[] = [
    {
      label: 'Physics',
      fields: ['friction', 'airResistance', 'backResistance', 'tolerance', 'deathOffs', 'water'],
    },
    {
      label: 'Handling',
      fields: [
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
      ],
    },
  ];

  isWater(field: RoadField): field is 'water' {
    return field === 'water';
  }

  usesStep(field: RoadField): boolean {
    return !['tolerance', 'deathOffs', 'dustColor', 'filler', 'filler2'].includes(field);
  }
}
