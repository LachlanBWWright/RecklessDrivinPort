import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

async function openProject(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: /level editor/i }).click();
  await page.getByRole('button', { name: /load default/i }).click();
  await page.getByRole('button', { name: 'Lua editor', exact: true }).click({ timeout: 30_000 });
  await expect(page.getByRole('heading', { name: 'Lua Project' })).toBeVisible({ timeout: 30_000 });
}

test.describe('Lua project workspace', () => {
  test.setTimeout(90_000);
  test('recovers an unfinished draft after a page reload without applying it', async ({ page }) => {
    await openProject(page);
    await page.getByRole('dialog', { name: 'Lua Project', exact: true }).getByRole('button', { name: 'New', exact: true }).click();
    await page.getByRole('textbox', { name: /Script name/ }).fill('Recovered draft');
    await page.getByRole('textbox', { name: 'Lua source code', exact: true }).fill('function onLevelTick(');
    await expect(page.getByRole('button', { name: 'Apply to resource pack', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Save draft & close', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Lua Project' })).not.toBeVisible();
    await page.reload();
    await openProject(page);
    await page.getByRole('button', { name: 'Restore draft', exact: true }).click();
    await expect(page.getByRole('textbox', { name: /Script name/ })).toHaveValue('Recovered draft');
    await expect(page.getByRole('textbox', { name: 'Lua source code', exact: true })).toHaveText('function onLevelTick(');
    await expect(page.getByRole('button', { name: 'Apply to resource pack', exact: true })).toBeDisabled();
  });

  test('previews file imports, preserves source on export, and navigates host diagnostics', async ({ page }) => {
    await openProject(page);
    const source = 'function onLevelTick(ctx, dt)\r\n  local player = ctx:player()\r\n  player:unknownMethod()\r\nend\r\n';
    await page.locator('input[type="file"][accept=".lua,.zip"]').setInputFiles({ name: 'sample.lua', mimeType: 'text/plain', buffer: Buffer.from(source) });
    await expect(page.getByRole('region', { name: 'Import preview' })).toBeVisible();
    await page.getByRole('button', { name: 'Import into draft', exact: true }).click();
    await page.getByRole('button', { name: /^problems/ }).click();
    const diagnostic = page.getByRole('button').filter({ hasText: "Unknown game object method 'unknownMethod'." });
    await expect(diagnostic).toBeVisible();
    await diagnostic.click();
    await expect(page.getByRole('textbox', { name: 'Lua source code', exact: true })).toBeFocused();
    const downloaded = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export .lua', exact: true }).click();
    const file = await downloaded;
    const path = await file.path();
    if (!path) throw new Error('Lua file download has no readable path.');
    expect((await readFile(path)).toString('utf8')).toBe(source);
  });
});
