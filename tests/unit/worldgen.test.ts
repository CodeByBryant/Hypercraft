import { describe, expect, it } from 'vitest';
import { B, REG, voxelId } from '../../src/content/registry';
import { SurfaceGenerator, inGarden, selectBiome } from '../../src/world/gen/SurfaceGen';
import { computeColumnLight } from '../../src/world/light/columnLight';
import { Chunk, packChunkFromDense } from '../../src/world/Chunk';
import { COLUMN_LAYER, denseIndex } from '../../src/world/constants';

const realm = REG.realm('surface');

function sameArray(a: ArrayLike<number>, b: ArrayLike<number>): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function genColumn(seed: number, cx: number, cz: number, cw: number) {
  const g = new SurfaceGenerator(seed, realm);
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

describe('Surface generator', () => {
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

  it('produces sane terrain: bedrock floor, stone, a surface and sky above', () => {
    const { blocks, g } = genColumn(77, 5, 5, 5);
    let bedrockFloor = 0;
    let air = 0;
    for (let i = 0; i < COLUMN_LAYER; i++) {
      if (blocks[i] === B.bedrock) bedrockFloor++;
      if (blocks[i + (g.height - 1) * COLUMN_LAYER] === 0) air++;
    }
    expect(bedrockFloor).toBe(COLUMN_LAYER);
    expect(air).toBe(COLUMN_LAYER);
    const counts = new Map<number, number>();
    for (const v of blocks) counts.set(voxelId(v), (counts.get(voxelId(v)) ?? 0) + 1);
    expect(counts.get(B.stone)! > 50000).toBe(true);
  });

  it('terrain varies along W (walking kata/ana changes the landscape)', () => {
    const g = new SurfaceGenerator(99, realm);
    g.testGarden = false;
    const s = { height: 0, biome: 0, grass: [0, 0, 0] as [number, number, number] };
    let changes = 0;
    let prev = g.sample(200, 200, 0, s).height;
    for (let w = 1; w < 200; w++) {
      const h = g.sample(200, 200, w, s).height;
      if (h !== prev) changes++;
      prev = h;
    }
    expect(changes).toBeGreaterThan(20);
  });

  it('computes column-local light: sky above ground, dark deep underground', () => {
    const { light, hm, blocks, g } = genColumn(5, 2, 2, 2);
    for (let i = 0; i < COLUMN_LAYER; i += 97) {
      const top = hm[i]!;
      expect(light[i + (g.height - 1) * COLUMN_LAYER]! >> 4).toBe(15);
      if (top < g.height - 1) expect(light[i + top * COLUMN_LAYER]! >> 4).toBeGreaterThan(10);
    }
    // bedrock / stone voxels carry no light
    let litOpaque = 0;
    for (let i = 0; i < blocks.length; i++) {
      if (REG.opaque[blocks[i]! & 0xfff] && REG.emission[blocks[i]! & 0xfff] === 0 && light[i] !== 0) litOpaque++;
    }
    expect(litOpaque).toBe(0);
  });

  it('packs into brick-sparse chunks that round-trip exactly', () => {
    const { blocks, light, g } = genColumn(8, -1, 0, 1);
    let nonUniform = 0;
    for (let cy = 0; cy < g.height >> 4; cy++) {
      const p = packChunkFromDense(blocks, light, cy * 16);
      nonUniform += p.bSlots;
      const ch = new Chunk(p);
      for (let k = 0; k < 3000; k++) {
        const x = (k * 7) & 15, y = (k * 3) & 15, z = (k * 11) & 15, w = (k * 5) & 15;
        const d = denseIndex(x, cy * 16 + y, z, w);
        expect(ch.getBlock(x, y, z, w)).toBe(blocks[d]);
        expect(ch.getLight(x, y, z, w)).toBe(light[d]);
      }
    }
    // Brick sparsity: far fewer than all 2048 bricks of the column carry data.
    expect(nonUniform).toBeLessThan(2048);
  });

  it('stamps the engine test garden near spawn', () => {
    const { blocks, g } = genColumn(1, 0, 0, 0);
    const floor = g.gardenFloor();
    expect(inGarden(0, 14, 0)).toBe(true);
    // the sculpture at x=-1..1, z=14..16, w=-1..1 sits on the floor; (0,14,0) is inside column (0,0,0)
    const v = blocks[denseIndex(0, floor + 1, 14, 0)]!;
    expect([B.marker_x, B.marker_y, B.marker_z, B.marker_w]).toContain(v);
  });

  it('generates a column fast enough for streaming', () => {
    let gen = 0;
    let lit = 0;
    const n = 6;
    for (let i = 0; i < n; i++) {
      const r = genColumn(42, 10 + i, 3, -4);
      gen += r.genMs;
      lit += r.lightMs;
    }
    // Loose bound for CI machines; typical numbers are logged in docs/benchmarks.
    console.log(`gen ${(gen / n).toFixed(1)} ms/column, light ${(lit / n).toFixed(1)} ms/column`);
    expect(gen / n).toBeLessThan(400);
  });
});

describe('biome selection', () => {
  const biomes = REG.biomes;
  const grass = biomes.map(() => [0.5, 0.5, 0.5] as [number, number, number]);
  const sel = () => ({ biome: -1, heightBias: 0, heightScale: 0, grass: [0, 0, 0] as [number, number, number] });

  it('picks the nearest biome in climate space', () => {
    for (let i = 0; i < biomes.length; i++) {
      const b = biomes[i]!;
      expect(selectBiome(b.temperature, b.humidity, biomes, grass, sel()).biome).toBe(i);
    }
    expect(biomes[selectBiome(0.0, 0.3, biomes, grass, sel()).biome]!.name).toBe('ice_plains');
    expect(biomes[selectBiome(1.0, 0.0, biomes, grass, sel()).biome]!.name).toBe('dune_sea');
  });

  it('blends height parameters continuously across borders', () => {
    let prev = selectBiome(0.1, 0.4, biomes, grass, sel()).heightBias;
    for (let t = 0.1; t <= 0.9; t += 0.005) {
      const v = selectBiome(t, 0.4, biomes, grass, sel()).heightBias;
      expect(Math.abs(v - prev)).toBeLessThan(1.5);
      prev = v;
    }
  });

  it('every biome occurs and biomes change along W', () => {
    const g = new SurfaceGenerator(2024, realm);
    g.testGarden = false;
    const s = { height: 0, biome: 0, grass: [0, 0, 0] as [number, number, number] };
    const seen = new Set<number>();
    for (let x = -6000; x <= 6000; x += 150) for (let z = -6000; z <= 6000; z += 150) seen.add(g.sample(x, z, 0, s).biome);
    expect(seen.size).toBe(biomes.length);
    let changes = 0;
    let prev = g.sample(100, 100, 0, s).biome;
    for (let w = 0; w < 20000; w += 50) {
      const b = g.sample(100, 100, w, s).biome;
      if (b !== prev) changes++;
      prev = b;
    }
    expect(changes).toBeGreaterThan(3);
  });
});
