import { expect, test, type Page } from '@playwright/test';

async function openEditor(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: /level editor/i }).click();
  await page.getByRole('button', { name: /load default/i }).click();
  await expect(page.locator('mat-select[aria-label="Level selector"]')).toBeVisible();
}

async function openObjects(page: Page): Promise<void> {
  await openEditor(page);
  await page.getByRole('button', { name: /objects & tracks/i }).click();
}

test('canvas tools follow the sidebar mode and sidebar tabs support arrow keys', async ({
  page,
}, testInfo) => {
  await openObjects(page);
  const placement = page.getByRole('group', { name: 'Object placement', exact: true });
  await expect(placement).toBeVisible();
  const tracks = page.getByRole('tab', { name: 'Tracks', exact: true });
  await tracks.click();
  await expect(tracks).toHaveAttribute('aria-selected', 'true');
  await expect(placement).toBeHidden();
  await expect(page.getByRole('group', { name: 'Track tools', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Undo (Ctrl+Z)', exact: true })).toBeVisible();
  await tracks.press('ArrowLeft');
  const groups = page.getByRole('tab', { name: 'Groups', exact: true });
  await expect(groups).toBeFocused();
  await expect(groups).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('group', { name: 'Track tools', exact: true })).toBeHidden();
  await page.getByRole('button', { name: /Road tools/ }).click();
  await expect(
    page.getByRole('group', { name: 'Road and marking tools', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: /Road tools/ }).click();
  await expect(
    page.getByRole('group', { name: 'Road and marking tools', exact: true }),
  ).toBeHidden();
  await testInfo.attach('contextual-toolbar', {
    body: await page.screenshot({ path: testInfo.outputPath('polish.png') }),
    contentType: 'image/png',
  });
});

test('object selection follows keyboard navigation through filtered rows', async ({ page }) => {
  await openObjects(page);
  const rows = page.locator('button[data-object-index]');
  const first = rows.first();
  const second = rows.nth(1);
  await first.click();
  await expect(first).toHaveAttribute('aria-pressed', 'true');
  await first.press('ArrowDown');
  await expect(second).toBeFocused();
  await expect(second).toHaveAttribute('aria-pressed', 'true');
  await expect(first).toHaveAttribute('tabindex', '-1');
  await second.press('Home');
  await expect(first).toBeFocused();
  await first.press('End');
  await expect(rows.last()).toBeFocused();
  await rows.last().press('Space');
  await expect(rows.last()).toHaveAttribute('aria-pressed', 'true');
});

test('toolbar dialogs trap focus, dismiss with Escape and restore their trigger', async ({
  page,
}, testInfo) => {
  await openEditor(page);
  const previewButton = page.getByRole('button', { name: 'Preview', exact: true });
  await previewButton.click();
  const preview = page.getByRole('dialog', { name: 'Preview selected level', exact: true });
  await expect(preview).toBeVisible();
  await expect(preview.getByRole('heading')).toBeFocused();
  for (let index = 0; index < 6; index++) {
    await page.keyboard.press('Tab');
    await expect(preview.locator(':focus')).toHaveCount(1);
  }
  await testInfo.attach('preview-dialog', {
    body: await page.screenshot({ path: testInfo.outputPath('polish.png') }),
    contentType: 'image/png',
  });
  await page.keyboard.press('Escape');
  await expect(preview).toBeHidden();
  await expect(previewButton).toBeFocused();

  const downloadButton = page.getByRole('button', { name: 'Download', exact: true });
  await downloadButton.click();
  const download = page.getByRole('dialog', { name: 'Download resources.dat', exact: true });
  await expect(download).toBeVisible();
  await download.getByRole('checkbox', { name: 'Strip scripting resources', exact: true }).check();
  await page.keyboard.press('Escape');
  await expect(downloadButton).toBeFocused();
  await downloadButton.click();
  await expect(download.getByRole('checkbox')).toBeChecked();
  await download.getByRole('button', { name: 'Cancel', exact: true }).click();

  await page.getByRole('button', { name: 'Manage levels', exact: true }).click();
  await page.getByRole('menuitem', { name: /Delete level/ }).click();
  const deletion = page.getByRole('dialog', { name: /Delete level \d+\?/ });
  await expect(deletion).toBeVisible();
  await expect(deletion.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(deletion).toBeHidden();

  await page
    .locator('app-site-toolbar-editor-actions input[type="file"][accept=".dat"]')
    .setInputFiles({
      name: 'merge-test.dat',
      mimeType: 'application/octet-stream',
      buffer: Buffer.from('cancelled import'),
    });
  const merge = page.getByRole('dialog', { name: 'Merge uploaded resources.dat', exact: true });
  await expect(merge).toBeVisible();
  await expect(merge).toContainText('merge-test.dat');
  await page.keyboard.press('Escape');
  await expect(merge).toBeHidden();
});
