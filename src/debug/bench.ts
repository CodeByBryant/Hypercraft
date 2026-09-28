// In-game benchmark (open the game with ?bench=1). Waits for the world to stream in, then
// renders fixed scenarios at fixed internal resolutions and reports frame-time statistics.
// This is how R5 (60 fps at 360p on integrated GPUs, 30+ fps at 720p on mid discrete GPUs)
// is checked on real hardware. Results: on-screen table, console, and window.__hcBench.

import { makeTiltedFrame } from '../math/frame';
import type { Game } from '../game/Game';

interface Scenario {
  name: string;
  res: number;
  view: { yaw?: number; pitch?: number; xw?: number; zw?: number };
  spin?: boolean;
}

export interface BenchResult {
  name: string;
  res: number;
  frames: number;
  avgMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  fps: number;
  gpuMs: number | null;
  avgSteps: number;
}

const SCENARIOS: Scenario[] = [];
for (const res of [360, 720]) {
  SCENARIOS.push({ name: 'axis-aligned', res, view: { pitch: -14 } });
  SCENARIOS.push({ name: 'xw30', res, view: { xw: 30, pitch: -14 } });
  SCENARIOS.push({ name: 'xw45+zw45', res, view: { xw: 45, zw: 45, pitch: -14 } });
  SCENARIOS.push({ name: 'spin+tilt', res, view: { pitch: -10 }, spin: true });
}

const nextFrame = () => new Promise<number>((r) => requestAnimationFrame((t) => r(t)));

export async function runBenchmark(game: Game, overlay: HTMLElement): Promise<BenchResult[]> {
  overlay.style.cssText =
    'position:absolute;left:8px;top:8px;padding:10px 12px;background:rgba(0,0,0,.72);color:#eef;font:12px monospace;white-space:pre;border-radius:4px;z-index:10';
  const say = (s: string) => (overlay.textContent = s);
  say('HYPERCRAFT benchmark\nwaiting for terrain…');
  while (!game.loaded) await nextFrame();
  // Hover above spawn looking at the test garden.
  game.player.flying = true;
  game.player.setPosition(0.5, game.spawn[1] + 3, -3.5, 0.5);
  let calm = 0;
  while (calm < 30) {
    const busy = game.streamer.pendingCount > 0 || game.light.pending() > 0 || game.world.dirtyChunks.length > 0;
    calm = busy ? 0 : calm + 1;
    await nextFrame();
  }
  game.renderMode = 'continuous';
  game.renderer.collectStats = true;
  const results: BenchResult[] = [];
  const lines: string[] = [];
  const gl = game.renderer.gl;
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  const gpuName = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));
  for (const sc of SCENARIOS) {
    game.scaler.mode = 'fixed';
    game.scaler.fixedHeight = sc.res;
    game.player.cam.copyFrom(makeTiltedFrame({ yawDeg: sc.view.yaw ?? 0, pitchDeg: sc.view.pitch ?? 0, xwDeg: sc.view.xw ?? 0, zwDeg: sc.view.zw ?? 0 }));
    say(`HYPERCRAFT benchmark (${gpuName})\n${lines.join('\n')}\nrunning ${sc.name} @ ${sc.res}p…`);
    // Warm up 1 s (also lets streaming settle after rotation).
    let t0 = await nextFrame();
    while ((await nextFrame()) - t0 < 1000) if (sc.spin) spin(game);
    const times: number[] = [];
    let last = await nextFrame();
    t0 = last;
    while (last - t0 < 4000) {
      if (sc.spin) spin(game);
      const t = await nextFrame();
      times.push(t - last);
      last = t;
    }
    times.sort((a, b) => a - b);
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    const pct = (p: number) => times[Math.min(times.length - 1, Math.floor(times.length * p))]!;
    const r: BenchResult = {
      name: sc.name,
      res: sc.res,
      frames: times.length,
      avgMs: avg,
      p50Ms: pct(0.5),
      p95Ms: pct(0.95),
      p99Ms: pct(0.99),
      fps: 1000 / avg,
      gpuMs: game.renderer.hasGpuTimer ? game.renderer.stats.gpuMs : null,
      avgSteps: game.renderer.stats.avgSteps,
    };
    results.push(r);
    lines.push(
      `${sc.name.padEnd(13)} ${String(sc.res).padStart(4)}p  ${r.fps.toFixed(1).padStart(6)} fps  avg ${r.avgMs.toFixed(2)} ms  p95 ${r.p95Ms.toFixed(2)} ms  gpu ${r.gpuMs === null ? 'n/a' : r.gpuMs.toFixed(2) + ' ms'}  steps ${r.avgSteps.toFixed(1)}`,
    );
  }
  game.scaler.mode = 'auto';
  say(
    `HYPERCRAFT benchmark — ${gpuName}\n${lines.join('\n')}\n\nNote: fps is capped by the display refresh (vsync); the GPU column (timer query) is the\nuncapped render cost when the browser exposes EXT_disjoint_timer_query_webgl2.`,
  );
  (window as unknown as { __hcBench: unknown }).__hcBench = { gpu: gpuName, results };
  console.log('HYPERCRAFT benchmark', JSON.stringify({ gpu: gpuName, results }, null, 2));
  return results;
}

function spin(game: Game): void {
  game.player.cam.yaw(0.02);
  game.player.cam.tiltRH(0.006);
}
