import { test, expect } from '@playwright/test';

test('Strings tab loads STR# #128 key names', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /level editor/i }).click();
  await page.getByRole('button', { name: /load default/i }).click();
  await expect(page.locator('mat-spinner')).not.toBeVisible({ timeout: 30_000 });

  // Click the Strings tab
  await page
    .getByRole('button', { name: /strings/i })
    .first()
    .click();
  await page.waitForTimeout(1500);

  // Should show string entries
  const rows = page.locator('app-editor-strings-section input[type=text]');
  const count = await rows.count();
  console.log(`Found ${count} string inputs`);
  expect(count).toBeGreaterThan(10);

  // First string should be a non-empty key name
  const first = await rows.nth(0).inputValue();
  console.log('String[0]:', JSON.stringify(first));
  expect(first.length).toBeGreaterThan(0);
});

