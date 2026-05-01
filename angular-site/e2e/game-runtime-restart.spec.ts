import { expect, test } from '@playwright/test';

test.describe('Game runtime restart', () => {
  test('Restart With Customisations restarts only the iframe runtime', async ({ page }) => {
    test.setTimeout(90_000);

    await page.goto('/');

    const mainFrameNavigations: string[] = [];
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) {
        mainFrameNavigations.push(frame.url());
      }
    });

    const restartButton = page.getByRole('button', { name: /restart with customisations/i });
    await expect(restartButton).toBeVisible();

    await expect
      .poll(async () =>
        page.evaluate(() => {
          const frame = document.getElementById('game-frame');
          if (!(frame instanceof HTMLIFrameElement)) return false;
          const canvas = frame.contentDocument?.getElementById('canvas');
          return canvas?.tagName === 'CANVAS';
        }),
      )
      .toBe(true);

    const beforeTokens = await page.evaluate(() => {
      const parentToken = `parent-${Math.random().toString(36).slice(2)}`;
      (window as Window & { __restartToken?: string }).__restartToken = parentToken;

      const frame = document.getElementById('game-frame');
      if (!(frame instanceof HTMLIFrameElement) || !frame.contentWindow) {
        return { parentToken, frameToken: null };
      }

      const frameToken = `frame-${Math.random().toString(36).slice(2)}`;
      (frame.contentWindow as Window & { __frameToken?: string }).__frameToken = frameToken;
      return { parentToken, frameToken };
    });

    const baselineMainNavCount = mainFrameNavigations.length;

    await restartButton.click();
    await expect(restartButton).toBeDisabled();
    await expect(restartButton).toBeEnabled({ timeout: 60_000 });

    await expect
      .poll(async () =>
        page.evaluate(() => {
          const frame = document.getElementById('game-frame');
          if (!(frame instanceof HTMLIFrameElement)) return false;
          const canvas = frame.contentDocument?.getElementById('canvas');
          return canvas?.tagName === 'CANVAS';
        }),
      )
      .toBe(true);

    const afterTokens = await page.evaluate(() => {
      const parentToken = (window as Window & { __restartToken?: string }).__restartToken ?? null;

      const frame = document.getElementById('game-frame');
      if (!(frame instanceof HTMLIFrameElement) || !frame.contentWindow) {
        return { parentToken, frameToken: null };
      }

      const frameToken = (frame.contentWindow as Window & { __frameToken?: string }).__frameToken;
      return { parentToken, frameToken: frameToken ?? null };
    });

    expect(afterTokens.parentToken).toBe(beforeTokens.parentToken);
    expect(afterTokens.frameToken).toBeNull();
    expect(mainFrameNavigations.length).toBe(baselineMainNavCount);
  });
});
