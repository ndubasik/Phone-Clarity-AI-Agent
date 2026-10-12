import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser', fullyParallel: true, workers: 2,
  use: { baseURL: 'http://127.0.0.1:3000', headless: true, viewport: { width: 1440, height: 1120 }, launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] }, permissions: ['microphone'] },
  webServer: { command: 'npm run dev', url: 'http://127.0.0.1:3000/api/health', reuseExistingServer: !process.env.CI, timeout: 30_000 },
});
