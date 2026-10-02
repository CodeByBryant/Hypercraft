#version 300 es
// HYPERCRAFT 4D slice ray marcher.
//
// Every pixel's ray is d = normalize(fwd + x*right + y*up): a combination of three of the
// camera's four orthonormal basis vectors, so it lies in the 3D hyperplane through the eye
// with normal `hidden`. We march that ray through the 4D voxel grid with a 4D DDA
// (hierarchical: whole uniform chunks 16^4, uniform bricks 4^4, then single voxels) and hit
// the real 3D facets of tesseracts. Nothing is resampled into a 3D grid: the visible
// polygons are exact facet ∩ hyperplane intersections, so tilted slices show prisms whose
// shape changes continuously as the eye moves along the hidden axis.
//
// See docs/rendering-4d.md and docs/gpu-layout.md.

precision highp float;
precision highp int;
precision highp usampler2D;
precision highp usampler2DArray;
precision highp sampler2D;
precision highp sampler3D;

in vec2 vNdc;
layout(location = 0) out vec4 oColor;
layout(location = 1) out vec4 oAux;

uniform highp usampler2D uChunkTable;
uniform highp usampler2D uBrickTable;
uniform highp usampler2DArray uBlockPool;
uniform highp usampler2DArray uLightPool;
uniform highp usampler2D uBlockInfo;
uniform highp sampler2D uShapes;
uniform highp sampler2D uAtlas;
uniform highp sampler3D uSurface;

uniform vec4 uEye;       // eye, relative to the window's min corner (cells)
uniform vec4 uRight;
uniform vec4 uUp;
uniform vec4 uFwd;
uniform vec4 uHidden;
uniform vec4 uUpVec;     // world up axis as a vector
uniform int uUpAxis;
uniform vec2 uTan;       // tan(fov/2) * (aspect, 1)
uniform float uPixel;    // world size of one internal pixel at distance 1
uniform ivec4 uWin;      // N, heightChunks, N^3, surface size (N*16)
uniform ivec4 uWinMod;   // window origin chunk mod N  (x, 0, z, w)
uniform ivec4 uSurfMod;  // window origin cells mod surface size (x, 0, z, w)
uniform float uMaxDist;
uniform int uMaxSteps;

uniform vec4 uSunDir;
uniform vec4 uMoonDir;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uFog;
uniform vec3 uSunColor;
uniform vec3 uSkyLight;
uniform vec3 uBlockLight;
uniform vec3 uWaterFog;
uniform float uAmbient;
uniform vec3 uAmbientTint;
uniform float uDaylight;
uniform float uTime;
uniform float uMoonPhase;
uniform float uStars;
uniform float uCloudCover;
uniform vec4 uCloudOrigin;
uniform float uFlash;
uniform float uStorm;
uniform float uWeatherFog;

uniform float uOutline;
uniform int uWire;
uniform ivec4 uSelect;
uniform int uSelectOn;
uniform float uBreak;   // mining progress 0..1 on the selected cell
uniform float uNightVision; // 0..1: everything lit as if by daylight (keeps a hint of the realm's tint)
uniform int uXray;          // spectator: from inside solid ground, see through it (Minecraft's view)
uniform float uHandLight;   // light carried in your hands: level at the eye, -1 per block
uniform highp sampler2D uEntities; // mob records + analytic parts (see MobManager.pack)
uniform int uEntityCount;

const uint NONUNI = 0x80000000u;
const uint ID_MASK = 0xFFFu;
const uint VOID_ID = 4095u;
const int R_INVIS = 0;
const int R_OPAQUE = 1;
const int R_CUTOUT = 2;
const int R_TRANS = 3;
const int R_FLUID = 4;
const int MAX_PASSES = 6;

// ---------------------------------------------------------------------------------------
// World lookups

struct Cache {
  ivec4 chunk;
  int slot;
  uint ce;
  ivec4 brick;
  uvec2 be;
};

void initCache(out Cache k) {
  k.chunk = ivec4(-99999);
  k.slot = 0;
  k.ce = 0u;
  k.brick = ivec4(-99999);
  k.be = uvec2(0u);
}

int chunkSlot(ivec4 lc) {
  int N = uWin.x;
  int x = lc.x + uWinMod.x;
  x -= x >= N ? N : 0;
  int z = lc.z + uWinMod.z;
  z -= z >= N ? N : 0;
  int w = lc.w + uWinMod.w;
  w -= w >= N ? N : 0;
  return x + N * (z + N * w) + uWin.z * lc.y;
}

uint poolBlock(uint p, ivec4 v) {
  int pi = int(p);
  int q = pi & 16383;
  ivec2 t = ivec2((q & 127) * 16 + v.x + 4 * v.w, (q >> 7) * 16 + v.y + 4 * v.z);
  return texelFetch(uBlockPool, ivec3(t, pi >> 14), 0).r;
}

uint poolLight(uint p, ivec4 v) {
  int pi = int(p);
  int q = pi & 16383;
  ivec2 t = ivec2((q & 127) * 16 + v.x + 4 * v.w, (q >> 7) * 16 + v.y + 4 * v.z);
  return texelFetch(uLightPool, ivec3(t, pi >> 14), 0).r;
}

// Voxel at local cell c (caller guarantees it is inside the window and 0 <= y < H).
// lvl receives the traversal step size: 16 (uniform chunk), 4 (uniform brick) or 1.
uint lookup(ivec4 c, inout Cache k, out int lvl, out bool loaded) {
  ivec4 ch = c >> 4;
  if (ch != k.chunk) {
    k.chunk = ch;
    k.slot = chunkSlot(ch);
    k.ce = texelFetch(uChunkTable, ivec2(k.slot & 255, k.slot >> 8), 0).r;
    k.brick = ivec4(-99999);
  }
  if (k.ce == 0u) {
    loaded = false;
    lvl = 16;
    return VOID_ID;
  }
  loaded = true;
  if ((k.ce & 0x40000000u) != 0u) {
    lvl = 16;
    return k.ce & 0xFFFFu;
  }
  ivec4 b = c >> 2;
  if (b != k.brick) {
    k.brick = b;
    ivec4 bl = b & 3;
    k.be = texelFetch(uBrickTable, ivec2((k.slot & 127) * 16 + bl.x + 4 * bl.w, (k.slot >> 7) * 16 + bl.y + 4 * bl.z), 0).rg;
  }
  if ((k.be.x & NONUNI) == 0u) {
    lvl = 4;
    return k.be.x & 0xFFFFu;
  }
  lvl = 1;
  return poolBlock(k.be.x & 0x7FFFFFFFu, c & 3);
}

