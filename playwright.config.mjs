import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  use: { baseURL: 'http://127.0.0.1:3100', serviceWorkers: 'block', trace: 'retain-on-failure' },
  projects: [
    { name: 'mobile', use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } } },
    { name: 'desktop', use: { browserName: 'chromium', viewport: { width: 1280, height: 900 } } }
  ],
  webServer: {
    command: 'node server/index.mjs',
    url: 'http://127.0.0.1:3100/api/health',
    reuseExistingServer: false,
    env: { HOST: '127.0.0.1', PORT: '3100', DATABASE_PATH: './var/browser-tests.sqlite', DATA_DIR: './var/data-sample', OLLAMA_URL: '' }
  }
});
