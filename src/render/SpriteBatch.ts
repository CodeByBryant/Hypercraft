// Instanced camera-facing sprites (ambient particles now; dropped items and break debris
// later). Depth-tested against the ray marcher's aux buffer like the line overlay.

import { Program } from './gl';
import vs from './shaders/sprites.vert.glsl?raw';
import fs from './shaders/sprites.frag.glsl?raw';

const MAX_SPRITES = 4096;
const FLOATS = 10; // center.xyzr, color.rgba, shape, spin

export const SPRITE_SOFT = 0;
export const SPRITE_SQUARE = 1;
export const SPRITE_GLOW = 2;
export const SPRITE_FLAKE = 3;

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
    gl.vertexAttribPointer(3, 2, gl.FLOAT, false, stride, 32);
    gl.vertexAttribDivisor(3, 1);
    gl.bindVertexArray(null);
  }

  clear(): void {
    this.count = 0;
  }

  get size(): number {
    return this.count;
  }

  /** Add a sprite at camera-space (x, y, z) with on-screen world radius r. */
  add(x: number, y: number, z: number, r: number, cr: number, cg: number, cb: number, ca: number, shape: number, spin: number): void {
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
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.bindVertexArray(this.vao);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.count);
    gl.bindVertexArray(null);
    gl.disable(gl.BLEND);
  }
}
