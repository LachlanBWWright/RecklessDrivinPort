import { TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { App } from './app';
import { BONUS_ROLL_COP } from './game/game-customisation-presets';

describe('App editor behavior', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [App],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();
  });

  it('should show the toolbar in game mode with right-aligned site tabs', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.componentInstance.activeTab()).toBe('game');
    expect(fixture.componentInstance.hasEditorData()).toBe(false);
    expect((fixture.nativeElement as HTMLElement).querySelector('app-site-toolbar')).toBeTruthy();
  });

  it('should show load/upload controls in the editor when no level pack is loaded', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.componentInstance.runtime.setTab('editor');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.componentInstance.activeTab()).toBe('editor');
    expect(fixture.componentInstance.hasEditorData()).toBe(false);
    expect(fixture.componentInstance.parsedLevels()).toHaveLength(0);
  });

  it('should show clear/download controls and a level dropdown when the editor has data', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.componentInstance.runtime.setTab('editor');
    fixture.componentInstance.hasEditorData.set(true);
    fixture.componentInstance.parsedLevels.set([
      {
        resourceId: 140,
        objects: [],
        marks: [],
        roadSegs: [],
        roadSegCount: 0,
        properties: { roadInfo: 0, time: 120, xStartPos: 0, levelEnd: 1000, objectGroups: [] },
        objectGroups: [],
        trackUp: [],
        trackDown: [],
        rawEntry1: new Uint8Array(0),
        rawEntry2: new Uint8Array(0),
        encrypted: false,
      },
    ]);
    fixture.componentInstance.selectedLevelId.set(140);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.componentInstance.activeTab()).toBe('editor');
    expect(fixture.componentInstance.hasEditorData()).toBe(true);
    expect(fixture.componentInstance.parsedLevels()).toHaveLength(1);
    expect(fixture.componentInstance.selectedLevelId()).toBe(140);
  });

  it('should clear road offscreen key when inserting a waypoint from the context menu', () => {
    const app = TestBed.createComponent(App).componentInstance;
    app.showTrackOverlay.set(true);
    const roadSegs = Array.from({ length: 5 }, () => ({ v0: -100, v1: -10, v2: 10, v3: 100 }));
    app.parsedLevels.set([
      {
        resourceId: 140,
        objects: [],
        marks: [],
        roadSegs,
        roadSegCount: roadSegs.length,
        properties: { roadInfo: 0, time: 120, xStartPos: 0, levelEnd: 1000, objectGroups: [] },
        objectGroups: [],
        trackUp: [
          { x: -100, y: 0, flags: 0, velo: 0 },
          { x: 100, y: 20, flags: 0, velo: 0 },
        ],
        trackDown: [
          { x: -100, y: 0, flags: 0, velo: 0 },
          { x: 100, y: 20, flags: 0, velo: 0 },
        ],
        rawEntry1: new Uint8Array(0),
        rawEntry2: new Uint8Array(0),
        encrypted: false,
      },
    ]);
    app.selectedLevelId.set(140);
    app.editTrackUp.set([
      { x: -100, y: 0, flags: 0, velo: 0 },
      { x: 100, y: 20, flags: 0, velo: 0 },
    ]);
    app.editTrackDown.set([
      { x: -100, y: 0, flags: 0, velo: 0 },
      { x: 100, y: 20, flags: 0, velo: 0 },
    ]);
    app.canvasToWorld = (() => [0, 200]) as typeof app.canvasToWorld;
    (app as unknown as Record<string, unknown>)['_roadOffscreenKey'] = 'stale-key';
    app.onCanvasContextMenu({ offsetX: 0, offsetY: 0 } as MouseEvent);
    expect((app as unknown as Record<string, unknown>)['_roadOffscreenKey']).toBe('');
    expect(app.editTrackUp().length).toBe(3);
  });

  it('should clear road offscreen key when removing a track waypoint from the context menu', () => {
    const app = TestBed.createComponent(App).componentInstance;
    app.showTrackOverlay.set(true);
    const roadSegs = Array.from({ length: 5 }, () => ({ v0: -100, v1: -20, v2: 20, v3: 100 }));
    app.parsedLevels.set([
      {
        resourceId: 140,
        objects: [],
        marks: [],
        roadSegs,
        roadSegCount: roadSegs.length,
        properties: { roadInfo: 0, time: 120, xStartPos: 0, levelEnd: 1000, objectGroups: [] },
        objectGroups: [],
        trackUp: [{ x: 0, y: 0, flags: 0, velo: 0 }],
        trackDown: [],
        rawEntry1: new Uint8Array(0),
        rawEntry2: new Uint8Array(0),
        encrypted: false,
      },
    ]);
    app.selectedLevelId.set(140);
    app.editTrackUp.set([{ x: 0, y: 0, flags: 0, velo: 0 }]);
    app.canvasToWorld = (() => [0, 0]) as typeof app.canvasToWorld;
    (app as unknown as Record<string, unknown>)['_roadOffscreenKey'] = 'stale-key';
    app.onCanvasContextMenu({ offsetX: 0, offsetY: 0 } as MouseEvent);
    expect((app as unknown as Record<string, unknown>)['_roadOffscreenKey']).toBe('');
    expect(app.editTrackUp().length).toBe(0);
  });

  it('restartGameWithCustomResources should set gameRestarting to true', () => {
    const app = TestBed.createComponent(App).componentInstance;
    app.customResourcesLoaded.set(true);
    app.runtime.restartGameWithCustomResources();
    expect(app.gameRestarting()).toBe(true);
  });

  it('clearCustomResources should reset loaded state', () => {
    const app = TestBed.createComponent(App).componentInstance;
    app.customResourcesLoaded.set(true);
    app.customResourcesName.set('my-resources.dat');
    app.runtime.clearCustomResources();
    expect(app.customResourcesLoaded()).toBe(false);
    expect(app.customResourcesName()).toBeNull();
  });

  it('setCustomSettingsPreset should apply the Terminator settings', () => {
    const app = TestBed.createComponent(App).componentInstance;
    app.editorTestDriveUseStartY.set(true);
    app.editorTestDriveUseObjectGroupStartY.set(true);
    app.editorTestDriveForcedAddOns.set(7);
    app.editorTestDriveDisabledBonusRollMask.set(3);
    app.setCustomSettingsPreset('terminator');
    expect(app.customSettingsPreset()).toBe('terminator');
    expect(app.customOptionsPreset()).toBe('manual');
    expect(app.editorTestDriveUseStartY()).toBe(false);
    expect(app.editorTestDriveUseObjectGroupStartY()).toBe(false);
    expect(app.editorTestDriveForcedAddOns()).toBe(0);
    expect(app.editorTestDriveDisabledBonusRollMask()).toBe(BONUS_ROLL_COP);
  });

  it('setCustomOptionsPreset should apply linked Terminator presets', async () => {
    const app = TestBed.createComponent(App).componentInstance;
    app.runtime.applyCustomResourcesPreset = (async (preset) => {
      app.customResourcesPreset.set(preset);
    }) as typeof app.runtime.applyCustomResourcesPreset;
    await app.setCustomOptionsPreset('terminator');
    expect(app.customOptionsPreset()).toBe('terminator');
    expect(app.customResourcesPreset()).toBe('terminator');
    expect(app.customSettingsPreset()).toBe('terminator');
    expect(app.editorTestDriveDisabledBonusRollMask()).toBe(BONUS_ROLL_COP);
  });
});
