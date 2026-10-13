// Browser smoke tests for the demos.
//   Local (default): npx playwright test           (starts scripts/serve.mjs)
//   Live site:       BASE_URL=https://janeferdinant.github.io/bit/ npx playwright test
import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.BASE_URL || 'http://localhost:4173/';

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  reporter: 'list',
  use: { baseURL },
  projects: [
    { name: 'phone-390', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 } } },
    { name: 'desktop-1280', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
  ],
  webServer: process.env.BASE_URL
    ? undefined
    : { command: 'node scripts/serve.mjs 4173', url: 'http://localhost:4173/', reuseExistingServer: true },
});
