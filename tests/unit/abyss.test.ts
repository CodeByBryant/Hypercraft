import { describe, expect, it } from 'vitest';
import { B, REG } from '../../src/content/registry';
import { IREG } from '../../src/content/itemRegistry';
import { ABYSS_BIOMES, ABYSS_STYLE, GATE_LAMP, GATE_STONE, gateCells } from '../../src/content/abyss';
import { AbyssGenerator } from '../../src/world/gen/AbyssGen';
import { SurfaceGenerator } from '../../src/world/gen/SurfaceGen';
import { LOOT_TABLES } from '../../src/content/loot';
import { RIFT_LINKS, riftLinkOf } from '../../src/content/rifts';
import { createGenerator } from '../../src/world/gen/generators';
import type { ColumnSample } from '../../src/world/gen/SurfaceGen';
import { COLUMN_LAYER } from '../../src/world/constants';
import { RECIPES } from '../../src/content/recipes';
import { TIERS } from '../../src/content/tiers';

const realm = REG.realm('abyss');
const smp = (): ColumnSample => ({ height: 0, biome: 0, grass: [0, 0, 0] });
/** The items a block drops when mined (by name). */
const blockDrops = (name: string): string[] => (IREG.drops[REG.id(name)] ?? []).map((d) => IREG.name(d.item));
const seed = 9001;
const gen = new AbyssGenerator(seed, realm);
const H = gen.height;

function column(cx: number, cz: number, cw: number) {
  const blocks = new Uint16Array(COLUMN_LAYER * H), surface = new Uint8Array(4096 * 4);
  gen.generate(cx, cz, cw, blocks, surface, {});
  return { blocks, surface };
}

/** Does a hyper-geode reach this (x, z, w) column? */
function geodeNear(x: number, z: number, w: number): boolean {
  for (let gw = Math.floor(w / 64) - 1; gw <= Math.floor(w / 64) + 1; gw++)
    for (let gz = Math.floor(z / 64) - 1; gz <= Math.floor(z / 64) + 1; gz++)
      for (let gx = Math.floor(x / 64) - 1; gx <= Math.floor(x / 64) + 1; gx++) {
        const g = gen.geodeOf(gx, gz, gw);
        if (g && Math.hypot(x - g.x, z - g.z, w - g.w) <= g.r + 1) return true;
      }
  return false;
}

describe('Crystal Abyss (Phase 9.4): the realm', () => {
  it('is an enclosed, sunless, dark realm with its own generator', () => {
    expect(realm.generator).toBe('abyss');
    expect(realm.ceilingBlock).toBe('bedrock');
    expect(realm.dayCycle).toBe(false);
    expect(realm.cavernSpawns).toBe(true);
    expect(realm.ambient).toBeLessThan(0.05);
    expect(createGenerator(1, realm)).toBeInstanceOf(AbyssGenerator);
  });

  it('has six biomes, each with its own style, ground and plants', () => {
    expect(ABYSS_BIOMES.map((b) => b.name).sort()).toEqual(['echo_lakes', 'geode_hollows', 'lumen_grotto', 'prism_forest', 'resonance_caverns', 'shard_barrens']);
    for (const b of ABYSS_BIOMES) {
      expect(ABYSS_STYLE[b.name], b.name).toBeDefined();
      expect(b.realm).toBe('abyss');
      for (const n of [b.surface, b.subsurface, b.underwater, b.stone!, b.ceiling!]) expect(REG.has(n), n).toBe(true);
      expect(b.plants.length).toBeGreaterThanOrEqual(2);
      expect(b.mobs?.day?.length).toBeGreaterThan(0);
    }
  });
});

