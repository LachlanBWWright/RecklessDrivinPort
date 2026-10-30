import { TestBed } from '@angular/core/testing';
import { OverlayContainer } from '@angular/cdk/overlay';
import { AppModule } from '../app-module';
import { ObjectListComponent } from './object-list.component';
import { EditorObjectsSectionComponent } from './sections/objects/editor-objects-section.component';
import { LevelEditorService } from '../level-editor.service';
import { blankLevelData } from '../level-management';
import { encodePackHandle } from '../pack-parser.service';
import { SiteToolbarDialogsComponent } from '../layout/site-toolbar/site-toolbar-dialogs.component';

beforeEach(async () => {
  await TestBed.configureTestingModule({ imports: [AppModule] }).compileComponents();
});

it('navigates only visible object rows and exposes their selected state without moving canvas focus', () => {
  const fixture = TestBed.createComponent(ObjectListComponent);
  fixture.componentRef.setInput(
    'objects',
    [0, 1, 2].map((x) => ({ x, y: 0, dir: 0, typeRes: 128 })),
  );
  fixture.componentRef.setInput('filteredIndices', [0, 2]);
  fixture.componentRef.setInput('selectedIndex', 0);
  fixture.componentInstance.objectSelected.subscribe((index) =>
    fixture.componentRef.setInput('selectedIndex', index),
  );
  fixture.detectChanges();
  const root: unknown = fixture.nativeElement;
  if (!(root instanceof HTMLElement)) throw new Error('Object list was not rendered');
  const first = root.querySelector<HTMLButtonElement>('button[data-object-index="0"]');
  const last = root.querySelector<HTMLButtonElement>('button[data-object-index="2"]');
  if (!first || !last) throw new Error('Object rows were not rendered');
  first.focus();
  first.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
  fixture.detectChanges();
  expect(document.activeElement).toBe(last);
  expect(last.getAttribute('aria-pressed')).toBe('true');
  expect(first.tabIndex).toBe(-1);
  expect(last.tabIndex).toBe(0);
  last.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
  fixture.detectChanges();
  expect(document.activeElement).toBe(first);
  expect(first.getAttribute('aria-pressed')).toBe('true');
});

it('switches contextual tools with keyboard-accessible sidebar tabs and cancels hidden drawing modes', () => {
  const fixture = TestBed.createComponent(EditorObjectsSectionComponent);
  const level = new LevelEditorService().extractParsedLevels([
    { type: 'Pack', id: 140, data: encodePackHandle([{ id: 1, data: blankLevelData(128) }], 140) },
  ])[0];
  fixture.componentRef.setInput('selectedLevel', level);
  fixture.componentRef.setInput('editTrackUp', level.trackUp);
  fixture.componentRef.setInput('editTrackDown', level.trackDown);
  fixture.detectChanges();
  const root: unknown = fixture.nativeElement;
  if (!(root instanceof HTMLElement)) throw new Error('Editor was not rendered');
  expect(root.querySelector('[aria-label="Object placement"]')).not.toBeNull();
  let drawMode = '';
  fixture.componentInstance.drawModeChange.subscribe((value) => {
    drawMode = value;
  });
  fixture.componentRef.setInput('drawMode', 'curve');
  fixture.componentInstance.setSidebarTab('tracks');
  fixture.detectChanges();
  expect(drawMode).toBe('none');
  expect(root.querySelector('[aria-label="Object placement"]')).toBeNull();
  expect(root.querySelector('[aria-label="Track tools"]')).not.toBeNull();
  expect(root.querySelector('[aria-label="Undo (Ctrl+Z)"]')).not.toBeNull();
  const tracks = root.querySelector<HTMLButtonElement>('[role="tab"][data-mode="tracks"]');
  if (!tracks) throw new Error('Tracks tab was not rendered');
  expect(tracks.getAttribute('aria-selected')).toBe('true');
  tracks.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
  fixture.detectChanges();
  const groups = root.querySelector<HTMLButtonElement>('[role="tab"][data-mode="groups"]');
  expect(fixture.componentInstance.sidebarTab).toBe('groups');
  expect(document.activeElement).toBe(groups);
  expect(groups?.getAttribute('aria-selected')).toBe('true');
  expect(root.querySelector('[role="tabpanel"]')?.getAttribute('aria-labelledby')).toBe(
    'groups-mode-tab',
  );
});

it('opens a named Material preview dialog and closes on Escape without confirming', async () => {
  const fixture = TestBed.createComponent(SiteToolbarDialogsComponent);
  fixture.componentRef.setInput('selectedLevelId', 140);
  fixture.componentRef.setInput('levelDisplayNum', () => 1);
  fixture.componentRef.setInput('previewDialogOpen', true);
  let closed = 0;
  let confirmed = 0;
  fixture.componentInstance.closePreview.subscribe(() => {
    closed++;
  });
  fixture.componentInstance.confirmPreview.subscribe(() => {
    confirmed++;
  });
  fixture.detectChanges();
  await fixture.whenStable();
  const overlay = TestBed.inject(OverlayContainer).getContainerElement();
  const dialog = overlay.querySelector<HTMLElement>('[role="dialog"]');
  expect(dialog?.getAttribute('aria-labelledby')).toBe('preview-dialog-title');
  expect(overlay.querySelector('h2')?.textContent).toContain('Preview selected level');
  dialog?.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }),
  );
  await fixture.whenStable();
  await expect.poll(() => closed, { timeout: 1000 }).toBe(1);
  expect(confirmed).toBe(0);
  expect(overlay.querySelector('[role="dialog"]')).toBeNull();
});
