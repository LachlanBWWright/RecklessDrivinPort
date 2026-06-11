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
