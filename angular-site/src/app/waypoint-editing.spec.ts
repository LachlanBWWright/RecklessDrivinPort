import { SimpleChange } from '@angular/core';
import { EditorObjectsSectionComponent } from './editor/sections/objects/editor-objects-section.component';
import { waypointBetween, isValidWaypointEdit } from './waypoint-editing';
import { insertBetweenClosestSegment } from './object-canvas-editing';
import { EditorWaypointsComponent } from './editor/sections/objects/editor-waypoints.component';
import type { TrackWaypointEdit } from './waypoint-editing';

const from = { x: 0, y: 0, flags: 1, velo: 10 };
const to = { x: 100, y: 0, flags: 10, velo: 30 };

describe('AI waypoint editing', () => {
  it('interpolates speed at the projected position and inherits destination flags', () => {
    expect(waypointBetween(from, to, 25, 10)).toEqual({ x: 25, y: 10, flags: 10, velo: 15 });
    expect(waypointBetween(from, to, 150, 10).velo).toBe(30);
    expect(waypointBetween(from, to, -50, 10).velo).toBe(10);
  });

  it('inserts into the nearest segment without mutating existing waypoints', () => {
    const points = [from, to, { x: 200, y: 0, flags: 4, velo: 50 }];
    expect(insertBetweenClosestSegment(points, 150, 10)).toEqual([
      from,
      to,
      { x: 150, y: 10, flags: 4, velo: 40 },
      points[2],
    ]);
    expect(points).toHaveLength(3);
  });

  it('starts empty tracks at a useful traffic speed', () => {
    expect(insertBetweenClosestSegment([], 10, 20)).toEqual([{ x: 10, y: 20, flags: 0, velo: 20 }]);
  });

  it('inherits settings when extending a one-point track and handles coincident neighbors', () => {
    expect(insertBetweenClosestSegment([to], 200, 50)[1]).toEqual({ ...to, x: 200, y: 50 });
    expect(waypointBetween(from, { ...from, velo: 30 }, 0, 0).velo).toBe(20);
  });

  it('rejects invalid speeds, float32 overflow and flags outside the stored UInt16 range', () => {
    const valid: TrackWaypointEdit = { track: 'up', index: 0, velo: 10.5, flags: 65535 };
    expect(isValidWaypointEdit(valid)).toBe(true);
    for (const velo of [-1, Infinity, NaN, Number.MAX_VALUE]) {
      expect(isValidWaypointEdit({ ...valid, velo })).toBe(false);
    }
    for (const flags of [-1, 65536, 1.5, NaN]) {
      expect(isValidWaypointEdit({ ...valid, flags })).toBe(false);
    }
  });

  it('sets mutually exclusive traffic behaviors using the runtime flag values', () => {
    const component = new EditorWaypointsComponent();
    component.trackUp = [{ ...from, flags: 3 }];
    expect(component.behavior).toBe(2);
    const edits: TrackWaypointEdit[] = [];
    component.waypointEdit.subscribe((edit) => edits.push(edit));
    component.changeBehavior(1);
    component.changeBehavior(0);
    component.changeBehavior(2);
    component.changeBehavior(3);
    expect(edits.map((edit) => edit.flags)).toEqual([1, 0, 2]);
  });

  it('applies an inclusive range on the current track with reversed endpoints', () => {
    const component = new EditorWaypointsComponent();
    component.trackDown = [from, to, { ...to, flags: 2 }];
    component.selection = { track: 'down', segIdx: 2 };
    const edits: TrackWaypointEdit[] = [];
    component.waypointEdit.subscribe((edit) => edits.push(edit));
    component.openRange();
    component.rangeStart = 2;
    component.rangeEnd = 0;
    component.applyRange();
    expect(edits).toEqual([{ track: 'down', index: 0, endIndex: 2, velo: 30, flags: 2 }]);
    expect(component.rangeOpen).toBe(false);
  });

  it('uses canvas selection for both tracks and rejects blank numeric inputs', () => {
    const component = new EditorWaypointsComponent();
    component.trackUp = [from];
    component.trackDown = [from, to];
    component.selection = { track: 'down', segIdx: 1 };
    const edits: TrackWaypointEdit[] = [];
    component.waypointEdit.subscribe((edit) => edits.push(edit));
    component.changeSpeed('25');
    expect(edits).toEqual([{ track: 'down', index: 1, velo: 25, flags: 10 }]);
    component.changeSpeed('');
    expect(edits).toHaveLength(1);
    expect(component.error).not.toBe('');
  });
  it('opens Tracks for canvas waypoint selection and Objects for object selection', () => {
    const section = new EditorObjectsSectionComponent();
    const selection = { track: 'up', segIdx: 0 } satisfies NonNullable<
      typeof section.selectedTrackWaypoint
    >;
    section.selectedTrackWaypoint = selection;
    section.ngOnChanges({ selectedTrackWaypoint: new SimpleChange(null, selection, false) });
    expect(section.sidebarTab).toBe('tracks');
    section.selectedTrackWaypoint = null;
    section.selectedObjIndex = 0;
    section.ngOnChanges({ selectedTrackWaypoint: new SimpleChange(selection, null, false) });
    expect(section.sidebarTab).toBe('objects');
  });

  it('deselects the current object when opening Tracks manually', () => {
    const section = new EditorObjectsSectionComponent();
    section.selectedObjIndex = 0;
    let deselected = false;
    section.deselect.subscribe(() => {
      deselected = true;
    });
    section.setSidebarTab('tracks');
    expect(section.sidebarTab).toBe('tracks');
    expect(deselected).toBe(true);
  });
  it('selects the first available waypoint when opening Tracks', () => {
    const section = new EditorObjectsSectionComponent();
    section.editTrackDown = [to];
    const selections: NonNullable<typeof section.selectedTrackWaypoint>[] = [];
    section.trackWaypointSelectionChange.subscribe((selection) => selections.push(selection));
    section.setSidebarTab('tracks');
    expect(selections).toEqual([{ track: 'down', segIdx: 0 }]);
  });
});
