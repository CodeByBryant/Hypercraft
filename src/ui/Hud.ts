// DOM HUD: crosshair, hotbar, hidden-axis compass + radar (R2 fairness), F3 debug overlay,
// toasts, loading and pause screens. Updated at a throttled rate; hidden panels cost nothing.

import { REG, hexToRgb, voxelId, FLUID_LAVA, FLUID_WATER } from '../content/registry';
import { TICKS_PER_DAY } from '../env/Environment';
import type { Game } from '../game/Game';
import { VOID_VOXEL } from '../world/constants';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent: HTMLElement, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  parent.appendChild(e);
  return e;
}

const AXIS = ['X', 'Y', 'Z', 'W'];
const AXIS_COLORS = ['#ff5a4e', '#57e05f', '#4d86ff', '#ff5cf0'];

function fmt(v: number, d = 2): string {
  return (v >= 0 ? ' ' : '') + v.toFixed(d);
}

function blockColor(id: number): string {
  const t = REG.textures[REG.texSide[id]!];
  if (!t) return '#888';
  const [r, g, b] = hexToRgb(t.colors[0]!);
  return `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`;
}

export class Hud {
  readonly root: HTMLElement;
  private readonly game: Game;
  private readonly debug: HTMLPreElement;
  private readonly hotbar: HTMLDivElement;
  private readonly slots: HTMLDivElement[] = [];
  private readonly toast: HTMLDivElement;
  private readonly loading: HTMLDivElement;
  private readonly loadingText: HTMLDivElement;
  private readonly radar: HTMLCanvasElement;
  private readonly radarCtx: CanvasRenderingContext2D;
  private readonly radarImg: ImageData;
  private readonly compass: HTMLDivElement;
  private readonly bars: HTMLDivElement[] = [];
  private readonly compassText: HTMLDivElement;
  private readonly mode: HTMLDivElement;
  private toastTimer = 0;
  private slowTimer = 0;
  private lastHotbar = -1;
  private lastHotbarVersion = -1;
  /** Base colour per block id (radar), precomputed so the radar does not allocate. */
  private readonly rgb = new Float32Array(REG.count * 3);

  constructor(parent: HTMLElement, game: Game) {
    this.game = game;
    this.root = el('div', 'hud', parent);
    el('div', 'crosshair', this.root);
    this.debug = el('pre', 'debug', this.root);
    this.debug.style.display = 'none';
    this.hotbar = el('div', 'hotbar', this.root);
    this.toast = el('div', 'toast', this.root);
    this.mode = el('div', 'mode', this.root);

    // Hidden-axis compass + radar (bottom right).
    this.compass = el('div', 'compass', this.root);
    el('div', 'compass-title', this.compass, 'HIDDEN AXIS h');
    const barBox = el('div', 'bars', this.compass);
    for (let i = 0; i < 4; i++) {
      if (i === 1) continue;
      const row = el('div', 'bar-row', barBox);
      el('span', 'bar-label', row, AXIS[i]);
      const track = el('div', 'bar-track', row);
      const fill = el('div', 'bar-fill', track);
      fill.style.background = AXIS_COLORS[i]!;
      this.bars[i] = fill;
    }
    this.compassText = el('div', 'compass-text', this.compass);
    this.radar = el('canvas', 'radar', this.compass);
    this.radar.width = 25;
    this.radar.height = 25;
    this.radarCtx = this.radar.getContext('2d')!;
    this.radarImg = this.radarCtx.createImageData(25, 25);
    const legend = el('div', 'radar-legend', this.compass);
    legend.innerHTML = '<span>&#8593; ana (+h)</span><span>&#8594; right</span>';

    this.loading = el('div', 'loading', this.root);
    el('div', 'loading-title', this.loading, 'HYPERCRAFT');
    this.loadingText = el('div', 'loading-text', this.loading, 'Generating 4D terrain…');

    for (let id = 0; id < REG.count; id++) {
      const t = REG.textures[REG.texSide[id]!];
      const c = t ? hexToRgb(t.colors[0]!) : [0.5, 0.5, 0.5];
      this.rgb[id * 3] = c[0]!;
      this.rgb[id * 3 + 1] = c[1]!;
      this.rgb[id * 3 + 2] = c[2]!;
    }
    this.renderHotbar();
  }

