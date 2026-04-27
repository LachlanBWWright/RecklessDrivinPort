import { describe, expect, it } from 'vitest';
import {
  worldDirToCanvasForwardVector,
  worldDirToCanvasRotationRad,
  worldDirToKonvaRotationDeg,
  worldVectorToDir,
} from './object-direction-utils';

describe('object direction utils', () => {
  it('keeps canvas and Konva rotation conversions in sync', () => {
    const dir = Math.PI / 3;
    expect(worldDirToCanvasRotationRad(dir)).toBeCloseTo(-Math.PI / 3);
    expect(worldDirToKonvaRotationDeg(dir)).toBeCloseTo(-60);
  });

  it('maps dir=0 to an upward editor arrow', () => {
    expect(worldDirToCanvasForwardVector(0, 12)).toEqual({ dx: 0, dy: -12 });
  });

  it('maps positive direction to clockwise screen rotation', () => {
    const vector = worldDirToCanvasForwardVector(Math.PI / 2, 8);
    expect(vector.dx).toBeCloseTo(8);
    expect(vector.dy).toBeCloseTo(0);
  });

  it('inverts world forward vectors back to direction angles', () => {
    expect(worldVectorToDir(0, -10)).toBeCloseTo(0);
    expect(worldVectorToDir(10, 0)).toBeCloseTo(Math.PI / 2);
    expect(worldVectorToDir(-10, 0)).toBeCloseTo(-Math.PI / 2);
  });
});
