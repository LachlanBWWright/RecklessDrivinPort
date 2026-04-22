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
import {
  type AudioEntryInfo,
  clampPreviewOffset,
  formatFrameLabel,
  formatObjectTypeLabel,
  formatSoundLabel,
  getPreviewFrameIds,
  hasCustomFrame,
  hasCustomObjectType,
  hasCustomSound,
  hasPreviewFrameControls,
  resolvePreviewFrameId,
  type SpriteFrameInfo,
} from './editor-object-types-section.helpers';
import {
  type ReferenceField,
  FLAG_OPTIONS,
  SCALAR_FIELDS,
  REFERENCE_FIELDS,
} from './editor-object-types-constants';

@Component({
  selector: 'app-editor-object-types-section',
  templateUrl: './editor-object-types-section.component.html',
  styleUrl: './editor-object-types-section.component.scss',
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

  readonly flagOptions = FLAG_OPTIONS;

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
        this.previewFrameOffsets.set(type.typeRes, this.clampPreviewOffset(type, this.getPreviewOffset(type.typeRes)));
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

  getPreviewFrameId(type: ObjectTypeDefinition): number {
    return resolvePreviewFrameId(type, this.spriteFrames, this.getPreviewOffset(type.typeRes));
  }

  hasPreviewFrameControls(type: ObjectTypeDefinition): boolean {
    return hasPreviewFrameControls(type, this.spriteFrames);
  }

  stepPreviewFrame(typeRes: number, delta: number): void {
    const type = this.objectTypes.find((item) => item.typeRes === typeRes);
    if (!type) return;
    const frames = getPreviewFrameIds(type, this.spriteFrames);
    if (frames.length <= 1) return;
    const current = clampPreviewOffset(type, this.spriteFrames, this.getPreviewOffset(typeRes));
    const next = (current + delta + frames.length) % frames.length;
    this.previewFrameOffsets.set(typeRes, next);
  }

  hasCustomFrame(frameId: number): boolean {
    return hasCustomFrame(this.spriteFrames, frameId);
  }

  hasCustomObjectType(typeRes: number): boolean {
    return hasCustomObjectType(this.objectTypes, typeRes);
  }

  hasCustomSound(soundId: number): boolean {
    return hasCustomSound(this.audioEntries, soundId);
  }

  getObjectTypeLabel(typeRes: number): string {
    return formatObjectTypeLabel(this.objectTypes, this.spriteFrames, typeRes);
  }

  getSoundLabel(soundId: number): string {
    return formatSoundLabel(this.audioEntries, soundId);
  }

  getFrameLabel(frameId: number): string {
    return formatFrameLabel(this.spriteFrames, frameId);
  }

  private getPreviewOffset(typeRes: number): number {
    return this.previewFrameOffsets.get(typeRes) ?? 0;
  }

  private clampPreviewOffset(type: ObjectTypeDefinition, offset: number): number {
    return clampPreviewOffset(type, this.spriteFrames, offset);
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
    for (const field of SCALAR_FIELDS) {
      const value = next[field];
      if (value !== null && value !== type[field]) {
        if (field === 'frame') this.frameChange.emit({ typeRes: type.typeRes, frame: value });
        else this.fieldInput.emit({ typeRes: type.typeRes, field, value });
      }
    }
    for (const field of REFERENCE_FIELDS) {
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
