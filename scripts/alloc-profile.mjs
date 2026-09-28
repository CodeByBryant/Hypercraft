// Samples JS allocations during steady-state rendering (no movement, world fully streamed)
// using Chrome's sampling heap profiler. Prints the top allocation sites.
//   node scripts/alloc-profile.mjs   (expects a server on BASE_URL, default :5173)
import { chromium } from '@playwright/test';

const base = process.env.BASE_URL ?? 'http://localhost:5173/';
// --no-turbo-inlining keeps allocation sites attributed to the real function.
const browser = await chromium.launch({
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--js-flags=--no-turbo-inlining --no-maglev-inlining'],
});
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
await page.goto(base + '?test=1&res=120&rd=3');
await page.waitForFunction(() => window.__hc !== undefined);
await page.evaluate(() => window.__hc.manual(true));
await page.evaluate(() => window.__hc.ready(90000));
await page.evaluate(() => window.__hc.idle(120000));
await page.evaluate(() => window.__hc.manual(false)); // continuous rendering
await page.evaluate(() => window.__hc.frames(30));
const cdp = await page.context().newCDPSession(page);
await cdp.send('HeapProfiler.enable');
await cdp.send('HeapProfiler.startSampling', { samplingInterval: 256 });
const f0 = await page.evaluate(() => window.__hc.game.frameCount);
await page.waitForTimeout(15000);
const f1 = await page.evaluate(() => window.__hc.game.frameCount);
const { profile } = await cdp.send('HeapProfiler.stopSampling');
const sites = new Map();
const walk = (n, stack) => {
  const fr = n.callFrame;
  const name = `${fr.functionName || '(anon)'} ${fr.url.split('/').slice(-2).join('/')}:${fr.lineNumber + 1}`;
  const st = [...stack, name];
  if (n.selfSize > 0) sites.set(st.slice(-4).join(' <- '), (sites.get(st.slice(-4).join(' <- ')) ?? 0) + n.selfSize);
  for (const c of n.children) walk(c, st);
};
walk(profile.head, []);
const frames = f1 - f0;
const total = [...sites.values()].reduce((a, b) => a + b, 0);
console.log(`frames sampled: ${frames}, sampled allocation total ${(total / 1024).toFixed(1)} KB (~${(total / Math.max(1, frames)).toFixed(0)} B/frame)`);
for (const [k, v] of [...sites.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log(`${(v / 1024).toFixed(1).padStart(8)} KB  ${k}`);
await browser.close();
