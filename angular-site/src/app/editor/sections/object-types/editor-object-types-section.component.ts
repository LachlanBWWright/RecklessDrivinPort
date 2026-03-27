import {
  Component,
  ChangeDetectionStrategy,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
} from '@angular/core';
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
    event: Event;
  }>();
  @Output() referenceChange = new EventEmitter<{
    typeRes: number;
    field: 'deathObj' | 'creationSound' | 'otherSound' | 'weaponObj';
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
      { bit: 1 << 0, label: 'Wheel', hint: 'Uses wheel physics' },
      { bit: 1 << 1, label: 'Solid friction', hint: 'Applies solid-surface friction' },
      { bit: 1 << 2, label: 'Back collision', hint: 'Uses back-collision handling' },
      { bit: 1 << 3, label: 'Random frame', hint: 'Starts on a random animation frame' },
      { bit: 1 << 4, label: 'Die when anim ends', hint: 'Kills the object at the end of animation' },
      { bit: 1 << 5, label: 'Default death', hint: 'Spawns the default explosion on death' },
      { bit: 1 << 6, label: 'Follow marks', hint: 'Uses mark-following behavior' },
      { bit: 1 << 7, label: 'Overtake', hint: 'Allows overtaking behavior' },
      { bit: 1 << 8, label: 'Slow', hint: 'Marked as slow-moving' },
      { bit: 1 << 9, label: 'Long', hint: 'Marked as long' },
      { bit: 1 << 10, label: 'Killed by cars', hint: 'Can be destroyed by cars' },
      { bit: 1 << 11, label: 'Kills cars', hint: 'Can destroy cars on contact' },
      { bit: 1 << 12, label: 'Bounce', hint: 'Bouncy collision response' },
      { bit: 1 << 13, label: 'Cop', hint: 'Uses cop control logic' },
      { bit: 1 << 14, label: 'Heli', hint: 'Helicopter-style movement' },
      { bit: 1 << 15, label: 'Bonus', hint: 'Counts as a bonus object' },
    ],
    flags2: [
      { bit: 1 << 0, label: 'Add-on', hint: 'Treat as an add-on object' },
      { bit: 1 << 1, label: 'Front collision', hint: 'Uses front collision handling' },
      { bit: 1 << 2, label: 'Oil', hint: 'Drops oil' },
      { bit: 1 << 3, label: 'Missile', hint: 'Behaves like a missile' },
      { bit: 1 << 4, label: 'Road kill', hint: 'Uses road-kill movement' },
      { bit: 1 << 5, label: 'Layer 1', hint: 'Draw on layer 1' },
      { bit: 1 << 6, label: 'Layer 2', hint: 'Draw on layer 2' },
      { bit: 1 << 7, label: 'Engine sound', hint: 'Route sound through engine playback' },
      { bit: 1 << 8, label: 'Ramp', hint: 'Ramp behavior' },
      { bit: 1 << 9, label: 'Sink', hint: 'Can sink in water' },
      { bit: 1 << 10, label: 'Damageable', hint: 'Tracks and applies damage' },
      { bit: 1 << 11, label: 'Die when off-screen', hint: 'Remove when off-screen' },
      { bit: 1 << 12, label: 'Rear drive', hint: 'Drive from rear wheels' },
      { bit: 1 << 13, label: 'Rear steer', hint: 'Steer from rear wheels' },
      { bit: 1 << 14, label: 'Floating', hint: 'Float in water' },
      { bit: 1 << 15, label: 'Bump', hint: 'Bump behavior' },
    ],
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
  }

  getFrameLabel(frameId: number): string {
    const frame = this.spriteFrames.find((item) => item.id === frameId);
    return frame ? `#${frame.id} · ${frame.width}×${frame.height} · ${frame.bitDepth}-bit` : `#${frameId}`;
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
    const duration = sound.durationMs !== undefined ? ` · ${(sound.durationMs / 1000).toFixed(1)}s` : '';
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

  onFieldInput(
    typeRes: number,
    field: Exclude<keyof ObjectTypeDefinition, 'typeRes'>,
    event: Event,
  ): void {
    this.fieldInput.emit({ typeRes, field, event });
  }

  onReferenceChange(
    typeRes: number,
    field: 'deathObj' | 'creationSound' | 'otherSound' | 'weaponObj',
    value: number,
  ): void {
    this.referenceChange.emit({ typeRes, field, value });
  }

  onFlagToggle(
    typeRes: number,
    field: 'flags' | 'flags2',
    bit: number,
    checked: boolean,
  ): void {
    this.flagToggle.emit({ typeRes, field, bit, checked });
  }
}
