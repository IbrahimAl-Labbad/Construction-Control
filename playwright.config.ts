import path from 'path';
import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';

// Load test environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env.test.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

/**
 * Playwright end-to-end test configuration.
 *
 * Tests are in: tests/e2e/
 * Naming convention: *.spec.ts
 *
 * Run: npm run test:e2e
 * Run with UI: npm run test:e2e:ui
 *
 * Requires the dev server to be running or will start it automatically.
 */
export default defineConfig({
  testDir: './tests/e2e',
  // Fail the build on CI if you accidentally left test.only in the source code.
  forbidOnly: !!process.env['CI'],
  // Retry on CI only
  retries: process.env['CI'] ? 2 : 0,
  // Opt out of parallel tests on CI
  ...(process.env['CI'] ? { workers: 1 } : {}),
  // Reporter
  reporter: [
    ['html', { outputFolder: 'tests/e2e/reports' }],
    ['list'],
  ],
  // Shared settings for all projects
  use: {
    // Base URL for the app
    baseURL: process.env['PLAYWRIGHT_BASE_URL'] ?? 'http://localhost:3000',
    // Collect trace when test fails
    trace: 'on-first-retry',
    // Arabic RTL screenshot settings
    locale: 'ar-SA',
  },
  // Configure projects for major browsers
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    // Uncomment for cross-browser testing
    // {
    //   name: 'firefox',
    //   use: { ...devices['Desktop Firefox'] },
    // },
    // {
    //   name: 'webkit',
    //   use: { ...devices['Desktop Safari'] },
    // },
  ],
  // Start local dev server before running tests
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env['CI'],
    timeout: 120 * 1000,
  },
});
