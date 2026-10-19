import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const tabs = [
  ['object groups', 'app-editor-object-groups-section'],
  ['object types', 'app-editor-object-types-section'],
  ['objects & tracks', 'app-editor-objects-section'],
  ['sprites', 'app-editor-sprites-section'],
  ['tiles', 'app-editor-tiles-section'],
  ['audio', 'app-editor-audio-section'],
  ['screens', 'app-editor-screens-section'],
] as const;

const tabContent = new Map<string, RegExp>([
  ['object groups', /Object Group Editor/i],
  ['object types', /Object Type Editor/i],
  ['objects & tracks', /Objects|Tracks/i],
  ['sprites', /Sprite Viewer/i],
  ['tiles', /Tile Editor|Tile Images/i],
  ['audio', /Sound Editor|Audio/i],
  ['screens', /Screen/i],
]);

async function loadEditor(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: /level editor/i }).click();
  await page.getByRole('button', { name: /load default/i }).click();
  await expect(page.locator('mat-select[aria-label="Level selector"]')).toBeVisible({
    timeout: 30_000,
  });
}

async function assertTabLayout(page: Page, label: string, section: string) {
  const panel = page.locator(section);
  await expect(panel).toBeVisible();
  await expect(panel.locator(':scope > mat-card')).toBeVisible();

  const sidebar = panel.locator('aside, app-editor-objects-sidebar').first();
  await expect(sidebar).toBeVisible();
  const scrollRegion = sidebar
    .locator('.editor-sidebar-scroll, [class*="overflow-y-auto"]')
    .first();
  await expect(scrollRegion).toBeVisible();

  const metrics = await panel.evaluate((element) => {
    const panelBox = element.getBoundingClientRect();
    const sidebarElement = element.querySelector<HTMLElement>('aside, app-editor-objects-sidebar');
    const scrollElement = sidebarElement?.querySelector<HTMLElement>(
      '.editor-sidebar-scroll, [class*="overflow-y-auto"]',
    );
    if (!sidebarElement || !scrollElement) return null;
    const sidebarBox = sidebarElement.getBoundingClientRect();
    const sidebarStyle = getComputedStyle(sidebarElement);
    const scrollStyle = getComputedStyle(scrollElement);
    return {
      panelHeight: panelBox.height,
      panelBottom: panelBox.bottom,
      sidebarHeight: sidebarBox.height,
      sidebarBottom: sidebarBox.bottom,
      sidebarWidth: sidebarBox.width,
      sidebarBackgroundImage: sidebarStyle.backgroundImage,
      scrollOverflowY: scrollStyle.overflowY,
      scrollHeight: scrollElement.scrollHeight,
      clientHeight: scrollElement.clientHeight,
    };
  });

  if (!metrics) throw new Error(`${label} sidebar metrics were unavailable`);
  expect(metrics.sidebarWidth, `${label} sidebar width`).toBeGreaterThan(250);
  expect(metrics.sidebarHeight, `${label} sidebar height`).toBeGreaterThan(
    metrics.panelHeight * 0.7,
  );
  expect(metrics.sidebarBottom, `${label} sidebar bottom`).toBeLessThanOrEqual(
    metrics.panelBottom + 2,
  );
  expect(metrics.sidebarBackgroundImage, `${label} sidebar gradient`).toBe('none');
  expect(metrics.scrollOverflowY, `${label} sidebar scrolling`).toBe('auto');
  expect(metrics.scrollHeight, `${label} sidebar content`).toBeGreaterThanOrEqual(
    metrics.clientHeight,
  );

  const expectedContent = tabContent.get(label);
  if (expectedContent) await expect(panel).toContainText(expectedContent);
  return panel;
}

