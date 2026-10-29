import { ChangeDetectorRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AppStateResources } from './app-state-resources';
import { changesOpaqueResource, EditorChangeEncoder } from './app-editor-changes';
import { KonvaEditorService } from './konva-editor.service';
import type { ParsedLevel } from './level-editor.service';

function level(resourceId: number): ParsedLevel {
  return {
    resourceId,
    properties: { roadInfo: 128, time: 120, xStartPos: 0, levelEnd: 1000, objectGroups: [] },
    objectGroups: [],
    objects: [{ x: 10, y: 50, dir: 0, typeRes: 128 }],
    marks: [],
    trackUp: [{ flags: 0, x: 10, y: 20, velo: 30 }],
    trackDown: [],
    roadSegs: [{ v0: -100, v1: -10, v2: 10, v3: 100 }],
    roadSegCount: 1,
    rawEntry1: new Uint8Array(),
    rawEntry2: new Uint8Array(),
    encrypted: false,
  };
}

function selectLevel(state: AppStateResources, selected: ParsedLevel): void {
  state.selectedLevelId.set(selected.resourceId);
  state.objects.set(selected.objects.map((object) => ({ ...object })));
  state.marks.set(selected.marks.map((mark) => ({ ...mark })));
  state.editTrackUp.set(selected.trackUp.map(({ x, y, flags, velo }) => ({ x, y, flags, velo })));
  state.editTrackDown.set(selected.trackDown.map((point) => ({ ...point })));
  state.editRoadInfo.set(selected.properties.roadInfo);
  state.editTime.set(selected.properties.time);
  state.editXStartPos.set(selected.properties.xStartPos);
  state.editLevelEnd.set(selected.properties.levelEnd);
  state.editObjectGroups.set(selected.objectGroups.map((group) => ({ ...group })));
}

describe('download change tracking', () => {
  let state: AppStateResources;
  let first: ParsedLevel;
  let second: ParsedLevel;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        { provide: ChangeDetectorRef, useValue: {} },
        { provide: MatSnackBar, useValue: {} },
        { provide: KonvaEditorService, useValue: {} },
      ],
    });
    state = TestBed.runInInjectionContext(() => new AppStateResources());
    first = level(140);
    second = level(141);
    state.parsedLevels.set([first, second]);
    state.hasEditorData.set(true);
    selectLevel(state, first);
    state.markDownloadBaseline();
  });

  it('stays clean through selection, camera changes, and background decoding', () => {
    expect(state.hasUndownloadedChanges()).toBe(false);
    selectLevel(state, second);
    state.canvasZoom.set(2);
    state.canvasPanY.set(300);
    state.selectedObjIndex.set(0);
    state.packSpritesVersion.update((version) => version + 1);
    state.roadInfoVersion.update((version) => version + 1);
    expect(state.hasUndownloadedChanges()).toBe(false);
  });

  it('recognizes waypoint edits and becomes clean after undoing to the downloaded data', () => {
    state.editTrackUp.set([{ x: 10, y: 20, flags: 2, velo: 50 }]);
    expect(state.hasUndownloadedChanges()).toBe(true);
    state.editTrackUp.set([{ x: 10, y: 20, flags: 0, velo: 30 }]);
    expect(state.hasUndownloadedChanges()).toBe(false);
  });

  it('keeps edits made during a download dirty after acknowledging its older snapshot', () => {
    state.objects.set([{ x: 50, y: 50, dir: 0, typeRes: 128 }]);
    const snapshot = state.captureDownloadSnapshot();
    state.editTime.set(200);
    state.markDownloadBaseline(snapshot);
    expect(state.hasUndownloadedChanges()).toBe(true);
    state.editTime.set(120);
    expect(state.hasUndownloadedChanges()).toBe(false);
  });

  it('tracks opaque resource writes independently of local level state', () => {
    state.markResourceEdited();
    const snapshot = state.captureDownloadSnapshot();
    state.markResourceEdited();
    state.markDownloadBaseline(snapshot);
    expect(state.hasUndownloadedChanges()).toBe(true);
    state.markDownloadBaseline();
    expect(state.hasUndownloadedChanges()).toBe(false);
  });

  it('does not acknowledge string drafts that are not included in the download', () => {
    state.strListDirty.set(true);
    state.markDownloadBaseline();
    expect(state.hasUndownloadedChanges()).toBe(true);
  });

  it('tracks road geometry, level order, and shared definition edits', () => {
    state.parsedLevels.set([second, first]);
    expect(state.hasUndownloadedChanges()).toBe(true);
    state.parsedLevels.set([first, second]);
    expect(state.hasUndownloadedChanges()).toBe(false);
    state.parsedLevels.set([
      { ...first, roadSegs: [{ v0: -200, v1: -10, v2: 10, v3: 100 }] },
      second,
    ]);
    expect(state.hasUndownloadedChanges()).toBe(true);
    state.markDownloadBaseline();
    state.objectGroupDefinitions.set([{ id: 128, entries: [] }]);
    expect(state.hasUndownloadedChanges()).toBe(true);
  });

  it('clears the indicator when the file is cleared or a new baseline is loaded', () => {
    state.markResourceEdited();
    expect(state.hasUndownloadedChanges()).toBe(true);
    state.hasEditorData.set(false);
    state.resetDownloadBaseline();
    expect(state.hasUndownloadedChanges()).toBe(false);
    state.hasEditorData.set(true);
    state.markDownloadBaseline();
    expect(state.hasUndownloadedChanges()).toBe(false);
  });

  it('does not treat autosave or preview flushing as opaque edits', () => {
    for (const command of [
      'APPLY_TRACK',
      'APPLY_MARKS',
      'APPLY_ROAD_SEGS',
      'APPLY_PROPS',
      'SERIALIZE',
      'DECODE_ROAD_TEXTURES',
    ]) {
      expect(changesOpaqueResource(command)).toBe(false);
    }
    for (const command of [
      'PUT_RESOURCE_RAW',
      'PUT_STR_LIST',
      'PUT_PACK_ENTRY_RAW',
      'APPLY_SPRITE_PACK_PIXELS',
      'APPLY_TILE16_PIXELS',
      'REMOVE_TILE16_TEXTURE',
    ]) {
      expect(changesOpaqueResource(command)).toBe(true);
    }
  });

  it('caches unchanged geometry and normalizes property order', () => {
    const encoder = new EditorChangeEncoder();
    let reads = 0;
    const geometry = [
      {
        get x() {
          reads++;
          return 10;
        },
        y: 20,
      },
    ];
    expect(encoder.encode(geometry)).toBe(encoder.encode([{ y: 20, x: 10 }]));
    const initialReads = reads;
    encoder.encode(geometry);
    expect(reads).toBe(initialReads);
  });
});
