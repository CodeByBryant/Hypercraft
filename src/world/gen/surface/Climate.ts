// Climate and terrain height for the Surface (Phase 2).
//
// Six noise fields over the horizontal 3-space (x, z, w):
//   continentalness  land vs ocean and base elevation
//   erosion          flat vs rugged
//   peaks            ridged noise for mountain chains
//   temperature, humidity, weirdness
// plus an "ana bias" field that varies ~9x faster along W than along X/Z and shifts
// temperature/humidity, so walking kata/ana moves through biomes faster than walking in X/Z.
//
// Smooth fields are sampled on a 4-block lattice (anchored to world coordinates, so columns
// agree at their borders) and interpolated; detail noise is evaluated per position.

import { SimplexNoise } from '../../../math/noise';
import { hexToRgb } from '../../../content/registry';
import type { BiomeDef, TerrainStyle } from '../../../content/types';

export interface ClimateSample {
  cont: number;
  temp: number;
  hum: number;
  weird: number;
  mountains: number;
  erosion: number;
  /** Biome-selection relief: 0 lowland .. ~0.6 hills (low erosion) .. 1 mountain ranges. */
  relief: number;
}

export interface BiomePick {
  /** Dominant biome index (into the full biome list). */
  biome: number;
  /** Share of the blend weight held by the dominant biome (0..1). */
  share: number;
  heightBias: number;
  heightScale: number;
  grass: [number, number, number];
  ocean: boolean;
  /** 0 = shallow .. 1 = deep (oceans only). */
  depth: number;
}

const LAND_T = 0.2;

export class Climate {
  readonly sea: number;
  readonly height: number;
  private readonly nCont: SimplexNoise;
  private readonly nEros: SimplexNoise;
  private readonly nPeaks: SimplexNoise;
  private readonly nTemp: SimplexNoise;
  private readonly nHum: SimplexNoise;
  private readonly nWeird: SimplexNoise;
  private readonly nAna: SimplexNoise;
  readonly nHills: SimplexNoise;
  readonly nDetail: SimplexNoise;
  private readonly land: number[] = [];
  private readonly oceans: number[] = [];
  readonly biomes: BiomeDef[];
  private readonly grass: [number, number, number][];

  constructor(seed: number, biomes: BiomeDef[], sea: number, height: number) {
    this.sea = sea;
    this.height = height;
    this.biomes = biomes;
    this.nCont = new SimplexNoise(seed ^ 0x1101);
    this.nEros = new SimplexNoise(seed ^ 0x2202);
    this.nPeaks = new SimplexNoise(seed ^ 0x3303);
    this.nTemp = new SimplexNoise(seed ^ 0x4404);
    this.nHum = new SimplexNoise(seed ^ 0x5505);
    this.nWeird = new SimplexNoise(seed ^ 0x6606);
    this.nAna = new SimplexNoise(seed ^ 0x7707);
    this.nHills = new SimplexNoise(seed ^ 0x8808);
    this.nDetail = new SimplexNoise(seed ^ 0x9909);
    biomes.forEach((b, i) => {
      if ((b.realm ?? 'surface') !== 'surface') return; // other realms pick their own biomes
      if (b.kind === 'land') this.land.push(i);
      else if (b.kind === 'ocean') this.oceans.push(i);
    });
    this.grass = biomes.map((b) => hexToRgb(b.grassColor));
  }

