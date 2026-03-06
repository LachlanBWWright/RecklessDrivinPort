import { LevelEditorService } from './level-editor.service';
import type { ResourceDatEntry } from './resource-dat.service';

describe('LevelEditorService', () => {
  const service = new LevelEditorService();

  it('extracts editable levels from pack resources', () => {
    const resources: ResourceDatEntry[] = [
      {
        type: 'Pack',
        id: 140,
        data: new Uint8Array(Array.from({ length: 512 }, (_, i) => i % 16)),
      },
    ];

    const levels = service.extractLevels(resources);
    expect(levels).toHaveLength(1);
    expect(levels[0].resourceId).toBe(140);
    expect(levels[0].tiles).toHaveLength(256);
    expect(levels[0].tiles[0]).toBe(0);
    expect(levels[0].tiles[15]).toBe(15);
  });

  it('applies tile changes to the original pack payload', () => {
    const resources: ResourceDatEntry[] = [
      {
        type: 'Pack',
        id: 140,
        data: new Uint8Array(512),
      },
    ];

    const levels = service.extractLevels(resources);
    levels[0].tiles[5] = 9;

    const updated = service.applyLevels(resources, levels);
    const edited = updated[0];
    expect(edited.data[5]).toBe(9);
  });

  it('lists and edits sprite-like PPic assets', () => {
    const resources: ResourceDatEntry[] = [
      {
        type: 'PPic',
        id: 1000,
        data: new Uint8Array([10, 20, 30]),
      },
    ];

    const assets = service.extractSpriteAssets(resources);
    expect(assets).toHaveLength(1);

    const updated = service.applySpriteByte(resources, 1000, 1, 77);
    expect(updated[0].data[1]).toBe(77);
  });
});
