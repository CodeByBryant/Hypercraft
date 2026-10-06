import { describe, expect, it } from 'vitest';
import { B, REG, voxelId } from '../../src/content/registry';
import { SurfaceGenerator, type ColumnSample } from '../../src/world/gen/SurfaceGen';
import { computeColumnLight } from '../../src/world/light/columnLight';
import { Chunk, packChunkFromDense } from '../../src/world/Chunk';
import { COLUMN_LAYER, denseIndex } from '../../src/world/constants';

const realm = REG.realm('surface');

function sameArray(a: ArrayLike<number>, b: ArrayLike<number>): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

const gens = new Map<string, SurfaceGenerator>();
function gen(seed: number, garden = false): SurfaceGenerator {
  const k = `${seed}:${garden}`;
  let g = gens.get(k);
  if (!g) {
    g = new SurfaceGenerator(seed, realm, { garden });
    gens.set(k, g);
  }
  return g;
}

function genColumn(seed: number, cx: number, cz: number, cw: number, garden = false) {
  const g = gen(seed, garden);
  const H = g.height;
  const blocks = new Uint16Array(COLUMN_LAYER * H);
  const light = new Uint8Array(COLUMN_LAYER * H);
  const surface = new Uint8Array(COLUMN_LAYER * 4);
  const hm = new Uint8Array(COLUMN_LAYER);
  const t0 = performance.now();
  g.generate(cx, cz, cw, blocks, surface);
  const t1 = performance.now();
  computeColumnLight(blocks, light, hm, H);
  const t2 = performance.now();
  return { g, blocks, light, surface, hm, genMs: t1 - t0, lightMs: t2 - t1 };
}

const sample = (): ColumnSample => ({ height: 0, biome: 0, grass: [0, 0, 0] });