describe('Crystal Abyss: the generator', () => {
  it('is deterministic', () => {
    const a = column(1, -1, 2), b = column(1, -1, 2);
    expect(a.blocks).toEqual(b.blocks);
    expect(a.surface).toEqual(b.surface);
    expect(new AbyssGenerator(seed, realm).spawnPoint()).toEqual(gen.spawnPoint());
  });

  it('is bedrock top and bottom, open caverns and rock between, water under the water line', () => {
    let air = 0, solid = 0, water = 0, bedrockTop = 0, total = 0;
    for (const [cx, cz, cw] of [[0, 0, 0], [3, -2, 1], [-4, 5, -3], [7, 1, 6]] as number[][]) {
      const { blocks } = column(cx!, cz!, cw!);
      for (let i = 0; i < COLUMN_LAYER; i++) {
        expect(blocks[i]! & 0xfff).toBe(B.bedrock);
        if ((blocks[i + (H - 1) * COLUMN_LAYER]! & 0xfff) === B.bedrock) bedrockTop++;
      }
      for (let k = 0; k < blocks.length; k++) {
        const id = blocks[k]! & 0xfff;
        total++;
        if (id === 0) air++;
        else if (id === B.water) water++;
        else solid++;
      }
      // Water only at or under the water line.
      for (let y = realm.seaLevel + 1; y < H; y++) for (let i = 0; i < COLUMN_LAYER; i += 37) expect(blocks[i + y * COLUMN_LAYER]! & 0xfff).not.toBe(B.water);
    }
    expect(bedrockTop).toBe(4 * COLUMN_LAYER);
    expect(air / total).toBeGreaterThan(0.25);
    expect(air / total).toBeLessThan(0.6);
    expect(water).toBeGreaterThan(0);
    expect(solid / total).toBeGreaterThan(0.4);
  });

  it('uses every biome within a few thousand blocks, and paints each column with its biome\'s ground', () => {
    const seen = new Set<string>();
    const s = smp();
    for (let a = -1200; a <= 1200; a += 150) for (let c = -1200; c <= 1200; c += 150) {
      gen.sample(a, 0, c, s);
      seen.add(REG.biomes[s.biome]!.name);
      gen.sample(c, 0, a + 600, s);
      seen.add(REG.biomes[s.biome]!.name);
    }
    for (const b of ABYSS_BIOMES) if (b.name !== 'echo_lakes') expect(seen.has(b.name), b.name).toBe(true);
    // Every column's surface alpha names an Abyss biome.
    const { surface } = column(2, 2, 2);
    for (let i = 0; i < COLUMN_LAYER; i++) expect(REG.biomes[surface[i * 4 + 3]!]!.realm).toBe('abyss');
  });

  it('sample() names the floor the blocks have: solid with air above, or a lakebed under water', () => {
    const { blocks } = column(0, 0, 0);
    const s = smp();
    let checked = 0;
    for (let w = 0; w < 16; w += 3) for (let z = 0; z < 16; z += 3) for (let x = 0; x < 16; x += 3) {
      gen.sample(x, z, w, s);
      const i = x + 16 * z + 256 * w;
      const at = (y: number) => blocks[i + y * COLUMN_LAYER]! & 0xfff;
      // Geodes are features and may cut through: skip columns they reach.
      if (geodeNear(x, z, w)) continue;
      expect(REG.solid[at(s.height)], `${x},${z},${w} floor ${s.height}`).toBeTruthy();
      if (s.ocean) expect([B.water, REG.id('glow_kelp'), REG.id('lake_coral')]).toContain(at(s.height + 1));
      else {
        expect(s.height).toBeGreaterThanOrEqual(realm.seaLevel);
        expect(s.ceiling! - s.height).toBeGreaterThanOrEqual(1);
      }
      checked++;
    }
    expect(checked).toBeGreaterThan(30);
  });

  it('spawns you on dry ground with head room and no wall in the way', () => {
    const [x, y, z, w] = gen.spawnPoint();
    const s = smp();
    gen.sample(x, z, w, s);
    expect(s.ocean).toBe(false);
    expect(y).toBe(s.height + 1);
    expect(s.ceiling! - s.height).toBeGreaterThanOrEqual(8);
    for (let dy = 1; dy <= 3; dy++) expect(gen.wallAt(x, s.height + dy, z, w)).toBe(false);
  });

  it('puts luminous crystals everywhere: prism ore on ceilings, clusters on floors, pillars in the forest', () => {
    const counts: Record<string, number> = {};
    const want = ['prism_ore', 'resonance_cluster', 'prism_glass', 'shifting_crystal'];
    for (let n = 0; n < 24; n++) {
      const { blocks } = column((n * 5) % 9 - 4, (n * 3) % 7 - 3, (n * 7) % 11 - 5);
      for (let k = 0; k < blocks.length; k += 3) {
        const nm = REG.name(blocks[k]! & 0xfff);
        if (want.includes(nm)) counts[nm] = (counts[nm] ?? 0) + 1;
      }
    }
    for (const n of ['prism_ore', 'resonance_cluster', 'shifting_crystal']) expect(counts[n], n).toBeGreaterThan(0);
  });
});

