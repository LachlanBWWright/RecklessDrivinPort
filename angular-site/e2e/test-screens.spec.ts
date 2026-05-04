import { test, expect } from '@playwright/test';

test('Picture resources render in Screens tab without decode stall', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /level editor/i }).click();
  await page.getByRole('button', { name: /load default/i }).click();
  await expect(page.locator('mat-spinner')).not.toBeVisible({ timeout: 30_000 });

  await page
    .getByRole('button', { name: /screens/i })
    .first()
    .click();
  await page.waitForTimeout(1500);

  const pictureButton = page
    .locator('app-editor-screens-section aside button', {
      has: page.locator('span', { hasText: /^(PICT|PPIC)$/i }),
    })
    .first();
  await expect(pictureButton).toBeVisible({ timeout: 15_000 });
  await pictureButton.click();

  // Wait until preview decode settles.
  await expect(page.locator('app-editor-screens-section mat-spinner')).not.toBeVisible({
    timeout: 15_000,
  });

  // Verify picture preview resolves and is not stuck on the loading spinner.
  const picturePreview = await page.evaluate(() => {
    const img = document.querySelector(
      'app-editor-screens-section img[alt="icon preview"]',
    ) as HTMLImageElement | null;
    if (!img) return null;
    return {
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
      renderedWidth: img.clientWidth,
      renderedHeight: img.clientHeight,
    };
  });

  expect(picturePreview).not.toBeNull();
  expect(picturePreview!.naturalWidth).toBeGreaterThan(0);
  expect(picturePreview!.naturalHeight).toBeGreaterThan(0);
  expect(picturePreview!.renderedWidth).toBeGreaterThan(0);
  expect(picturePreview!.renderedHeight).toBeGreaterThan(0);
});

test('Screens tab exposes edit actions for both icons and picture resources', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /level editor/i }).click();
  await page.getByRole('button', { name: /load default/i }).click();
  await expect(page.locator('mat-spinner')).not.toBeVisible({ timeout: 30_000 });

  await page
    .getByRole('button', { name: /screens/i })
    .first()
    .click();

  const anyPictureButton = page
    .locator('app-editor-screens-section aside button', {
      has: page.locator('span', { hasText: /^(PICT|PPIC)$/i }),
    })
    .first();
  await expect(anyPictureButton).toBeVisible({ timeout: 15_000 });
  await anyPictureButton.click();
  await expect(page.getByRole('button', { name: /replace image/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /export raw/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /replace raw/i })).toBeVisible();

  await page
    .locator('app-editor-screens-section button')
    .filter({ hasText: /ICN#|icl8|ics8|ics#/i })
    .first()
    .click();
  await expect(page.getByRole('button', { name: /export png/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /replace png/i })).toBeVisible();
});

test('PPIC 1006 and 1009 previews decode when present', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /level editor/i }).click();
  await page.getByRole('button', { name: /load default/i }).click();
  await expect(page.locator('mat-spinner')).not.toBeVisible({ timeout: 30_000 });
  await page
    .getByRole('button', { name: /screens/i })
    .first()
    .click();

  const ppicButtons = page
    .locator('app-editor-screens-section aside button')
    .filter({ has: page.locator('span', { hasText: /^PPIC$/i }) });

  for (const id of [1006, 1009]) {
    const button = ppicButtons.filter({ hasText: new RegExp(`#${id}\\b`, 'i') }).first();
    if ((await button.count()) === 0) {
      continue;
    }
    await button.click();
    await expect(page.locator('app-editor-screens-section mat-spinner')).not.toBeVisible({
      timeout: 20_000,
    });
    const preview = await page.evaluate(() => {
      const img = document.querySelector(
        'app-editor-screens-section img[alt="icon preview"]',
      ) as HTMLImageElement | null;
      return img ? { w: img.naturalWidth, h: img.naturalHeight } : null;
    });
    expect(preview).not.toBeNull();
    expect(preview!.w).toBeGreaterThan(0);
    expect(preview!.h).toBeGreaterThan(0);
  }
});

test('PPIC 1000-1009 previews decode distinctly when present', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /level editor/i }).click();
  await page.getByRole('button', { name: /load default/i }).click();
  await expect(page.locator('mat-spinner')).not.toBeVisible({ timeout: 30_000 });
  await page
    .getByRole('button', { name: /screens/i })
    .first()
    .click();

  const ppicButtons = page
    .locator('app-editor-screens-section aside button')
    .filter({ hasText: /PPic|PPIC/i });
  await expect(ppicButtons.first()).toBeVisible({ timeout: 15_000 });

  const buttonCount = await ppicButtons.count();
  const maxChecks = Math.min(10, buttonCount);
  const fingerprints = new Map<number, string>();

  for (let i = 0; i < maxChecks; i += 1) {
    const button = ppicButtons.nth(i);
    await button.click();
    await expect(page.locator('app-editor-screens-section mat-spinner')).not.toBeVisible({
      timeout: 20_000,
    });

    const preview = await page.evaluate(() => {
      const img = document.querySelector(
        'app-editor-screens-section img[alt="icon preview"]',
      ) as HTMLImageElement | null;
      const errorText = document.body.innerText;
      const failedDecode = errorText.includes('Failed to decode PPic #');
      if (!img) {
        return { failedDecode, fingerprint: null, width: 0, height: 0 };
      }
      const src = img.currentSrc || img.src || '';
      return {
        failedDecode,
        fingerprint: `${img.naturalWidth}x${img.naturalHeight}:${src.length}:${src.slice(-64)}`,
        width: img.naturalWidth,
        height: img.naturalHeight,
      };
    });

    if (!preview.fingerprint) {
      continue;
    }

    expect(preview.failedDecode).toBe(false);
    expect(preview.width).toBeGreaterThan(0);
    expect(preview.height).toBeGreaterThan(0);
    fingerprints.set(i, preview.fingerprint);
  }

  expect(fingerprints.size).toBeGreaterThan(0);
  const uniqueFingerprints = new Set(Array.from(fingerprints.values()));
  expect(uniqueFingerprints.size).toBeGreaterThanOrEqual(Math.max(1, fingerprints.size - 1));
});
