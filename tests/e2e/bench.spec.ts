import { expect, test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import './util';

// Engine benchmarks (run with BENCH=1 npx playwright test bench; BENCH_OUT names the JSON). In CI/containers
// WebGL runs on SwiftShader (CPU), so render timings here are NOT GPU numbers; the
// GPU-independent metrics (ray steps per pixel, streaming throughput, worker times, CPU frame
// cost, memory) are. Real-GPU numbers come from the in-game benchmark (?bench=1).
test('engine benchmarks', async ({ page }) => {
  test.skip(!process.env.BENCH, 'set BENCH=1 to run the benchmark');
  const errors: string[] = [];
  const t0 = Date.now();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?test=1&res=360&rd=4&seed=hypercraft');
  await page.waitForFunction(() => window.__hc !== undefined);
  await page.evaluate(() => window.__hc.manual(true));
  await page.evaluate(() => window.__hc.ready(120_000));
  const tReady = Date.now() - t0;
  await page.evaluate(() => window.__hc.idle(240_000));
  const tIdle = Date.now() - t0;
  const loaded = await page.evaluate(() => window.__hc.state());

  // CPU cost of a logic frame (physics, streaming, light, uploads, picking, env), no rendering.
  await page.evaluate(() => window.__hc.frames(30));
  const cpu = await page.evaluate(async () => {
    const g = (window.__hc as unknown as { game: { cpuMs: number } }).game;
    const xs: number[] = [];
    for (let i = 0; i < 120; i++) {
      await window.__hc.frames(1);
      xs.push(g.cpuMs);
    }
    xs.sort((a, b) => a - b);
    return { avg: xs.reduce((a, b) => a + b, 0) / xs.length, p95: xs[Math.floor(xs.length * 0.95)] };
  });

  const spawn = loaded.pos;
  const views = [
    { name: 'axis-aligned', view: { pitch: -14 } },
    { name: 'xw30', view: { xw: 30, pitch: -14 } },
    { name: 'xw45+zw45', view: { xw: 45, zw: 45, pitch: -14 } },
  ];
  const render: Record<string, unknown>[] = [];
  for (const v of views) {
    await page.evaluate(
      ([pos, view]) => {
        const p = pos as number[];
        window.__hc.setFlying(true);
        window.__hc.teleport(p[0]!, p[1]! + 3, p[2]!, p[3]!);
        window.__hc.setView(view as { pitch: number });
      },
      [spawn, v.view] as const,
    );
    await page.evaluate(() => window.__hc.idle(240_000));
    const row: Record<string, unknown> = { view: v.name };
    for (const res of [180, 360, 720]) {
      await page.evaluate((r) => window.__hc.setResolution(r), res);
      row[`swMs@${res}p`] = Math.round(await page.evaluate(() => window.__hc.benchRender(3)));
      if (res === 360) row.steps360 = await page.evaluate(() => window.__hc.raySteps());
    }
    render.push(row);
  }

  // Streaming throughput: move 2 chunks along the hidden axis (ana), then rotate the slice 90°.
  await page.evaluate(() => window.__hc.setResolution(180));
  const cols0 = (await page.evaluate(() => window.__hc.state())).workers as { done: number };
  let t = Date.now();
  await page.evaluate(([pos]) => {
    const p = pos as number[];
    window.__hc.setView({ pitch: -14 });
    window.__hc.teleport(p[0]!, p[1]! + 3, p[2]!, p[3]! + 32);
  }, [spawn] as const);
  await page.evaluate(() => window.__hc.idle(240_000));
  const kataMs = Date.now() - t;
  const cols1 = (await page.evaluate(() => window.__hc.state())).workers as { done: number };
  t = Date.now();
  await page.evaluate(() => window.__hc.setView({ xw: 90, pitch: -14 }));
  await page.evaluate(() => window.__hc.idle(240_000));
  const rotateMs = Date.now() - t;
  const final = await page.evaluate(() => window.__hc.state());
  const cols2 = final.workers as { done: number; genMs: number; lightMs: number; packMs: number };

  const report = {
    date: new Date().toISOString(),
    renderer: loaded.renderer,
    settings: { renderDistance: 4, internal: '360p', workers: (loaded as unknown as { workers: unknown }).workers },
    startup: { readyMs: tReady, fullyStreamedMs: tIdle, columns: loaded.columns, gpu: loaded.gpu, cpuMemMB: loaded.memMB },
    cpuFrameMs: cpu,
    render,
    streaming: {
      anaTwoChunks: { ms: kataMs, columnsGenerated: cols1.done - cols0.done },
      rotateXW90: { ms: rotateMs, columnsGenerated: cols2.done - cols1.done },
      perColumnWorkerMs: { generate: cols2.genMs, light: cols2.lightMs, pack: cols2.packMs },
    },
  };
  mkdirSync('test-results/bench', { recursive: true });
  writeFileSync(process.env.BENCH_OUT ?? 'test-results/bench/bench.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  expect(errors).toEqual([]);
});
