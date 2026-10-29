import { EditorWaypointsComponent } from './editor-waypoints.component';
import type { TrackWaypointEdit } from '../../../waypoint-editing';
import { TestBed } from '@angular/core/testing';
import { App } from '../../../app';
import { AppModule } from '../../../app-module';
import { EditorObjectsSectionComponent } from './editor-objects-section.component';
import { LevelEditorService } from '../../../level-editor.service';
import { blankLevelData } from '../../../level-management';
import { encodePackHandle } from '../../../pack-parser.service';

it('updates nested Undo controls after a waypoint edit and opens Tracks for canvas selection', async () => {
  await TestBed.configureTestingModule({ imports: [AppModule] }).compileComponents();
  const fixture = TestBed.createComponent(EditorObjectsSectionComponent);
  const level = new LevelEditorService().extractParsedLevels([
    { type: 'Pack', id: 140, data: encodePackHandle([{ id: 1, data: blankLevelData(128) }], 140) },
  ])[0];
  const app = TestBed.createComponent(App).componentInstance;
  app.parsedLevels.set([level]);
  app.selectLevel(140);
  app.objects.set([{ x: 10, y: 20, dir: 0, typeRes: 128 }]);
  fixture.componentRef.setInput('objects', app.objects());
  fixture.componentRef.setInput('selectedLevel', level);
  fixture.componentRef.setInput('editTrackUp', level.trackUp);
  fixture.componentRef.setInput('editTrackDown', level.trackDown);
  fixture.detectChanges();
  const root: unknown = fixture.nativeElement;
  expect(root).toBeInstanceOf(HTMLElement);
  if (!(root instanceof HTMLElement)) return;
  const undo = root.querySelector('button[aria-label="Undo (Ctrl+Z)"]');
  expect(undo).toBeInstanceOf(HTMLButtonElement);
  if (!(undo instanceof HTMLButtonElement)) return;
  expect(undo.disabled).toBe(true);

  // This is the same input transition produced by a canvas waypoint click.
  app.selectedTrackWaypoint.set({ track: 'up', segIdx: 0 });
  fixture.componentRef.setInput('selectedTrackWaypoint', app.selectedTrackWaypoint());
  fixture.detectChanges();
  const speed = root.querySelector('app-editor-waypoints input[type="number"]');
  expect(speed).toBeInstanceOf(HTMLInputElement);
  if (!(speed instanceof HTMLInputElement)) return;
  fixture.componentInstance.waypointEdit.subscribe((edit) => {
    app.applyWaypointEdit(edit);
    fixture.componentRef.setInput('canUndo', app.canUndo());
  });
  speed.value = '41';
  speed.dispatchEvent(new Event('change', { bubbles: true }));
  fixture.detectChanges();
  expect(app.editTrackUp()[0].velo).toBe(41);
  expect(app.canUndo()).toBe(true);
  expect(undo.disabled).toBe(false);

  // Changing selection elsewhere must refresh the sidebar despite its stable state input.
  app.selectObject(0);
  fixture.componentRef.setInput('selectedTrackWaypoint', app.selectedTrackWaypoint());
  fixture.componentRef.setInput('selectedObjIndex', app.selectedObjIndex());
  fixture.detectChanges();
  expect(root.querySelector('app-editor-waypoints')).toBeNull();
  expect(root.querySelector('app-object-type-selector mat-select')).not.toBeNull();
  fixture.componentRef.setInput('selectedTrackWaypoint', { track: 'down', segIdx: 0 });
  fixture.componentRef.setInput('selectedObjIndex', null);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  const track = root.querySelector('app-editor-waypoints select');
  expect(track).toBeInstanceOf(HTMLSelectElement);
  if (track instanceof HTMLSelectElement) expect(track.value).toBe('down');
});

it('reads both range endpoints from the rendered selectors and exposes only three behavior modes', async () => {
  await TestBed.configureTestingModule({ imports: [AppModule] }).compileComponents();
  const fixture = TestBed.createComponent(EditorWaypointsComponent);
  fixture.componentRef.setInput(
    'trackUp',
    Array.from({ length: 4 }, (_, index) => ({ x: 0, y: index * 100, velo: 25, flags: 1 })),
  );
  fixture.componentRef.setInput('selection', { track: 'up', segIdx: 0 });
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.componentInstance.openRange();
  fixture.detectChanges();
  await fixture.whenStable();
  const root: unknown = fixture.nativeElement;
  if (!(root instanceof HTMLElement)) return;
  expect(root.querySelectorAll('input[type="number"]')).toHaveLength(1);
  expect(root.querySelectorAll('input[type="radio"]')).toHaveLength(3);
  const selects = root.querySelectorAll('select');
  const first = selects[2];
  const last = selects[3];
  first.value = first.options[1].value;
  first.dispatchEvent(new Event('change', { bubbles: true }));
  fixture.detectChanges();
  last.value = last.options[3].value;
  last.dispatchEvent(new Event('change', { bubbles: true }));
  fixture.detectChanges();
  const edits: TrackWaypointEdit[] = [];
  fixture.componentInstance.waypointEdit.subscribe((edit) => edits.push(edit));
  const apply = Array.from(root.querySelectorAll('button')).find(
    (button) => button.textContent?.trim() === 'Apply',
  );
  expect(apply).toBeDefined();
  apply?.click();
  expect(edits).toEqual([{ track: 'up', index: 1, endIndex: 3, velo: 25, flags: 1 }]);
});
