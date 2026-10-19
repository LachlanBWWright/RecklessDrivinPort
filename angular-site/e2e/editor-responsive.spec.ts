import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const editorTabs = [
  ['object groups', 'app-editor-object-groups-section'],
  ['object types', 'app-editor-object-types-section'],
  ['objects & tracks', 'app-editor-objects-section'],
  ['sprites', 'app-editor-sprites-section'],
  ['tiles', 'app-editor-tiles-section'],
  ['audio', 'app-editor-audio-section'],
  ['screens', 'app-editor-screens-section'],
] as const;

async function loadEditor(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: /level editor/i }).click();
  await page.getByRole('button', { name: /load default/i }).click();
  await expect(page.locator('mat-select[aria-label="Level selector"]')).toBeVisible({
    timeout: 30_000,
  });
}

test.describe('responsive editor layout', () => {
  for (const viewport of [
    { width: 1024, height: 768 },
    { width: 1280, height: 800 },
  ]) {
    test(`editor tabs stay within the viewport at ${viewport.width}px`, async ({ page }) => {
      test.setTimeout(120_000);
      await page.setViewportSize(viewport);
      await loadEditor(page);

      for (const [label, section] of editorTabs) {
        await page
          .getByRole('button', { name: new RegExp(label, 'i') })
          .first()
          .click();
        const panel = page.locator(section);
        await expect(panel).toBeVisible();
        const geometry = await panel.evaluate((element) => {
          const panelBox = element.getBoundingClientRect();
          const overflowingElements = [...element.querySelectorAll<HTMLElement>('*')]
            .filter((child) => {
              const box = child.getBoundingClientRect();
              return box.right > window.innerWidth + 2 || box.left < -2;
            })
            .map((child) => child.tagName.toLowerCase());
          return {
            panelRight: panelBox.right,
            viewportWidth: window.innerWidth,
            overflowingElements,
          };
        });
        expect(geometry.panelRight, `${label} panel right edge`).toBeLessThanOrEqual(
          geometry.viewportWidth + 2,
        );
        expect(geometry.overflowingElements, `${label} horizontal overflow`).toEqual([]);
      }
    });
  }
});
