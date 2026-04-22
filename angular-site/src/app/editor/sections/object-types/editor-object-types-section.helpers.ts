import type { ObjectTypeDefinition } from '../../../level-editor.service';

export interface SpriteFrameInfo {
  id: number;
  bitDepth: 8 | 16;
  width: number;
  height: number;
}

export interface AudioEntryInfo {
  id: number;
  sizeBytes: number;
  durationMs?: number;
}

export function formatFrameLabel(spriteFrames: SpriteFrameInfo[], frameId: number): string {
  const frame = spriteFrames.find((item) => item.id === frameId);
  return frame ? `#${frame.id} · ${frame.width}×${frame.height} · ${frame.bitDepth}-bit` : `#${frameId}`;
}

export function getPreviewFrameCount(type: Pick<ObjectTypeDefinition, 'numFrames'>): number {
  return Math.max(1, type.numFrames & 0xff);
}

export function getPreviewFrameIds(
  type: Pick<ObjectTypeDefinition, 'frame' | 'numFrames'>,
  spriteFrames: SpriteFrameInfo[],
): number[] {
  const ids: number[] = [];
  const count = getPreviewFrameCount(type);
  for (let i = 0; i < count; i++) {
    const frameId = type.frame + i;
    if (!spriteFrames.some((frame) => frame.id === frameId)) break;
    ids.push(frameId);
  }
  return ids.length > 0 ? ids : [type.frame];
}

export function clampPreviewOffset(
  type: Pick<ObjectTypeDefinition, 'frame' | 'numFrames'>,
  spriteFrames: SpriteFrameInfo[],
  offset: number,
): number {
  const frameCount = getPreviewFrameIds(type, spriteFrames).length;
  if (frameCount <= 1) return 0;
  return ((offset % frameCount) + frameCount) % frameCount;
}

export function resolvePreviewFrameId(
  type: Pick<ObjectTypeDefinition, 'frame' | 'numFrames'>,
  spriteFrames: SpriteFrameInfo[],
  offset: number,
): number {
  const frames = getPreviewFrameIds(type, spriteFrames);
  const clampedOffset = clampPreviewOffset(type, spriteFrames, offset);
  return frames[clampedOffset] ?? type.frame;
}

export function hasPreviewFrameControls(
  type: Pick<ObjectTypeDefinition, 'frame' | 'numFrames'>,
  spriteFrames: SpriteFrameInfo[],
): boolean {
  return getPreviewFrameIds(type, spriteFrames).length > 1;
}

export function hasCustomFrame(spriteFrames: SpriteFrameInfo[], frameId: number): boolean {
  return !spriteFrames.some((frame) => frame.id === frameId);
}

export function hasCustomObjectType(objectTypes: ObjectTypeDefinition[], typeRes: number): boolean {
  return !objectTypes.some((type) => type.typeRes === typeRes);
}

export function hasCustomSound(audioEntries: AudioEntryInfo[], soundId: number): boolean {
  return soundId !== 0 && !audioEntries.some((sound) => sound.id === soundId);
}

export function formatObjectTypeLabel(
  objectTypes: ObjectTypeDefinition[],
  spriteFrames: SpriteFrameInfo[],
  typeRes: number,
): string {
  if (typeRes === -1) return 'None';
  const type = objectTypes.find((item) => item.typeRes === typeRes);
  if (!type) return `#${typeRes}`;
  return `Type #${type.typeRes} · ${formatFrameLabel(spriteFrames, type.frame)}`;
}

export function formatSoundLabel(audioEntries: AudioEntryInfo[], soundId: number): string {
  if (soundId === 0) return 'None';
  const sound = audioEntries.find((item) => item.id === soundId);
  if (!sound) return `Sound #${soundId}`;
  const duration = sound.durationMs !== undefined ? ` · ${(sound.durationMs / 1000).toFixed(1)}s` : '';
  return `Sound #${sound.id}${duration}`;
}
