import { defineConfig } from '@playwright/test'
import path from 'path'

export default defineConfig({
  testDir: './e2e',
  timeout: 30 * 1000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['html'],
    ['list'],
  ],
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'electron',
      testMatch: /.*\.spec\.ts$/,
      use: {
        // Test against the Electron app
        launchOptions: {
          executablePath: require('electron').toString(),
          args: [path.join(__dirname, 'dist', 'main', 'index.js')],
        },
      },
    },
  ],
})

