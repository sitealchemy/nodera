import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end configuration.
 *
 * The dev server is started by Playwright itself, on a port of its own so a
 * server already running on 3000 is neither used nor disturbed.
 */
const PORT = 4321;

export default defineConfig({
  testDir: './e2e',
  // Artefacts live outside src/ so they never reach the bundle.
  outputDir: './e2e-results',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [
    ['list'],
    ['html', { outputFolder: './e2e-report', open: 'never' }],
  ],
  use: {
    baseURL: `http://localhost:${PORT}`,
    // Trace and screenshot only when something actually fails, so a green run
    // does not bury the evidence that matters.
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    {
      name: 'chromium-1366',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 768 } },
    },
  ],
  webServer: {
    command: `bunx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