test.describe('editor tab integrity', () => {
  test('all data tabs render their panel and consistent sidebar geometry', async ({ page }) => {
    test.setTimeout(120_000);
    const consoleErrors: string[] = [];
    let currentTab = 'startup';
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(`${currentTab}: ${message.text()}`);
    });

    await loadEditor(page);

    for (const [label, section] of tabs) {
      currentTab = label;
      await page
        .getByRole('button', { name: new RegExp(label, 'i') })
        .first()
        .click();
      const panel = await assertTabLayout(page, label, section);
      if (label === 'sprites' || label === 'screens') {
        await expect(panel.locator('img[src^="data:image/"]').first()).toBeVisible({
          timeout: 30_000,
        });
      }
      await expect(panel).toHaveScreenshot('editor-' + label.replaceAll(' ', '-') + '.png', {
        animations: 'disabled',
      });
    }

    const toolbarMetrics = await page.locator('mat-toolbar.site-toolbar').evaluate((toolbar) => {
      const toolbarBox = toolbar.getBoundingClientRect();
      const selector = toolbar.querySelector<HTMLElement>(
        'mat-select[aria-label="Level selector"]',
      );
      if (!selector) return null;
      const selectorBox = selector.getBoundingClientRect();
      return {
        toolbarLeft: toolbarBox.left,
        toolbarRight: toolbarBox.right,
        selectorLeft: selectorBox.left,
        selectorRight: selectorBox.right,
      };
    });
    if (!toolbarMetrics) throw new Error('Level selector geometry was unavailable');
    expect(toolbarMetrics.selectorLeft).toBeGreaterThanOrEqual(toolbarMetrics.toolbarLeft);
    expect(toolbarMetrics.selectorRight).toBeLessThanOrEqual(toolbarMetrics.toolbarRight);

    expect(
      consoleErrors.filter((error) => /mat-form-field|track expression|NG01050/i.test(error)),
    ).toEqual([]);
  });

  test('interactive tab layouts preserve scroll, ordering, and canvas width', async ({ page }) => {
    test.setTimeout(120_000);
    await loadEditor(page);

    await page.getByRole('button', { name: /tiles/i }).first().click();
    const tiles = page.locator('app-editor-tiles-section');
    const tileHeadings = await tiles.locator('app-editor-tiles-sidebar').evaluate((sidebar) => {
      const labels = [...sidebar.querySelectorAll<HTMLElement>('span')]
        .map((element) => element.textContent?.trim() ?? '')
        .filter((text) => /^(Road Records|Tile Images)/i.test(text));
      return labels;
    });
    expect(tileHeadings[0]).toMatch(/^Road Records/i);
    expect(tileHeadings.at(-1)).toMatch(/^Tile Images/i);

    const tileScroll = tiles.locator('app-editor-sidebar-scroll').first();
    await expect(tileScroll).toBeVisible();
    await tileScroll.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    expect(await tileScroll.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);

    await page
      .getByRole('button', { name: /objects & tracks/i })
      .first()
      .click();
    const objects = page.locator('app-editor-objects-section');
    const canvasMetrics = await objects
      .locator('app-editor-objects-canvas-panel')
      .evaluate((panel) => {
        const panelBox = panel.getBoundingClientRect();
        const canvas = panel.querySelector('canvas');
        const canvasBox = canvas?.getBoundingClientRect();
        return {
          panelWidth: panelBox.width,
          canvasWidth: canvasBox?.width ?? 0,
          panelLeft: panelBox.left,
          canvasLeft: canvasBox?.left ?? 0,
        };
      });
    expect(canvasMetrics.canvasWidth).toBeGreaterThan(0);
    expect(canvasMetrics.canvasWidth).toBeGreaterThan(canvasMetrics.panelWidth * 0.8);
    expect(canvasMetrics.canvasLeft).toBeGreaterThanOrEqual(canvasMetrics.panelLeft);

    await page
      .getByRole('button', { name: /object groups/i })
      .first()
      .click();
    const groups = page.locator('app-editor-object-groups-section');
    const triggerThumbnails = groups.locator('app-editor-object-group-type-select img');
    if ((await triggerThumbnails.count()) > 0) {
      await expect(triggerThumbnails.first()).toBeVisible();
    }
  });
});
