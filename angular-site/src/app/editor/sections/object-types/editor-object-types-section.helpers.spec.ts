import type { ObjectTypeDefinition } from '../../../level-editor.service';
import {
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
  type AudioEntryInfo,
  type SpriteFrameInfo,
} from './editor-object-types-section.helpers';

describe('editor-object-types-section.helpers', () => {
  const spriteFrames: SpriteFrameInfo[] = [
    { id: 10, bitDepth: 8, width: 16, height: 16 },
    { id: 11, bitDepth: 8, width: 16, height: 16 },
    { id: 12, bitDepth: 16, width: 32, height: 20 },
  ];

  const audioEntries: AudioEntryInfo[] = [
    { id: 0, sizeBytes: 0 },
    { id: 7, sizeBytes: 1000, durationMs: 450 },
  ];

  const objectTypes: ObjectTypeDefinition[] = [
    {
      typeRes: 200,
      mass: 1,
      maxEngineForce: 0,
      maxNegEngineForce: 0,
      friction: 1,
      flags: 0,
      deathObj: -1,
      frame: 10,
      numFrames: 3,
      frameDuration: 0,
      wheelWidth: 0,
      wheelLength: 0,
      steering: 0,
      width: 0,
      length: 0,
      score: 0,
      flags2: 0,
      creationSound: -1,
      otherSound: -1,
      maxDamage: 0,
      weaponObj: -1,
      weaponInfo: -1,
    },
  ];

  it('formats frame labels with metadata when available', () => {
    expect(formatFrameLabel(spriteFrames, 10)).toBe('#10 · 16×16 · 8-bit');
    expect(formatFrameLabel(spriteFrames, 99)).toBe('#99');
  });

  it('computes preview frame IDs and control visibility', () => {
    expect(getPreviewFrameIds(objectTypes[0], spriteFrames)).toEqual([10, 11, 12]);
    expect(hasPreviewFrameControls(objectTypes[0], spriteFrames)).toBe(true);
  });

  it('clamps and resolves preview offsets', () => {
    expect(clampPreviewOffset(objectTypes[0], spriteFrames, -1)).toBe(2);
    expect(resolvePreviewFrameId(objectTypes[0], spriteFrames, -1)).toBe(12);
  });

  it('detects custom references', () => {
    expect(hasCustomFrame(spriteFrames, 99)).toBe(true);
    expect(hasCustomObjectType(objectTypes, 999)).toBe(true);
    expect(hasCustomSound(audioEntries, 42)).toBe(true);
  });

  it('formats object type and sound labels', () => {
    expect(formatObjectTypeLabel(objectTypes, spriteFrames, 200)).toContain('Type #200');
    expect(formatObjectTypeLabel(objectTypes, spriteFrames, -1)).toBe('None');
    expect(formatSoundLabel(audioEntries, 7)).toBe('Sound #7 · 0.5s');
    expect(formatSoundLabel(audioEntries, 0)).toBe('None');
  });
});
