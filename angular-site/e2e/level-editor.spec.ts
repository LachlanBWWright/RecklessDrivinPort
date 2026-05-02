import { test, expect } from '@playwright/test';

/**
 * Basic smoke tests for the Reckless Drivin level editor.
 *
 * These tests verify navigation, data loading, and — critically — that
 * number inputs accept typed text without resetting the cursor (the bug
 * fixed by InputValueDirective).
 */

test.describe('Site navigation', () => {
  test('home page loads with a toolbar', async ({ page }) => {
    await page.goto('/');
    const toolbar = page.locator('mat-toolbar.site-toolbar');
    await expect(toolbar).toBeVisible();
  });

  test('toolbar contains a Level Editor nav button', async ({ page }) => {
    await page.goto('/');
    const editorButton = page.getByRole('button', { name: /level editor/i });
    await expect(editorButton).toBeVisible();
  });

  test('clicking Level Editor tab shows the editor panel', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /level editor/i }).click();
    const editorPanel = page.locator('#panel-editor');
    await expect(editorPanel).toBeVisible();
  });
});

test.describe('Editor with no data loaded', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /level editor/i }).click();
  });

  test('shows a "Load Default" button when no data is loaded', async ({ page }) => {
    const loadBtn = page.getByRole('button', { name: /load default/i });
    await expect(loadBtn).toBeVisible();
  });

  test('shows a "no data loaded" message', async ({ page }) => {
    await expect(page.getByText(/no data loaded/i)).toBeVisible();
  });
});

test.describe('Editor with default resources loaded', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /level editor/i }).click();
    // Load the default resources.dat served alongside the app
    await page.getByRole('button', { name: /load default/i }).click();
    // Wait for the worker to finish — the busy spinner disappears and a level
    // select dropdown appears
    await expect(page.locator('mat-spinner')).not.toBeVisible({ timeout: 30_000 });
  });

  test('level selector appears after loading', async ({ page }) => {
    const levelSelect = page.locator('mat-select[aria-label="Level selector"]');
    await expect(levelSelect).toBeVisible();
  });

  test('can navigate to Properties section', async ({ page }) => {
    await page.getByRole('button', { name: /properties/i }).click();
    // The properties tab should show road-info selector
    await expect(page.locator('mat-select[aria-label="Shared road selector"]')).toBeVisible();
  });
});

test.describe('Number input editing (InputValueDirective fix)', () => {
  /**
   * Verifies that number inputs in OnPush components do not reset the cursor
   * on every keypress — the core bug that was fixed by InputValueDirective.
   *
   * The test:
   *  1. Loads data and navigates to the Properties section
   *  2. Clears the "friction" field and types a multi-digit number
   *  3. Confirms the full typed value is present in the field — not just the
   *     last digit that would remain after repeated cursor-reset resets.
   */
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /level editor/i }).click();
    await page.getByRole('button', { name: /load default/i }).click();
    await expect(page.locator('mat-spinner')).not.toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: /properties/i }).click();
    await expect(page.locator('mat-select[aria-label="Shared road selector"]')).toBeVisible();
  });

  test('friction field accepts a typed multi-digit value', async ({ page }) => {
    // Find the friction input by its label
    const frictionInput = page.locator('input[type="number"]').first();
    await frictionInput.click();
    await frictionInput.selectText();
    await frictionInput.type('0.75');
    // After typing, the field should contain the full value — not a partial reset
    const value = await frictionInput.inputValue();
    expect(value).toBe('0.75');
  });

  test('can type new value in a number field and commit by blurring', async ({ page }) => {
    const frictionInput = page.locator('input[type="number"]').first();
    await frictionInput.click();
    await frictionInput.selectText();
    await frictionInput.fill('0.123');
    await frictionInput.blur();
    await expect(frictionInput).toHaveValue('0.123');
  });
});
