import { describe, expect, it } from 'vitest';
import { isPackedPictType, isPictType, monoMaskTypeForColorIcon } from './app-media';

describe('app-media type helpers', () => {
  it('treats mixed-case PPic as packed PICT', () => {
    expect(isPictType('PPic')).toBe(true);
    expect(isPackedPictType('PPic')).toBe(true);
  });

  it('maps 8-bit color icon types to the correct mono mask resources', () => {
    expect(monoMaskTypeForColorIcon('icl8')).toBe('ICN#');
    expect(monoMaskTypeForColorIcon('ics8')).toBe('ICS#');
  });
});
