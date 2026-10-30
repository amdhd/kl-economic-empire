import { defineConfig } from '@playwright/test';

// E2E_PORT lets parallel checkouts run their own dev server without reusing another branch's.
const port = Number(process.env.E2E_PORT ?? 5173);

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  // Multiple software-rendered WebGL maps can starve the real-time clock test on a laptop.
  workers: 2,
  use: { baseURL: `http://localhost:${port}`, viewport: { width: 1600, height: 900 } },
  webServer: { command: `npx vite --port ${port} --strictPort`, port, reuseExistingServer: true },
});
