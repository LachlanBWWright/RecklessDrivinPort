import {
  LevelEditorService,
  parseLevelEntry,
  parseMarkSegs,
  serializeLevelProperties,
  serializeLevelObjects,
  serializeMarkSegs,
} from './level-editor.service';
import { encodePackHandle } from './pack-parser.service';

function makeLevelEntry(overrides: Partial<{
  roadInfo: number;
  time: number;
  xStartPos: number;
  levelEnd: number;
}> = {}): Uint8Array {
  const { roadInfo = 1, time = 600, xStartPos = 100, levelEnd = 50000 } = overrides;
  // tLevelData (48 bytes) + trackUp count=0 (4) + trackDown count=0 (4) + objCount=0 (4) + roadLen=0 (4)
  const buf = new Uint8Array(64);
  const view = new DataView(buf.buffer);
  view.setInt16(0, roadInfo, false);
  view.setUint16(2, time, false);
  // objGrps[10] at offset 4-43: leave zero
  view.setInt16(44, xStartPos, false);
  view.setUint16(46, levelEnd, false);
  // trackUp count = 0 at offset 48
  view.setUint32(48, 0, false);
  // trackDown count = 0 at offset 52
  view.setUint32(52, 0, false);
  // objCount = 0 at offset 56
  view.setUint32(56, 0, false);
  // roadLen = 0 at offset 60
  view.setUint32(60, 0, false);
  return buf;
}

describe('parseLevelEntry', () => {
  it('extracts tLevelData fields correctly', () => {
    const entry = makeLevelEntry({ roadInfo: 3, time: 1200, xStartPos: -50, levelEnd: 60000 });
    const result = parseLevelEntry(entry);
    expect(result.properties.roadInfo).toBe(3);
    expect(result.properties.time).toBe(1200);
    expect(result.properties.xStartPos).toBe(-50);
    expect(result.properties.levelEnd).toBe(60000);
  });

  it('returns 10 object group references', () => {
    const entry = makeLevelEntry();
    const result = parseLevelEntry(entry);
    expect(result.objectGroups.length).toBe(10);
  });

  it('returns empty track/object/road arrays for a minimal entry', () => {
    const entry = makeLevelEntry();
    const result = parseLevelEntry(entry);
    expect(result.trackUp.length).toBe(0);
    expect(result.trackDown.length).toBe(0);
    expect(result.objects.length).toBe(0);
    expect(result.roadSegs.length).toBe(0);
    expect(result.roadSegCount).toBe(0);
  });

  it('throws on too-small input', () => {
    expect(() => parseLevelEntry(new Uint8Array(10))).toThrow();
  });

  it('parses objects in entry', () => {
    // tLevelData (48) + trackUp(4) + trackDown(4) + objCount(4) + 1 object(16) + roadLen(4)
    const buf = new Uint8Array(48 + 4 + 4 + 4 + 16 + 4);
    const view = new DataView(buf.buffer);
    view.setUint32(48, 0, false); // trackUp count = 0
    view.setUint32(52, 0, false); // trackDown count = 0
    view.setUint32(56, 1, false); // objCount = 1
    view.setInt32(60, 123, false); // obj.x
    view.setInt32(64, 456, false); // obj.y
    view.setFloat32(68, 1.5, false); // obj.dir
    view.setInt16(72, 200, false);   // obj.typeRes
    view.setUint32(76, 0, false);   // roadLen = 0
    const result = parseLevelEntry(buf);
    expect(result.objects.length).toBe(1);
    expect(result.objects[0].x).toBe(123);
    expect(result.objects[0].y).toBe(456);
    expect(result.objects[0].typeRes).toBe(200);
  });
});

describe('parseMarkSegs', () => {
  it('parses mark segments correctly', () => {
    const buf = new Uint8Array(16 * 2); // 2 marks
    const view = new DataView(buf.buffer);
    view.setInt32(0, 10, false);
    view.setInt32(4, 20, false);
    view.setInt32(8, 30, false);
    view.setInt32(12, 40, false);
    const marks = parseMarkSegs(buf);
    expect(marks.length).toBe(2);
    expect(marks[0].x1).toBe(10);
    expect(marks[0].y1).toBe(20);
    expect(marks[0].x2).toBe(30);
    expect(marks[0].y2).toBe(40);
  });

  it('returns empty array for empty input', () => {
    expect(parseMarkSegs(new Uint8Array(0))).toEqual([]);
  });

  it('ignores trailing partial record', () => {
    // 17 bytes: 1 full mark (16) + 1 partial byte
    expect(parseMarkSegs(new Uint8Array(17)).length).toBe(1);
  });
});

describe('serializeLevelProperties', () => {
  it('patches tLevelData fields in-place', () => {
    const entry = makeLevelEntry({ roadInfo: 1, time: 600 });
    const patched = serializeLevelProperties(entry, { roadInfo: 7, time: 300, xStartPos: 50, levelEnd: 12345 });
    const view = new DataView(patched.buffer);
    expect(view.getInt16(0, false)).toBe(7);
    expect(view.getUint16(2, false)).toBe(300);
    expect(view.getInt16(44, false)).toBe(50);
    expect(view.getUint16(46, false)).toBe(12345);
  });

  it('does not modify the original entry', () => {
    const entry = makeLevelEntry({ roadInfo: 5 });
    serializeLevelProperties(entry, { roadInfo: 99, time: 0, xStartPos: 0, levelEnd: 0 });
    expect(new DataView(entry.buffer).getInt16(0, false)).toBe(5);
  });
});

