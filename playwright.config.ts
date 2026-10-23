import { defineConfig, devices } from '@playwright/test';

/**
 * Mobile-only E2E configuration.
 *
 * Two device profiles (Android Chromium + iOS WebKit), both landscape: the game
 * refuses to run in portrait. SwiftShader flags keep WebGL deterministic on CI
 * runners without a GPU.
 */
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'android-chrome-landscape',
      use: {
        ...devices['Pixel 7 landscape'],
        // Software rendering on CI: a 2.6x DPR canvas would crawl.
        deviceScaleFactor: 1,
        launchOptions: {
          args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
        },
      },
    },
    {
      name: 'ios-webkit-landscape',
      use: {
        ...devices['iPhone 13 landscape'],
        deviceScaleFactor: 1,
      },
    },
  ],
});
