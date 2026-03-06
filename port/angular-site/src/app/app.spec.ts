import { TestBed } from '@angular/core/testing';
import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [App],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render the game title', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain("Reckless Drivin'");
  });

  it('should default to the game tab', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app.activeTab()).toBe('game');
  });

  it('should switch to the editor tab when setTab is called', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    app.setTab('editor');
    expect(app.activeTab()).toBe('editor');
  });

  it('should switch back to the game tab from the editor tab', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    app.setTab('editor');
    app.setTab('game');
    expect(app.activeTab()).toBe('game');
  });

  it('should show the game panel when on the game tab', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    const gamePanel = compiled.querySelector('#panel-game');
    expect(gamePanel).toBeTruthy();
    expect(gamePanel?.classList.contains('tab-panel--hidden')).toBe(false);
  });

  it('should hide the game panel when on the editor tab', async () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    app.setTab('editor');
    fixture.detectChanges();
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    const gamePanel = compiled.querySelector('#panel-game');
    expect(gamePanel?.classList.contains('tab-panel--hidden')).toBe(true);
  });

  it('should show the editor panel when on the editor tab', async () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    app.setTab('editor');
    fixture.detectChanges();
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('#panel-editor')).toBeTruthy();
  });

  it('should not render the editor panel when on the game tab', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('#panel-editor')).toBeNull();
  });
});