bool inWindow(ivec4 c) {
  int wc = uWin.x * 16;
  return c.x >= 0 && c.z >= 0 && c.w >= 0 && c.x < wc && c.z < wc && c.w < wc;
}

// Voxel + light at any local cell (used for lighting/AO samples and fluid tests).
void sampleCell(ivec4 c, inout Cache k, out uint vox, out uint light) {
  int H = uWin.y * 16;
  if (c.y >= H) {
    vox = 0u;
    light = 0xF0u;
    return;
  }
  if (c.y < 0 || !inWindow(c)) {
    vox = VOID_ID;
    light = 0u;
    return;
  }
  int lvl;
  bool loaded;
  vox = lookup(c, k, lvl, loaded);
  if (!loaded) {
    light = 0u;
    return;
  }
  // k.be is valid for c's brick unless the chunk is uniform: fetch the brick entry then.
  uvec2 be = k.be;
  if ((k.ce & 0x40000000u) != 0u) {
    ivec4 bl = (c >> 2) & 3;
    be = texelFetch(uBrickTable, ivec2((k.slot & 127) * 16 + bl.x + 4 * bl.w, (k.slot >> 7) * 16 + bl.y + 4 * bl.z), 0).rg;
  }
  light = (be.y & NONUNI) != 0u ? poolLight(be.y & 0x7FFFFFFFu, c & 3) : (be.y & 0xFFu);
}

// ---------------------------------------------------------------------------------------
// Block info (see Registry.gpuBlockInfo)

uvec4 blockInfo(uint id) {
  return texelFetch(uBlockInfo, ivec2(int(id) & 63, int(id) >> 6), 0);
}
int renderOf(uvec4 bi) { return int(bi.x & 7u); }
int shapeBaseOf(uvec4 bi) { return int((bi.x >> 3) & 1023u); }
int variantModeOf(uvec4 bi) { return int((bi.x >> 13) & 3u); }
float emissionOf(uvec4 bi) { return float((bi.x >> 15) & 15u) / 15.0; }
int tintOf(uvec4 bi) { return int((bi.x >> 19) & 3u); }
int fluidOf(uvec4 bi) { return int((bi.x >> 21) & 3u); }
bool fullOf(uvec4 bi) { return ((bi.x >> 23) & 1u) != 0u; }
bool lightOpaqueOf(uvec4 bi) { return ((bi.x >> 24) & 1u) != 0u; }

// Animated textures: flames flicker by scrolling through the solid texture's third axis
// (their tongues rise and fall along it); churn drifts slowly (magma).
vec3 animUVS(uvec4 bi, vec3 uvs) {
  int a = int(bi.w & 3u);
  if (a == 1) return vec3(uvs.x, uvs.y, fract(uvs.z + uTime * 1.3));
  if (a == 2) return fract(uvs + vec3(uTime * 0.03, uTime * 0.05, uTime * 0.09));
  return uvs;
}

int shapeIndex(uvec4 bi, uint vox) {
  int mode = variantModeOf(bi);
  int meta = int((vox >> 12) & 15u);
  int v = mode == 1 ? (meta & 1) : (mode == 2 ? min(meta, 5) : 0);
  return shapeBaseOf(bi) + v;
}

// ---------------------------------------------------------------------------------------
// Textures: 16^3 solid textures in a 2D atlas (see textureGen.ts)

vec4 texel(int tex, vec3 uvs) {
  ivec3 q = clamp(ivec3(floor(uvs * 16.0)), ivec3(0), ivec3(15));
  ivec2 base = ivec2((tex & 15) * 64, (tex >> 4) * 64);
  return texelFetch(uAtlas, base + ivec2((q.z & 3) * 16 + q.x, (q.z >> 2) * 16 + q.y), 0);
}

// In-facet coordinates (u, v, s) for a facet with normal axis `axis`; v runs along world up
// for side facets.
vec3 facetUVS(int axis, vec4 f) {
  if (axis == 0) return vec3(f.z, f.y, f.w);
  if (axis == 1) return vec3(f.x, f.z, f.w);
  if (axis == 2) return vec3(f.x, f.y, f.w);
  return vec3(f.x, f.y, f.z);
}

int facetTexture(uvec4 bi, int axis, float ns) {
  if (axis == uUpAxis) return ns > 0.0 ? int(bi.y & 1023u) : int((bi.y >> 10) & 1023u);
  return int((bi.y >> 20) & 1023u);
}

vec4 axisVec(int a) {
  return a == 0 ? vec4(1, 0, 0, 0) : a == 1 ? vec4(0, 1, 0, 0) : a == 2 ? vec4(0, 0, 1, 0) : vec4(0, 0, 0, 1);
}

ivec4 axisIVec(int a) {
  return a == 0 ? ivec4(1, 0, 0, 0) : a == 1 ? ivec4(0, 1, 0, 0) : a == 2 ? ivec4(0, 0, 1, 0) : ivec4(0, 0, 0, 1);
}

vec3 surfaceColor(ivec4 c) {
  int S = uWin.w;
  ivec3 p = ivec3(c.x + uSurfMod.x, c.z + uSurfMod.z, c.w + uSurfMod.w);
  p = p - S * (p / S);
  return texelFetch(uSurface, p, 0).rgb;
}

// ---------------------------------------------------------------------------------------
// Noise helpers (sky)

float hash41(vec4 p) {
  p = fract(p * vec4(0.1031, 0.1030, 0.0973, 0.1099));
  p += dot(p, p.wzxy + 33.33);
  return fract((p.x + p.y) * (p.z + p.w));
}

float hash31(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}

float vnoise3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash31(i);
  float b = hash31(i + vec3(1, 0, 0));
  float c = hash31(i + vec3(0, 1, 0));
  float d = hash31(i + vec3(1, 1, 0));
  float e = hash31(i + vec3(0, 0, 1));
  float g = hash31(i + vec3(1, 0, 1));
  float h = hash31(i + vec3(0, 1, 1));
  float j = hash31(i + vec3(1, 1, 1));
  return mix(mix(mix(a, b, f.x), mix(c, d, f.x), f.y), mix(mix(e, g, f.x), mix(h, j, f.x), f.y), f.z);
}

// ---------------------------------------------------------------------------------------
// Sky

