// Renderer: ray-march pass at internal resolution (MRT: colour + aux), then composite to
// the canvas, then the polytope line overlay. The per-frame path allocates nothing.

import type { Frame4 } from '../math/frame';
import type { World } from '../world/World';
import { mod } from '../world/constants';
import { GpuWorld } from './GpuWorld';
import { LineOverlay } from './LineOverlay';
import { SpriteBatch } from './SpriteBatch';
import { ENTITY_TEX_H, ENTITY_TEX_W, MOB_TEXELS, PART_BASE, PART_TEXELS } from '../game/mobs/MobManager';
import { Program } from './gl';
import fullscreenVs from './shaders/fullscreen.vert.glsl?raw';
import raymarchFs from './shaders/raymarch.frag.glsl?raw';
import compositeFs from './shaders/composite.frag.glsl?raw';

export interface SkyState {
  sunDir: Float64Array;
  moonDir: Float64Array;
  zenith: Float32Array;
  horizon: Float32Array;
  fog: Float32Array;
  sunColor: Float32Array;
  skyLight: Float32Array;
  blockLight: Float32Array;
  waterFog: Float32Array;
  ambient: number;
  /** Ambient light colour (realms tint it: the Ember Depths glow red). */
  ambientTint: Float32Array;
  daylight: number;
  time: number;
  moonPhase: number;
  stars: number;
  cloudCover: number;
  flash: number;
  storm: number;
  weatherFog: number;
  rain: number;
  snow: number;
}

export interface RenderParams {
  cam: Frame4;
  /** Eye position in world coordinates. */
  eye: Float64Array;
  fovY: number;
  maxDist: number;
  maxSteps: number;
  outline: number;
  wire: boolean;
  selectOn: boolean;
  select: Int32Array;
  /** Mining progress 0..1 on the selected cell (crack overlay). */
  breakProgress: number;
  /** Mobs packed into the entity buffer this frame (see MobManager.pack). */
  entityCount: number;
  entityData: Float32Array | null;
  underwater: number;
  hazard: Float32Array;
  blocked: Float32Array;
  /** Hostile mobs hidden kata / ana of the slice (R2 proximity warning), 0..1. */
  threat: Float32Array;
  vignette: number;
  damage: number;
  yaw: number;
  pitch: number;
  pixelated: boolean;
}

export interface RenderStats {
  internalW: number;
  internalH: number;
  gpuMs: number;
  avgSteps: number;
  maxSteps: number;
  statsAge: number;
}

