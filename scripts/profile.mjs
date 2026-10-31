// Reproducible development profiling; uses an isolated no-save Chromium profile at real 3× (`-- --speed 5` for 5×).
import { createServer } from 'vite';
import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { cpus, platform } from 'node:os';

const speed = process.argv.includes('--speed') ? Number(process.argv[process.argv.indexOf('--speed') + 1]) : 3;
const server = await createServer({ server: { port: 5176, strictPort: true, host: '127.0.0.1' }, logLevel: 'error' });
let browser;
try {
  const { profileEngine } = await server.ssrLoadModule('/tools/profile.ts');
  const engine = profileEngine();
  await server.listen();
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  await page.addInitScript(() => sessionStorage.setItem('klDevNoSave', '1'));
  await page.goto('http://127.0.0.1:5176/');
  await expect(page.locator('.maplibregl-ctrl-attrib')).toContainText('OpenStreetMap', { timeout: 20000 });
  await page.getByTestId('start-campaign').click();
  await expect(page.getByTestId('new-game')).toBeHidden();
  await page.getByTestId('info-views').click();
  await page.evaluate(() => {
    const st = window.__klDev.state();
    const targetHour = Date.UTC(2028, 0, 31, 15) / 3600000; // Jan 31 23:00 MYT, before a month close
    window.__klDev.runHours(targetHour - st.clock.hour);
  });
  await page.getByTestId('nav-economy').click();
  const mapReachedNetworkIdle = await page.waitForLoadState('networkidle', { timeout: 15000 }).then(() => true, () => false);
  await page.getByTestId(`btn-speed-${speed}`).click();
  const sample = await page.evaluate(async () => {
    const startGame = window.__klDev.state().clock.hour;
    const start = performance.now(), frames = [], longTasks = [];
    const observer = new PerformanceObserver((list) => { for (const entry of list.getEntries()) longTasks.push(entry.duration); });
    observer.observe({ entryTypes: ['longtask'] });
    let prev = start, raf;
    const frame = (now) => { frames.push(now - prev); prev = now; raf = requestAnimationFrame(frame); };
    raf = requestAnimationFrame(frame);
    await new Promise((resolve) => setTimeout(resolve, 12000));
    cancelAnimationFrame(raf);
    observer.disconnect();
    frames.sort((a, b) => a - b);
    return { realMs: performance.now() - start, gameHours: window.__klDev.state().clock.hour - startGame,
      frames: frames.length, p95FrameMs: frames[Math.floor(frames.length * 0.95)], maxFrameMs: frames.at(-1),
      longTasks: longTasks.length, maxLongTaskMs: longTasks.length ? Math.max(...longTasks) : 0,
      reports: window.__klDev.state().reports.length };
  });
  await page.getByTestId('btn-pause').click();
  const started = Date.now();
  await page.getByTestId('nav-objectives').click();
  await expect(page.getByTestId('score-explanation')).toBeVisible();
  const inputResponseMs = Date.now() - started;
  await mkdir('artifacts', { recursive: true });
  await page.screenshot({ path: 'artifacts/phase6-profile.png' });
  const result = { machine: { platform: platform(), cpu: cpus()[0].model, node: process.version, chromium: browser.version() },
    engine, browser: { ...sample, inputResponseMs, mapReachedNetworkIdle, mode: `headless Chromium, 1600×900, map + Economy panel, ${speed}× across month close` } };
  await writeFile('artifacts/profile.json', JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser?.close();
  await server.close();
}
