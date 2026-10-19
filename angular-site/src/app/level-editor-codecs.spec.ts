import {
  applyScriptResources,
  extractScriptResources,
  rgb565ToRgba,
  rgbaToRgb555,
  stripScriptResources,
} from './level-editor.service';
import {
  LEVEL_SCRIPT_BINDINGS_RESOURCE_ID,
  LEVEL_SCRIPT_BINDINGS_RESOURCE_TYPE,
  SCRIPT_FORMAT_VERSION,
  serializeLevelScriptBindings,
} from './script-format';

describe('level-editor pixel codecs', () => {
  it('converts pure red RGB565 to RGBA', () =>
    expect(rgb565ToRgba(0xf800)).toEqual([255, 0, 0, 255]));
  it('converts pure green RGB565 to RGBA', () =>
    expect(rgb565ToRgba(0x07e0)).toEqual([0, 255, 0, 255]));
  it('converts pure blue RGB565 to RGBA', () =>
    expect(rgb565ToRgba(0x001f)).toEqual([0, 0, 255, 255]));
  it('converts black RGB565 to RGBA', () => expect(rgb565ToRgba(0x0000)).toEqual([0, 0, 0, 255]));
  it('converts white RGB565 to RGBA', () =>
    expect(rgb565ToRgba(0xffff)).toEqual([255, 255, 255, 255]));
  it('converts pure red RGBA to RGB555', () => expect(rgbaToRgb555(255, 0, 0)).toBe(0x7c00));
  it('converts pure green RGBA to RGB555', () => expect(rgbaToRgb555(0, 255, 0)).toBe(0x03e0));
  it('converts pure blue RGBA to RGB555', () => expect(rgbaToRgb555(0, 0, 255)).toBe(0x001f));
  it('converts black RGBA to RGB555', () => expect(rgbaToRgb555(0, 0, 0)).toBe(0x0000));
  it('converts white RGBA to RGB555', () => expect(rgbaToRgb555(255, 255, 255)).toBe(0x7fff));
  it('keeps RGB555 channels within five bits', () => {
    for (let i = 0; i < 256; i += 16) {
      const value = rgbaToRgb555(i, i, i);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(0x7fff);
    }
  });
});

describe('script resource helpers', () => {
  it('round-trips scripts and bindings through resources', () => {
    const resources = applyScriptResources(
      [],
      [
        {
          id: 128,
          version: SCRIPT_FORMAT_VERSION,
          name: 'Ambush',
          source: 'function onTick(self, ctx)\n  self:setInput(1.0, 0.65)\nend\n',
        },
      ],
      [{ objectTypeId: 200, scriptId: 128, flags: 0 }],
    );
    const extracted = extractScriptResources(resources);
    expect(extracted.scripts).toEqual([
      {
        id: 128,
        version: SCRIPT_FORMAT_VERSION,
        name: 'Ambush',
        source: 'function onTick(self, ctx)\n  self:setInput(1.0, 0.65)\nend\n',
      },
    ]);
    expect(extracted.bindings).toEqual([{ objectTypeId: 200, scriptId: 128, flags: 0 }]);
    expect(extracted.levelBindings).toEqual([]);
    expect(extracted.issues).toEqual([]);
  });

  it('strips only scripting resources', () => {
    const resources = applyScriptResources(
      [{ type: 'Pack', id: 140, data: new Uint8Array([1, 2, 3]) }],
      [
        {
          id: 128,
          version: SCRIPT_FORMAT_VERSION,
          name: 'Ambush',
          source: 'function onTick(self, ctx)\nend\n',
        },
      ],
      [{ objectTypeId: 200, scriptId: 128, flags: 0 }],
    );
    resources.push({
      type: LEVEL_SCRIPT_BINDINGS_RESOURCE_TYPE,
      id: LEVEL_SCRIPT_BINDINGS_RESOURCE_ID,
      data: serializeLevelScriptBindings([{ levelResourceId: 140, scriptId: 128, flags: 0 }]),
    });
    const stripped = stripScriptResources(resources);
    expect(stripped).toEqual([{ type: 'Pack', id: 140, data: new Uint8Array([1, 2, 3]) }]);
    expect(extractScriptResources(stripped).scripts).toEqual([]);
    expect(extractScriptResources(stripped).bindings).toEqual([]);
    expect(extractScriptResources(stripped).levelBindings).toEqual([]);
  });
});
