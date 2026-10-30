import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  use: { baseURL: 'http://localhost:5174', viewport: { width: 1600, height: 900 } },
  webServer: { command: 'npm run dev -- --port 5174', port: 5174, reuseExistingServer: false },
});
