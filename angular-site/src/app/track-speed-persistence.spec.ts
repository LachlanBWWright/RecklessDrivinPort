import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LevelEditorService } from './level-editor.service';
import { ResourceDatService } from './resource-dat.service';

it('persists a 30 to 100 speed edit on one whole track through resources.dat export and reload', () => {
  const dat = new ResourceDatService();
  const editor = new LevelEditorService();
  const original = dat.parse(new Uint8Array(readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), '../../../port/resources/resources.dat'),
  )));
  expect(original.isOk()).toBe(true);
  if (original.isErr()) return;
  const levels = editor.extractParsedLevels(original.value);
  const level = levels[0];
  expect(level.trackUp.some((point) => point.velo === 30)).toBe(true);
  const edited = level.trackUp.map((point) => ({ ...point, velo: 100 }));
  const updated = editor.applyLevelTrack(original.value, level.resourceId, edited, level.trackDown);
  const reloaded = dat.serialize(updated).andThen((bytes) => dat.parse(bytes));
  expect(reloaded.isOk()).toBe(true);
  if (reloaded.isErr()) return;
  const savedLevels = editor.extractParsedLevels(reloaded.value);
  const saved = savedLevels.find((item) => item.resourceId === level.resourceId);
  expect(saved?.trackUp).toEqual(edited);
  expect(saved?.trackDown).toEqual(level.trackDown);
  expect(savedLevels.slice(1)).toEqual(levels.slice(1));
});
