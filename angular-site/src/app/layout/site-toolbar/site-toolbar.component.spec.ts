import type { LevelOperation } from '../../level-management';
import { LevelEditorService } from '../../level-editor.service';
import { blankLevelData } from '../../level-management';
import { encodePackHandle } from '../../pack-parser.service';
import { describe, expect, it } from 'vitest';
import { SiteToolbarComponent } from './site-toolbar.component';

describe('SiteToolbarComponent', () => {
  it('opens preview modal and emits only after confirmation', () => {
    const component = new SiteToolbarComponent();
    component.selectedLevelId = 142;

    let emitted: { levelResourceId: number; stripScripts: boolean } | null = null;
    component.previewSelectedLevel.subscribe((value) => {
      emitted = value;
    });

    component.launchSelectedLevelPreview();
    component.stripScriptsForPreview = true;
    expect(component.previewDialogOpen).toBe(true);
    expect(emitted).toBeNull();

    component.confirmPreviewDialog();
    expect(emitted).toEqual({ levelResourceId: 142, stripScripts: true });
    expect(component.previewDialogOpen).toBe(false);
  });

  it('opens download modal and emits strip option after confirmation', () => {
    const component = new SiteToolbarComponent();
    let emitted: boolean | null = null;
    component.downloadEditedResources.subscribe((value) => {
      emitted = value;
    });

    component.launchDownloadDialog();
    component.stripScriptsForDownload = true;
    expect(component.downloadDialogOpen).toBe(true);
    expect(emitted).toBeNull();

    component.confirmDownloadDialog();
    expect(emitted).toBe(true);
    expect(component.downloadDialogOpen).toBe(false);
  });

  it('tracks level-by-level merge checkbox selections', () => {
    const component = new SiteToolbarComponent();
    component.mergeOptions.levels = true;
    component.mergeOptions.levelResourceIds = [140, 141, 142];

    component.onLevelCheckboxChange(141, false);
    expect(component.levelCheckboxChecked(141)).toBe(false);

    component.onLevelCheckboxChange(145, true);
    expect(component.levelCheckboxChecked(145)).toBe(true);
  });
});

describe('level management menu', () => {
  function toolbar(): SiteToolbarComponent {
    const component = new SiteToolbarComponent();
    component.parsedLevels = new LevelEditorService().extractParsedLevels(
      [140, 141].map((id) => ({
        type: 'Pack',
        id,
        data: encodePackHandle([{ id: 1, data: blankLevelData(128) }], id),
      })),
    );
    component.selectedLevelId = 140;
    return component;
  }

  it('requires deletion confirmation and emits only after confirming the captured selection', () => {
    const component = toolbar();
    const operations: LevelOperation[] = [];
    component.manageLevels.subscribe((operation) => operations.push(operation));
    component.requestLevelOperation('delete');
    expect(component.deleteLevelId).toBe(140);
    expect(operations).toEqual([]);
    component.confirmDeleteLevel();
    expect(operations).toEqual(['delete']);
    expect(component.deleteLevelId).toBeNull();
  });

  it('cancels deletion on level selection or another menu action', () => {
    const component = toolbar();
    const operations: LevelOperation[] = [];
    component.manageLevels.subscribe((operation) => operations.push(operation));
    component.requestLevelOperation('delete');
    component.selectManagedLevel(141);
    component.selectedLevelId = 141;
    component.confirmDeleteLevel();
    expect(operations).toEqual([]);
    component.requestLevelOperation('delete');
    component.requestLevelOperation('earlier');
    expect(component.deleteLevelId).toBeNull();
    expect(operations).toEqual(['earlier']);
  });

  it('refuses confirmation after the selection changes or while processing', () => {
    const component = toolbar();
    const operations: LevelOperation[] = [];
    component.manageLevels.subscribe((operation) => operations.push(operation));
    component.requestLevelOperation('delete');
    component.selectedLevelId = 141;
    component.confirmDeleteLevel();
    component.requestLevelOperation('delete');
    component.workerBusy = true;
    component.confirmDeleteLevel();
    expect(operations).toEqual([]);
  });
});
