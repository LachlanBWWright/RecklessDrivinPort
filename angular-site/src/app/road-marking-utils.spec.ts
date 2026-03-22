import {
  clampBarrierPoint,
  generateCentreDashMarkings,
  generateSideMarkings,
  sampleQuadraticBezier,
} from './road-marking-utils';

describe('clampBarrierPoint', () => {
  it('keeps the outer left barrier from crossing the inner left barrier', () => {
    const seg = { v0: -100, v1: -20, v2: 20, v3: 100 };
    expect(clampBarrierPoint(seg, 'v0', 15)).toEqual({ ...seg, v0: -20 });
  });

  it('keeps the right inner barrier inside the road order', () => {
    const seg = { v0: -100, v1: -20, v2: 20, v3: 100 };
    expect(clampBarrierPoint(seg, 'v2', -40)).toEqual({ ...seg, v2: -20 });
  });

  it('merges both inner barriers without crossing the outer barriers', () => {
    const seg = { v0: -100, v1: -20, v2: 20, v3: 100 };
    expect(clampBarrierPoint(seg, 'i', 150)).toEqual({ ...seg, v1: 100, v2: 100 });
  });
});

describe('sampleQuadraticBezier', () => {
  it('returns a curve that starts and ends at the requested endpoints', () => {
    const points = sampleQuadraticBezier({ x: 0, y: 0 }, { x: 50, y: 40 }, { x: 100, y: 0 }, 8);
    expect(points[0]).toEqual({ x: 0, y: 0 });
    expect(points[points.length - 1]).toEqual({ x: 100, y: 0 });
    expect(points.some((point) => point.y > 0)).toBe(true);
  });
});

describe('generateSideMarkings', () => {
  it('creates side markings for a merged single road', () => {
    const roadSegs = [
      { v0: -100, v1: 0, v2: 0, v3: 100 },
      { v0: -100, v1: 0, v2: 0, v3: 100 },
      { v0: -100, v1: 0, v2: 0, v3: 100 },
    ];
    const marks = generateSideMarkings(roadSegs, { roadSelection: 'single', yStart: 0, yEnd: 4, inset: 10 });
    expect(marks).toEqual([
      { x1: -90, y1: 0, x2: -90, y2: 2 },
      { x1: -90, y1: 2, x2: -90, y2: 4 },
      { x1: 90, y1: 0, x2: 90, y2: 2 },
      { x1: 90, y1: 2, x2: 90, y2: 4 },
    ]);
  });
});

describe('generateCentreDashMarkings', () => {
  it('creates dashed center markings for both split roads', () => {
    const roadSegs = Array.from({ length: 8 }, () => ({ v0: -100, v1: -20, v2: 20, v3: 100 }));
    const marks = generateCentreDashMarkings(roadSegs, { roadSelection: 'both', yStart: 0, yEnd: 14, dashFrequency: 8 });
    expect(marks.length).toBeGreaterThan(0);
    expect(marks.some((mark) => mark.x1 === -60 || mark.x2 === -60)).toBe(true);
    expect(marks.some((mark) => mark.x1 === 60 || mark.x2 === 60)).toBe(true);
  });
});
