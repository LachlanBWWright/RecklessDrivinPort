import { TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { vi } from 'vitest';
import { App } from './app';
import { manageEditorLevels } from './app-level-management';
import { blankLevelData } from './level-management';
import { LevelEditorService } from './level-editor.service';
import { encodePackHandle } from './pack-parser.service';

it('flushes pending fields before a structural edit and clears stale history without saving over moved slots', async () => {
  await TestBed.configureTestingModule({
    declarations: [App],
    schemas: [NO_ERRORS_SCHEMA],
  }).compileComponents();
  const app = TestBed.createComponent(App).componentInstance;
  const levels = new LevelEditorService().extractParsedLevels([
    { type: 'Pack', id: 140, data: encodePackHandle([{ id: 1, data: blankLevelData(128) }], 140) },
  ]);
  app.parsedLevels.set(levels);
  app.selectedLevelId.set(140);
  app.propertiesDirty.set(true);
  app.editTime.set(321);
  app._pushUndo('props');
  app.objectTypesDirty.set(true);
  app.levelScriptBindings.set([{ levelResourceId: 140, scriptId: 129, flags: 0 }]);
  app.propertiesSaveTimer = setTimeout(() => {}, 60_000);
  app.objectGroupsSaveTimer = setTimeout(() => {}, 60_000);
  app.objectTypesSaveTimer = setTimeout(() => {}, 60_000);
  app._markAutoSaveTimer = setTimeout(() => {}, 60_000);
  let releaseFlush: (() => void) | undefined;
  const flushWait = new Promise<void>((resolve) => {
    releaseFlush = resolve;
  });
  const dispatch = vi.spyOn(app.runtime, 'dispatchWorker').mockImplementation(async (cmd) => {
    if (cmd === 'APPLY_PROPS') await flushWait;
    if (cmd === 'MANAGE_LEVELS')
      return {
        levels: levels.map((level) => ({ ...level, resourceId: 141 })),
        selectedLevelId: 141,
        levelScriptBindings: [],
      };
    return {};
  });
  const save = vi.spyOn(app, 'saveLevelProperties');
  const running = manageEditorLevels(app, 'new');
  expect(dispatch.mock.calls.some(([cmd]) => cmd === 'MANAGE_LEVELS')).toBe(false);
  await vi.waitFor(() => {
    expect(dispatch.mock.calls.find(([cmd]) => cmd === 'APPLY_PROPS')?.[1]).toEqual(
      expect.objectContaining({ props: expect.objectContaining({ time: 321 }) }),
    );
  });
  expect(dispatch.mock.calls.find(([cmd]) => cmd === 'APPLY_SCRIPTS')?.[1]).toEqual(
    expect.objectContaining({ levelBindings: app.levelScriptBindings() }),
  );
  releaseFlush?.();
  await running;
  expect(dispatch.mock.calls.at(-1)?.[0]).toBe('MANAGE_LEVELS');
  expect(app.selectedLevelId()).toBe(141);
  expect(app.propertiesSaveTimer).toBeNull();
  expect(app.objectGroupsSaveTimer).toBeNull();
  expect(app.objectTypesSaveTimer).toBeNull();
  expect(app._markAutoSaveTimer).toBeNull();
  expect(app.canUndo()).toBe(false);
  expect(app.propertiesDirty()).toBe(false);
  expect(app.objectTypesDirty()).toBe(false);
  expect(save).not.toHaveBeenCalled();
  expect(app.workerBusy()).toBe(false);
});
