import {
  Component,
  ChangeDetectionStrategy,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
} from '@angular/core';
import { FormArray, FormControl, FormGroup } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import type { ObjectTypeDefinition } from '../../../level-editor.service';

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

interface FlagOption {
  bit: number;
  label: string;
  hint: string;
}

type ScalarField =
  | 'frame'
  | 'numFrames'
  | 'frameDuration'
  | 'mass'
  | 'maxEngineForce'
  | 'maxNegEngineForce'
  | 'friction'
  | 'steering'
  | 'wheelWidth'
  | 'wheelLength'
  | 'width'
  | 'length'
  | 'score'
  | 'maxDamage'
  | 'weaponInfo';

type ReferenceField = 'deathObj' | 'creationSound' | 'otherSound' | 'weaponObj';

@Component({
  selector: 'app-editor-object-types-section',
  templateUrl: './editor-object-types-section.component.html',
  host: {
    class: 'flex min-h-0 w-full flex-1 flex-col',
  },
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditorObjectTypesSectionComponent implements OnChanges {
  @Input() objectTypes: ObjectTypeDefinition[] = [];
  @Input() selectedObjectTypeId: number | null = null;
  @Input() spriteFrames: SpriteFrameInfo[] = [];
  @Input() audioEntries: AudioEntryInfo[] = [];
  @Input() getSpriteUrl: (frameId: number) => string | null = () => null;
  @Input() typesDirty = false;
  @Input() workerBusy = false;

  @Output() selectedObjectTypeIdChange = new EventEmitter<number>();
  @Output() addType = new EventEmitter<void>();
  @Output() deleteType = new EventEmitter<number>();
  @Output() fieldInput = new EventEmitter<{
    typeRes: number;
    field: Exclude<keyof ObjectTypeDefinition, 'typeRes'>;
    value: number;
  }>();
  @Output() referenceChange = new EventEmitter<{
    typeRes: number;
    field: ReferenceField;
    value: number;
  }>();
  @Output() flagToggle = new EventEmitter<{
    typeRes: number;
    field: 'flags' | 'flags2';
    bit: number;
    checked: boolean;
  }>();
  @Output() frameChange = new EventEmitter<{ typeRes: number; frame: number }>();
  @Output() saveObjectTypes = new EventEmitter<void>();

  /**
   * Local preview offset per object type. This keeps the hero preview on the
   * currently selected type even when the user switches away and back.
   */
  private previewFrameOffsets = new Map<number, number>();

  readonly flagOptions: Record<'flags' | 'flags2', FlagOption[]> = {
    flags: [
      {
        bit: 1 << 0,
        label: 'Wheel',
        hint: 'kObjectWheelFlag: enables wheel-force vehicle physics.',
      },
      {
        bit: 1 << 1,
        label: 'Solid friction',
        hint: 'kObjectSolidFrictionFlag: uses solid-surface friction path.',
      },
      {
        bit: 1 << 2,
        label: 'Back collision',
        hint: 'kObjectBackCollFlag: enables rear-collision checks.',
      },
      {
        bit: 1 << 3,
        label: 'Random frame',
        hint: 'kObjectRandomFrameFlag: spawn frame randomized in NewObject().',
      },
      {
        bit: 1 << 4,
        label: 'Die when anim ends',
        hint: 'kObjectDieWhenAnimEndsFlag: remove object when animation reaches last frame.',
      },
      {
        bit: 1 << 5,
        label: 'Default death',
        hint: 'kObjectDefaultDeath: use Explosion() default death path.',
      },
      {
        bit: 1 << 6,
        label: 'Follow marks',
        hint: 'kObjectFollowMarks: controller follows generated marks/track guidance.',
      },
      {
        bit: 1 << 7,
        label: 'Overtake',
        hint: 'kObjectOvertake: enables overtake target offset in AI.',
      },
      { bit: 1 << 8, label: 'Slow', hint: 'kObjectSlow: lowers AI target speed multiplier.' },
      { bit: 1 << 9, label: 'Long', hint: 'kObjectLong: marks long-body collision behavior.' },
      {
        bit: 1 << 10,
        label: 'Killed by cars',
        hint: 'kObjectKilledByCars: allows destruction from vehicle hits.',
      },
      {
        bit: 1 << 11,
        label: 'Kills cars',
        hint: 'kObjectKillsCars: object can kill colliding cars.',
      },
      {
        bit: 1 << 12,
        label: 'Bounce',
        hint: 'kObjectBounce: enables bounce response on collisions.',
      },
      {
        bit: 1 << 13,
        label: 'Cop',
        hint: 'kObjectCop: object participates in cop behavior/systems.',
      },
      {
        bit: 1 << 14,
        label: 'Heli',
        hint: 'kObjectHeliFlag: helicopter movement/control handling.',
      },
      {
        bit: 1 << 15,
        label: 'Bonus',
        hint: 'kObjectBonusFlag: object is treated as a bonus/add-on pickup.',
      },
    ],
    flags2: [
      {
        bit: 1 << 0,
        label: 'Add-on',
        hint: 'kObjectAddOnFlag: marks object as an add-on pickup/effect.',
      },
      {
        bit: 1 << 1,
        label: 'Front collision',
        hint: 'kObjectFrontCollFlag: enables front-collision behavior.',
      },
      { bit: 1 << 2, label: 'Oil', hint: 'kObjectOil: marks oil-type hazard behavior.' },
      {
        bit: 1 << 3,
        label: 'Missile',
        hint: 'kObjectMissile: projectile logic treats object as missile.',
      },
      {
        bit: 1 << 4,
        label: 'Road kill',
        hint: 'kObjectRoadKill: road-kill movement path in object control.',
      },
      {
        bit: 1 << 5,
        label: 'Layer 1',
        hint: 'kObjectLayerFlag1: contributes to render layer bits.',
      },
      {
        bit: 1 << 6,
        label: 'Layer 2',
        hint: 'kObjectLayerFlag2: contributes to render layer bits.',
      },
      {
        bit: 1 << 7,
        label: 'Engine sound',
        hint: 'kObjectEngineSound: object uses looping engine sound logic.',
      },
      {
        bit: 1 << 8,
        label: 'Ramp',
        hint: 'kObjectRamp: object behaves as ramp-type collision surface.',
      },
      { bit: 1 << 9, label: 'Sink', hint: 'kObjectSink: allows sink/deathOffs behavior in water.' },
      {
        bit: 1 << 10,
        label: 'Damageable',
        hint: 'kObjectDamageble: object takes and tracks damage.',
      },
      {
        bit: 1 << 11,
        label: 'Die when off-screen',
        hint: 'kObjectDieWhenOutOfScreen: despawn when out of view.',
      },
      {
        bit: 1 << 12,
        label: 'Rear drive',
        hint: 'kObjectRearDrive: rear wheels receive engine force.',
      },
      {
        bit: 1 << 13,
        label: 'Rear steer',
        hint: 'kObjectRearSteer: steering applied to rear wheels.',
      },
      {
        bit: 1 << 14,
        label: 'Floating',
        hint: 'kObjectFloating: receives water drift/tide float behavior.',
      },
      { bit: 1 << 15, label: 'Bump', hint: 'kObjectBump: bump interaction behavior flag.' },
    ],
  };

  readonly fieldTooltips: Record<ScalarField | ReferenceField, string> = {
    frame: 'tObjectType.frame: base sprite frame id (Pack 129/137).',
    numFrames: 'tObjectType.numFrames: low byte = animation frames, high byte = repeat count.',
    frameDuration: 'tObjectType.frameDuration: seconds between animation frame advances.',
    mass: 'tObjectType.mass: used in force/acceleration calculations in objectPhysics.c.',
    maxEngineForce: 'tObjectType.maxEngineForce: forward drive force cap.',
    maxNegEngineForce: 'tObjectType.maxNegEngineForce: reverse/brake drive force cap.',
    friction: 'tObjectType.friction: multiplied with road friction in wheel-force math.',
    steering: 'tObjectType.steering: steering angle influence for wheel vectors.',
    wheelWidth: 'tObjectType.wheelWidth: lateral wheel offset from center.',
    wheelLength: 'tObjectType.wheelLength: longitudinal wheel offset from center.',
    width: 'tObjectType.width: collision half-width.',
    length: 'tObjectType.length: collision half-length.',
    score: 'tObjectType.score: points awarded for this object.',
    maxDamage: 'tObjectType.maxDamage: threshold before kill path triggers.',
    weaponInfo: 'tObjectType.weaponInfo: projectile launch speed offset in FireWeapon().',
    deathObj: 'tObjectType.deathObj: replacement type on death (-1 disables replacement).',
    creationSound: 'tObjectType.creationSound: sound id played on spawn.',
    otherSound: 'tObjectType.otherSound: secondary sound id used by object logic.',
    weaponObj: 'tObjectType.weaponObj: spawned projectile/object id (0 = none).',
  };

  readonly typeForm = new FormGroup({
    frame: new FormControl<number | null>(null),
    numFrames: new FormControl<number | null>(null),
    frameDuration: new FormControl<number | null>(null),
    mass: new FormControl<number | null>(null),
    maxEngineForce: new FormControl<number | null>(null),
    maxNegEngineForce: new FormControl<number | null>(null),
    friction: new FormControl<number | null>(null),
    steering: new FormControl<number | null>(null),
    wheelWidth: new FormControl<number | null>(null),
    wheelLength: new FormControl<number | null>(null),
    width: new FormControl<number | null>(null),
    length: new FormControl<number | null>(null),
    score: new FormControl<number | null>(null),
    maxDamage: new FormControl<number | null>(null),
    weaponInfo: new FormControl<number | null>(null),
    deathObj: new FormControl<number | null>(null),
    creationSound: new FormControl<number | null>(null),
    otherSound: new FormControl<number | null>(null),
    weaponObj: new FormControl<number | null>(null),
  });

  readonly flagForms = {
    flags: this.createFlagForm('flags'),
    flags2: this.createFlagForm('flags2'),
  };

  get selectedType(): ObjectTypeDefinition | null {
    if (this.selectedObjectTypeId === null) return null;
    return this.objectTypes.find((type) => type.typeRes === this.selectedObjectTypeId) ?? null;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['selectedObjectTypeId'] && this.selectedObjectTypeId !== null) {
      const type = this.selectedType;
      if (type) {
        this.previewFrameOffsets.set(
          type.typeRes,
          this.clampPreviewOffset(type, this.getPreviewOffset(type.typeRes)),
        );
      }
    }
    if (changes['objectTypes'] || changes['selectedObjectTypeId']) {
      this.syncTypeForm();
    }
    if (changes['workerBusy']) {
      if (this.workerBusy) {
        this.typeForm.disable({ emitEvent: false });
        this.flagForms.flags.disable({ emitEvent: false });
        this.flagForms.flags2.disable({ emitEvent: false });
      } else {
        this.typeForm.enable({ emitEvent: false });
        this.flagForms.flags.enable({ emitEvent: false });
        this.flagForms.flags2.enable({ emitEvent: false });
      }
    }
  }

  constructor() {
    this.typeForm.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      this.emitTypeFormChanges();
    });
    this.flagForms.flags.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      this.emitFlagChanges('flags');
    });
    this.flagForms.flags2.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      this.emitFlagChanges('flags2');
    });
  }

  getFrameLabel(frameId: number): string {
    const frame = this.spriteFrames.find((item) => item.id === frameId);
    return frame
      ? `#${frame.id} · ${frame.width}×${frame.height} · ${frame.bitDepth}-bit`
      : `#${frameId}`;
  }

  getPreviewFrameCount(type: ObjectTypeDefinition): number {
    // The low byte of numFrames is the animation frame count in the original game.
    return Math.max(1, type.numFrames & 0xff);
  }

  getPreviewFrameIds(type: ObjectTypeDefinition): number[] {
    const ids: number[] = [];
    const count = this.getPreviewFrameCount(type);
    for (let i = 0; i < count; i++) {
      const frameId = type.frame + i;
      if (!this.spriteFrames.some((frame) => frame.id === frameId)) break;
      ids.push(frameId);
    }
    return ids.length > 0 ? ids : [type.frame];
  }

  getPreviewFrameId(type: ObjectTypeDefinition): number {
    const frames = this.getPreviewFrameIds(type);
    const offset = this.clampPreviewOffset(type, this.getPreviewOffset(type.typeRes));
    return frames[offset] ?? type.frame;
  }

  hasPreviewFrameControls(type: ObjectTypeDefinition): boolean {
    return this.getPreviewFrameIds(type).length > 1;
  }

  stepPreviewFrame(typeRes: number, delta: number): void {
    const type = this.objectTypes.find((item) => item.typeRes === typeRes);
    if (!type) return;
    const frames = this.getPreviewFrameIds(type);
    if (frames.length <= 1) return;
    const current = this.clampPreviewOffset(type, this.getPreviewOffset(typeRes));
    const next = (current + delta + frames.length) % frames.length;
    this.previewFrameOffsets.set(typeRes, next);
  }

  hasCustomFrame(frameId: number): boolean {
    return !this.spriteFrames.some((frame) => frame.id === frameId);
  }

  hasCustomObjectType(typeRes: number): boolean {
    return !this.objectTypes.some((type) => type.typeRes === typeRes);
  }

  hasCustomSound(soundId: number): boolean {
    return soundId !== 0 && !this.audioEntries.some((sound) => sound.id === soundId);
  }

  getObjectTypeLabel(typeRes: number): string {
    if (typeRes === -1) return 'None';
    const type = this.objectTypes.find((item) => item.typeRes === typeRes);
    if (!type) return `#${typeRes}`;
    return `Type #${type.typeRes} · ${this.getFrameLabel(type.frame)}`;
  }

  getSoundLabel(soundId: number): string {
    if (soundId === 0) return 'None';
    const sound = this.audioEntries.find((item) => item.id === soundId);
    if (!sound) return `Sound #${soundId}`;
    const duration =
      sound.durationMs !== undefined ? ` · ${(sound.durationMs / 1000).toFixed(1)}s` : '';
    return `Sound #${sound.id}${duration}`;
  }

  hasFlag(flags: number, bit: number): boolean {
    return (flags & bit) !== 0;
  }

  trackType(_index: number, type: ObjectTypeDefinition): number {
    return type.typeRes;
  }

  trackFrame(_index: number, frame: SpriteFrameInfo): number {
    return frame.id;
  }

  onFrameChange(typeRes: number, frame: number): void {
    this.frameChange.emit({ typeRes, frame });
  }

  private getPreviewOffset(typeRes: number): number {
    return this.previewFrameOffsets.get(typeRes) ?? 0;
  }

  private clampPreviewOffset(type: ObjectTypeDefinition, offset: number): number {
    const frameCount = this.getPreviewFrameIds(type).length;
    if (frameCount <= 1) return 0;
    return ((offset % frameCount) + frameCount) % frameCount;
  }

  private createFlagForm(field: 'flags' | 'flags2'): FormArray<FormControl<boolean>> {
    return new FormArray(
      this.flagOptions[field].map(() => new FormControl(false, { nonNullable: true })),
    );
  }

  private syncTypeForm(): void {
    const type = this.selectedType;
    if (!type) {
      this.typeForm.patchValue(
        {
          frame: null,
          numFrames: null,
          frameDuration: null,
          mass: null,
          maxEngineForce: null,
          maxNegEngineForce: null,
          friction: null,
          steering: null,
          wheelWidth: null,
          wheelLength: null,
          width: null,
          length: null,
          score: null,
          maxDamage: null,
          weaponInfo: null,
          deathObj: null,
          creationSound: null,
          otherSound: null,
          weaponObj: null,
        },
        { emitEvent: false },
      );
      this.syncFlagForms();
      return;
    }
    this.typeForm.patchValue(
      {
        frame: type.frame,
        numFrames: type.numFrames,
        frameDuration: type.frameDuration,
        mass: type.mass,
        maxEngineForce: type.maxEngineForce,
        maxNegEngineForce: type.maxNegEngineForce,
        friction: type.friction,
        steering: type.steering,
        wheelWidth: type.wheelWidth,
        wheelLength: type.wheelLength,
        width: type.width,
        length: type.length,
        score: type.score,
        maxDamage: type.maxDamage,
        weaponInfo: type.weaponInfo,
        deathObj: type.deathObj,
        creationSound: type.creationSound,
        otherSound: type.otherSound,
        weaponObj: type.weaponObj,
      },
      { emitEvent: false },
    );
    this.syncFlagForms();
  }

  private syncFlagForms(): void {
    const type = this.selectedType;
    const flags = this.flagForms.flags.controls;
    const flags2 = this.flagForms.flags2.controls;
    const currentFlags = type?.flags ?? 0;
    const currentFlags2 = type?.flags2 ?? 0;
    this.flagOptions.flags.forEach((flag, index) => {
      flags[index].setValue(type ? (currentFlags & flag.bit) !== 0 : false, { emitEvent: false });
    });
    this.flagOptions.flags2.forEach((flag, index) => {
      flags2[index].setValue(type ? (currentFlags2 & flag.bit) !== 0 : false, { emitEvent: false });
    });
  }

  private emitTypeFormChanges(): void {
    const type = this.selectedType;
    if (!type) return;
    const next = this.typeForm.getRawValue();
    const scalarFields: ScalarField[] = [
      'frame',
      'numFrames',
      'frameDuration',
      'mass',
      'maxEngineForce',
      'maxNegEngineForce',
      'friction',
      'steering',
      'wheelWidth',
      'wheelLength',
      'width',
      'length',
      'score',
      'maxDamage',
      'weaponInfo',
    ];
    for (const field of scalarFields) {
      const value = next[field];
      if (value !== null && value !== type[field]) {
        if (field === 'frame') {
          this.frameChange.emit({ typeRes: type.typeRes, frame: value });
        } else {
          this.fieldInput.emit({ typeRes: type.typeRes, field, value });
        }
      }
    }

    const referenceFields: ReferenceField[] = [
      'deathObj',
      'creationSound',
      'otherSound',
      'weaponObj',
    ];
    for (const field of referenceFields) {
      const value = next[field];
      if (value !== null && value !== type[field]) {
        this.referenceChange.emit({ typeRes: type.typeRes, field, value });
      }
    }
  }

  private emitFlagChanges(field: 'flags' | 'flags2'): void {
    const type = this.selectedType;
    if (!type) return;
    const currentValue = type[field];
    const controls = this.flagForms[field].controls;
    this.flagOptions[field].forEach((flag, index) => {
      const checked = controls[index].value;
      const active = (currentValue & flag.bit) !== 0;
      if (checked !== active) {
        this.flagToggle.emit({ typeRes: type.typeRes, field, bit: flag.bit, checked });
      }
    });
  }
}
