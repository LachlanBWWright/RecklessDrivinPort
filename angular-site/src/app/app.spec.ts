import { TestBed } from '@angular/core/testing';
import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ declarations: [App] }).compileComponents();
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
    app.setSection('road');
    expect(app.editorSection()).toBe('road');
    app.setSection('sprites');
    expect(app.editorSection()).toBe('sprites');
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

  it('should update raw time when editing friendly seconds', () => {
    const app = TestBed.createComponent(App).componentInstance;

    app.onTimeSecondsInput({ target: { value: '45' } } as unknown as Event);

    expect(app.editTimeSeconds()).toBe(45);
    expect(app.editTime()).toBe(4500);
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
    expect((fixture.nativeElement as HTMLElement).querySelector('.site-nav')).toBeTruthy();
  });

  it('should have nav tabs for game and editor', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();
    const tabs = (fixture.nativeElement as HTMLElement).querySelectorAll('.nav-tab');
    expect(tabs.length).toBe(2);
  });
});