vec3 skyGradient(vec4 d) {
  float up = dot(d, uUpVec);
  vec3 c = mix(uHorizon, uZenith, pow(smoothstep(-0.02, 0.55, up), 0.8));
  c = mix(c, uHorizon * 0.55, smoothstep(0.0, -0.3, up));
  return c;
}

// A celestial body is a 4D direction. It is drawn at its projection into the view
// hyperplane and fades/shrinks as it moves out of the slice (|dir . hidden| grows).
float bodyDisk(vec4 d, vec4 dir, float radius, out float vis, out vec4 proj) {
  float sh = dot(dir, uHidden);
  proj = dir - sh * uHidden;
  float pl = length(proj);
  vis = pl > 1e-4 ? 1.0 - smoothstep(0.3, 0.95, abs(sh)) : 0.0;
  if (vis <= 0.0) return 0.0;
  proj /= pl;
  float r = radius * (0.55 + 0.45 * vis);
  return smoothstep(cos(r * 1.18), cos(r), dot(d, proj));
}

vec3 sky(vec4 d) {
  vec3 c = skyGradient(d);
  float up = dot(d, uUpVec);
  // Sun
  float vis;
  vec4 sp;
  float disk = bodyDisk(d, uSunDir, 0.045, vis, sp);
  if (vis > 0.0) {
    float cs = max(dot(d, sp), 0.0);
    float glow = pow(cs, 90.0) * 0.6 + pow(cs, 8.0) * 0.22 * (1.0 - uWeatherFog);
    c += uSunColor * (disk * 5.0 * (1.0 - uWeatherFog * 0.8) + glow) * vis;
  }
  // Stars (only visible at night); a star is a cell on the 3-sphere of 4D directions, so
  // rotating the slice reveals different stars.
  if (uStars > 0.01 && up > -0.05) {
    vec4 q = floor(d * 120.0);
    float h = hash41(q);
    if (h > 0.9972) {
      float tw = 0.65 + 0.35 * sin(uTime * 2.7 + h * 997.0);
      c += vec3(0.85, 0.9, 1.0) * uStars * tw * min(1.0, (h - 0.9972) * 700.0) * (1.0 - uWeatherFog);
    }
  }
  // Moon with phases (lit fraction by uMoonPhase: 0 full -> 0.5 new -> 1 full)
  float mvis;
  vec4 mp;
  float md = bodyDisk(d, uMoonDir, 0.04, mvis, mp);
  if (mvis > 0.0 && md > 0.0) {
    vec4 side = normalize(uUpVec - dot(uUpVec, mp) * mp + uRight * 0.3);
    float x = dot(d - mp, side) / 0.04;
    float ph = cos(uMoonPhase * 6.2831853);
    float lit = smoothstep(-0.1, 0.1, x * sign(ph) + (1.0 - abs(ph)) * 2.0 - 1.0 + abs(ph));
    lit = mix(lit, 1.0, step(0.97, abs(ph)) * step(0.0, ph));
    c = mix(c, vec3(0.92, 0.93, 0.98) * (0.25 + 0.75 * lit), md * mvis * (1.0 - uWeatherFog * 0.7));
  }
  // Clouds: a layer in the 3D hyperplane y = 196, textured by 3D noise over (x, z, w), so
  // cloud shapes change as you move kata/ana.
  if (up > 0.0 && uCloudCover > 0.0) {
    float tt = (196.0 - uEye.y) / max(up, 0.02);
    vec4 p = uEye + d * tt + uCloudOrigin;
    vec3 q = vec3(p.x, p.z, p.w) * 0.011 + vec3(uTime * 0.012, 0.0, uTime * 0.004);
    float n = vnoise3(q) * 0.65 + vnoise3(q * 2.3) * 0.35;
    float cov = uCloudCover;
    float a = smoothstep(1.0 - cov, 1.0 - cov + 0.28, n) * smoothstep(0.0, 0.2, up);
    vec3 cc = mix(vec3(0.35, 0.37, 0.42), vec3(1.0), 0.25 + 0.75 * uDaylight) * (1.0 - uWeatherFog * 0.45);
    c = mix(c, cc, a * 0.9);
  }
  c = mix(c, uFog, uWeatherFog * 0.65);
  c += vec3(0.7, 0.72, 0.9) * uFlash;
  if (uStorm > 0.0) {
    float band = 0.5 + 0.5 * sin(dot(d, uHidden) * 40.0 + dot(d, uUpVec) * 18.0 - uTime * 3.0);
    c = mix(c, vec3(0.55, 0.25, 0.85) * (0.4 + 0.6 * band), uStorm * 0.35);
  }
  return c;
}

vec3 fogColor(vec4 d) {
  return mix(uFog, skyGradient(d), 0.35);
}

// What distant geometry fades into: fog at the horizon, the sky gradient higher up, so tall
// far-away terrain dissolves into whatever the sky shows behind it.
vec3 farColor(vec4 d) {
  return mix(fogColor(d), skyGradient(d), smoothstep(0.02, 0.3, dot(d, uUpVec)));
}

// ---------------------------------------------------------------------------------------
// Surfaces

struct Surf {
  float t;
  vec4 p;        // hit point (local)
  int axis;      // facet normal axis
  float ns;      // normal sign (+1/-1); normal = ns * e_axis
  ivec4 cell;
  vec4 bmin;     // box bounds in cell coordinates (edges of the cross-section polytope)
  vec4 bmax;
  ivec4 lcell;   // cell whose light illuminates the surface
  int kind;      // 0 = box facet, 1 = plant sheet
  vec3 uvs;
};

// 4D ray vs axis-aligned box [bmin, bmax] (absolute). Returns entry t and axis.
bool rayBox(vec4 o, vec4 invD, vec4 bmin, vec4 bmax, float tmin, float tmax, out float tHit, out int ax) {
  vec4 t0 = (bmin - o) * invD;
  vec4 t1 = (bmax - o) * invD;
  vec4 tn = min(t0, t1);
  vec4 tf = max(t0, t1);
  float tNear = max(max(tn.x, tn.y), max(tn.z, tn.w));
  float tFar = min(min(tf.x, tf.y), min(tf.z, tf.w));
  if (tNear > tFar || tFar < tmin || tNear > tmax) return false;
  ax = tNear == tn.x ? 0 : (tNear == tn.y ? 1 : (tNear == tn.z ? 2 : 3));
  tHit = tNear;
  return true;
}

