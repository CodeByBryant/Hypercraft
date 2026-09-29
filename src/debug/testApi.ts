// Hooks for Playwright tests and benchmarks (window.__hc). Exposed in every build: they only
// drive the same public game methods a player uses, which keeps smoke tests honest.

import { makeTiltedFrame } from '../math/frame';
import { REG } from '../content/registry';
import type { Game } from '../game/Game';
import type { WeatherKind } from '../content/types';
import { IREG } from '../content/itemRegistry';
import type { InventoryScreen } from '../ui/InventoryScreen';

export interface ViewSpec {
  yaw?: number;
  pitch?: number;
  xw?: number;
  zw?: number;
}

export function installTestApi(game: Game, screen?: InventoryScreen): void {
  const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
  const px = new Uint8Array(4);
  /** gl.finish() does not block on Chrome's GPU process; a 1-pixel read does. */
  const sync = () => {
    const gl = game.renderer.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  };
  const api = {
    game,
    /** Resolves when the spawn column is loaded and physics is running. */
    async ready(timeoutMs = 60000): Promise<void> {
      const t0 = performance.now();
      while (!game.loaded) {
        if (performance.now() - t0 > timeoutMs) throw new Error('timeout waiting for spawn');
        await nextFrame();
      }
    },
    /** Resolves when streaming, lighting and uploads have all settled. */
    async idle(timeoutMs = 120000): Promise<void> {
      const t0 = performance.now();
      let calm = 0;
      while (calm < 5) {
        const busy =
          game.streamer.pendingCount > 0 ||
          game.light.pending() > 0 ||
          game.renderer.gpu.stats.queued > 0 ||
          game.world.dirtyChunks.length > 0;
        calm = busy ? 0 : calm + 1;
        if (performance.now() - t0 > timeoutMs) throw new Error('timeout waiting for idle');
        await nextFrame();
      }
    },
    frames: async (n = 1) => {
      for (let i = 0; i < n; i++) await nextFrame();
    },
    /** Switch to on-demand rendering (software GL in CI renders ~1 frame/s). */
    manual(on = true): void {
      game.renderMode = on ? 'manual' : 'continuous';
    },
    /** Render one frame now and wait for the GPU to finish it; returns ms. */
    renderNow(): number {
      sync();
      const t0 = performance.now();
      game.renderImmediate();
      sync();
      return performance.now() - t0;
    },
    /** Median ms per synchronous render over `n` renders (GPU included via gl.finish). */
    benchRender(n = 5): number {
      const times: number[] = [];
      game.renderImmediate();
      sync();
      for (let i = 0; i < n; i++) {
        const t0 = performance.now();
        game.renderImmediate();
        sync();
        times.push(performance.now() - t0);
      }
      times.sort((a, b) => a - b);
      return times[Math.floor(times.length / 2)]!;
    },
    /** Average / max ray steps per pixel of the last render (synchronous readback). */
    raySteps(): { avg: number; max: number; p95: number } {
      const aux = game.renderer.readAux();
      const hist = new Uint32Array(256);
      let sum = 0;
      let mx = 0;
      const n = aux.length / 4;
      for (let i = 0; i < n; i++) {
        const s = aux[i * 4 + 2]!;
        sum += s;
        hist[s] = hist[s]! + 1;
        if (s > mx) mx = s;
      }
      let acc = 0;
      let p95 = 0;
      for (let i = 0; i < 256; i++) {
        acc += hist[i]!;
        if (acc >= n * 0.95) {
          p95 = i;
          break;
        }
      }
      return { avg: sum / n, max: mx, p95 };
    },
    teleport(x: number, y: number, z: number, w: number): void {
      game.player.setPosition(x, y, z, w);
      game.streamer.invalidate();
    },
    /** Set the view: base frame, then XW and ZW slice tilts (degrees), then yaw/pitch. */
    setView(v: ViewSpec): void {
      const f = makeTiltedFrame({ yawDeg: v.yaw ?? 0, pitchDeg: v.pitch ?? 0, xwDeg: v.xw ?? 0, zwDeg: v.zw ?? 0 });
      game.player.cam.copyFrom(f);
      game.streamer.invalidate();
    },
    setFlying(on: boolean): void {
      game.player.flying = on;
    },
    setMode(m: 'survival' | 'creative' | 'spectator'): void {
      game.player.mode = m;
    },
    key(code: string, down: boolean): void {
      game.input.setKey(code, down);
    },
    breakTarget: () => game.breakTarget(),
    /** Give items to the player (Phase 3). */
    give(name: string, count = 1): number {
      return game.inv.add({ id: IREG.id(name), count, damage: 0 });
    },
    inventory(): [number, string, number, number][] {
      const out: [number, string, number, number][] = [];
      for (let i = 0; i < game.inv.size; i++) {
        const s = game.inv.get(i);
        if (s) out.push([i, IREG.name(s.id), s.count, s.damage]);
      }
      return out;
    },
    clearInventory(): void {
      game.inv.clear();
    },
    select(i: number): void {
      game.hotbarIndex = i;
    },
    /**
     * Hold the break button until the targeted block is gone (survival mining takes time);
     * returns the seconds it took, or -1 on timeout.
     */
    async mine(timeoutMs = 20000): Promise<number> {
      const t = game.hasTarget ? { ...game.target } : null;
      if (!t) return -1;
      const t0 = performance.now();
      game.input.setButton(0, true);
      try {
        while (performance.now() - t0 < timeoutMs) {
          await nextFrame();
          if ((game.world.getBlock(t.x, t.y, t.z, t.w) & 0xfff) !== (t.voxel & 0xfff)) return (performance.now() - t0) / 1000;
        }
        return -1;
      } finally {
        game.input.setButton(0, false);
      }
    },
    /** Dropped item entities: [name, count, x, y, z, w]. */
    dropped: () => game.items.list.map((e) => [IREG.name(e.stack.id), e.stack.count, ...Array.from(e.pos)] as [string, number, ...number[]]),
    /** Right-click the target (open stations, use items, place). */
    use(): void {
      game.input.setButton(2, true);
      requestAnimationFrame(() => game.input.setButton(2, false));
    },
    screenOpen: () => screen?.isOpen ?? false,
    closeScreen: () => screen?.close(),
    openInventory: () => game.onOpenScreen?.({ kind: 'inventory' }),
    blockEntity: (x: number, y: number, z: number, w: number) => game.blockEntities.get(x, y, z, w),
    /** Put a stack into a chest/furnace slot. */
    beSet(x: number, y: number, z: number, w: number, slot: number, name: string | null, count = 1): boolean {
      const c = game.blockEntities.container(x, y, z, w);
      if (!c) return false;
      c.set(slot, name ? { id: IREG.id(name), count, damage: 0 } : null);
      return true;
    },
    beGet(x: number, y: number, z: number, w: number, slot: number): [string, number] | null {
      const s = game.blockEntities.container(x, y, z, w)?.get(slot);
      return s ? [IREG.name(s.id), s.count] : null;
    },
    tickWorld(seconds: number): void {
      for (let t = 0; t < seconds; t += 0.05) game.blockEntities.tick(0.05);
    },
    placeTarget: (name: string) => game.placeAtTarget(REG.id(name)),
    target: () => (game.hasTarget ? { ...game.target, p: Array.from(game.target.p), name: REG.name(game.target.voxel) } : null),
    blockAt: (x: number, y: number, z: number, w: number) => REG.name(game.world.getBlock(x, y, z, w)),
    setTime: (t: number) => game.env.setTime(t),
    setWeather: (w: WeatherKind) => game.env.setWeather(w),
    setResolution(h: number | 'auto'): void {
      if (h === 'auto') game.scaler.mode = 'auto';
      else {
        game.scaler.mode = 'fixed';
        game.scaler.fixedHeight = h;
      }
    },
    setWire: (on: boolean) => {
      game.params.wire = on;
    },
    setDebug: (on: boolean) => {
      game.showDebug = on;
    },
    state() {
      const p = game.player;
      const rs = game.renderer.stats;
      return {
        pos: Array.from(p.pos),
        eye: Array.from(game.eye()),
        hidden: Array.from(p.cam.hidden),
        fwd: Array.from(p.cam.fwd),
        onGround: p.onGround,
        loaded: game.loaded,
        fps: game.fps,
        frameMs: game.frameMs,
        cpuMs: game.cpuMs,
        gpuMs: rs.gpuMs,
        hasGpuTimer: game.renderer.hasGpuTimer,
        internal: [rs.internalW, rs.internalH],
        avgSteps: rs.avgSteps,
        maxSteps: rs.maxSteps,
        columns: game.world.columns.size,
        pending: game.streamer.pendingCount,
        backlog: game.streamer.backlog,
        workers: { ...game.pool.stats },
        gpu: { ...game.renderer.gpu.stats },
        lightPending: game.light.pending(),
        memMB: game.world.memoryBytes() / 1048576,
        renderer: (() => {
          const gl = game.renderer.gl;
          const ext = gl.getExtension('WEBGL_debug_renderer_info');
          return ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));
        })(),
      };
    },
  };
  (window as unknown as { __hc: typeof api }).__hc = api;
}
