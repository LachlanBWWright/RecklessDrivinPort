import { expect, test } from '@playwright/test';

for (const kind of ['sprites', 'tiles', 'screens']) {
  test(`${kind} switches its preview into an inline editor and applies or cancels pixels`, async ({
    page,
  }, testInfo) => {
    await page.goto('/');
    await page.getByRole('button', { name: /level editor/i }).click();
    await page.getByRole('button', { name: /load default/i }).click();
    await expect(page.locator('mat-select[aria-label="Level selector"]')).toBeVisible();
    await page
      .getByRole('button', { name: new RegExp(`^.*${kind}.*$`, 'i') })
      .first()
      .click();
    const section = page.locator(`app-editor-${kind}-section`);
    if (kind === 'sprites') {
      await section
        .locator('app-editor-sprite-list-item')
        .filter({ hasText: '16-bit' })
        .first()
        .getByRole('button')
        .click();
    } else if (kind === 'tiles') {
      await section.locator('app-editor-tile-row').first().getByRole('button').first().click();
    } else {
      await section
        .locator('app-editor-screen-list-item')
        .filter({ hasText: /PPIC/i })
        .first()
        .getByRole('button')
        .click();
    }
    const image = section.locator('app-image-preview img').first();
    await expect(image).toBeVisible();
    if (kind === 'screens') await expect(image).toHaveJSProperty('naturalWidth', 640);
    const original = await image.getAttribute('src');
    const editButton = section.getByRole('button', { name: /Edit (Pixels|Image)/i });
    await editButton.click();
    const editor = section.getByRole('region', { name: 'Image pixel editor', exact: true });
    await expect(editor).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(section.locator('[inert]')).toBeVisible();
    await editor.locator('input[type="color"]').fill('#ff00ff');
    await editor
      .locator('canvas')
      .first()
      .click({ position: { x: 3, y: 3 } });
    await expect(editor.getByRole('status')).toContainText('Unapplied changes');
    await editor.getByRole('button', { name: 'Undo pixel edit', exact: true }).click();
    await expect(editor.getByRole('status')).toContainText('Editing a working copy');
    await editor.getByRole('button', { name: 'Redo pixel edit', exact: true }).click();
    await expect(editor.getByRole('status')).toContainText('Unapplied changes');
    if (kind === 'sprites') {
      page.once('dialog', async (dialog) => {
        await dialog.dismiss();
      });
      await page
        .getByRole('button', { name: /^.*Screens.*$/i })
        .first()
        .click();
      await expect(editor).toBeVisible();
    }
    if (kind === 'tiles') await editor.press('Escape');
    else await editor.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(editor).toBeHidden();
    await expect(image).toHaveAttribute('src', original ?? '');

    await editButton.click();
    await editor.locator('input[type="color"]').fill('#ff00ff');
    await editor
      .locator('canvas')
      .first()
      .click({ position: { x: 3, y: 3 } });
    await testInfo.attach(`${kind}-inline`, {
      body: await page.screenshot({ path: testInfo.outputPath('inline.png') }),
      contentType: 'image/png',
    });
    await editor.getByRole('button', { name: 'Apply changes', exact: true }).click();
    await expect(editor).toBeHidden();
    await expect(image).toBeVisible();
    await expect(image).not.toHaveAttribute('src', original ?? '');
    await expect(section.locator('[inert]')).toHaveCount(0);
  });
}
