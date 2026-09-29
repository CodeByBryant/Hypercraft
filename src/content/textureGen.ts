// Procedural solid-texture generator. Each texture is a 16x16x16 RGBA volume (u, v, s)
// where, for side facets, v runs along world up. Textures are packed into a 2D atlas:
// texture t occupies a 64x64 region; slice s of that region is a 16x16 tile at
// ((s % 4) * 16, floor(s / 4) * 16). See docs/gpu-layout.md.

import { SimplexNoise } from '../math/noise';
import { hash4f } from '../math/rng';
import { hexToRgb } from './registry';
import type { TextureDef } from './types';

export const TEX_SIZE = 16;
export const TEX_REGION = 64;
export const ATLAS_COLS = 16;
export const ATLAS_WIDTH = TEX_REGION * ATLAS_COLS; // 1024

type RGB = [number, number, number];

function mix(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
function scale(a: RGB, k: number): RGB {
  return [a[0] * k, a[1] * k, a[2] * k];
}

/** Generates one texture volume: returns RGBA bytes in (u + 16 v + 256 s) order. */
export function generateTexture(def: TextureDef, index: number): Uint8Array {
  const out = new Uint8Array(TEX_SIZE * TEX_SIZE * TEX_SIZE * 4);
  const seed = (def.seed ?? 0) + index * 7919 + 17;
  const noise = new SimplexNoise(seed);
  const cols = def.colors.map((c) => hexToRgb(c) as RGB);
  const c0 = cols[0]!;
  const c1 = cols[1] ?? c0;
  const c2 = cols[2] ?? c1;
  const amount = def.amount ?? 0.1;
  const density = def.density ?? 0.2;
  const baseAlpha = def.alpha ?? 1;

  // Ore blob centres (deterministic per texture).
  const blobs: number[][] = [];
  if (def.pattern === 'ore') {
    const n = Math.max(3, Math.round(density * 40));
    for (let i = 0; i < n; i++) {
      blobs.push([hash4f(i, 1, 0, 0, seed) * 16, hash4f(i, 2, 0, 0, seed) * 16, hash4f(i, 3, 0, 0, seed) * 16, 1.2 + hash4f(i, 4, 0, 0, seed) * 1.3]);
    }
  }

  for (let s = 0; s < TEX_SIZE; s++) {
    for (let v = 0; v < TEX_SIZE; v++) {
      for (let u = 0; u < TEX_SIZE; u++) {
        const j = hash4f(u, v, s, 0, seed); // per-texel jitter in [0,1)
        const jit = 1 + (j - 0.5) * 2 * amount;
        let col: RGB = c0;
        let a = 1;
        const lo = noise.n3(u * 0.23, v * 0.23, s * 0.23);
        switch (def.pattern) {
          case 'solid':
            col = c0;
            break;
          case 'noise':
            col = scale(mix(c0, c1, 0.5 + 0.5 * lo), jit);
            a = baseAlpha;
            break;
          case 'cells': {
            const n = noise.n3(u * 0.28, v * 0.28, s * 0.28) + 0.45 * noise.n3(u * 0.6 + 9, v * 0.6, s * 0.6);
            if (Math.abs(n) < 0.09) col = scale(c1, 0.9 + j * 0.15);
            else col = scale(n > 0 ? c0 : mix(c0, c2, 0.6), 1 + (j - 0.5) * 0.14);
            break;
          }
          case 'grass_top':
            col = scale(mix(c0, c1, 0.5 + 0.5 * lo), jit);
            a = 1; // tint mask: fully tinted
            break;
          case 'grass_side': {
            const edge = 12 + (hash4f(u, s, 7, 0, seed) < 0.45 ? 1 : 0) - (hash4f(u, s, 8, 0, seed) < 0.25 ? 1 : 0);
            if (v >= edge) {
              col = scale(c2, 1 + (j - 0.5) * 0.2);
              a = 1; // tinted
            } else {
              col = scale(mix(c0, c1, 0.5 + 0.5 * lo), 1 + (j - 0.5) * 0.24);
              a = 0; // not tinted
            }
            break;
          }
          case 'log_side': {
            const streak = hash4f(u, 0, s, 3, seed);
            col = scale(mix(c0, c1, streak), 1 + (hash4f(u, v >> 2, s, 4, seed) - 0.5) * 0.12);
            break;
          }
          case 'log_top': {
            const r = Math.hypot(u - 7.5, v - 7.5, s - 7.5);
            if (r > 7.6) col = scale(c2, jit);
            else col = scale(Math.floor(r / 1.7) % 2 === 0 ? c0 : c1, 1 + (j - 0.5) * 0.08);
            break;
          }
          case 'planks': {
            const board = v >> 2;
            if ((v & 3) === 3) col = scale(c2, 0.9 + j * 0.1);
            else {
              const bt = hash4f(board, (u + board * 5) >> 3, s >> 3, 5, seed);
              col = scale(mix(c0, c1, bt), 1 + (noise.n3(u * 0.5, v * 2, s * 0.5) * 0.06) + (j - 0.5) * amount);
            }
            break;
          }
          case 'bricks': {
            const row = v >> 2;
            const off = (row & 1) * 4;
            const mortar = (v & 3) === 3 || ((u + off) & 7) === 7 || ((s + off) & 7) === 7;
            if (mortar) col = scale(c2, 0.95 + j * 0.1);
            else col = scale(hash4f((u + off) >> 3, row, (s + off) >> 3, 6, seed) < 0.5 ? c0 : c1, 1 + (j - 0.5) * 0.12);
            break;
          }
          case 'ore': {
            col = scale(mix(c0, c1, 0.5 + 0.5 * lo), 1 + (j - 0.5) * 0.2);
            for (const b of blobs) {
              const d = Math.hypot(u + 0.5 - b[0]!, v + 0.5 - b[1]!, s + 0.5 - b[2]!);
              if (d < b[3]!) {
                col = scale(c2, 0.85 + j * 0.3);
                break;
              }
            }
            break;
          }
          case 'glass': {
            const frame = u === 0 || u === 15 || v === 0 || v === 15 || s === 0 || s === 15;
            if (frame) {
              col = c1;
              a = 0.85;
            } else {
              const streak = (u + v + s) % 11 === 0 ? 0.25 : 0;
              col = c0;
              a = baseAlpha + streak;
            }
            break;
          }
          case 'leaves': {
            col = scale(mix(c0, c1, 0.5 + 0.5 * lo), 1 + (j - 0.5) * 0.3);
            a = hash4f(u >> 1, v >> 1, s >> 1, 9, seed) < density ? 0 : 1;
            break;
          }
          case 'fluid': {
            const n2 = noise.n3(u * 0.18, v * 0.18, s * 0.18);
            if (cols.length >= 3) {
              // lava: bright veins along noise ridges
              const ridge = 1 - Math.abs(n2);
              col = ridge > 0.85 ? c2 : mix(c0, c1, Math.max(0, ridge - 0.3) / 0.7);
            } else {
              col = scale(mix(c0, c1, 0.5 + 0.5 * n2), 1 + (j - 0.5) * 0.06);
            }
            a = baseAlpha;
            break;
          }
          case 'glow': {
            const n2 = noise.n3(u * 0.35, v * 0.35, s * 0.35);
            col = n2 > 0.25 ? c2 : mix(c0, c1, 0.5 + 0.5 * n2);
            break;
          }
          case 'torch':
            col = v < 9 ? scale(c0, jit) : v < 11 ? c1 : c2;
            break;
          case 'ladder': {
            const rail = u === 1 || u === 2 || u === 13 || u === 14;
            const rung = (v & 3) === 2;
            a = rail || rung ? 1 : 0;
            col = scale(rail ? c0 : c1, 1 + (j - 0.5) * 0.15);
            break;
          }
          case 'portal': {
            const sw = noise.n3(u * 0.3 + Math.sin(v * 0.4) * 2, v * 0.3, s * 0.3);
            col = sw > 0.3 ? c1 : sw < -0.3 ? c2 : c0;
            a = baseAlpha;
            break;
          }
          case 'plant': {
            const blade = hash4f(u, 0, s, 11, seed) < density;
            const height = 5 + Math.floor(hash4f(u, 1, s, 12, seed) * 11);
            a = blade && v < height ? 1 : 0;
            col = scale(mix(c0, c1, v / 16), 1 + (j - 0.5) * 0.2);
            break;
          }
          case 'bands': {
            // Layered rock: horizontal bands through the palette, wobbling with u/s.
            const k = Math.floor((v + 2 * noise.n3(u * 0.15, 0.5, s * 0.15)) / 3);
            const band = ((k % cols.length) + cols.length) % cols.length;
            col = scale(cols[band]!, 1 + (j - 0.5) * amount * 2);
            break;
          }
          case 'speckle': {
            col = scale(mix(c0, c1, 0.5 + 0.5 * lo), 1 + (j - 0.5) * amount * 2);
            if (hash4f(u, v, s, 13, seed) < density) col = scale(c2, 0.9 + j * 0.2);
            break;
          }
          case 'crystal': {
            // Faceted: planes of constant (u ± v ± s) with bright edges.
            const f1 = (u + v + s) & 7, f2 = (u - v + 16 + s) & 7, f3 = (u + v - s + 16) & 7;
            const edge = f1 === 0 || f2 === 0 || f3 === 0;
            col = edge ? c2 : scale(mix(c0, c1, 0.5 + 0.5 * noise.n3(u * 0.3, v * 0.3, s * 0.3)), 1 + (j - 0.5) * 0.1);
            a = baseAlpha;
            break;
          }
          case 'cap': {
            // Mushroom cap: base colour with white spots (3D blobs).
            const sp = noise.n3(u * 0.35 + 3, v * 0.35, s * 0.35);
            col = sp > 0.45 ? c1 : scale(c0, 1 + (j - 0.5) * 0.15);
            break;
          }
          case 'fruit': {
            // Leaves with fruit dots (alpha holes like leaves).
            col = scale(mix(c0, c1, 0.5 + 0.5 * lo), 1 + (j - 0.5) * 0.3);
            a = hash4f(u >> 1, v >> 1, s >> 1, 9, seed) < density ? 0 : 1;
            if (hash4f(u >> 2, v >> 2, s >> 2, 21, seed) < 0.12 && ((u + v + s) & 3) === 0) {
              col = c2;
              a = 1;
            }
            break;
          }
          case 'bamboo': {
            const node = (v & 3) === 0;
            col = node ? scale(c1, 0.9) : scale(mix(c0, c1, (u + s) / 30), 1 + (j - 0.5) * 0.1);
            break;
          }
          case 'dripstone': {
            const streak = hash4f(u, 0, s, 17, seed);
            col = scale(mix(c0, c1, streak), 1 + (hash4f(u, v >> 1, s, 18, seed) - 0.5) * 0.15);
            break;
          }
          case 'flower': {
            // Stem + blossom near the top; alpha cut-out.
            const stem = (u === 7 || u === 8) && (s === 7 || s === 8 || hash4f(u, 3, s, 19, seed) < 0.05);
            const r = Math.hypot(u - 7.5, v - 11.5, s - 7.5);
            if (r < 3.2 && hash4f(u, v, s, 20, seed) < 0.85) {
              col = scale(c2, 0.85 + j * 0.3);
              a = 1;
            } else if (stem && v < 11) {
              col = c0;
              a = 1;
            } else {
              a = 0;
            }
            break;
          }
          case 'mushroom': {
            const r2 = Math.hypot(u - 7.5, s - 7.5);
            if (v >= 6 && v <= 8 && r2 < 5) {
              col = scale(c1, 0.9 + j * 0.2);
              a = 1;
            } else if (v < 6 && r2 < 1.6) {
              col = c0;
              a = 1;
            } else a = 0;
            break;
          }
          case 'bud': {
            // Crystal spikes growing from the floor.
            const cx = (u >> 2) * 4 + 1.5, cs = (s >> 2) * 4 + 1.5;
            const hgt = 4 + Math.floor(hash4f(u >> 2, 0, s >> 2, 22, seed) * 10);
            const rr = Math.hypot(u - cx, s - cs);
            a = rr < 1.6 * (1 - v / (hgt + 1)) && v < hgt ? 1 : 0;
            col = mix(c0, c2, v / 16);
            break;
          }
          case 'furnace': {
            // Stone casing with a mouth (u 4..11, v 3..8); lit furnaces glow inside (c2).
            col = scale(mix(c0, c1, 0.5 + 0.5 * lo), 1 + (j - 0.5) * 0.16);
            const mouth = u >= 4 && u <= 11 && v >= 3 && v <= 8;
            if (mouth) col = cols.length >= 3 ? scale(mix(c2, [0.25, 0.08, 0.02], (8 - v) / 8), 0.8 + j * 0.4) : scale(c1, 0.35);
            else if (u >= 3 && u <= 12 && v >= 2 && v <= 9) col = scale(c1, 0.7);
            break;
          }
          case 'table_top': {
            // Planks with a crafting grid (horizontal coords u, s).
            const line = u % 5 === 0 || s % 5 === 0;
            col = line ? scale(c2, 0.9 + j * 0.1) : scale(mix(c0, c1, hash4f(u >> 2, 0, s >> 2, 23, seed)), 1 + (j - 0.5) * 0.12);
            break;
          }
          case 'chest': {
            // Boards with a lid seam at v 9..10 and a latch.
            const board = hash4f(u >> 3, v >> 2, s >> 3, 24, seed);
            col = scale(mix(c0, c1, board), 1 + (j - 0.5) * 0.1);
            if (v === 9 || v === 10) col = scale(c1, 0.6);
            if (u >= 7 && u <= 8 && v >= 7 && v <= 11) col = c2;
            if (u === 0 || u === 15 || s === 0 || s === 15 || v === 0 || v === 15) col = scale(c1, 0.75);
            break;
          }
          case 'metal': {
            // Storage block: bevelled bright metal/gem.
            const edge = u === 0 || u === 15 || v === 0 || v === 15 || s === 0 || s === 15;
            const inner = u === 1 || u === 14 || v === 1 || v === 14 || s === 1 || s === 14;
            col = edge ? scale(c1, 0.8) : inner ? scale(c2, 1) : scale(mix(c0, c2, 0.15 + 0.15 * lo), 1 + (j - 0.5) * 0.06);
            break;
          }
          case 'marker': {
            const frame = u === 0 || u === 15 || v === 0 || v === 15 || s === 0 || s === 15;
            col = frame ? c1 : scale(c0, 1 + (j - 0.5) * 0.08);
            break;
          }
          case 'cage': {
            // Mob spawner: a 3D lattice of dark bars (every 4 texels in u, v and s), hollow inside.
            const bu = (u & 3) === 0 || u === 15, bv = (v & 3) === 0 || v === 15, bs = (s & 3) === 0 || s === 15;
            const bars = (bu && bv) || (bu && bs) || (bv && bs);
            a = bars ? 1 : 0;
            col = scale(bars ? c0 : c1, 1 + (j - 0.5) * 0.2);
            break;
          }
          case 'shelf': {
            // Bookshelf: wooden frame and a middle board; rows of book spines (palette 2..).
            const frame = v === 0 || v === 15 || v === 7 || v === 8 || u === 0 || u === 15 || s === 0 || s === 15;
            if (frame) col = scale(v === 7 || v === 8 ? c1 : c0, 1 + (j - 0.5) * 0.1);
            else {
              const book = (u + s * 3) >> 1;
              const pick = 2 + Math.floor(hash4f(book, v >> 3, 0, 25, seed) * Math.max(1, cols.length - 2));
              const top = (v & 7) === 6 && hash4f(book, v >> 3, 1, 26, seed) < 0.5;
              col = top ? scale(c1, 0.5) : scale(cols[Math.min(cols.length - 1, pick)]!, 0.85 + 0.3 * hash4f(book, v >> 3, 2, 27, seed));
            }
            break;
          }
          case 'quilt': {
            // Bed top: a stitched blanket (c0/c1) with a white sheet border (c2) and a pillow
            // band along one edge (the icon and the blanket fold read as "bed" in any slice).
            const edge = u <= 1 || u >= 14 || s <= 1 || s >= 14;
            const pillow = u >= 10 && u <= 13 && s >= 3 && s <= 12;
            const stitch = (u + s) % 6 === 0 || (u - s + 32) % 6 === 0;
            col = edge || pillow ? scale(c2, 0.92 + j * 0.08) : scale(stitch ? c1 : c0, 1 + (j - 0.5) * 0.08);
            break;
          }
          case 'bed_side': {
            // Bed side (v = up): wooden base (c2), white sheet line, blanket (c0) folding over.
            if (v <= 2) col = scale(c2, 0.9 + j * 0.15);
            else if (v === 3 || v === 4) col = scale([0.93, 0.93, 0.9], 0.95 + j * 0.05);
            else col = scale(v >= 8 ? c1 : c0, 1 + (j - 0.5) * 0.08);
            break;
          }
          case 'thatch': {
            // Straw: long streaks along u with dark gaps.
            const st = hash4f(0, v, s, 28, seed) * 16 + u * 0.4;
            const band = Math.floor(st) % 5;
            col = scale(band === 0 ? c2 : band < 3 ? c0 : c1, 1 + (j - 0.5) * 0.18);
            break;
          }
        }
        const o = (u + TEX_SIZE * (v + TEX_SIZE * s)) * 4;
        out[o] = Math.max(0, Math.min(255, Math.round(col[0] * 255)));
        out[o + 1] = Math.max(0, Math.min(255, Math.round(col[1] * 255)));
        out[o + 2] = Math.max(0, Math.min(255, Math.round(col[2] * 255)));
        out[o + 3] = Math.max(0, Math.min(255, Math.round(a * 255)));
      }
    }
  }
  return out;
}

/** Builds the atlas (RGBA8, ATLAS_WIDTH x height). */
export function buildAtlas(defs: TextureDef[]): { data: Uint8Array; width: number; height: number } {
  const rows = Math.max(1, Math.ceil(defs.length / ATLAS_COLS));
  const width = ATLAS_WIDTH;
  const height = rows * TEX_REGION;
  const data = new Uint8Array(width * height * 4);
  defs.forEach((def, t) => {
    const vol = generateTexture(def, t);
    const rx = (t % ATLAS_COLS) * TEX_REGION;
    const ry = Math.floor(t / ATLAS_COLS) * TEX_REGION;
    for (let s = 0; s < TEX_SIZE; s++) {
      const tx = rx + (s % 4) * TEX_SIZE;
      const ty = ry + Math.floor(s / 4) * TEX_SIZE;
      for (let v = 0; v < TEX_SIZE; v++) {
        for (let u = 0; u < TEX_SIZE; u++) {
          const src = (u + TEX_SIZE * (v + TEX_SIZE * s)) * 4;
          const dst = ((ty + v) * width + (tx + u)) * 4;
          data[dst] = vol[src]!;
          data[dst + 1] = vol[src + 1]!;
          data[dst + 2] = vol[src + 2]!;
          data[dst + 3] = vol[src + 3]!;
        }
      }
    }
  });
  return { data, width, height };
}
