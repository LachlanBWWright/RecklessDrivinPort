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