  /**
   * Raw climate at a world position (no lattice). Temperature, humidity and weirdness are
   * spread with tanh so the whole 0..1 range (hot deserts, frozen plains) is common; mountains
   * are ridge lines where erosion is low, so most land is lowland or hills.
   */
  sample(x: number, z: number, w: number, out: ClimateSample): ClimateSample {
    const cont = this.nCont.fbm3(x / 700, z / 700, w / 700, 4);
    const eros = this.nEros.fbm3(x / 380, z / 380, w / 380, 3);
    // Ridged noise with a rounded crest (soft |f|), so peaks are steep but not knife edges.
    const pf = this.nPeaks.fbm3(x / 460, z / 460, w / 460, 2);
    const ridge = 1 - 2 * Math.sqrt(pf * pf + 0.0144);
    const ana = this.nAna.n3(x / 2600, z / 2600, w / 290);
    out.cont = cont;
    out.erosion = eros;
    out.temp = 0.5 + 0.5 * Math.tanh(2.6 * this.nTemp.fbm3(x / 720, z / 720, w / 720, 3) + 0.5 * ana);
    out.hum = 0.5 + 0.5 * Math.tanh(2.6 * this.nHum.fbm3(x / 620, z / 620, w / 620, 3) - 0.35 * ana);
    out.weird = 0.5 + 0.5 * Math.tanh(2.4 * this.nWeird.fbm3(x / 460, z / 460, w / 460, 2));
    // Ranges follow ridge lines (|peaks noise| small) inside low-erosion zones.
    const gate = Math.max(0, Math.min(1, (0.2 - eros) / 0.45));
    out.mountains = Math.max(0, Math.min(1, ((ridge - 0.52) / 0.36) * gate * 1.3));
    out.relief = Math.max(out.mountains, Math.max(0, Math.min(1, 0.5 - 1.05 * eros)) * 0.62);
    return out;
  }

  /** Biome choice + blended height parameters for a climate sample. */
  pick(c: ClimateSample, out: BiomePick): BiomePick {
    const ocean = c.cont < -LAND_T;
    out.ocean = ocean;
    out.depth = ocean ? Math.min(1, (-LAND_T - c.cont) / 0.45) : 0;
    const list = ocean ? this.oceans : this.land;
    // Biome choice: sharp 1/d^4 weights (argmax). Height parameters and colours blend with a
    // softer kernel so neighbouring biomes with different relief meet without walls.
    let wsum = 0, hsum = 0, bias = 0, scale = 0, gr = 0, gg = 0, gb = 0, best = list[0]!, bestW = -1;
    for (let k = 0; k < list.length; k++) {
      const i = list[k]!;
      const b = this.biomes[i]!;
      const cl = b.climate;
      let d2: number;
      if (ocean) {
        const dt = c.temp - cl[0];
        const dd = out.depth - cl[1];
        d2 = dt * dt + dd * dd * 0.8;
      } else {
        const dt = c.temp - cl[0];
        const dh = c.hum - cl[1];
        const dw = c.weird - cl[2];
        const dm = (c.relief - cl[3]) * 1.25;
        d2 = dt * dt + dh * dh + dw * dw * 0.7 + dm * dm;
      }
      const wt = 1 / (d2 * d2 + 1e-6);
      wsum += wt;
      const sd = d2 + 0.035;
      const hw = 1 / (sd * sd);
      hsum += hw;
      bias += hw * b.heightBias;
      scale += hw * b.heightScale;
      const g = this.grass[i]!;
      gr += hw * g[0];
      gg += hw * g[1];
      gb += hw * g[2];
      if (wt > bestW) {
        bestW = wt;
        best = i;
      }
    }
    out.biome = best;
    out.share = bestW / wsum;
    out.heightBias = bias / hsum;
    out.heightScale = scale / hsum;
    out.grass[0] = gr / hsum;
    out.grass[1] = gg / hsum;
    out.grass[2] = gb / hsum;
    return out;
  }

  /**
   * Terrain height (top solid block y) for a position. Continuous across the coastline: the
   * ocean floor rises to just below sea level at the shore, and on land hills, mountains and
   * biome bias fade in over the first stretch inland (no sheer sea cliffs).
   */
  heightAt(x: number, z: number, w: number, c: ClimateSample, p: BiomePick): number {
    const sea = this.sea;
    const detail = this.nDetail.n3(x / 21, z / 21, w / 21);
    let h: number;
    if (p.ocean) {
      const shelf = Math.min(1, p.depth * 4);
      h = sea - 1 - 30 * Math.pow(p.depth, 0.85) + (2.5 * detail + p.heightBias) * shelf;
    } else {
      const landness = Math.min(1, Math.max(0, (c.cont + LAND_T) / 0.55));
      const coast = smooth(Math.min(1, landness / 0.35));
      const base = sea + 2 + 12 * landness * landness + 5 * (c.cont + LAND_T) - 1.5 * (1 - coast);
      const hills = (this.nHills.fbm3(x / 88, z / 88, w / 88, 4) + 0.25) * 11 * Math.max(0.15, 0.55 - 0.9 * c.erosion);
      const mount = Math.pow(c.mountains, 1.4) * 52;
      h = base + ((hills + mount) * p.heightScale + p.heightBias) * coast + detail * 2.2 * (0.3 + 0.7 * coast);
      h = this.styleHeight(h, x, z, w, p, detail);
    }
    return Math.max(4, Math.min(this.height - 14, Math.floor(h)));
  }

