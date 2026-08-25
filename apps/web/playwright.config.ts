import { defineConfig, devices } from '@playwright/test'

const e2ePort = process.env.OPENKARTLINE_E2E_PORT ?? '4187'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://127.0.0.1:${e2ePort}`,
    trace: 'on-first-retry',
  },
  /*
   * Three engines, because this app leans on exactly where they diverge:
   * pointer capture during a control-point drag, `getBoundingClientRect` read
   * under an SVG user-space transform, and a non-passive wheel listener for
   * zoom. Chromium alone could not have told us whether any of that held.
   *
   * The axe pass runs on Chromium only: the rules describe the page, not the
   * engine, so running it three times would triple the wall clock to re-derive
   * the same violations.
   */
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
      testIgnore: /accessibility\.spec\.ts/,
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
      testIgnore: /accessibility\.spec\.ts/,
    },
  ],
  webServer: {
    command: `pnpm build && pnpm preview --host 127.0.0.1 --port ${e2ePort}`,
    url: `http://127.0.0.1:${e2ePort}`,
    reuseExistingServer: false,
  },
})