describe('Surface generator (Phase 2)', () => {
  it('is deterministic per seed', () => {
    const a = genColumn(1234, 3, -2, 5);
    const b = genColumn(1234, 3, -2, 5);
    const c = genColumn(4321, 3, -2, 5);
    expect(sameArray(a.blocks, b.blocks)).toBe(true);
    expect(sameArray(a.light, b.light)).toBe(true);
    let diff = 0;
    for (let i = 0; i < a.blocks.length; i++) if (a.blocks[i] !== c.blocks[i]) diff++;
    expect(diff).toBeGreaterThan(1000);
  });

  it('produces sane terrain: bedrock floor, deepstone, open sky above', () => {
    const { blocks, g } = genColumn(77, 5, 5, 5);
    let bedrock = 0, air = 0, deep = 0;
    const deepstone = REG.id('deepstone');
    for (let i = 0; i < COLUMN_LAYER; i++) {
      if (blocks[i] === B.bedrock) bedrock++;
      if (blocks[i + (g.height - 1) * COLUMN_LAYER] === 0) air++;
      if (blocks[i + 6 * COLUMN_LAYER] === deepstone) deep++;
    }
    expect(bedrock).toBe(COLUMN_LAYER);
    expect(air).toBe(COLUMN_LAYER);
    expect(deep).toBeGreaterThan(2000);
  });

  it('terrain and biomes vary along W (kata/ana changes the landscape)', () => {
    const g = gen(99);
    const s = sample();
    let hChanges = 0, bChanges = 0;
    g.sample(200, 200, 0, s);
    let ph = s.height, pb = s.biome;
    for (let w = 1; w < 4000; w += 4) {
      g.sample(200, 200, w, s);
      if (s.height !== ph) hChanges++;
      if (s.biome !== pb) bChanges++;
      ph = s.height;
      pb = s.biome;
    }
    expect(hChanges).toBeGreaterThan(50);
    expect(bChanges).toBeGreaterThan(3);
  });

  it('every land and ocean biome occurs somewhere', () => {
    const g = gen(2024);
    const s = sample();
    const seen = new Set<number>();
    for (let x = -9000; x <= 9000; x += 180) for (let w = -9000; w <= 9000; w += 180) seen.add(g.sample(x, 333, w, s).biome);
    const missing = REG.biomes.filter((b, i) => b.kind !== 'underground' && (b.realm ?? 'surface') === 'surface' && !seen.has(i)).map((b) => b.name);
    expect(missing).toEqual([]);
  });

  it('underground biomes are reachable', () => {
    const g = gen(2024);
    const seen = new Set<number>();
    // Cave biomes are picked in 3D (humidity, weirdness, depth): sample many depths.
    let k = 0;
    for (let x = -3000; x <= 3000; x += 97) for (let w = -3000; w <= 3000; w += 97) seen.add(g.caveBiomeAt(x, 6 + ((k++ * 17) % 96), 71, w));
    const caves = REG.biomes.filter((b) => b.kind === 'underground' && (b.realm ?? 'surface') === 'surface').map((b) => b.name);
    expect(caves.length).toBeGreaterThanOrEqual(15);
    expect(caves.filter((n) => !seen.has(REG.biomeIndex(n)))).toEqual([]);
  });

  it('carves caves below the surface', () => {
    let caveAir = 0;
    for (let k = 0; k < 4; k++) {
      const { blocks, hm } = genColumn(7, k * 3, 1, -k);
      for (let i = 0; i < COLUMN_LAYER; i++) {
        for (let y = 8; y < hm[i]! - 6; y++) if (blocks[i + y * COLUMN_LAYER] === 0) caveAir++;
      }
    }
    expect(caveAir).toBeGreaterThan(2000);
  });

  it('generates Ana Sheets: cavities thin along W but wide in X and Z', () => {
    // Scan the columns covering one 96-block W cell at a fixed (cx, cz).
    let found = 0;
    // Big caverns cut through the sheet in places, so keep scanning until enough of it runs
    // through solid rock.
    for (let cx = 0; cx < 6 && found <= 20; cx++)
      for (let cw = 0; cw < 6 && found <= 20; cw++) {
        const { blocks } = genColumn(31337, cx, 2, cw);
        // Open: air, or water where the sheet runs below an aquifer's water table.
        const water = REG.id('water');
        const at = (x: number, y: number, z: number, w: number) => {
          const v = w < 0 || w > 15 ? 1 : blocks[denseIndex(x, y, z, w)]!;
          return v === water ? 0 : v;
        };
        for (let y = 30; y < 96; y++)
          for (let w = 1; w < 14; w++)
            for (let z = 2; z < 14; z++)
              for (let x = 2; x < 14; x++) {
                if (at(x, y, z, w) !== 0 || at(x, y, z, w + 1) !== 0) continue;
                if (at(x, y, z, w - 1) === 0 || at(x, y, z, w + 2) === 0) continue;
                if (at(x + 1, y, z, w) === 0 && at(x - 1, y, z, w) === 0 && at(x, y, z + 1, w) === 0 && at(x, y, z - 1, w) === 0) found++;
              }
      }
    expect(found).toBeGreaterThan(20);
  });

  it('places ores by depth, plenty of them (deep variants only in the deepstone layer)', () => {
    const counts = new Map<string, number>();
    const deepHigh: string[] = [];
    for (let k = 0; k < 6; k++) {
      const { blocks } = genColumn(55, k, -k, 2 * k);
      for (let y = 1; y < realm.heightChunks * 16; y++)
        for (let i = 0; i < COLUMN_LAYER; i++) {
          const v = blocks[i + y * COLUMN_LAYER]!;
          const def = REG.blocks[voxelId(v)]!;
          if (!def.tags?.includes('ore')) continue;
          counts.set(def.name, (counts.get(def.name) ?? 0) + 1);
          if (def.name.startsWith('deep_') && y >= 48) deepHigh.push(`${def.name}@${y}`);
        }
    }
    // Minecraft-like: thousands of coal and iron per 4D column (~100+ per 3D slice chunk).
    expect(counts.get('coal_ore') ?? 0).toBeGreaterThan(6000);
    expect((counts.get('iron_ore') ?? 0) + (counts.get('deep_iron_ore') ?? 0)).toBeGreaterThan(6000);
    expect(counts.get('copper_ore') ?? 0).toBeGreaterThan(3000);
    for (const n of ['deep_gold_ore', 'deep_azurite_ore', 'deep_fluxite_ore', 'deep_hyperite_ore']) expect(counts.get(n) ?? 0, n).toBeGreaterThan(30);
    expect(deepHigh).toEqual([]);
  });

  it('carves rivers down to sea level inland', () => {
    const g = gen(8);
    const s = sample();
    let rivers = 0;
    for (let x = -4000; x < 4000 && rivers < 5; x += 7) {
      g.sample(x, 50, x * 0.37, s);
      if (s.river) {
        expect(s.height).toBeLessThan(realm.seaLevel);
        rivers++;
      }
    }
    expect(rivers).toBe(5);
  });

  it('has no sheer walls: coasts and river valleys are continuous', () => {
    // Regression: coastlines used to jump up to 70 blocks in one step (mountains applied at
    // full height right at the shore) and rivers stopped at a wall above a mountain threshold.
    const g = gen(0x5eed);
    const a = sample(), b = sample();
    let worst = 0;
    for (let k = 0; k < 150; k++) {
      const x0 = ((k * 7919) % 20000) - 10000, z0 = ((k * 104729) % 20000) - 10000, w0 = ((k * 1299709) % 20000) - 10000;
      for (let axis = 0; axis < 3; axis++)
        for (let t = 0; t < 40; t++) {
          const p = [x0, z0, w0];
          p[axis] = p[axis]! + t;
          g.sample(p[0]!, p[1]!, p[2]!, a);
          p[axis] = p[axis]! + 1;
          g.sample(p[0]!, p[1]!, p[2]!, b);
          worst = Math.max(worst, Math.abs(a.height - b.height));
        }
    }
    // (Rivers cut gorges with steep walls through mountains, so the bound is a little looser
    // than it was when they faded out; the 70-block coast jumps are what this guards against.)
    expect(worst).toBeLessThanOrEqual(30);
  });

  it('fills contained 4D lakes above sea level', () => {
    const g = gen(8);
    let lake: ReturnType<SurfaceGenerator['lakeAt']> = null;
    for (let a = -6; a <= 6 && !lake; a++) for (let d = -6; d <= 6 && !lake; d++) lake = g.lakeAt(a, 0, d);
    expect(lake).not.toBeNull();
    const l = lake!;
    const cx = Math.floor(l.x / 16), cz = Math.floor(l.z / 16), cw = Math.floor(l.w / 16);
    const { blocks } = genColumn(8, cx, cz, cw);
    const at = (y: number) => blocks[denseIndex(l.x - cx * 16, y, l.z - cz * 16, l.w - cw * 16)]!;
    expect(l.level).toBeGreaterThanOrEqual(realm.seaLevel); // lowland ponds sit at sea level
    expect([B.water, B.ice]).toContain(at(l.level));
    expect(at(l.level - 1)).toBe(B.water);
    expect(at(l.level + 1)).toBe(0);
    expect(REG.solid[at(l.level - l.depth - 1)!]).toBe(1);
  });

  it('grows trees and plants', () => {
    let logs = 0, plants = 0;
    const log = REG.id('log');
    for (let k = 0; k < 8; k++) {
      const { blocks } = genColumn(3, k * 5, k, -k * 3);
      for (const v of blocks) {
        const def = REG.blocks[voxelId(v)]!;
        if (def.tags?.includes('log') || v === log) logs++;
        if (def.tags?.includes('plant') || v === B.tall_grass) plants++;
      }
    }
    expect(logs).toBeGreaterThan(5);
    expect(plants).toBeGreaterThan(20);
  });

  it('computes column-local light and packs losslessly', () => {
    const { blocks, light, g } = genColumn(8, -1, 0, 1);
    let lit = 0;
    for (let i = 0; i < COLUMN_LAYER; i++) if (light[i + (g.height - 1) * COLUMN_LAYER]! >> 4 === 15) lit++;
    expect(lit).toBe(COLUMN_LAYER);
    for (let cy = 0; cy < g.height >> 4; cy++) {
      const ch = new Chunk(packChunkFromDense(blocks, light, cy * 16));
      for (let k = 0; k < 2000; k++) {
        const x = (k * 7) & 15, y = (k * 3) & 15, z = (k * 11) & 15, w = (k * 5) & 15;
        const d = denseIndex(x, cy * 16 + y, z, w);
        if (ch.getBlock(x, y, z, w) !== blocks[d] || ch.getLight(x, y, z, w) !== light[d]) throw new Error('pack mismatch');
      }
    }
  });

  it('stamps the engine test garden only when asked', () => {
    const g = gen(1, true);
    const o = g.gardenOrigin;
    const cx = Math.floor(o[0] / 16), cz = Math.floor((o[2] + 14) / 16), cw = Math.floor(o[3] / 16);
    const { blocks } = genColumn(1, cx, cz, cw, true);
    const floor = g.gardenFloor();
    const v = blocks[denseIndex(o[0] - cx * 16, floor + 1, o[2] + 14 - cz * 16, o[3] - cw * 16)]!;
    expect([B.marker_x, B.marker_y, B.marker_z, B.marker_w]).toContain(v);
    const plain = genColumn(1, cx, cz, cw, false);
    expect(plain.blocks[denseIndex(o[0] - cx * 16, floor + 1, o[2] + 14 - cz * 16, o[3] - cw * 16)]).not.toBe(v);
  });

  it('spawns on dry land', () => {
    for (const seed of [1, 2, 3, 42, 1234567]) {
      const g = gen(seed);
      const [x, y, z, w] = g.spawnPoint();
      const s = g.sample(Math.floor(x), Math.floor(z), Math.floor(w), sample());
      expect(s.ocean).toBe(false);
      expect(y).toBeGreaterThan(realm.seaLevel);
    }
  });

  it('generates a column fast enough for streaming', () => {
    let gms = 0, lms = 0;
    const n = 6;
    for (let i = 0; i < n; i++) {
      const r = genColumn(42, 10 + i, 3, -4);
      gms += r.genMs;
      lms += r.lightMs;
    }
    console.log(`gen ${(gms / n).toFixed(1)} ms/column, light ${(lms / n).toFixed(1)} ms/column`);
    expect(gms / n).toBeLessThan(400);
  });
});