float fluidHeight(uint vox, ivec4 cell, inout Cache k) {
  uint up;
  uint l;
  sampleCell(cell + ivec4(0, 1, 0, 0), k, up, l);
  if ((up & ID_MASK) == (vox & ID_MASK)) return 1.0;
  uint meta = (vox >> 12) & 15u;
  if (meta >= 8u) return 1.0;
  return meta == 0u ? 0.875 : max(0.12, (8.0 - float(meta)) / 9.0);
}

// Opaque/cutout surface test inside `cell` for the ray segment [tEnter, tExit].
bool surfaceHit(vec4 o, vec4 d, vec4 invD, ivec4 cell, int enterAxis, float tEnter, float tExit, int exitAxis,
                uint vox, uvec4 bi, int render, vec4 sgn, out Surf s) {
  s.cell = cell;
  s.kind = 0;
  s.bmin = vec4(0.0);
  s.bmax = vec4(1.0);
  if (fullOf(bi)) {
    if (enterAxis < 0) return false; // eye inside the block
    s.t = tEnter;
    s.axis = enterAxis;
    s.ns = -sgn[enterAxis];
    s.p = o + d * tEnter;
    s.lcell = cell - ivec4(sgn[enterAxis] * axisVec(enterAxis));
    s.uvs = facetUVS(s.axis, s.p - vec4(cell));
    if (render == R_CUTOUT) {
      int tex = facetTexture(bi, s.axis, s.ns);
      if (texel(tex, animUVS(bi, s.uvs)).a < 0.5) {
        // See through the hole to the inside of the far facet.
        s.t = tExit;
        s.axis = exitAxis;
        s.ns = -sgn[exitAxis];
        s.p = o + d * tExit;
        s.lcell = cell;
        s.uvs = facetUVS(s.axis, s.p - vec4(cell));
        tex = facetTexture(bi, s.axis, s.ns);
        if (texel(tex, animUVS(bi, s.uvs)).a < 0.5) return false;
      }
    }
    return true;
  }
  int si = shapeIndex(bi, vox);
  vec4 head = texelFetch(uShapes, ivec2(0, si), 0);
  int kind = int(head.x + 0.5);
  vec4 c0 = vec4(cell);
  if (kind == 0) {
    int n = int(head.y + 0.5);
    float best = 1e30;
    int bax = -1;
    vec4 bmn = vec4(0.0), bmx = vec4(1.0);
    for (int b = 0; b < 7; b++) {
      if (b >= n) break;
      vec4 mn = texelFetch(uShapes, ivec2(1 + 2 * b, si), 0);
      vec4 mx = texelFetch(uShapes, ivec2(2 + 2 * b, si), 0);
      float th;
      int ax;
      if (rayBox(o, invD, c0 + mn, c0 + mx, tEnter - 1e-4, tExit + 1e-4, th, ax)) {
        if (th < tEnter - 1e-3 && enterAxis < 0) continue; // eye inside this box
        if (th < tEnter + 1e-4 && enterAxis >= 0) ax = enterAxis; // box touches the entry facet
        th = max(th, tEnter);
        if (th < best) {
          best = th;
          bax = ax;
          bmn = mn;
          bmx = mx;
        }
      }
    }
    if (bax < 0) return false;
    s.t = best;
    s.axis = bax;
    s.ns = -sgn[bax];
    s.p = o + d * best;
    s.bmin = bmn;
    s.bmax = bmx;
    vec4 f = s.p - c0;
    // On the cell boundary the light comes from the neighbour cell, else from this cell.
    float fa = f[bax];
    bool onBoundary = (s.ns < 0.0 && fa < 1e-3) || (s.ns > 0.0 && fa > 1.0 - 1e-3);
    s.lcell = onBoundary ? cell + ivec4(s.ns * axisVec(bax)) : cell;
    s.uvs = facetUVS(s.axis, f);
    if (render == R_CUTOUT) {
      int tex = facetTexture(bi, s.axis, s.ns);
      if (texel(tex, animUVS(bi, s.uvs)).a < 0.5) return false;
    }
    return true;
  }
  if (kind == 1) {
    // Plant: six diagonal 3D sheets through the cell centre (all pairs of horizontal axes).
    float best = 1e30;
    vec4 bn = vec4(0.0);
    vec3 buv = vec3(0.0);
    vec4 ctr = c0 + vec4(0.5);
    for (int i = 0; i < 6; i++) {
      vec4 n = i == 0 ? vec4(1, 0, -1, 0) : i == 1 ? vec4(1, 0, 1, 0) : i == 2 ? vec4(1, 0, 0, -1)
             : i == 3 ? vec4(1, 0, 0, 1) : i == 4 ? vec4(0, 0, 1, -1) : vec4(0, 0, 1, 1);
      n *= 0.70710678;
      float dn = dot(d, n);
      if (abs(dn) < 1e-5) continue;
      float th = dot(ctr - o, n) / dn;
      if (th < tEnter || th > tExit || th >= best) continue;
      vec4 f = o + d * th - c0;
      vec3 uv = vec3(fract(f.x + f.z * 0.5 + f.w * 0.25), f.y, fract(f.z + f.w));
      if (texel(int(bi.y >> 20) & 1023, animUVS(bi, uv)).a < 0.5) continue;
      best = th;
      bn = n * -sign(dn);
      buv = uv;
    }
    if (best > 1e29) return false;
    s.t = best;
    s.p = o + d * best;
    s.kind = 1;
    s.axis = uUpAxis;
    s.ns = 1.0;
    s.lcell = cell;
    s.uvs = buv;
    return true;
  }
  return false;
}

float lightCurve(float x) {
  return x / (3.0 - 2.0 * x);
}

