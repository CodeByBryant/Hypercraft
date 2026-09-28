// Ad-hoc screenshot tool for development:
//   node scripts/shot.mjs [url-query] [out.png] [viewJSON]
// Assumes a dev/preview server on http://localhost:5173 (override with BASE_URL).
import { chromium } from '@playwright/test';

const base = process.env.BASE_URL ?? 'http://localhost:5173/';
const query = process.argv[2] ?? 'test=1&res=360';
const out = process.argv[3] ?? 'shot.png';
const view = process.argv[4] ? JSON.parse(process.argv[4]) : null;
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
await page.goto(base + '?' + query);
try {
  await page.waitForFunction(() => window.__hc !== undefined, null, { timeout: 20000 });
  await page.evaluate(() => window.__hc.manual(true));
  await page.evaluate(() => window.__hc.ready(90000));
  if (view) await page.evaluate((v) => {
    if (v.pos) window.__hc.teleport(...v.pos);
    window.__hc.setView(v);
    if (v.fly) window.__hc.setFlying(true);
    if (v.debug) window.__hc.setDebug(true);
    if (v.wire) window.__hc.setWire(true);
    if (v.time !== undefined) window.__hc.setTime(v.time);
    if (v.weather) window.__hc.setWeather(v.weather);
  }, view);
  await page.evaluate(() => window.__hc.idle(120000));
  await page.evaluate((n) => window.__hc.frames(n), view && view.settle ? view.settle : 3);
  const ms = await page.evaluate(() => window.__hc.benchRender(3));
  const steps = await page.evaluate(() => window.__hc.raySteps());
  console.log('render ms/frame (software GL):', ms.toFixed(0), 'steps', JSON.stringify(steps));
  const st = await page.evaluate(() => window.__hc.state());
  console.log(JSON.stringify(st));
} catch (e) {
  console.log('ERROR', e.message);
}
await page.screenshot({ path: out });
console.log(logs.slice(0, 40).join('\n'));
await browser.close();
