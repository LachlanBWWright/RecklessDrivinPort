import { test, expect } from '@playwright/test';

test('PPic renders as 640x480 in Screens tab', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /level editor/i }).click();
  await page.getByRole('button', { name: /load default/i }).click();
  await expect(page.locator('mat-spinner')).not.toBeVisible({ timeout: 30_000 });

  await page.getByRole('button', { name: /screens/i }).first().click();
  await page.waitForTimeout(1500);

  await page.locator('app-editor-screens-section button').filter({ hasText: 'PPic #1000' }).scrollIntoViewIfNeeded();
  await page.locator('app-editor-screens-section button').filter({ hasText: 'PPic #1000' }).click();

  // Wait for spinner to appear then disappear (confirming async decode)
  await expect(page.locator('app-editor-screens-section mat-spinner')).toBeVisible({ timeout: 5_000 });
  await expect(page.locator('app-editor-screens-section mat-spinner')).not.toBeVisible({ timeout: 15_000 });

  // Verify at least one 640x480 image is visible
  const has640x480 = await page.evaluate(() => {
    const imgs = document.querySelectorAll('app-editor-screens-section img');
    return Array.from(imgs).some(el => (el as HTMLImageElement).naturalWidth === 640 && (el as HTMLImageElement).naturalHeight === 480);
  });
  
  expect(has640x480).toBe(true);
  console.log('PPic #1000 renders as 640x480 ✓');
});
