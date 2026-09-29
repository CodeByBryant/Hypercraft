// Instanced camera-facing sprites (ambient particles now; dropped items and break debris
// later). Depth-tested against the ray marcher's aux buffer like the line overlay.

import { Program } from './gl';
import vs from './shaders/sprites.vert.glsl?raw';
import fs from './shaders/sprites.frag.glsl?raw';

const MAX_SPRITES = 4096;
const FLOATS = 12; // center.xyzr, color.rgba, shape, spin, icon uv

export const SPRITE_SOFT = 0;
export const SPRITE_SQUARE = 1;
export const SPRITE_GLOW = 2;
export const SPRITE_FLAKE = 3;
export const SPRITE_ITEM = 4;

export class SpriteBatch {
  private readonly gl: WebGL2RenderingContext;
  private readonly prog: Program;
  private readonly vao: WebGLVertexArrayObject;
  private readonly buf: WebGLBuffer;
  private readonly data = new Float32Array(MAX_SPRITES * FLOATS);
  private count = 0;
  /** Distance at which sprites have fully faded. */
  fade = 64;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.prog = new Program(gl, vs, fs, 'sprites');
    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);
    const corner = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, corner);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.buf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferData(gl.ARRAY_BUFFER, this.data.byteLength, gl.DYNAMIC_DRAW);
    const stride = FLOATS * 4;
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, stride, 0);
    gl.vertexAttribDivisor(1, 1);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 4, gl.FLOAT, false, stride, 16);
    gl.vertexAttribDivisor(2, 1);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 4, gl.FLOAT, false, stride, 32);
    gl.vertexAttribDivisor(3, 1);
    gl.bindVertexArray(null);
  }

  clear(): void {
    this.count = 0;
  }

  get size(): number {
    return this.count;
  }

  private icons: WebGLTexture | null = null;

  /** Item icon sheet for SPRITE_ITEM sprites. */
  setIcons(canvas: HTMLCanvasElement): void {
    const gl = this.gl;
    this.icons = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.icons);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  /** Add an item icon sprite (icon cell origin in sheet UV). */
  addItem(x: number, y: number, z: number, r: number, bright: number, u: number, v: number): void {
    this.add(x, y, z, r, bright, bright, bright, 1, SPRITE_ITEM, 0, u, v);
  }

  /** Add a sprite at camera-space (x, y, z) with on-screen world radius r. */
  add(x: number, y: number, z: number, r: number, cr: number, cg: number, cb: number, ca: number, shape: number, spin: number, u = 0, v = 0): void {
    if (this.count >= MAX_SPRITES || z < 0.05 + r) return;
    const d = this.data;
    const k = this.count * FLOATS;
    d[k] = x;
    d[k + 1] = y;
    d[k + 2] = z;
    d[k + 3] = r;
    d[k + 4] = cr;
    d[k + 5] = cg;
    d[k + 6] = cb;
    d[k + 7] = ca;
    d[k + 8] = shape;
    d[k + 9] = spin;
    d[k + 10] = u;
    d[k + 11] = v;
    this.count++;
  }

  draw(aux: WebGLTexture, tanX: number, tanY: number, width: number, height: number): void {
    if (this.count === 0) return;
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.data, 0, this.count * FLOATS);
    this.prog.use();
    gl.uniform2f(this.prog.loc('uTan'), tanX, tanY);
    gl.uniform2f(this.prog.loc('uRes'), width, height);
    gl.uniform1f(this.prog.loc('uFade'), this.fade);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, aux);
    gl.uniform1i(this.prog.loc('uAux'), 0);
    if (this.icons) {
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.icons);
      gl.activeTexture(gl.TEXTURE0);
    }
    gl.uniform1i(this.prog.loc('uIcons'), 1);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.bindVertexArray(this.vao);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.count);
    gl.bindVertexArray(null);
    gl.disable(gl.BLEND);
  }
}