describe('Crystal Abyss: hyper-geodes', () => {
  it('are hollow 4-balls with a lining: a husk, calcite, a glowing lining, an interior with clusters and a heart', () => {
    let found = 0;
    for (let gx = -3; gx <= 3 && found < 1; gx++) for (let gz = -3; gz <= 3 && found < 1; gz++) for (let gw = -3; gw <= 3 && found < 1; gw++) {
      const g = gen.geodeOf(gx, gz, gw);
      if (!g) continue;
      expect(g.r).toBeGreaterThanOrEqual(8);
      expect(g.r).toBeLessThanOrEqual(14.01);
      const cx = Math.floor(g.x / 16), cz = Math.floor(g.z / 16), cw = Math.floor(g.w / 16);
      const { blocks } = column(cx, cz, cw);
      const at = (X: number, Y: number, Z: number, W: number) => REG.name(blocks[(X - cx * 16) + 16 * (Z - cz * 16) + 256 * (W - cw * 16) + COLUMN_LAYER * Y]! & 0xfff);
      const X = Math.floor(g.x), Y = Math.floor(g.y), Z = Math.floor(g.z), W = Math.floor(g.w);
      if (X < cx * 16 || X > cx * 16 + 15 || Z < cz * 16 || Z > cz * 16 + 15 || W < cw * 16 || W > cw * 16 + 15) continue;
      expect(at(X, Y, Z, W)).toBe('prism_ore'); // the heart
      expect(at(X + 4, Y, Z, W)).toBe('air');
      const names = new Set<string>();
      for (let d = 0; d < 16 && X + d < cx * 16 + 16; d++) names.add(at(X + d, Y, Z, W));
      for (const n of ['geode_husk', 'calcite_layer']) if (g.x + g.r < cx * 16 + 16) expect(names.has(n), n).toBe(true);
      found++;
    }
    expect(found).toBe(1);
  });

  it('are the same in every column they reach (a ball, not a stack of slices)', () => {
    // Two neighbouring columns along w both see the same ball: their shared geode is one object.
    const g = (() => {
      for (let gx = -3; gx <= 3; gx++) for (let gz = -3; gz <= 3; gz++) for (let gw = -3; gw <= 3; gw++) {
        const q = gen.geodeOf(gx, gz, gw);
        if (q) return q;
      }
      return null;
    })()!;
    expect(gen.geodeOf(Math.floor(g.x / 64), Math.floor(g.z / 64), Math.floor(g.w / 64))).toEqual(g);
  });
});

describe('Crystal Abyss: shifting crystal walls', () => {
  it('slide as you step along W: a wall in front of you at one w is beside you at the next', () => {
    // Find a wall cell, then walk along w and watch the wall's x change.
    let found: [number, number, number, number] | null = null;
    outer: for (let w = 0; w < 160; w += 2) for (let z = 0; z < 160; z += 2) for (let x = 0; x < 160; x += 2) {
      if (gen.wallAt(x, 60, z, w)) {
        found = [x, 60, z, w];
        break outer;
      }
    }
    expect(found).not.toBeNull();
    const [x, y, z, w] = found!;
    // The nearest wall cell along x, at w and at w + 6.
    const nearest = (ww: number): number => {
      for (let d = 0; d < 40; d++) for (const s of [d, -d]) if (gen.wallAt(x + s, y, z, ww)) return x + s;
      return NaN;
    };
    const a = nearest(w), b = nearest(w + 6);
    expect(Number.isFinite(a)).toBe(true);
    expect(Number.isFinite(b)).toBe(true);
    expect(b).not.toBe(a);
  });
});