describe('serializeLevelObjects', () => {
  it('replaces object block with new objects', () => {
    const entry = makeLevelEntry(); // 0 objects
    const newObjs = [{ x: 100, y: 200, dir: 0, typeRes: 128 }];
    const result = serializeLevelObjects(entry, newObjs);
    // Re-parse to verify
    const parsed = parseLevelEntry(result);
    expect(parsed.objects.length).toBe(1);
    expect(parsed.objects[0].x).toBe(100);
    expect(parsed.objects[0].y).toBe(200);
    expect(parsed.objects[0].typeRes).toBe(128);
  });

  it('allows removing all objects', () => {
    const entry = makeLevelEntry();
    const result = serializeLevelObjects(entry, []);
    const parsed = parseLevelEntry(result);
    expect(parsed.objects.length).toBe(0);
  });
});

describe('LevelEditorService', () => {
  const svc = new LevelEditorService();

  it('extractSpriteAssets returns PPic entries only', () => {
    const resources = [
      { type: 'Pack', id: 140, data: new Uint8Array(0) },
      { type: 'PPic', id: 1, data: new Uint8Array(100) },
      { type: 'PPic', id: 2, data: new Uint8Array(200) },
    ];
    const sprites = svc.extractSpriteAssets(resources);
    expect(sprites.length).toBe(2);
    expect(sprites[0].size).toBe(100);
    expect(sprites[1].size).toBe(200);
  });

  it('applySpriteByte patches correct asset', () => {
    const resources = [
      { type: 'PPic', id: 1, data: new Uint8Array([0, 1, 2, 3]) },
    ];
    const result = svc.applySpriteByte(resources, 1, 2, 0xff);
    expect(result[0].data[2]).toBe(0xff);
    expect(result[0].data[1]).toBe(1); // unchanged
  });

  it('applySpriteByte ignores out-of-range offset', () => {
    const resources = [{ type: 'PPic', id: 1, data: new Uint8Array([10]) }];
    const result = svc.applySpriteByte(resources, 1, 99, 5);
    expect(result[0].data[0]).toBe(10); // unchanged
  });

  it('getSpriteBytes returns null for missing id', () => {
    const resources = [{ type: 'PPic', id: 1, data: new Uint8Array(0) }];
    expect(svc.getSpriteBytes(resources, 999)).toBeNull();
  });

  it('extractLevels filters to Pack IDs 140-149', () => {
    const resources = [
      { type: 'Pack', id: 128, data: new Uint8Array(256) },
      { type: 'Pack', id: 140, data: new Uint8Array(256) },
      { type: 'Pack', id: 141, data: new Uint8Array(256) },
    ];
    const levels = svc.extractLevels(resources);
    expect(levels.length).toBe(2);
    expect(levels[0].resourceId).toBe(140);
    expect(levels[1].resourceId).toBe(141);
  });

  it('extractObjectTypeDefinitions reads object frame and size info from Pack #128', () => {
    const objectType = new Uint8Array(64);
    const view = new DataView(objectType.buffer);
    view.setInt16(20, 321, false); // frame
    view.setUint16(22, 4, false);  // numFrames
    view.setFloat32(40, 36, false); // width
    view.setFloat32(44, 52, false); // length

    const resources = [{
      type: 'Pack',
      id: 128,
      data: encodePackHandle([{ id: 150, data: objectType }], 128),
    }];

    const defs = svc.extractObjectTypeDefinitions(resources);
    expect(defs.get(150)).toEqual({
      typeRes: 150,
      frame: 321,
      numFrames: 4,
      width: 36,
      length: 52,
    });
  });

  it('decodeSpriteFrame decodes 16-bit sprite pixels from Pack #137', () => {
    const sprite = new Uint8Array(8 + 2 * 4);
    const view = new DataView(sprite.buffer);
    view.setUint16(0, 2, false); // width
    view.setUint16(2, 2, false); // height
    sprite[4] = 1; // log2xSize => stride 2
    view.setUint16(8, 0x0000, false); // mask / transparent
    view.setUint16(10, 0xf800, false); // red
    view.setUint16(12, 0x07e0, false); // green
    view.setUint16(14, 0x001f, false); // blue

    const resources = [{
      type: 'Pack',
      id: 137,
      data: encodePackHandle([{ id: 321, data: sprite }], 137),
    }];

    const decoded = svc.decodeSpriteFrame(resources, 321);
    expect(decoded?.width).toBe(2);
    expect(decoded?.height).toBe(2);
    expect(decoded?.bitDepth).toBe(16);
    expect(decoded?.pixels[3]).toBe(0);
    expect(decoded?.pixels[4]).toBeGreaterThan(decoded?.pixels[6] ?? 0);
  });
});

describe('serializeMarkSegs', () => {
  it('produces big-endian bytes matching input marks', () => {
    const marks = [{ x1: 10, y1: 20, x2: 30, y2: 40 }];
    const buf = serializeMarkSegs(marks);
    expect(buf.length).toBe(16);
    const view = new DataView(buf.buffer);
    expect(view.getInt32(0,  false)).toBe(10);
    expect(view.getInt32(4,  false)).toBe(20);
    expect(view.getInt32(8,  false)).toBe(30);
    expect(view.getInt32(12, false)).toBe(40);
  });

  it('round-trips through parseMarkSegs', () => {
    const orig = [
      { x1: -100, y1: 200, x2: 300, y2: -400 },
      { x1: 0,    y1: 0,   x2: 1,   y2: 1    },
    ];
    const serialized = serializeMarkSegs(orig);
    const parsed = parseMarkSegs(serialized);
    expect(parsed.length).toBe(2);
    expect(parsed[0]).toEqual(orig[0]);
    expect(parsed[1]).toEqual(orig[1]);
  });

  it('returns empty buffer for empty array', () => {
    expect(serializeMarkSegs([]).length).toBe(0);
  });
});