// Smooth 4D lighting + ambient occlusion from the 2x2x2 neighbourhood (in the facet's
// three in-plane axes) of the lit cell, trilinearly weighted by the hit position.
void smoothLight(Surf s, out float sky, out float blk, out float occ) {
  vec4 f = s.p - vec4(s.cell);
  int a0 = s.axis == 0 ? 1 : 0;
  int a1 = s.axis <= 1 ? 2 : 1;
  int a2 = s.axis <= 2 ? 3 : 2;
  ivec4 o1 = axisIVec(a0) * (f[a0] < 0.5 ? -1 : 1);
  ivec4 o2 = axisIVec(a1) * (f[a1] < 0.5 ? -1 : 1);
  ivec4 o3 = axisIVec(a2) * (f[a2] < 0.5 ? -1 : 1);
  float w1 = clamp(abs(f[a0] - 0.5), 0.0, 0.5);
  float w2 = clamp(abs(f[a1] - 0.5), 0.0, 0.5);
  float w3 = clamp(abs(f[a2] - 0.5), 0.0, 0.5);
  if (s.kind == 1) {
    w1 = 0.0;
    w2 = 0.0;
    w3 = 0.0;
  }
  Cache k;
  initCache(k);
  float sw = 0.0, ss = 0.0, sb = 0.0;
  occ = 0.0;
  for (int i = 0; i < 8; i++) {
    float wt = ((i & 1) != 0 ? w1 : 1.0 - w1) * ((i & 2) != 0 ? w2 : 1.0 - w2) * ((i & 4) != 0 ? w3 : 1.0 - w3);
    if (wt <= 0.0) continue;
    ivec4 c = s.lcell + ((i & 1) != 0 ? o1 : ivec4(0)) + ((i & 2) != 0 ? o2 : ivec4(0)) + ((i & 4) != 0 ? o3 : ivec4(0));
    uint v, l;
    sampleCell(c, k, v, l);
    if (lightOpaqueOf(blockInfo(v & ID_MASK))) {
      occ += wt;
      continue;
    }
    sw += wt;
    ss += wt * float(l >> 4);
    sb += wt * float(l & 15u);
  }
  if (sw > 1e-4) {
    sky = ss / sw / 15.0;
    blk = sb / sw / 15.0;
  } else {
    sky = 0.0;
    blk = 0.0;
  }
}

// Distance (in the face plane) from the hit point to the nearest edge of the cross-section
// polygon. For facet axis i, x_j (j != i) changes at rate g_j = sqrt(1 - h_j^2 / (1 - h_i^2))
// per unit in-face distance; g_j = 0 means x_j is constant on the face (no edge).
float edgeDistance(Surf s, out int eax) {
  vec4 f = s.p - vec4(s.cell);
  float hi = uHidden[s.axis];
  float inv = 1.0 / max(1e-6, 1.0 - hi * hi);
  float e = 1e9;
  eax = -1;
  for (int j = 0; j < 4; j++) {
    if (j == s.axis) continue;
    float hj = uHidden[j];
    float g2 = 1.0 - hj * hj * inv;
    if (g2 < 4e-4) continue;
    float dj = min(f[j] - s.bmin[j], s.bmax[j] - f[j]) / sqrt(g2);
    if (dj < e) {
      e = dj;
      eax = j;
    }
  }
  return e;
}

// Night vision: a floor under all lighting, as bright as a sunny day.
vec3 nightVisionLight() {
  return uNightVision * mix(vec3(1.0), uAmbientTint, 0.25);
}

vec3 axisColor(int a) {
  return a == 0 ? vec3(1.0, 0.25, 0.2) : a == 1 ? vec3(0.3, 1.0, 0.35) : a == 2 ? vec3(0.25, 0.5, 1.0) : vec3(1.0, 0.3, 1.0);
}

