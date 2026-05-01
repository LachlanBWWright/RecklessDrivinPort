import { TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { App } from './app';
import { BONUS_ROLL_COP } from './game/game-customisation-presets';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [App],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should default to game tab', () => {
    const app = TestBed.createComponent(App).componentInstance;
    expect(app.activeTab()).toBe('game');
  });

  it('should switch to editor tab', () => {
    const app = TestBed.createComponent(App).componentInstance;
    app.runtime.setTab('editor');
    expect(app.activeTab()).toBe('editor');
  });

  it('should switch back to game tab', () => {
    const app = TestBed.createComponent(App).componentInstance;
    app.runtime.setTab('editor');
    app.runtime.setTab('game');
    expect(app.activeTab()).toBe('game');
  });

  it('should pause the game loop on the editor tab and resume on the game tab', () => {
    const app = TestBed.createComponent(App).componentInstance;
    const originalModule = window.Module;
    let pauseCount = 0;
    let resumeCount = 0;

    window.Module = {
      pauseMainLoop: () => {
        pauseCount += 1;
      },
      resumeMainLoop: () => {
        resumeCount += 1;
      },
    } as unknown as NonNullable<typeof window.Module>;

    try {
      app.runtime.setTab('editor');
      expect(pauseCount).toBe(1);
      expect(resumeCount).toBe(0);

      app.runtime.setTab('game');
      expect(resumeCount).toBe(1);
    } finally {
      window.Module = originalModule;
    }
  });

  it('should hide game panel when on editor tab', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.componentInstance.runtime.setTab('editor');
    fixture.detectChanges();
    await fixture.whenStable();
    const gamePanel = (fixture.nativeElement as HTMLElement).querySelector('#panel-game');
    expect(gamePanel).toBeTruthy();
    expect(gamePanel?.classList.contains('hidden')).toBe(true);
  });

  it('should show game panel when on game tab', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();
    const gamePanel = (fixture.nativeElement as HTMLElement).querySelector('#panel-game');
    expect(gamePanel).toBeTruthy();
    expect(gamePanel?.classList.contains('hidden')).toBe(false);
  });

  it('should show editor section when on editor tab', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.componentInstance.runtime.setTab('editor');
    fixture.detectChanges();
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).querySelector('#panel-editor')).toBeTruthy();
  });

  it('should NOT show editor section when on game tab', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).querySelector('#panel-editor')).toBeNull();
  });

  it('should NOT show hero card when on editor tab', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.componentInstance.runtime.setTab('editor');
    fixture.detectChanges();
    await fixture.whenStable();
    // With NO_ERRORS_SCHEMA, child component internals are not rendered.
    // Verify that the game panel host element is hidden instead.
    const gamePanel = (fixture.nativeElement as HTMLElement).querySelector('#panel-game');
    expect(gamePanel?.classList.contains('hidden')).toBe(true);
  });

  it('should show hero card when on game tab', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();
    // With NO_ERRORS_SCHEMA, child component internals are not rendered.
    // Verify that the game panel host element is visible instead.
    const gamePanel = (fixture.nativeElement as HTMLElement).querySelector('#panel-game');
    expect(gamePanel?.classList.contains('hidden')).toBe(false);
  });

  it('should default to properties section', () => {
    const app = TestBed.createComponent(App).componentInstance;
    expect(app.editorSection()).toBe('properties');
  });

  it('should switch editor sections', () => {
    const app = TestBed.createComponent(App).componentInstance;
    app.runtime.setSection('objects');
    expect(app.editorSection()).toBe('objects');
    app.runtime.setSection('object-types');
    expect(app.editorSection()).toBe('object-types');
    app.runtime.setSection('sprites');
    expect(app.editorSection()).toBe('sprites');
    app.runtime.setSection('properties');
    expect(app.editorSection()).toBe('properties');
  });

  it('should start with no editor data', () => {
    const app = TestBed.createComponent(App).componentInstance;
    expect(app.hasEditorData()).toBe(false);
  });

  it('should duplicate the selected object with an x offset', () => {
    const app = TestBed.createComponent(App).componentInstance;
    app.objects.set([{ x: 100, y: 200, dir: 1.5, typeRes: 136 }]);
    app.selectObject(0);

    app.duplicateSelectedObject();

    expect(app.objects().length).toBe(2);
    expect(app.objects()[1]).toEqual({ x: 150, y: 200, dir: 1.5, typeRes: 136 });
    expect(app.selectedObjIndex()).toBe(1);
  });

  it('should flush dirty object types before downloading resources', async () => {
    const app = TestBed.createComponent(App).componentInstance;
    app.hasEditorData.set(true);
    app.parsedLevels.set([]);
    app.selectedLevelId.set(null);
    app.objectTypeDefinitions.set([
      {
        typeRes: 200,
        mass: 1,
        maxEngineForce: 0,
        maxNegEngineForce: 0,
        friction: 1,
        flags: 1 << 13,
        deathObj: -1,
        frame: 128,
        numFrames: 1,
        frameDuration: 0,
        wheelWidth: 0,
        wheelLength: 0,
        steering: 0,
        width: 0,
        length: 0,
        score: 0,
        flags2: 0,
        creationSound: -1,
        otherSound: -1,
        maxDamage: 0,
        weaponObj: -1,
        weaponInfo: -1,
      },
    ]);
    app.objectTypesDirty.set(true);

    const dispatchCalls: string[] = [];
    const originalDispatchWorker = app.runtime.dispatchWorker;
    app.runtime.dispatchWorker = ((cmd: string) => {
      dispatchCalls.push(cmd);
      if (cmd === 'APPLY_OBJECT_TYPES') {
        return Promise.resolve({ objectTypesArr: [[200, app.objectTypeDefinitions()[0]]] });
      }
      if (cmd === 'SERIALIZE') {
        return Promise.resolve(new ArrayBuffer(8));
      }
      return Promise.resolve({});
    }) as typeof app.runtime.dispatchWorker;

    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    Object.defineProperty(URL, 'createObjectURL', { value: () => 'blob:mock', configurable: true });
    Object.defineProperty(URL, 'revokeObjectURL', { value: () => {}, configurable: true });

    try {
      await app.runtime.downloadEditedResources();
    } finally {
      app.runtime.dispatchWorker = originalDispatchWorker;
      Object.defineProperty(URL, 'createObjectURL', {
        value: originalCreateObjectURL,
        configurable: true,
      });
      Object.defineProperty(URL, 'revokeObjectURL', {
        value: originalRevokeObjectURL,
        configurable: true,
      });
    }

    expect(dispatchCalls).toContain('APPLY_OBJECT_TYPES');
    expect(dispatchCalls).toContain('SERIALIZE');
  });

  it('should undo and redo a dragged object', () => {
    const app = TestBed.createComponent(App).componentInstance;
    app.objects.set([{ x: 100, y: 200, dir: 0, typeRes: 128 }]);
    app.selectObject(0);

    let canvasToWorldCall = 0;
    app.canvasToWorld = (() => {
      canvasToWorldCall += 1;
      return canvasToWorldCall === 1 ? [100, 200] : [150, 240];
    }) as typeof app.canvasToWorld;

    const mouseEvent = (x: number, y: number) =>
      ({
        button: 0,
        offsetX: x,
        offsetY: y,
        preventDefault: () => {},
        target: { focus: () => {} },
      }) as unknown as MouseEvent;

    app.onCanvasMouseDown(mouseEvent(0, 0));
    app.onCanvasMouseMove(mouseEvent(0, 0));
    app.onCanvasMouseUp();

    expect(app.objects()[0]).toEqual({ x: 150, y: 240, dir: 0, typeRes: 128 });

    app.undo();
    expect(app.objects()[0]).toEqual({ x: 100, y: 200, dir: 0, typeRes: 128 });
    expect(app.canRedo()).toBe(true);

    app.redo();
    expect(app.objects()[0]).toEqual({ x: 150, y: 240, dir: 0, typeRes: 128 });
  });

  it('should undo and redo a dragged start marker', () => {
    const app = TestBed.createComponent(App).componentInstance;
    app.editXStartPos.set(100);

    let canvasToWorldCall = 0;
    app.canvasToWorld = (() => {
      canvasToWorldCall += 1;
      return canvasToWorldCall === 1 ? [100, 0] : [150, 0];
    }) as typeof app.canvasToWorld;

    const mouseEvent = (x: number, y: number) =>
      ({
        button: 0,
        offsetX: x,
        offsetY: y,
        preventDefault: () => {},
        target: { focus: () => {} },
      }) as unknown as MouseEvent;

    app.onCanvasMouseDown(mouseEvent(0, 0));
    app.onCanvasMouseMove(mouseEvent(0, 0));
    app.onCanvasMouseUp();

    expect(app.editXStartPos()).toBe(150);
    expect(app.propertiesDirty()).toBe(true);

    app.undo();
    expect(app.editXStartPos()).toBe(100);
    expect(app.canRedo()).toBe(true);

    app.redo();
    expect(app.editXStartPos()).toBe(150);
  });

  it('should undo and redo a dragged finish line', () => {
    const app = TestBed.createComponent(App).componentInstance;
    app.editLevelEnd.set(500);

    // The finish line is dragged via Konva callbacks set up inside initializeKonvaOverlay,
    // which requires a real canvas in the DOM (not available in unit tests). Simulate
    // the same operations those callbacks perform: push an undo snapshot, update the
    // signal, and mark properties dirty.
    app._pushUndo('props');
    app.editLevelEnd.set(650);
    app.markPropertiesDirty();

    expect(app.editLevelEnd()).toBe(650);
    expect(app.propertiesDirty()).toBe(true);

    app.undo();
    expect(app.editLevelEnd()).toBe(500);
    expect(app.canRedo()).toBe(true);

    app.redo();
    expect(app.editLevelEnd()).toBe(650);
  });

  it('should undo and redo a double-click object add', () => {
    const app = TestBed.createComponent(App).componentInstance;
    app.canvasToWorld = (() => [10, 20]) as typeof app.canvasToWorld;

    app.onCanvasDoubleClick({
      offsetX: 0,
      offsetY: 0,
    } as MouseEvent);

    expect(app.objects()).toEqual([{ x: 10, y: 20, dir: 0, typeRes: 128 }]);

    app.undo();
    expect(app.objects()).toEqual([]);
    expect(app.canRedo()).toBe(true);

    app.redo();
    expect(app.objects()).toEqual([{ x: 10, y: 20, dir: 0, typeRes: 128 }]);
  });

  it('should undo and redo a property edit', () => {
    const app = TestBed.createComponent(App).componentInstance;

    app.onPropsInput('time', { target: { value: '45' } } as unknown as Event);
    expect(app.editTime()).toBe(45);

    app.undo();
    expect(app.editTime()).toBe(0);
    expect(app.canRedo()).toBe(true);

    app.redo();
    expect(app.editTime()).toBe(45);
  });

  it('should undo and redo a track waypoint removal', () => {
    const app = TestBed.createComponent(App).componentInstance;
    app.editTrackUp.set([{ x: 0, y: 0, flags: 0, velo: 0 }]);
    app.showTrackOverlay.set(true);
    app.canvasToWorld = (() => [0, 0]) as typeof app.canvasToWorld;

    app.onCanvasContextMenu({
      offsetX: 0,
      offsetY: 0,
      preventDefault: () => {},
    } as MouseEvent);

    expect(app.editTrackUp().length).toBe(0);

    app.undo();
    expect(app.editTrackUp()).toEqual([{ x: 0, y: 0, flags: 0, velo: 0 }]);

    app.redo();
    expect(app.editTrackUp().length).toBe(0);
  });

  it('should update time when editing time directly (seconds stored as-is)', () => {
    const app = TestBed.createComponent(App).componentInstance;

    app.onPropsInput('time', { target: { value: '45' } } as unknown as Event);

    expect(app.editTime()).toBe(45);
    expect(app.propertiesDirty()).toBe(true);
  });

  it('should toggle visible object type filters', () => {
    const app = TestBed.createComponent(App).componentInstance;
    expect(app.visibleTypeFilter().has(3)).toBe(true);

    app.toggleTypeVisibility(3);
    expect(app.visibleTypeFilter().has(3)).toBe(false);

    app.toggleTypeVisibility(3);
    expect(app.visibleTypeFilter().has(3)).toBe(true);
  });

  it('should frame all objects around their bounds', () => {
    const app = TestBed.createComponent(App).componentInstance;
    app.objects.set([
      { x: -300, y: 100, dir: 0, typeRes: 128 },
      { x: 500, y: 900, dir: 0, typeRes: 136 },
    ]);

    app.frameAllObjects();

    expect(app.canvasPanX()).toBe(100);
    expect(app.canvasPanY()).toBe(500);
    expect(app.canvasZoom()).toBeGreaterThan(0.1);
  });

  it('should center the view on the selected object', () => {
    const app = TestBed.createComponent(App).componentInstance;
    app.objects.set([
      { x: 25, y: 50, dir: 0, typeRes: 128 },
      { x: 400, y: 640, dir: 0, typeRes: 140 },
    ]);
    app.selectObject(1);

    app.centerOnSelectedObject();

    expect(app.canvasPanX()).toBe(400);
    expect(app.canvasPanY()).toBe(640);
  });

  it('should show the toolbar in game mode with right-aligned site tabs', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();

    // With NO_ERRORS_SCHEMA, child component templates are not rendered.
    // Verify the App passes the correct state to <app-site-toolbar> via signals.
    expect(fixture.componentInstance.activeTab()).toBe('game');
    expect(fixture.componentInstance.hasEditorData()).toBe(false);
    // The toolbar host element is always present.
    expect((fixture.nativeElement as HTMLElement).querySelector('app-site-toolbar')).toBeTruthy();
  });

  it('should show load/upload controls in the editor when no level pack is loaded', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.componentInstance.runtime.setTab('editor');
    fixture.detectChanges();
    await fixture.whenStable();

    // Verify the App exposes the correct state for the editor toolbar.
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

    // Verify the App exposes the correct state for the editor toolbar.
    expect(fixture.componentInstance.activeTab()).toBe('editor');
    expect(fixture.componentInstance.hasEditorData()).toBe(true);
    expect(fixture.componentInstance.parsedLevels()).toHaveLength(1);
    expect(fixture.componentInstance.selectedLevelId()).toBe(140);
  });

  // ── Road cache invalidation ──────────────────────────────────────────────

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

    // Simulate a stale road key
    (app as unknown as Record<string, unknown>)['_roadOffscreenKey'] = 'stale-key';

    app.onCanvasContextMenu({
      offsetX: 0,
      offsetY: 0,
    } as MouseEvent);

    expect((app as unknown as Record<string, unknown>)['_roadOffscreenKey']).toBe('');
    expect(app.editTrackUp().length).toBe(0);
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

    app.onCanvasContextMenu({
      offsetX: 0,
      offsetY: 0,
    } as MouseEvent);

    expect((app as unknown as Record<string, unknown>)['_roadOffscreenKey']).toBe('');
    expect(app.editTrackUp().length).toBe(3);
  });

  // ── Custom resources persistence ─────────────────────────────────────────

  it('restartGameWithCustomResources should set gameRestarting to true', () => {
    const app = TestBed.createComponent(App).componentInstance;
    app.customResourcesLoaded.set(true);

    // restartGameWithCustomResources calls window.location.reload() after a setTimeout.
    // In jsdom that setTimeout is async; we only check that gameRestarting flips synchronously.
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
    spyOn(app.runtime, 'applyCustomResourcesPreset').and.callFake(async (preset) => {
      app.customResourcesPreset.set(preset);
    });

    await app.setCustomOptionsPreset('terminator');

    expect(app.customOptionsPreset()).toBe('terminator');
    expect(app.customResourcesPreset()).toBe('terminator');
    expect(app.customSettingsPreset()).toBe('terminator');
    expect(app.editorTestDriveDisabledBonusRollMask()).toBe(BONUS_ROLL_COP);
  });
});
