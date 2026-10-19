import { expect, test } from '@playwright/test';

const stories = [
  'pages-editor-tabs--properties',
  'pages-editor-tabs--object-groups',
  'pages-editor-tabs--object-types',
  'pages-editor-tabs--objects-and-tracks',
  'pages-editor-tabs--sprites',
  'pages-editor-tabs--tiles',
  'pages-editor-tabs--audio',
  'pages-editor-tabs--screens',
  'pages-editor-tabs--strings',
  'layout-sidebar-consistency--all-editor-sidebars',
  'layout-sidebar-consistency--sidebar-scroll-interaction',
  'components-editor-detail-cards--consistent-cards',
];

test.describe('Storybook editor visual contracts', () => {
  for (const story of stories) {
    test(`${story} renders without browser errors`, async ({ page }) => {
      const browserErrors: string[] = [];
      page.on('console', (message) => {
        if (message.type() === 'error') browserErrors.push(message.text());
      });
      page.on('pageerror', (error) => browserErrors.push(error.message));

      await page.goto(`/iframe.html?id=${story}&viewMode=story`, {
        waitUntil: 'domcontentloaded',
      });
      await expect(page.locator('#storybook-root')).toBeVisible();
      expect(browserErrors, `${story} browser errors`).toEqual([]);

      await expect(page).toHaveScreenshot(`${story}.png`, {
        animations: 'disabled',
        fullPage: false,
      });
    });
  }
});
