import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e/storybook',
  fullyParallel: false,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  workers: 1,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:6007',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'pnpm storybook --ci --port 6007',
    url: 'http://localhost:6007/iframe.html',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