  private styleHeight(h: number, x: number, z: number, w: number, p: BiomePick, detail: number): number {
    const style: TerrainStyle = this.biomes[p.biome]!.terrain ?? 'normal';
    const k = Math.min(1, Math.max(0, (p.share - 0.35) / 0.4));
    if (k <= 0) return h;
    switch (style) {
      case 'dunes': {
        // Ripples whose phase depends on W: walking kata/ana shifts the dune crests.
        const ph = x * 0.21 + w * 0.34 + z * 0.07 + 2.4 * detail;
        return h + k * (3.2 * Math.sin(ph) + 1.6 * Math.sin(ph * 2.3 + w * 0.2));
      }
      case 'mesa': {
        const step = 7;
        const t = h / step;
        const f = t - Math.floor(t);
        const terr = (Math.floor(t) + smooth(Math.max(0, (f - 0.7) / 0.3))) * step;
        return h + k * (terr - h) + k * 6;
      }
      case 'marsh':
        return h + k * (this.sea + 0.4 + detail * 1.2 - h);
      case 'flat':
        return h + k * (this.sea + 4 + detail * 0.5 - h);
      case 'steppe': {
        const t = h / 4;
        return h + k * 0.6 * (Math.round(t) * 4 - h);
      }
      default:
        return h;
    }
  }
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

/**
 * Climate on the 4-block lattice of one column (5 x 5 x 5 points over x, z, w), trilinearly
 * interpolated; much cheaper than sampling every position and seamless across columns.
 */
export class ClimateLattice {
  private readonly vals = new Float32Array(125 * 7);
  private readonly tmp: ClimateSample = { cont: 0, temp: 0, hum: 0, weird: 0, mountains: 0, erosion: 0, relief: 0 };

  fill(cl: Climate, X0: number, Z0: number, W0: number): void {
    const v = this.vals;
    for (let iw = 0; iw < 5; iw++)
      for (let iz = 0; iz < 5; iz++)
        for (let ix = 0; ix < 5; ix++) {
          const s = cl.sample(X0 + ix * 4, Z0 + iz * 4, W0 + iw * 4, this.tmp);
          const o = (ix + 5 * (iz + 5 * iw)) * 7;
          v[o] = s.cont;
          v[o + 1] = s.temp;
          v[o + 2] = s.hum;
          v[o + 3] = s.weird;
          v[o + 4] = s.mountains;
          v[o + 5] = s.erosion;
          v[o + 6] = s.relief;
        }
  }

  /** Interpolated climate at column-local (x, z, w) in [0, 16). */
  at(x: number, z: number, w: number, out: ClimateSample): ClimateSample {
    const fx = x / 4, fz = z / 4, fw = w / 4;
    const ix = Math.min(3, fx | 0), iz = Math.min(3, fz | 0), iw = Math.min(3, fw | 0);
    const tx = fx - ix, tz = fz - iz, tw = fw - iw;
    const v = this.vals;
    let c0 = 0, c1 = 0, c2 = 0, c3 = 0, c4 = 0, c5 = 0, c6 = 0;
    for (let c = 0; c < 8; c++) {
      const dx = c & 1, dz = (c >> 1) & 1, dw = (c >> 2) & 1;
      const wt = (dx ? tx : 1 - tx) * (dz ? tz : 1 - tz) * (dw ? tw : 1 - tw);
      const o = (ix + dx + 5 * (iz + dz + 5 * (iw + dw))) * 7;
      c0 += wt * v[o]!;
      c1 += wt * v[o + 1]!;
      c2 += wt * v[o + 2]!;
      c3 += wt * v[o + 3]!;
      c4 += wt * v[o + 4]!;
      c5 += wt * v[o + 5]!;
      c6 += wt * v[o + 6]!;
    }
    out.cont = c0;
    out.temp = c1;
    out.hum = c2;
    out.weird = c3;
    out.mountains = c4;
    out.erosion = c5;
    out.relief = c6;
    return out;
  }
}
