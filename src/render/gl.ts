// Small WebGL2 helpers.

export function compileShader(gl: WebGL2RenderingContext, type: number, src: string, name: string): WebGLShader {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(s) ?? '';
    const numbered = src
      .split('\n')
      .map((l, i) => `${String(i + 1).padStart(4)}: ${l}`)
      .join('\n');
    gl.deleteShader(s);
    throw new Error(`Shader compile failed (${name}):\n${log}\n${numbered.slice(0, 20000)}`);
  }
  return s;
}

export class Program {
  readonly program: WebGLProgram;
  private readonly locs = new Map<string, WebGLUniformLocation | null>();

  constructor(
    readonly gl: WebGL2RenderingContext,
    vs: string,
    fs: string,
    readonly name: string,
  ) {
    const p = gl.createProgram()!;
    const v = compileShader(gl, gl.VERTEX_SHADER, vs, `${name}.vert`);
    const f = compileShader(gl, gl.FRAGMENT_SHADER, fs, `${name}.frag`);
    gl.attachShader(p, v);
    gl.attachShader(p, f);
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      throw new Error(`Program link failed (${name}): ${gl.getProgramInfoLog(p)}`);
    }
    gl.deleteShader(v);
    gl.deleteShader(f);
    this.program = p;
  }

  loc(name: string): WebGLUniformLocation | null {
    let l = this.locs.get(name);
    if (l === undefined) {
      l = this.gl.getUniformLocation(this.program, name);
      this.locs.set(name, l);
    }
    return l;
  }

  use(): void {
    this.gl.useProgram(this.program);
  }
}

export function createTexture2D(
  gl: WebGL2RenderingContext,
  internalFormat: number,
  width: number,
  height: number,
  format: number,
  type: number,
  data: ArrayBufferView | null,
  filter: number = gl.NEAREST,
): WebGLTexture {
  const t = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, width, height, 0, format, type, data);
  return t;
}

export function createTextureArray(
  gl: WebGL2RenderingContext,
  internalFormat: number,
  width: number,
  height: number,
  layers: number,
): WebGLTexture {
  const t = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D_ARRAY, t);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, internalFormat, width, height, layers);
  return t;
}
