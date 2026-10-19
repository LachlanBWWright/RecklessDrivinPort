import { mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../angular-site/package.json', import.meta.url));
const { chromium } = require('playwright');

const baseUrl = process.env.STORYBOOK_URL ?? 'http://127.0.0.1:6007';
const outputDir = new URL('../angular-site/storybook-screenshots/', import.meta.url);
const ownsServer = !process.env.STORYBOOK_URL;

const stories = [
  ['pages-game--ready', 'game-ready.png'],
  ['pages-editor-tabs--properties', 'editor-properties.png'],
  ['pages-editor-tabs--object-groups', 'editor-object-groups.png'],
  ['pages-editor-tabs--object-types', 'editor-object-types.png'],
  ['pages-editor-tabs--objects-and-tracks', 'editor-objects-and-tracks.png'],
  ['pages-editor-tabs--sprites', 'editor-sprites.png'],
  ['pages-editor-tabs--tiles', 'editor-tiles.png'],
  ['pages-editor-tabs--audio', 'editor-audio.png'],
  ['pages-editor-tabs--screens', 'editor-screens.png'],
  ['pages-editor-tabs--strings', 'editor-strings.png'],
  ['layout-sidebar-consistency--all-editor-sidebars', 'sidebar-consistency.png'],
];

await mkdir(outputDir, { recursive: true });
let server;
if (ownsServer) {
  server = spawn('pnpm', ['storybook', '--ci', '--port', '6007'], {
    cwd: new URL('../angular-site/', import.meta.url),
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/iframe.html`);
      if (response.ok) break;
    } catch {
      // Storybook is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}
const browser = await chromium.launch({ headless: true });

try {
  for (const [storyId, filename] of stories) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const consoleErrors = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', (error) => consoleErrors.push(error.message));
    await page.goto(`${baseUrl}/iframe.html?id=${storyId}&viewMode=story`, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });
    await page.locator('#storybook-root').waitFor({ state: 'visible' });
    if (consoleErrors.length > 0) {
      throw new Error(`${storyId} emitted browser errors:\n${consoleErrors.join('\n')}`);
    }
    await page.screenshot({
      path: new URL(filename, outputDir).pathname,
      fullPage: false,
    });
    await page.close();
  }
} finally {
  await browser.close();
  if (server) server.kill('SIGTERM');
}