describe('Crystal Abyss: the way in, and the Prism tier', () => {
  it('the gate is the arch in gate stone with two rift cells', () => {
    for (const rift of ['dormant_abyss_rift', 'abyss_rift']) {
      const cells = gateCells(rift);
      const at = (a: number, y: number, b: number, c: number) => cells.find((k) => k.d[0] === a && k.d[1] === y && k.d[2] === b && k.d[3] === c)?.block;
      expect(at(0, 0, 0, 0)).toBe(rift);
      expect(at(0, 1, 0, 0)).toBe(rift);
      expect(at(0, -1, 0, 0)).toBe(GATE_STONE);
      expect(at(1, 2, 1, 0)).toBe(GATE_LAMP);
      expect(at(1, 0, 0, 0)).toBeUndefined();
      for (const k of cells) expect(REG.has(k.block)).toBe(true);
    }
  });

  it('Resonance Crystals grow on the Surface (crystal geodes) and in the Abyss; they fuel rifts and attune compasses', () => {
    expect(IREG.def(IREG.id('resonance_crystal')).use).toBe('rift_fuel');
    expect(blockDrops('sky_crystal_cluster')).toContain('resonance_crystal');
    expect(blockDrops('resonance_cluster')).toContain('resonance_crystal');
    const r = RECIPES.find((x) => x.result === 'resonance_compass')!;
    expect(r.type).toBe('shapeless');
    expect(IREG.def(IREG.id('resonance_compass')).atlas).toEqual(['geode_gate', 'crystal_cathedral']);
  });

  it('Prism Shards come from prism ore (iron-plus tier), smelt to ingots, and make a tool tier', () => {
    expect(blockDrops('prism_ore')).toContain('prism_shard');
    expect(RECIPES.some((r) => r.type === 'smelting' && r.input === 'prism_shard' && r.result === 'prism_ingot')).toBe(true);
    const t = TIERS.find((x) => x.name === 'prism')!;
    expect(t.material).toBe('prism_ingot');
    expect(t.level).toBeGreaterThanOrEqual(4);
    for (const n of ['prism_pickaxe', 'prism_sword', 'prism_axe', 'prism_shovel', 'prism_hoe']) expect(IREG.has(n), n).toBe(true);
  });
});

describe('Geode Gate (Surface)', () => {
  const surface = new SurfaceGenerator(seed, REG.realm('surface'));

  it('lies deep under the Surface: a geode room with a dormant rift on a gate-stone plinth, clusters and a chest', () => {
    const st = surface.structures.placer.nearest(['geode_gate'], 0, 0, 0, 3000);
    expect(st).not.toBeNull();
    expect(st!.y).toBeGreaterThanOrEqual(18);
    expect(st!.y).toBeLessThanOrEqual(44);
    const plan = surface.structures.plan(st!);
    expect(plan.markers.filter((m) => m.kind === 'chest').map((m) => m.loot)).toEqual(['geode_gate']);
    const cx = Math.floor(st!.x / 16), cz = Math.floor(st!.z / 16), cw = Math.floor(st!.w / 16);
    const blocks = new Uint16Array(COLUMN_LAYER * surface.height);
    surface.generate(cx, cz, cw, blocks, new Uint8Array(COLUMN_LAYER * 4), {});
    const at = (y: number) => REG.name(blocks[(st!.x & 15) + 16 * (st!.z & 15) + 256 * (st!.w & 15) + COLUMN_LAYER * y]! & 0xfff);
    expect(at(st!.y)).toBe('dormant_abyss_rift');
    expect(at(st!.y + 1)).toBe('dormant_abyss_rift');
    expect(at(st!.y - 1)).toBe('gate_stone');
    expect(at(st!.y + 3)).toBe('gate_stone');
  });

  it('every non-cave biome may host one, and its chest holds fuel and light', () => {
    for (const b of REG.biomes) {
      if (b.realm && b.realm !== 'surface') continue;
      expect((b.structures ?? []).includes('geode_gate'), b.name).toBe(b.kind !== 'underground');
    }
    const items = new Set(LOOT_TABLES.geode_gate!.pools.flatMap((p) => p.entries.map((e) => e.item)));
    for (const n of ['resonance_crystal', 'torch']) expect(items.has(n), n).toBe(true);
  });
});

describe('Rift links', () => {
  it('each link names real blocks and realms, a waker item, and the way an arrival stands', () => {
    expect(RIFT_LINKS.map((l) => l.rift)).toEqual(['mirror_rift', 'abyss_rift', 'cloud_rift']);
    for (const l of RIFT_LINKS) {
      expect(REG.has(l.rift) && REG.has(l.dormant) && REG.has(l.foot)).toBe(true);
      expect(IREG.has(l.waker)).toBe(true);
      for (const r of l.realms) {
        expect(REG.realm(r)).toBeDefined();
        expect(l.arrival[r]).toBeTruthy();
        expect(l.stand[r]).toBeDefined();
      }
      // Both ends are built the same way: the cells hold the rift twice and a plinth under it.
      const cells = l.cells(l.rift);
      expect(cells.filter((c) => c.block === l.rift)).toHaveLength(2);
      expect(cells.some((c) => c.d[1] === -1 && c.block === l.foot)).toBe(true);
    }
    expect(riftLinkOf(undefined).rift).toBe('mirror_rift');
    expect(riftLinkOf('abyss_rift').stand.abyss).toBe('depth');
  });
});