  showMessage(text: string): void {
    this.toast.textContent = text;
    this.toast.style.opacity = '1';
    this.toastTimer = 2.2;
  }

  setVisible(v: boolean): void {
    this.root.style.display = v ? 'block' : 'none';
  }

  private renderHotbar(): void {
    const g = this.game;
    this.hotbar.innerHTML = '';
    this.slots.length = 0;
    g.hotbar.forEach((id, i) => {
      const s = el('div', 'slot', this.hotbar);
      const sw = el('div', 'swatch', s);
      sw.style.background = blockColor(id);
      if (i < 9) el('span', 'key', s, String(i + 1));
      s.title = REG.blocks[id]?.displayName ?? REG.blocks[id]?.name ?? '';
      s.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        g.hotbarIndex = i;
      });
      this.slots.push(s);
    });
    this.lastHotbarVersion = g.hotbarVersion;
  }

  update(dt: number): void {
    const g = this.game;
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.toast.style.opacity = '0';
    }
    if (g.hotbarVersion !== this.lastHotbarVersion) this.renderHotbar();
    if (g.hotbarIndex !== this.lastHotbar) {
      this.slots.forEach((s, i) => s.classList.toggle('active', i === g.hotbarIndex));
      this.lastHotbar = g.hotbarIndex;
      const id = g.hotbar[g.hotbarIndex]!;
      this.showMessage(REG.blocks[id]?.displayName ?? REG.blocks[id]!.name);
    }
    this.loading.style.display = g.loaded ? 'none' : 'flex';
    if (!g.loaded) {
      this.loadingText.textContent = `Generating 4D terrain… ${g.world.columns.size} columns`;
    }
    this.slowTimer -= dt;
    if (this.slowTimer > 0) return;
    this.slowTimer = 0.1;
    this.updateCompass();
    this.updateRadar();
    const p = g.player;
    this.mode.textContent = `${p.mode.toUpperCase()}${p.flying ? ' · FLYING' : ''}${g.params.wire ? ' · WIREFRAME' : ''}`;
    this.debug.style.display = g.showDebug ? 'block' : 'none';
    if (g.showDebug) this.debug.textContent = this.debugText();
  }

  private updateCompass(): void {
    const h = this.game.player.cam.hidden;
    for (let i = 0; i < 4; i++) {
      const b = this.bars[i];
      if (!b) continue;
      const v = h[i]!;
      b.style.width = `${Math.abs(v) * 50}%`;
      b.style.left = v >= 0 ? '50%' : `${50 - Math.abs(v) * 50}%`;
    }
    const tilt = (this.game.player.cam.hiddenAxisTilt() * 180) / Math.PI;
    let dom = 0;
    for (let i = 1; i < 4; i++) if (Math.abs(h[i]!) > Math.abs(h[dom]!)) dom = i;
    const sgn = h[dom]! >= 0 ? '+' : '−';
    const w = this.game.eye()[3]!;
    this.compassText.textContent = tilt < 0.5 ? `h = ${sgn}${AXIS[dom]} (aligned) · w ${w.toFixed(1)}` : `h ≈ ${sgn}${AXIS[dom]}, tilt ${tilt.toFixed(1)}° · w ${w.toFixed(1)}`;
  }

  /**
   * 25x25 view of the plane spanned by R (right, horizontal) and H (ana, vertical) through
   * the player's body: shows what is kata/ana of you, which the 3D slice cannot.
   */
  private updateRadar(): void {
    const g = this.game;
    const p = g.player;
    const R = p.cam.R, H = p.cam.H;
    const d = this.radarImg.data;
    const up = p.up;
    const pos = p.pos;
    for (let j = 0; j < 25; j++) {
      for (let i = 0; i < 25; i++) {
        const a = i - 12, b = 12 - j;
        let solid = 0;
        let lava = false, water = false;
        let r = 0, gg = 0, bb = 0;
        const x = pos[0]! + R[0]! * a + H[0]! * b;
        const z = pos[2]! + R[2]! * a + H[2]! * b;
        const w = pos[3]! + R[3]! * a + H[3]! * b;
        const fx = Math.floor(x), fz = Math.floor(z), fw = Math.floor(w);
        const y0 = Math.floor(pos[up]! + 0.3);
        // Body height (feet, head): walls.
        for (let hgt = 0; hgt < 2; hgt++) {
          const v = g.world.getBlock(fx, y0 + hgt, fz, fw);
          if (v === VOID_VOXEL) continue;
          const id = voxelId(v);
          if (REG.fluid[id] === FLUID_LAVA) lava = true;
          else if (REG.fluid[id] === FLUID_WATER) water = true;
          else if (REG.solid[id]) {
            solid++;
            r += this.rgb[id * 3]!;
            gg += this.rgb[id * 3 + 1]!;
            bb += this.rgb[id * 3 + 2]!;
          }
        }
        // Floor under a passable cell: hazards and drops you would walk into along ±h.
        let floor = 0; // 0 drop, 1 ground, 2 lava, 3 water
        if (solid === 0 && !lava && !water) {
          const v = g.world.getBlock(fx, y0 - 1, fz, fw);
          const id = voxelId(v);
          if (v === VOID_VOXEL) floor = 1;
          else if (REG.fluid[id] === FLUID_LAVA) floor = 2;
          else if (REG.fluid[id] === FLUID_WATER) floor = 3;
          else if (REG.solid[id]) floor = 1;
        }
        const o = (j * 25 + i) * 4;
        if (lava || floor === 2) {
          d[o] = 255;
          d[o + 1] = lava ? 90 : 120;
          d[o + 2] = 20;
          d[o + 3] = 255;
        } else if (solid > 0) {
          const k = solid === 2 ? 255 : 170;
          d[o] = Math.min(255, (r / solid) * k);
          d[o + 1] = Math.min(255, (gg / solid) * k);
          d[o + 2] = Math.min(255, (bb / solid) * k);
          d[o + 3] = solid === 2 ? 235 : 150;
        } else if (water || floor === 3) {
          d[o] = 50;
          d[o + 1] = 110;
          d[o + 2] = 230;
          d[o + 3] = water ? 220 : 170;
        } else if (floor === 1) {
          d[o] = 40;
          d[o + 1] = 48;
          d[o + 2] = 62;
          d[o + 3] = 150;
        } else {
          // Drop-off: nothing to stand on.
          d[o] = 0;
          d[o + 1] = 0;
          d[o + 2] = 0;
          d[o + 3] = 235;
        }
        if (i === 12 && j === 12) {
          d[o] = 255;
          d[o + 1] = 255;
          d[o + 2] = 255;
          d[o + 3] = 255;
        }
        // The visible slice is the horizontal line through the centre.
        if (j === 12 && i !== 12) d[o + 3] = Math.max(d[o + 3]!, 200);
      }
    }
    this.radarCtx.putImageData(this.radarImg, 0, 0);
  }

  private debugText(): string {
    const g = this.game;
    const p = g.player;
    const e = g.eye();
    const cam = p.cam;
    const rs = g.renderer.stats;
    const gs = g.renderer.gpu.stats;
    const ws = g.pool.stats;
    const light = g.eyeLight();
    const bi = g.world.biomeAt(Math.floor(e[0]!), Math.floor(e[2]!), Math.floor(e[3]!));
    const biome = bi >= 0 ? REG.biomes[bi]!.displayName : '—';
    const tod = g.env.timeOfDay;
    const hours = Math.floor(((tod / TICKS_PER_DAY) * 24 + 6) % 24);
    const mins = Math.floor((((tod / TICKS_PER_DAY) * 24 + 6) % 1) * 60);
    let chunks = 0;
    for (const c of g.world.columns.values()) chunks += c.chunks.length;
    const v4 = (v: Float64Array) => `(${fmt(v[0]!)},${fmt(v[1]!)},${fmt(v[2]!)},${fmt(v[3]!)})`;
    const lines = [
      `HYPERCRAFT · Phase 1 engine`,
      `fps ${g.fps.toFixed(0)}  frame ${g.frameMs.toFixed(1)} ms  cpu ${g.cpuMs.toFixed(1)} ms  gpu ${g.renderer.hasGpuTimer ? rs.gpuMs.toFixed(2) + ' ms' : 'n/a'}`,
      `internal ${rs.internalW}x${rs.internalH} (${g.scaler.mode === 'auto' ? 'auto' : 'fixed'})  canvas ${g.canvas.width}x${g.canvas.height}`,
      `ray steps avg ${rs.avgSteps.toFixed(1)}  max ${rs.maxSteps}  (cap ${g.settings.maxSteps})`,
      ``,
      `xyzw ${e[0]!.toFixed(2)} ${e[1]!.toFixed(2)} ${e[2]!.toFixed(2)} ${e[3]!.toFixed(2)}  (eye)`,
      `chunk ${Math.floor(e[0]! / 16)} ${Math.floor(e[1]! / 16)} ${Math.floor(e[2]! / 16)} ${Math.floor(e[3]! / 16)}  vel ${v4(p.vel)}`,
      `hidden h ${v4(cam.hidden)}  tilt ${((cam.hiddenAxisTilt() * 180) / Math.PI).toFixed(1)}°`,
      `fwd    f ${v4(cam.fwd)}`,
      `right  r ${v4(cam.right)}`,
      `biome ${biome}  light sky ${light >> 4} block ${light & 15}  ${p.onGround ? 'ground' : 'air'}${p.inWater ? ' water' : ''}${p.onClimbable ? ' climb' : ''}`,
      ``,
      `columns ${g.world.columns.size} (chunks ${chunks})  pending ${g.streamer.pendingCount}  backlog ${g.streamer.backlog}  window ${g.world.N}³`,
      `workers ${g.pool.size}: gen ${ws.genMs.toFixed(1)} ms  light ${ws.lightMs.toFixed(1)} ms  pack ${ws.packMs.toFixed(1)} ms  done ${ws.done}`,
      `gpu pools: block ${(gs.blockGroups * 8 / 1000).toFixed(1)}k bricks  light ${(gs.lightGroups * 8 / 1000).toFixed(1)}k  ${(gs.poolBytes / 1048576).toFixed(0)} MB  regrows ${gs.regrows}`,
      `uploads ${gs.uploadsThisFrame} (${(gs.bytesThisFrame / 1024).toFixed(0)} KB, ${g.uploadMsFrame.toFixed(1)} ms)  queued ${gs.queued}  cpu mem ${(g.world.memoryBytes() / 1048576).toFixed(0)} MB`,
      `light queue ${g.light.pending()} (${g.lightMsFrame.toFixed(1)} ms)  fluids ${g.fluids.stats.pendingWater}/${g.fluids.stats.pendingLava}`,
      `time ${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}  day ${g.env.day}  moon ${g.env.moonPhase}/8  weather ${g.env.weather} ${(g.env.intensity * 100).toFixed(0)}%`,
    ];
    if (g.hasTarget) {
      const t = g.target;
      lines.push(`target ${REG.name(t.voxel)} @ ${t.x} ${t.y} ${t.z} ${t.w}  facet ${t.sign > 0 ? '+' : '-'}${AXIS[t.axis]}  dist ${t.t.toFixed(2)}`);
    }
    return lines.join('\n');
  }
}
