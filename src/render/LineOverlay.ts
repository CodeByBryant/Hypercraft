// CPU-computed cross-section polytope edges, drawn as thick lines on top of the scene.
// Used for the targeted block's outline (always) and, in P mode, for every exposed cell
// near the target. The polytopes come from sliceBoxEdges(), i.e. the exact intersection of
// the view hyperplane with each tesseract (or sub-voxel box): axis-aligned slices give
// cubes, tilted slices give the prisms the ray marcher shows.

import { sliceBoxEdges } from '../math/crossSection';
import type { Frame4 } from '../math/frame';
import { Program } from './gl';
import vs from './shaders/lines.vert.glsl?raw';
import fs from './shaders/lines.frag.glsl?raw';

const MAX_SEGMENTS = 16384;
const FLOATS_PER_INSTANCE = 10; // A.xyz, B.xyz, color.rgba

export class LineOverlay {
  private readonly gl: WebGL2RenderingContext;
  private readonly prog: Program;
  private readonly vao: WebGLVertexArrayObject;
  private readonly instBuf: WebGLBuffer;
  private readonly data = new Float32Array(MAX_SEGMENTS * FLOATS_PER_INSTANCE);
  private readonly seg4 = new Float64Array(64 * 8);
  private readonly bmin = new Float64Array(4);
  private readonly bmax = new Float64Array(4);
  private count = 0;
  width = 2.0;
  hiddenAlpha = 0.25;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.prog = new Program(gl, vs, fs, 'lines');
    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);
    const corner = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, corner);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, -1, 0, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.instBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instBuf);
    gl.bufferData(gl.ARRAY_BUFFER, this.data.byteLength, gl.DYNAMIC_DRAW);
    const stride = FLOATS_PER_INSTANCE * 4;
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 0);
    gl.vertexAttribDivisor(1, 1);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 3, gl.FLOAT, false, stride, 12);
    gl.vertexAttribDivisor(2, 1);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 4, gl.FLOAT, false, stride, 24);
    gl.vertexAttribDivisor(3, 1);
    gl.bindVertexArray(null);
  }

  clear(): void {
    this.count = 0;
  }

  get segments(): number {
    return this.count;
  }

  /**
   * Add the cross-section edges of box [min, max] (world coordinates, relative to `origin`
   * which is the eye) for the slice through the eye with the camera's hidden axis.
   * Coordinates are passed eye-relative to keep float precision.
   */
  addBox(relMin: ArrayLike<number>, relMax: ArrayLike<number>, cam: Frame4, r: number, g: number, b: number, a: number): number {
    for (let i = 0; i < 4; i++) {
      this.bmin[i] = relMin[i]!;
      this.bmax[i] = relMax[i]!;
    }
    const zero = ZERO;
    const n = sliceBoxEdges(this.bmin, this.bmax, zero, cam.hidden, this.seg4, 0, 64);
    let added = 0;
    for (let s = 0; s < n && this.count < MAX_SEGMENTS; s++) {
      if (this.pushSegment(s, cam, r, g, b, a)) added++;
    }
    return added;
  }

  private pushSegment(s: number, cam: Frame4, r: number, g: number, b: number, a: number): boolean {
    const p = this.seg4;
    const o = s * 8;
    // camera space
    let ax = 0, ay = 0, az = 0, bx = 0, by = 0, bz = 0;
    for (let i = 0; i < 4; i++) {
      const pa = p[o + i]!;
      const pb = p[o + 4 + i]!;
      ax += pa * cam.right[i]!;
      ay += pa * cam.up[i]!;
      az += pa * cam.fwd[i]!;
      bx += pb * cam.right[i]!;
      by += pb * cam.up[i]!;
      bz += pb * cam.fwd[i]!;
    }
    const near = 0.05;
    if (az < near && bz < near) return false;
    if (az < near) {
      const t = (near - az) / (bz - az);
      ax += (bx - ax) * t;
      ay += (by - ay) * t;
      az = near;
    } else if (bz < near) {
      const t = (near - bz) / (az - bz);
      bx += (ax - bx) * t;
      by += (ay - by) * t;
      bz = near;
    }
    const d = this.data;
    const k = this.count * FLOATS_PER_INSTANCE;
    d[k] = ax;
    d[k + 1] = ay;
    d[k + 2] = az;
    d[k + 3] = bx;
    d[k + 4] = by;
    d[k + 5] = bz;
    d[k + 6] = r;
    d[k + 7] = g;
    d[k + 8] = b;
    d[k + 9] = a;
    this.count++;
    return true;
  }

  draw(aux: WebGLTexture, tanX: number, tanY: number, width: number, height: number): void {
    if (this.count === 0) return;
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.data, 0, this.count * FLOATS_PER_INSTANCE);
    this.prog.use();
    gl.uniform2f(this.prog.loc('uTan'), tanX, tanY);
    gl.uniform2f(this.prog.loc('uRes'), width, height);
    gl.uniform1f(this.prog.loc('uWidth'), this.width * Math.max(1, height / 720));
    gl.uniform1f(this.prog.loc('uHiddenAlpha'), this.hiddenAlpha);
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

const ZERO = new Float64Array(4);