// Mining cracks: planes through the cell centre in texel space (seen as jagged lines on any
// facet slice) reaching outward with progress, plus crumbling speckle.
float crackMask(vec3 uvs, float prog) {
  vec3 cell = floor(uvs * 16.0);
  vec3 q = cell / 16.0 - 0.5 + 1.0 / 32.0;
  float m = 0.0;
  for (int k = 0; k < 6; k++) {
    if (float(k) > prog * 6.0) break;
    float fk = float(k);
    vec3 dir = normalize(vec3(sin(fk * 2.4 + 1.0), cos(fk * 1.7 + 0.3), sin(fk * 3.1 + 2.0)));
    float wob = 0.045 * sin(dot(cell, vec3(1.9, 2.3, 1.3)) + fk * 5.0);
    m = max(m, step(abs(dot(q, dir) + wob), 0.034) * step(length(q), 0.12 + 0.55 * prog));
  }
  float h = fract(sin(dot(cell, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
  return max(m, step(h, prog * 0.22));
}

vec3 shade(Surf s, vec4 d, uint vox, uvec4 bi, float t, out float alpha) {
  int tex = facetTexture(bi, s.axis, s.ns);
  vec3 uvs = s.uvs;
  int fl = fluidOf(bi);
  if (fl != 0 || renderOf(bi) == R_TRANS) {
    uvs = fract(uvs + vec3(uTime * 0.021, uTime * (fl == 2 ? 0.013 : 0.035), uTime * 0.017));
  }
  uvs = animUVS(bi, uvs);
  vec4 tx = texel(tex, uvs);
  vec3 albedo = tx.rgb;
  alpha = tx.a;
  int tint = tintOf(bi);
  if (tint != 0) {
    vec3 g = surfaceColor(s.cell) * 1.3;
    if (tint == 2) g *= 0.8;
    float amt = renderOf(bi) == R_OPAQUE ? tx.a : 1.0;
    albedo *= mix(vec3(1.0), g, amt);
    if (renderOf(bi) == R_OPAQUE) alpha = 1.0;
  }
  vec4 n = axisVec(s.axis) * s.ns;
  float sky, blk, occ;
  smoothLight(s, sky, blk, occ);
  blk = max(blk, clamp((uHandLight - t) / 15.0, 0.0, 1.0));
  // Fixed per-axis facet shading (W facets get their own tone so they read as a 4th
  // kind of face in tilted views) plus a soft 4D sun term.
  float fs = s.axis == uUpAxis ? (s.ns > 0.0 ? 1.0 : 0.5) : (s.axis == 0 ? 0.8 : (s.axis == 2 ? 0.7 : 0.62));
  if (s.kind == 1) fs = 0.85;
  float sunTerm = 0.78 + 0.22 * max(0.0, dot(n, uSunDir));
  vec3 light = uSkyLight * lightCurve(sky) * sunTerm + uBlockLight * lightCurve(blk) + uAmbient * uAmbientTint;
  light = max(light, nightVisionLight());
  float ao = 1.0 - 0.62 * occ;
  vec3 c = albedo * light * fs * ao;
  float e = emissionOf(bi);
  c = mix(c, albedo * 1.12, e);
  // Cross-section polytope edges.
  if (s.kind == 0) {
    int eax;
    float ed = edgeDistance(s, eax);
    float px = t * uPixel;
    float width = uWire != 0 ? 1.7 : 1.0;
    float m = 1.0 - smoothstep(width * px * 0.55, width * px * 1.35, ed);
    m *= 1.0 - smoothstep(0.06, 0.25, px);
    if (uWire != 0) {
      vec3 base = mix(c, axisColor(s.axis), 0.28) * 0.45;
      c = mix(base, axisColor(eax), m);
    } else {
      c *= 1.0 - uOutline * m;
    }
  }
  if (uSelectOn != 0 && s.cell == uSelect) {
    if (uBreak > 0.0) c *= 1.0 - 0.6 * crackMask(s.uvs, uBreak);
    c = mix(c, vec3(1.0), 0.12);
  }
  return c;
}

void composite(inout vec3 acc, inout float accA, vec3 c, float a) {
  acc += (1.0 - accA) * a * c;
  accA += (1.0 - accA) * a;
}

void addMedium(inout vec3 acc, inout float accA, uint medium, float dist) {
  uvec4 bi = blockInfo(medium);
  if (fluidOf(bi) == 1) {
    float a = 1.0 - exp(-max(dist, 0.0) * 0.1);
    composite(acc, accA, uWaterFog, a);
  } else if (renderOf(bi) == R_TRANS) {
    uint tint = bi.z;
    vec3 tc = vec3(float(tint & 255u), float((tint >> 8) & 255u), float((tint >> 16) & 255u)) / 255.0;
    float a = 1.0 - exp(-max(dist, 0.0) * 0.08);
    composite(acc, accA, tc * (uSkyLight * 0.5 + 0.2), a * 0.5);
  }
}

// ---------------------------------------------------------------------------------------


// ---------------------------------------------------------------------------------------
// Mobs: unions of analytic 4D primitives (boxes, balls, capsules) in each mob's own frame
// (R, up, F, H). The ray stays in the view hyperplane, so what we see is the exact 3D
// cross-section of the 4D body, which morphs as the slice moves.

const int ENT_W = 256;
const int MOB_TEXELS = 6;
const int PART_TEXELS = 4;
const int PART_BASE = 48 * 6;

vec4 entTexel(int i) {
  return texelFetch(uEntities, ivec2(i % ENT_W, i / ENT_W), 0);
}

struct EntHit {
  float t;
  vec4 n;
  vec3 col;
  float glow;
  float hurt;
  float fuse;
};

bool entBox(vec4 o, vec4 d, vec4 c, vec4 hs, out float t, out vec4 n) {
  vec4 dd = mix(d, vec4(1e-7), lessThan(abs(d), vec4(1e-7)));
  vec4 inv = 1.0 / dd;
  vec4 t1 = (c - hs - o) * inv, t2 = (c + hs - o) * inv;
  vec4 tmn = min(t1, t2), tmx = max(t1, t2);
  float tn = max(max(tmn.x, tmn.y), max(tmn.z, tmn.w));
  float tf = min(min(tmx.x, tmx.y), min(tmx.z, tmx.w));
  if (tn > tf || tf < 0.0) return false;
  t = max(tn, 0.0);
  n = vec4(0.0);
  if (tn == tmn.x) n.x = -sign(dd.x);
  else if (tn == tmn.y) n.y = -sign(dd.y);
  else if (tn == tmn.z) n.z = -sign(dd.z);
  else n.w = -sign(dd.w);
  return true;
}

bool entBall(vec4 o, vec4 d, vec4 c, float r, out float t, out vec4 n) {
  vec4 oc = o - c;
  float b = dot(oc, d);
  float cc = dot(oc, oc) - r * r;
  float h = b * b - cc;
  if (h < 0.0) return false;
  t = -b - sqrt(h);
  if (t < 0.0) return false;
  n = (oc + d * t) / r;
  return true;
}

bool entCapsule(vec4 ro, vec4 rd, vec4 pa, vec4 pb, float r, out float t, out vec4 n) {
  vec4 ba = pb - pa;
  vec4 oa = ro - pa;
  float baba = dot(ba, ba), bard = dot(ba, rd), baoa = dot(ba, oa), rdoa = dot(rd, oa), oaoa = dot(oa, oa);
  float a = baba - bard * bard;
  float b = baba * rdoa - baoa * bard;
  float c = baba * oaoa - baoa * baoa - r * r * baba;
  float h = b * b - a * c;
  if (h < 0.0) return false;
  float tt = (-b - sqrt(h)) / a;
  float y = baoa + tt * bard;
  if (y > 0.0 && y < baba && tt > 0.0) {
    t = tt;
    n = (oa + rd * t - ba * (y / baba)) / r;
    return true;
  }
  vec4 cap = y <= 0.0 ? pa : pb;
  vec4 oc = ro - cap;
  b = dot(rd, oc);
  c = dot(oc, oc) - r * r;
  h = b * b - c;
  if (h <= 0.0) return false;
  tt = -b - sqrt(h);
  if (tt <= 0.0) return false;
  t = tt;
  n = (oc + rd * t) / r;
  return true;
}

bool entityTrace(vec4 o, vec4 d, float tMax, out EntHit h) {
  h.t = tMax;
  h.n = vec4(0.0, 1.0, 0.0, 0.0);
  h.col = vec3(1.0);
  h.glow = 0.0;
  h.hurt = 0.0;
  h.fuse = 0.0;
  bool hit = false;
  for (int e = 0; e < 48; e++) {
    if (e >= uEntityCount) break;
    int b = e * MOB_TEXELS;
    vec4 pos = entTexel(b);
    vec4 info = entTexel(b + 4);
    vec4 oc = o - pos;
    float bb = dot(oc, d);
    float cc = dot(oc, oc) - info.x * info.x;
    float disc = bb * bb - cc;
    if (disc < 0.0) continue;
    float sq = sqrt(disc);
    if (-bb + sq < 0.0 || -bb - sq > h.t) continue;
    vec4 R = entTexel(b + 1), F = entTexel(b + 2), Hh = entTexel(b + 3), extra = entTexel(b + 5);
    float sc = extra.x;
    vec4 U = uUpVec;
    vec4 lo = vec4(dot(oc, R), dot(oc, U), dot(oc, F), dot(oc, Hh)) / sc;
    vec4 ld = vec4(dot(d, R), dot(d, U), dot(d, F), dot(d, Hh));
    int ps = int(info.y), pc = int(info.z);
    for (int p = 0; p < 16; p++) {
      if (p >= pc) break;
      int pb = PART_BASE + (ps + p) * PART_TEXELS;
      vec4 p0 = entTexel(pb), p1 = entTexel(pb + 1), p2 = entTexel(pb + 2);
      float tl;
      vec4 nl;
      bool ok;
      if (p0.x < 0.5) ok = entBox(lo, ld, p1, p2, tl, nl);
      else if (p0.x < 1.5) ok = entBall(lo, ld, p1, p0.y, tl, nl);
      else ok = entCapsule(lo, ld, p1, p2, p0.y, tl, nl);
      if (!ok) continue;
      float tw = tl * sc;
      if (tw <= 0.0 || tw >= h.t) continue;
      h.t = tw;
      h.n = normalize(nl.x * R + nl.y * U + nl.z * F + nl.w * Hh);
      h.col = entTexel(pb + 3).rgb;
      h.glow = p0.z;
      h.hurt = info.w;
      h.fuse = extra.y;
      hit = true;
    }
  }
  return hit;
}

vec3 shadeEntity(EntHit h, vec4 o, vec4 d, inout Cache k) {
  vec4 p = o + d * h.t;
  ivec4 c = ivec4(floor(p + h.n * 0.35));
  float sky = 1.0, blk = 0.0;
  if (c.y >= 0 && c.y < uWin.y * 16 && inWindow(c)) {
    uint vox, light;
    sampleCell(c, k, vox, light);
    sky = float(light >> 4u) / 15.0;
    blk = float(light & 15u) / 15.0;
  }
  blk = max(blk, clamp((uHandLight - h.t) / 15.0, 0.0, 1.0));
  float facet = 0.62 + 0.38 * max(0.0, dot(h.n, uUpVec)) + 0.12 * abs(dot(h.n, uHidden));
  float sunTerm = 0.78 + 0.22 * max(0.0, dot(h.n, uSunDir));
  vec3 light = uSkyLight * lightCurve(sky) * sunTerm + uBlockLight * lightCurve(blk) + uAmbient * uAmbientTint;
  light = max(light, nightVisionLight());
  vec3 col = h.col * light * facet;
  if (h.glow > 0.5) col = h.col * 1.15;
  if (h.hurt > 0.5) col = mix(col, vec3(0.95, 0.12, 0.08), 0.5);
  col = mix(col, vec3(1.0), h.fuse * 0.55);
  return col;
}

void main() {
  vec4 d = normalize(uFwd + vNdc.x * uTan.x * uRight + vNdc.y * uTan.y * uUp);
  vec4 o = uEye;
  vec4 sgn = vec4(greaterThanEqual(d, vec4(0.0))) * 2.0 - 1.0;
  vec4 invD = sgn / max(abs(d), vec4(1e-9));
  vec4 stepPos = step(vec4(0.0), d);
  ivec4 stepI = ivec4(sgn);

  int H = uWin.y * 16;
  ivec4 cell = ivec4(floor(o));
  float t = 0.0;
  int axis = -1;

  Cache k;
  initCache(k);

  EntHit eh;
  bool entHit = uEntityCount > 0 && entityTrace(o, d, uMaxDist, eh);
  float tEnt = entHit ? eh.t : 1e30;

  vec3 acc = vec3(0.0);
  float accA = 0.0;
  uint medium = 0u;
  float mediumT = 0.0;
  int passes = 0;
  vec3 result = vec3(0.0);
  float hitT = -1.0;
  int hitAxis = -1;
  bool finished = false;
  bool isFog = false;
  bool unloaded = false;
  int steps = 0;

  // The medium the eye is in (water / glass), so we do not draw its internal faces.
  if (cell.y >= 0 && cell.y < H && inWindow(cell)) {
    int lv;
    bool ld;
    uint v = lookup(cell, k, lv, ld);
    uint id = v & ID_MASK;
    uvec4 bi = blockInfo(id);
    int r = renderOf(bi);
    if (ld && r == R_TRANS) medium = id;
    if (ld && r == R_FLUID && fluidOf(bi) == 1) {
      float h = fluidHeight(v, cell, k);
      if (o.y - float(cell.y) < h) medium = id;
    }
  }

  // Spectator inside solid ground, like Minecraft's: faces between solid blocks are not drawn,
  // so the ray passes through rock until it reaches open space, and the first face it meets
  // after that is a cave wall (or the terrain beyond) facing you. The near walls of a cave,
  // seen from behind, are not drawn either.
  bool buried = false;
  if (uXray != 0 && cell.y >= 0 && cell.y < H && inWindow(cell)) {
    int lv;
    bool ld;
    uint v = lookup(cell, k, lv, ld);
    uvec4 bi = blockInfo(v & ID_MASK);
    buried = ld && renderOf(bi) == R_OPAQUE && fullOf(bi);
  }

  for (int i = 0; i < 1024; i++) {
    steps = i;
    if (tEnt <= t) {
      // A mob in front of this cell.
      if (medium != 0u) addMedium(acc, accA, medium, tEnt - mediumT);
      result = shadeEntity(eh, o, d, k);
      hitT = tEnt;
      hitAxis = -1;
      finished = true;
      break;
    }
    if (i >= uMaxSteps || t > uMaxDist) {
      isFog = true;
      break;
    }
    if (cell.y < 0) {
      result = vec3(0.01, 0.01, 0.015);
      hitT = t;
      finished = true;
      break;
    }
    if (!inWindow(cell)) {
      isFog = cell.y < H;
      break;
    }
    int lvl;
    uint vox;
    if (cell.y >= H) {
      if (d.y >= 0.0) break;
      vox = 0u;
      lvl = 16;
    } else {
      bool loaded;
      vox = lookup(cell, k, lvl, loaded);
      if (!loaded) {
        isFog = true;
        unloaded = true;
        break;
      }
    }
    uint id = vox & ID_MASK;
    bool through = false;
    if (buried) {
      uvec4 bb = blockInfo(id);
      if (renderOf(bb) == R_OPAQUE && fullOf(bb)) through = true;
      else buried = false;
    }
    if (!through && id != medium) {
      uvec4 bi = blockInfo(id);
      int r = renderOf(bi);
      if (r == R_INVIS) {
        if (medium != 0u) {
          addMedium(acc, accA, medium, t - mediumT);
          medium = 0u;
        }
      } else {
        lvl = 1;
        vec4 bnd = vec4(cell) + stepPos;
        vec4 tmc = (bnd - o) * invD;
        float tExit = min(min(tmc.x, tmc.y), min(tmc.z, tmc.w));
        int exitAxis = tExit == tmc.x ? 0 : (tExit == tmc.y ? 1 : (tExit == tmc.z ? 2 : 3));
        if (r == R_OPAQUE || r == R_CUTOUT) {
          Surf s;
          if (surfaceHit(o, d, invD, cell, axis, t, tExit, exitAxis, vox, bi, r, sgn, s)) {
            if (tEnt < s.t) {
              if (medium != 0u) addMedium(acc, accA, medium, tEnt - mediumT);
              result = shadeEntity(eh, o, d, k);
              hitT = tEnt;
              hitAxis = -1;
              finished = true;
              break;
            }
            float a;
            vec3 c = shade(s, d, vox, bi, s.t, a);
            if (medium != 0u) addMedium(acc, accA, medium, s.t - mediumT);
            result = c;
            hitT = s.t;
            hitAxis = s.axis;
            finished = true;
            break;
          }
        } else if (r == R_TRANS) {
          if (medium != 0u) addMedium(acc, accA, medium, t - mediumT);
          if (axis >= 0) {
            Surf s;
            s.cell = cell;
            s.kind = 0;
            s.bmin = vec4(0.0);
            s.bmax = vec4(1.0);
            s.t = t;
            s.axis = axis;
            s.ns = -sgn[axis];
            s.p = o + d * t;
            s.lcell = cell - ivec4(sgn[axis] * axisVec(axis));
            s.uvs = facetUVS(axis, s.p - vec4(cell));
            float a;
            vec3 c = shade(s, d, vox, bi, t, a);
            c += emissionOf(bi) * 0.25;
            composite(acc, accA, c, clamp(a, 0.0, 1.0));
            if (hitT < 0.0) {
              hitT = t;
              hitAxis = axis;
            }
          }
          medium = id;
          mediumT = t;
          passes++;
        } else if (r == R_FLUID) {
          float h = fluidHeight(vox, cell, k);
          vec4 c0 = vec4(cell);
          float th;
          int ax;
          if (rayBox(o, invD, c0, c0 + vec4(1.0, h, 1.0, 1.0), t - 1e-4, tExit + 1e-4, th, ax)) {
            th = max(th, t);
            if (th <= t + 1e-4 && axis >= 0) ax = axis;
            Surf s;
            s.cell = cell;
            s.kind = 0;
            s.bmin = vec4(0.0);
            s.bmax = vec4(1.0, h, 1.0, 1.0);
            s.t = th;
            s.axis = ax;
            s.ns = -sgn[ax];
            s.p = o + d * th;
            vec4 f = s.p - c0;
            bool onBoundary = (s.ns < 0.0 && f[ax] < 1e-3) || (s.ns > 0.0 && f[ax] > 1.0 - 1e-3);
            s.lcell = onBoundary ? cell + ivec4(s.ns * axisVec(ax)) : cell;
            s.uvs = facetUVS(ax, f);
            float a;
            vec3 c = shade(s, d, vox, bi, th, a);
            if (fluidOf(bi) == 2) {
              if (medium != 0u) addMedium(acc, accA, medium, th - mediumT);
              result = c;
              hitT = th;
              hitAxis = ax;
              finished = true;
              break;
            }
            if (medium != 0u) addMedium(acc, accA, medium, th - mediumT);
            // Water surface: tinted, with a cheap Fresnel sky reflection on top faces.
            float fres = 0.0;
            if (ax == uUpAxis && s.ns > 0.0) fres = 0.04 + 0.6 * pow(1.0 - abs(dot(d, uUpVec)), 5.0);
            vec3 refl = skyGradient(d - 2.0 * dot(d, uUpVec) * uUpVec);
            c = mix(c, refl * (0.4 + 0.6 * uDaylight), fres);
            composite(acc, accA, c, clamp(a + fres, 0.0, 1.0) * 0.75);
            if (hitT < 0.0) {
              hitT = th;
              hitAxis = ax;
            }
            medium = id;
            mediumT = th;
            passes++;
          }
        }
        if (passes >= MAX_PASSES || accA > 0.985) {
          finished = true;
          result = vec3(0.0);
          if (hitT < 0.0) hitT = t;
          break;
        }
      }
    }
    // Advance to the next cell/brick/chunk boundary at the current level.
    ivec4 lo = cell & ivec4(~(lvl - 1));
    vec4 bound = vec4(lo) + stepPos * float(lvl);
    vec4 tm = (bound - o) * invD;
    float tn = min(min(tm.x, tm.y), min(tm.z, tm.w));
    int ax = tn == tm.x ? 0 : (tn == tm.y ? 1 : (tn == tm.z ? 2 : 3));
    t = max(t, tn);
    ivec4 nc = clamp(ivec4(floor(o + d * t)), lo, lo + ivec4(lvl - 1));
    nc[ax] = stepI[ax] > 0 ? int(bound[ax]) : int(bound[ax]) - 1;
    cell = nc;
    axis = ax;
  }

  if (!finished && tEnt < (isFog ? min(t, uMaxDist) : uMaxDist)) {
    // A mob in front of the sky / fog.
    if (medium != 0u) addMedium(acc, accA, medium, tEnt - mediumT);
    medium = 0u;
    result = shadeEntity(eh, o, d, k);
    hitT = tEnt;
    finished = true;
  }
  if (!finished) {
    float tEnd = isFog ? min(t, uMaxDist) : uMaxDist;
    if (medium != 0u) addMedium(acc, accA, medium, tEnd - mediumT);
    if (isFog) {
      // Out of range (distance/step cap or unloaded space): beyond the render distance the
      // sky shows through, fading into fog toward the horizon (so sun, moon, stars and
      // clouds stay visible above distant terrain).
      float up = dot(d, uUpVec);
      result = mix(fogColor(d), sky(d), smoothstep(0.02, 0.3, up) * (unloaded ? 0.0 : 1.0));
    } else {
      result = sky(d);
    }
    if (isFog && hitT < 0.0) hitT = tEnd;
  } else if (hitT >= 0.0) {
    float fogF = smoothstep(uMaxDist * 0.5, uMaxDist, hitT);
    fogF = max(fogF, uWeatherFog * (1.0 - exp(-hitT * 0.02)));
    result = mix(result, farColor(d), fogF);
  }
  vec3 col = acc + (1.0 - accA) * result;
  oColor = vec4(col, 1.0);
  float depth01 = hitT < 0.0 ? 1.0 : clamp(hitT / 512.0, 0.0, 1.0);
  float dv = depth01 * 255.0;
  oAux = vec4(floor(dv) / 255.0, fract(dv), float(steps) / 255.0, float(hitAxis + 1) / 8.0);
}
