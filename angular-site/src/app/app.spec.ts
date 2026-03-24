import { TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { App } from './app';

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
    app.setTab('editor');
    expect(app.activeTab()).toBe('editor');
  });

  it('should switch back to game tab', () => {
    const app = TestBed.createComponent(App).componentInstance;
    app.setTab('editor');
    app.setTab('game');
    expect(app.activeTab()).toBe('game');
  });

  it('should pause the game loop on the editor tab and resume on the game tab', () => {
    const app = TestBed.createComponent(App).componentInstance;
    const originalModule = window.Module;
    let pauseCount = 0;
    let resumeCount = 0;

    window.Module = {
      pauseMainLoop: () => { pauseCount += 1; },
      resumeMainLoop: () => { resumeCount += 1; },
    } as unknown as NonNullable<typeof window.Module>;

    try {
      app.setTab('editor');
      expect(pauseCount).toBe(1);
      expect(resumeCount).toBe(0);

      app.setTab('game');
      expect(resumeCount).toBe(1);
    } finally {
      window.Module = originalModule;
    }
  });

  it('should hide game panel when on editor tab', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.componentInstance.setTab('editor');
    fixture.detectChanges();
    await fixture.whenStable();
    const gamePanel = (fixture.nativeElement as HTMLElement).querySelector('#panel-game');
    expect(gamePanel?.classList.contains('tab-panel--hidden')).toBe(true);
  });

  it('should show game panel when on game tab', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();
    const gamePanel = (fixture.nativeElement as HTMLElement).querySelector('#panel-game');
    expect(gamePanel?.classList.contains('tab-panel--hidden')).toBe(false);
  });

  it('should show editor section when on editor tab', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.componentInstance.setTab('editor');
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
    fixture.componentInstance.setTab('editor');
    fixture.detectChanges();
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).querySelector('.hero-card')).toBeNull();
  });

  it('should show hero card when on game tab', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).querySelector('.hero-card')).toBeTruthy();
  });

  it('should default to properties section', () => {
    const app = TestBed.createComponent(App).componentInstance;
    expect(app.editorSection()).toBe('properties');
  });

  it('should switch editor sections', () => {
    const app = TestBed.createComponent(App).componentInstance;
    app.setSection('objects');
    expect(app.editorSection()).toBe('objects');
    app.setSection('sprites');
    expect(app.editorSection()).toBe('sprites');
    app.setSection('properties');
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

  it('should have site-nav in the DOM', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).querySelector('.site-toolbar, .site-nav, mat-toolbar')).toBeTruthy();
  });

  it('should have nav tabs for game and editor', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();
    const tabs = (fixture.nativeElement as HTMLElement).querySelectorAll('.nav-tab');
    expect(tabs.length).toBe(2);
  });

  // ── Road cache invalidation ──────────────────────────────────────────────

  it('should clear road offscreen key when mergeMiddleBarriers is called', () => {
    const app = TestBed.createComponent(App).componentInstance;
    // Set up a level with a median so mergeMiddleBarriers has something to merge
    const roadSegs = Array.from({ length: 5 }, () => ({ v0: -100, v1: -20, v2: 20, v3: 100 }));
    app.parsedLevels.set([{
      resourceId: 140,
      objects: [],
      marks: [],
      roadSegs,
      roadSegCount: roadSegs.length,
      properties: { roadInfo: 0, time: 120, xStartPos: 0, levelEnd: 1000, objectGroups: [] },
      objectGroups: [],
      trackUp: [],
      trackDown: [],
      rawEntry1: new Uint8Array(0),
      rawEntry2: new Uint8Array(0),
      encrypted: false,
    }]);
    app.selectedLevelId.set(140);

    // Simulate a stale road key
    (app as unknown as Record<string, unknown>)['_roadOffscreenKey'] = 'stale-key';

    app.mergeMiddleBarriers();

    expect((app as unknown as Record<string, unknown>)['_roadOffscreenKey']).toBe('');
  });

  it('should clear road offscreen key when splitMiddleBarriers is called', () => {
    const app = TestBed.createComponent(App).componentInstance;
    const roadSegs = Array.from({ length: 5 }, () => ({ v0: -100, v1: -10, v2: 10, v3: 100 }));
    app.parsedLevels.set([{
      resourceId: 140,
      objects: [],
      marks: [],
      roadSegs,
      roadSegCount: roadSegs.length,
      properties: { roadInfo: 0, time: 120, xStartPos: 0, levelEnd: 1000, objectGroups: [] },
      objectGroups: [],
      trackUp: [],
      trackDown: [],
      rawEntry1: new Uint8Array(0),
      rawEntry2: new Uint8Array(0),
      encrypted: false,
    }]);
    app.selectedLevelId.set(140);

    (app as unknown as Record<string, unknown>)['_roadOffscreenKey'] = 'stale-key';

    app.splitMiddleBarriers();

    expect((app as unknown as Record<string, unknown>)['_roadOffscreenKey']).toBe('');
  });

  // ── Custom resources persistence ─────────────────────────────────────────

  it('restartGameWithCustomResources should set gameRestarting to true', () => {
    const app = TestBed.createComponent(App).componentInstance;
    app.customResourcesLoaded.set(true);

    // restartGameWithCustomResources calls window.location.reload() after a setTimeout.
    // In jsdom that setTimeout is async; we only check that gameRestarting flips synchronously.
    app.restartGameWithCustomResources();

    expect(app.gameRestarting()).toBe(true);
  });

  it('clearCustomResources should reset loaded state', () => {
    const app = TestBed.createComponent(App).componentInstance;
    app.customResourcesLoaded.set(true);
    app.customResourcesName.set('my-resources.dat');

    app.clearCustomResources();

    expect(app.customResourcesLoaded()).toBe(false);
    expect(app.customResourcesName()).toBeNull();
  });
});