export class Renderer {
  readonly gl: WebGL2RenderingContext;
  readonly canvas: HTMLCanvasElement;
  readonly gpu: GpuWorld;
  readonly lines: LineOverlay;
  readonly sprites: SpriteBatch;
  private readonly march: Program;
  private readonly comp: Program;
  private readonly vao: WebGLVertexArrayObject;
  private fb: WebGLFramebuffer | null = null;
  private colorTex: WebGLTexture | null = null;
  private auxTex: WebGLTexture | null = null;
  private iw = 0;
  private ih = 0;
  private readonly timerExt: { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null;
  private readonly queries: WebGLQuery[] = [];
  private queryPending: WebGLQuery[] = [];
  // Async readback of the aux buffer (average ray steps for F3).
  private pbo: WebGLBuffer | null = null;
  private pboSync: WebGLSync | null = null;
  private pboW = 0;
  private pboH = 0;
  private pboData = new Uint8Array(0);
  private lastReadback = 0;
  readonly stats: RenderStats = { internalW: 0, internalH: 0, gpuMs: 0, avgSteps: 0, maxSteps: 0, statsAge: 0 };
  collectStats = false;
  private readonly eyeLocal = new Float32Array(4);
  private readonly entityTex: WebGLTexture;

  constructor(canvas: HTMLCanvasElement, world: World) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', { antialias: false, depth: false, stencil: false, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: true });
    if (!gl) throw new Error('WebGL2 is not available in this browser.');
    this.gl = gl;
    this.gpu = new GpuWorld(gl, world);
    this.march = new Program(gl, fullscreenVs, raymarchFs, 'raymarch');
    this.comp = new Program(gl, fullscreenVs, compositeFs, 'composite');
    this.lines = new LineOverlay(gl);
    this.sprites = new SpriteBatch(gl);
    this.vao = gl.createVertexArray()!;
    const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2') as { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null;
    this.timerExt = ext;
    // Sampler units are fixed.
    this.march.use();
    const units: [string, number][] = [
      ['uChunkTable', 0],
      ['uBrickTable', 1],
      ['uBlockPool', 2],
      ['uLightPool', 3],
      ['uBlockInfo', 4],
      ['uShapes', 5],
      ['uAtlas', 6],
      ['uSurface', 7],
      ['uEntities', 8],
    ];
    for (const [n, u] of units) gl.uniform1i(this.march.loc(n), u);
    this.comp.use();
    gl.uniform1i(this.comp.loc('uColor'), 0);
    // Mob buffer: RGBA32F, rows filled as needed each frame.
    this.entityTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.entityTex);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA32F, ENTITY_TEX_W, ENTITY_TEX_H);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  }

  private ensureTargets(iw: number, ih: number): void {
    if (iw === this.iw && ih === this.ih && this.fb) return;
    const gl = this.gl;
    if (this.fb) gl.deleteFramebuffer(this.fb);
    if (this.colorTex) gl.deleteTexture(this.colorTex);
    if (this.auxTex) gl.deleteTexture(this.auxTex);
    const mk = (filter: number) => {
      const t = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, iw, ih);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    };
    this.colorTex = mk(gl.LINEAR);
    this.auxTex = mk(gl.NEAREST);
    this.fb = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.colorTex, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, this.auxTex, 0);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE) throw new Error(`framebuffer incomplete: 0x${status.toString(16)}`);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.iw = iw;
    this.ih = ih;
    this.stats.internalW = iw;
    this.stats.internalH = ih;
    // Readback buffer at 1/4 resolution (sampled rows/cols) is enough for averages.
    this.pboW = iw;
    this.pboH = ih;
    if (this.pbo) gl.deleteBuffer(this.pbo);
    this.pbo = gl.createBuffer();
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this.pbo);
    gl.bufferData(gl.PIXEL_PACK_BUFFER, iw * ih * 4, gl.STREAM_READ);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    this.pboData = new Uint8Array(iw * ih * 4);
    this.pboSync = null;
  }

  /** Render one frame. `internalH` is the ray-march resolution height. */
  render(p: RenderParams, sky: SkyState, world: World, internalH: number, now: number): void {
    const gl = this.gl;
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    const aspect = cw / ch;
    const ih = Math.max(90, Math.min(ch, Math.round(internalH)));
    const iw = Math.max(160, Math.round(ih * aspect));
    this.ensureTargets(iw, ih);
    const gw = this.gpu;

    const tanY = Math.tan(p.fovY / 2);
    const tanX = tanY * aspect;

    // Eye relative to the window's minimum corner (keeps float precision in an infinite world).
    const ox = world.ox * 16, oz = world.oz * 16, ow = world.ow * 16;
    const e = this.eyeLocal;
    e[0] = p.eye[0]! - ox;
    e[1] = p.eye[1]!;
    e[2] = p.eye[2]! - oz;
    e[3] = p.eye[3]! - ow;

    this.beginTimer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fb);
    gl.viewport(0, 0, iw, ih);
    const m = this.march;
    m.use();
    const cam = p.cam;
    gl.uniform4f(m.loc('uEye'), e[0]!, e[1]!, e[2]!, e[3]!);
    gl.uniform4f(m.loc('uRight'), cam.right[0]!, cam.right[1]!, cam.right[2]!, cam.right[3]!);
    gl.uniform4f(m.loc('uUp'), cam.up[0]!, cam.up[1]!, cam.up[2]!, cam.up[3]!);
    gl.uniform4f(m.loc('uFwd'), cam.fwd[0]!, cam.fwd[1]!, cam.fwd[2]!, cam.fwd[3]!);
    gl.uniform4f(m.loc('uHidden'), cam.hidden[0]!, cam.hidden[1]!, cam.hidden[2]!, cam.hidden[3]!);
    gl.uniform4f(m.loc('uUpVec'), cam.U[0]!, cam.U[1]!, cam.U[2]!, cam.U[3]!);
    gl.uniform1i(m.loc('uUpAxis'), cam.upAxis);
    gl.uniform2f(m.loc('uTan'), tanX, tanY);
    gl.uniform1f(m.loc('uPixel'), (2 * tanY) / ih);
    const N = gw.N;
    gl.uniform4i(m.loc('uWin'), N, gw.heightChunks, N * N * N, gw.surfaceSize);
    gl.uniform4i(m.loc('uWinMod'), mod(world.ox, N), 0, mod(world.oz, N), mod(world.ow, N));
    const S = gw.surfaceSize;
    gl.uniform4i(m.loc('uSurfMod'), mod(ox, S), 0, mod(oz, S), mod(ow, S));
    gl.uniform1f(m.loc('uMaxDist'), p.maxDist);
    gl.uniform1i(m.loc('uMaxSteps'), p.maxSteps);
    const sd = sky.sunDir, md = sky.moonDir;
    gl.uniform4f(m.loc('uSunDir'), sd[0]!, sd[1]!, sd[2]!, sd[3]!);
    gl.uniform4f(m.loc('uMoonDir'), md[0]!, md[1]!, md[2]!, md[3]!);
    gl.uniform3fv(m.loc('uZenith'), sky.zenith);
    gl.uniform3fv(m.loc('uHorizon'), sky.horizon);
    gl.uniform3fv(m.loc('uFog'), sky.fog);
    gl.uniform3fv(m.loc('uSunColor'), sky.sunColor);
    gl.uniform3fv(m.loc('uSkyLight'), sky.skyLight);
    gl.uniform3fv(m.loc('uBlockLight'), sky.blockLight);
    gl.uniform3fv(m.loc('uWaterFog'), sky.waterFog);
    gl.uniform1f(m.loc('uAmbient'), sky.ambient);
    gl.uniform3fv(m.loc('uAmbientTint'), sky.ambientTint);
    gl.uniform1f(m.loc('uDaylight'), sky.daylight);
    gl.uniform1f(m.loc('uTime'), sky.time);
    gl.uniform1f(m.loc('uMoonPhase'), sky.moonPhase);
    gl.uniform1f(m.loc('uStars'), sky.stars);
    gl.uniform1f(m.loc('uCloudCover'), sky.cloudCover);
    gl.uniform4f(m.loc('uCloudOrigin'), mod(ox, 4096), 0, mod(oz, 4096), mod(ow, 4096));
    gl.uniform1f(m.loc('uFlash'), sky.flash);
    gl.uniform1f(m.loc('uStorm'), sky.storm);
    gl.uniform1f(m.loc('uWeatherFog'), sky.weatherFog);
    gl.uniform1f(m.loc('uOutline'), p.outline);
    gl.uniform1i(m.loc('uWire'), p.wire ? 1 : 0);
    gl.uniform4i(m.loc('uSelect'), p.select[0]! - ox, p.select[1]!, p.select[2]! - oz, p.select[3]! - ow);
    gl.uniform1i(m.loc('uSelectOn'), p.selectOn ? 1 : 0);
    gl.uniform1f(m.loc('uBreak'), p.breakProgress);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, gw.chunkTable);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, gw.brickTable);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, gw.blockPool.tex);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, gw.lightPool.tex);
    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_2D, gw.blockInfoTex);
    gl.activeTexture(gl.TEXTURE5);
    gl.bindTexture(gl.TEXTURE_2D, gw.shapeTex);
    gl.activeTexture(gl.TEXTURE6);
    gl.bindTexture(gl.TEXTURE_2D, gw.atlasTex);
    gl.activeTexture(gl.TEXTURE7);
    gl.bindTexture(gl.TEXTURE_3D, gw.surfaceTex);
    gl.activeTexture(gl.TEXTURE8);
    gl.bindTexture(gl.TEXTURE_2D, this.entityTex);
    const ec = p.entityData ? p.entityCount : 0;
    if (ec > 0 && p.entityData) {
      // Upload the rows holding mob records and their parts.
      let parts = 0;
      for (let e = 0; e < ec; e++) parts = Math.max(parts, p.entityData[e * MOB_TEXELS * 4 + 17]! + p.entityData[e * MOB_TEXELS * 4 + 18]!);
      const texels = PART_BASE + parts * PART_TEXELS;
      const rows = Math.min(ENTITY_TEX_H, Math.ceil(texels / ENTITY_TEX_W));
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, ENTITY_TEX_W, rows, gl.RGBA, gl.FLOAT, p.entityData, 0);
    }
    gl.uniform1i(m.loc('uEntityCount'), ec);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    if (this.collectStats) this.readbackStats(now);

    // Composite to the canvas.
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, cw, ch);
    const c = this.comp;
    c.use();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.colorTex);
    const filter = p.pixelated ? gl.NEAREST : gl.LINEAR;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.uniform2f(c.loc('uRes'), cw, ch);
    gl.uniform1f(c.loc('uTime'), sky.time);
    gl.uniform1f(c.loc('uUnderwater'), p.underwater);
    gl.uniform3fv(c.loc('uWaterTint'), sky.waterFog);
    gl.uniform1f(c.loc('uRain'), sky.rain);
    gl.uniform1f(c.loc('uSnow'), sky.snow);
    gl.uniform1f(c.loc('uStorm'), sky.storm);
    gl.uniform1f(c.loc('uFlash'), sky.flash);
    gl.uniform2f(c.loc('uHazard'), p.hazard[0]!, p.hazard[1]!);
    gl.uniform2f(c.loc('uBlocked'), p.blocked[0]!, p.blocked[1]!);
    gl.uniform2f(c.loc('uThreat'), p.threat[0]!, p.threat[1]!);
    gl.uniform1f(c.loc('uVignette'), p.vignette);
    gl.uniform2f(c.loc('uLook'), p.yaw, p.pitch);
    gl.uniform1f(c.loc('uDamage'), p.damage);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);

    this.sprites.fade = p.maxDist * 0.75;
    this.sprites.draw(this.auxTex!, tanX, tanY, cw, ch);
    this.lines.draw(this.auxTex!, tanX, tanY, cw, ch);
    this.endTimer();
  }

  private beginTimer(): void {
    const ext = this.timerExt;
    if (!ext) return;
    const gl = this.gl;
    // Resolve finished queries.
    while (this.queryPending.length) {
      const q = this.queryPending[0]!;
      if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break;
      const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT) as boolean;
      const ns = gl.getQueryParameter(q, gl.QUERY_RESULT) as number;
      if (!disjoint) this.stats.gpuMs += (ns / 1e6 - this.stats.gpuMs) * 0.1;
      this.queryPending.shift();
      this.queries.push(q);
    }
    if (this.queryPending.length > 3) return;
    const q = this.queries.pop() ?? gl.createQuery()!;
    gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
    this.queryPending.push(q);
    this.timing = true;
  }

  private timing = false;

  private endTimer(): void {
    if (!this.timerExt || !this.timing) return;
    this.gl.endQuery(this.timerExt.TIME_ELAPSED_EXT);
    this.timing = false;
  }

  get hasGpuTimer(): boolean {
    return this.timerExt !== null;
  }

  private readbackStats(now: number): void {
    const gl = this.gl;
    if (this.pboSync) {
      const r = gl.clientWaitSync(this.pboSync, 0, 0);
      if (r === gl.ALREADY_SIGNALED || r === gl.CONDITION_SATISFIED) {
        gl.deleteSync(this.pboSync);
        this.pboSync = null;
        gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this.pbo);
        gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, this.pboData);
        gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
        let sum = 0;
        let mx = 0;
        const d = this.pboData;
        const n = this.pboW * this.pboH;
        for (let i = 0; i < n; i++) {
          const s = d[i * 4 + 2]!;
          sum += s;
          if (s > mx) mx = s;
        }
        this.stats.avgSteps = sum / n;
        this.stats.maxSteps = mx;
        this.stats.statsAge = now;
      }
      return;
    }
    if (now - this.lastReadback < 500) return;
    this.lastReadback = now;
    gl.readBuffer(gl.COLOR_ATTACHMENT1);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this.pbo);
    gl.readPixels(0, 0, this.pboW, this.pboH, gl.RGBA, gl.UNSIGNED_BYTE, 0);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    gl.readBuffer(gl.COLOR_ATTACHMENT0);
    this.pboSync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
  }

  /** Synchronous read of the canvas (tests/screenshots). */
  readAux(): Uint8Array {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fb);
    gl.readBuffer(gl.COLOR_ATTACHMENT1);
    const out = new Uint8Array(this.iw * this.ih * 4);
    gl.readPixels(0, 0, this.iw, this.ih, gl.RGBA, gl.UNSIGNED_BYTE, out);
    gl.readBuffer(gl.COLOR_ATTACHMENT0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return out;
  }
}
