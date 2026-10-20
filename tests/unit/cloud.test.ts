import { describe, expect, it } from 'vitest';
import { B, REG } from '../../src/content/registry';
import { IREG } from '../../src/content/itemRegistry';
import { CLOUD_BIOMES, SKY_GATE_LAMP, SKY_GATE_STONE, skyGateCells } from '../../src/content/cloud';
import { RECIPES } from '../../src/content/recipes';
import { RIFT_LINKS } from '../../src/content/rifts';
import { SKY_GATE_HOSTS } from '../../src/content/realms9';
import { CLOUD_BASE, CLOUD_THICK, CLOUD_WANDER, CloudGenerator } from '../../src/world/gen/CloudGen';
import { SurfaceGenerator, type ColumnSample } from '../../src/world/gen/SurfaceGen';
import { createGenerator } from '../../src/world/gen/generators';
import { COLUMN_LAYER } from '../../src/world/constants';
import { Player, type MoveInput } from '../../src/physics/Player';
import { WIND_AIR, WIND_GLIDE, WIND_GROUND, WIND_LAYER, WIND_RIDE, windAt } from '../../src/physics/wind';
import { makeWorld } from './helpers';

const realm = REG.realm('cloud');
const smp = (): ColumnSample => ({ height: 0, biome: 0, grass: [0, 0, 0] });
const seed = 5150;
const gen = new CloudGenerator(seed, realm);
const H = gen.height;

function column(cx: number, cz: number, cw: number) {
  const blocks = new Uint16Array(COLUMN_LAYER * H), surface = new Uint8Array(4096 * 4);
  gen.generate(cx, cz, cw, blocks, surface, {});
  return { blocks, surface };
}

describe('Cloud Archipelago (Phase 9.6): the realm', () => {
  it('is an open sky with a day, light gravity (40% of the Surface), wind along W and island spawns', () => {
    expect(realm.generator).toBe('cloud');
    expect(realm.ceilingBlock).toBeNull();
    expect(realm.dayCycle).toBe(true);
    expect(realm.gravity / REG.realm('surface').gravity).toBeCloseTo(0.4, 1);
    expect(realm.wind).toBeGreaterThan(5);
    expect(realm.islandSpawns).toBe(true);
    expect(createGenerator(1, realm)).toBeInstanceOf(CloudGenerator);
  });

  it('has six biomes: five island biomes and the Nimbus Sea, each with ground that exists', () => {
    expect(CLOUD_BIOMES.map((b) => b.name).sort()).toEqual(['aurora_ridge', 'cirrus_meadow', 'nimbus_sea', 'storm_reef', 'sunbreak_gardens', 'zephyr_terraces']);
    for (const b of CLOUD_BIOMES) {
      expect(b.realm).toBe('cloud');
      for (const n of [b.surface, b.subsurface, b.underwater, b.stone!, b.ceiling!]) expect(REG.has(n), n).toBe(true);
      expect(b.plants.length).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('Cloud Archipelago: the generator', () => {
  it('is deterministic', () => {
    const a = column(2, 1, -3), b = column(2, 1, -3);
    expect(a.blocks).toEqual(b.blocks);
    expect(a.surface).toEqual(b.surface);
    expect(new CloudGenerator(seed, realm).spawnPoint()).toEqual(gen.spawnPoint());
  });

  it('puts a cloud sea under everything (walkable, eight thick, wandering between y 24 and 36) and no bedrock', () => {
    for (const [cx, cz, cw] of [[0, 0, 0], [3, -2, 1], [-4, 5, -3]] as number[][]) {
      const { blocks } = column(cx!, cz!, cw!);
      for (let i = 0; i < COLUMN_LAYER; i += 29) {
        const X = cx! * 16 + (i & 15), Z = cz! * 16 + ((i >> 4) & 15), W = cw! * 16 + (i >> 8);
        const ct = gen.cloudTop(X, Z, W);
        expect(ct).toBeGreaterThanOrEqual(CLOUD_BASE - CLOUD_WANDER);
        expect(ct).toBeLessThanOrEqual(CLOUD_BASE + CLOUD_WANDER);
        expect(REG.name(blocks[i + ct * COLUMN_LAYER]! & 0xfff)).toBe('nimbus_cloud');
        expect(REG.name(blocks[i + (ct - CLOUD_THICK) * COLUMN_LAYER]! & 0xfff)).toBe('nimbus_underside');
        expect(blocks[i + (ct - CLOUD_THICK - 1) * COLUMN_LAYER]).toBe(0);
        expect(blocks[i]).not.toBe(B.bedrock);
      }
    }
  });

  it('floats islands above it: the top is the biome\'s surface, the underside a crust, plants on top', () => {
    let seen = 0;
    const plants = new Set<string>();
    for (let n = 0; n < 24 && seen < 3; n++) {
      const cx = (n * 5) % 11 - 5, cz = (n * 3) % 9 - 4, cw = (n * 7) % 13 - 6;
      const { blocks } = column(cx, cz, cw);
      for (let i = 0; i < COLUMN_LAYER; i += 17) {
        const X = cx * 16 + (i & 15), Z = cz * 16 + ((i >> 4) & 15), W = cw * 16 + (i >> 8);
        const isl = gen.islandAt(X, Z, W);
        if (!isl || isl.top <= gen.cloudTop(X, Z, W) || isl.top - isl.bottom < 9) continue;
        const b = REG.biomes.find((q) => q.name === isl.biome)!;
        expect(REG.name(blocks[i + isl.top * COLUMN_LAYER]! & 0xfff)).toBe(b.surface);
        expect(REG.name(blocks[i + (isl.top - 1) * COLUMN_LAYER]! & 0xfff)).toBe(b.subsurface);
        expect(REG.name(blocks[i + isl.bottom * COLUMN_LAYER]! & 0xfff)).toBe(b.ceiling);
        const above = REG.name(blocks[i + (isl.top + 1) * COLUMN_LAYER]! & 0xfff);
        if (above !== 'air') plants.add(above);
        seen++;
      }
    }
    expect(seen).toBeGreaterThan(10);
    expect(plants.size).toBeGreaterThan(0);
  });

  it('has islands of every biome within a few thousand blocks; the Aurora Ridge only on the highest', () => {
    const found = new Map<string, number>();
    let aurora = 0;
    let samples = 0;
    for (const z of [10, 44, 70])
      for (let a = -1500; a <= 1500; a += 70)
        for (let c = -1500; c <= 1500; c += 70) {
          samples++;
          const i = gen.islandAt(a, z, c);
          if (!i) continue;
          found.set(i.biome, (found.get(i.biome) ?? 0) + 1);
          if (i.biome === 'aurora_ridge') {
            aurora++;
            expect(i.top).toBeGreaterThan(95);
          }
        }
    for (const b of CLOUD_BIOMES) if (b.name !== 'nimbus_sea') expect(found.get(b.name), b.name).toBeGreaterThan(0);
    expect(aurora).toBeGreaterThan(0);
    // Islands cover a good share (but not all) of the sky: the cloud sea shows between them.
    const total = [...found.values()].reduce((s, n) => s + n, 0);
    expect(total / samples).toBeGreaterThan(0.12);
    expect(total / samples).toBeLessThan(0.5);
  });

  it('sample() names the highest floor: an island top or the cloud sea, never "ocean"', () => {
    const s = smp();
    for (const [x, z, w] of [[10, 3, 40], [-150, 7, 220], [900, 1, -400], [31, 31, 31]] as number[][]) {
      gen.sample(x!, z!, w!, s);
      const isl = gen.islandAt(x!, z!, w!);
      const ct = gen.cloudTop(Math.floor(x!), Math.floor(z!), Math.floor(w!));
      expect(s.ocean).toBe(false);
      expect(s.height).toBe(isl && isl.top > ct ? isl.top : ct);
      expect(REG.biomes[s.biome]!.name).toBe(isl && isl.top > ct ? isl.biome : 'nimbus_sea');
    }
  });

  it('spawns you on a calm island (not the storm or the ridge), solid below and open above', () => {
    const [x, y, z, w] = gen.spawnPoint();
    const isl = gen.islandAt(x, z, w)!;
    expect(isl).not.toBeNull();
    expect(['storm_reef', 'aurora_ridge']).not.toContain(isl.biome);
    expect(y).toBe(isl.top + 1);
    const cx = Math.floor(x / 16), cz = Math.floor(z / 16), cw = Math.floor(w / 16);
    const { blocks } = column(cx, cz, cw);
    const i = (Math.floor(x) & 15) + 16 * (Math.floor(z) & 15) + 256 * (Math.floor(w) & 15);
    expect(REG.solid[blocks[i + isl.top * COLUMN_LAYER]! & 0xfff]).toBeTruthy();
    expect(blocks[i + (isl.top + 2) * COLUMN_LAYER]).toBe(0);
  });

  it('is a 4D lattice: islands are balls, so one grows and shrinks as you step along W', () => {
    // Find an island, then count its columns' extent at the centre w and at w + 15: a different disc.
    let island: ReturnType<CloudGenerator['islandOf']> = null;
    for (let gx = -2; gx <= 2 && !island; gx++) for (let gw = -2; gw <= 2 && !island; gw++) island = gen.islandOf(gx, 0, gw);
    expect(island).not.toBeNull();
    const radiusAlongX = (w: number): number => {
      let n = 0;
      for (let x = Math.floor(island!.x - island!.r - 2); x <= Math.ceil(island!.x + island!.r + 2); x++) if (gen.shape(island!, x, Math.floor(island!.z), w)) n++;
      return n;
    };
    const mid = radiusAlongX(Math.floor(island!.w)), off = radiusAlongX(Math.floor(island!.w + island!.r * 0.8));
    expect(mid).toBeGreaterThan(off);
    expect(off).toBeGreaterThan(0);
  });
});

describe('Wind currents (src/physics/wind.ts)', () => {
  it('is a fraction between -1 and 1, smooth, and flips direction every layer', () => {
    let min = 1, max = -1;
    for (let y = 0; y < 200; y += 0.5) {
      const f = windAt(10, y, 20, 100);
      min = Math.min(min, f);
      max = Math.max(max, f);
      expect(Math.abs(f - windAt(10, y + 0.1, 20, 100))).toBeLessThan(0.15);
    }
    expect(min).toBe(-1);
    expect(max).toBe(1);
    // One layer up, the other way (at a steady t, x and z).
    const probe = windAt(0, 6, 0, 0), next = windAt(0, 6 + WIND_LAYER, 0, 0);
    expect(Math.sign(probe)).toBe(-Math.sign(next));
  });

  it('drifts with the clock and bends with x and z (a current you ride is not there forever)', () => {
    expect(windAt(5, 60, 5, 0)).not.toBeCloseTo(windAt(5, 60, 5, 120), 3);
    expect(windAt(5, 60, 5, 0)).not.toBeCloseTo(windAt(300, 60, 5, 0), 3);
    expect(windAt(5, 60, 5, 7)).toBe(windAt(5, 60, 5, 7));
  });

  it('carries gliders the most, then gliders without wings, then falling, then walking', () => {
    expect(WIND_RIDE).toBeGreaterThan(WIND_GLIDE);
    expect(WIND_GLIDE).toBeGreaterThan(WIND_AIR);
    expect(WIND_AIR).toBeGreaterThan(WIND_GROUND);
    expect(WIND_GROUND).toBeGreaterThan(0);
  });
});

describe('Player in the wind', () => {
  const still = (): MoveInput => ({ forward: 0, strafe: 0, ana: 0, jump: false, sneak: false, sprint: false });
  const open = () => makeWorld(() => B.air);
  function newPlayer() {
    const p = new Player(1, 13);
    p.mode = 'survival';
    p.frozen = false;
    p.setPosition(8.5, 80, 8.5, 8.5);
    return p;
  }

  it('is carried along W by the wind, easing up to speed (and not otherwise moved)', () => {
    const world = open();
    const p = newPlayer();
    p.windSpeed = 10;
    const w0 = p.pos[3]!;
    for (let i = 0; i < 60; i++) p.update(world, still(), 1 / 60);
    expect(p.pos[3]! - w0).toBeGreaterThan(3);
    expect(p.windV).toBeGreaterThan(5);
    expect(p.windV).toBeLessThanOrEqual(10);
    expect(p.pos[0]).toBeCloseTo(8.5, 5);
    expect(p.pos[2]).toBeCloseTo(8.5, 5);
    // The other way round, kata.
    const q = newPlayer();
    q.windSpeed = -10;
    for (let i = 0; i < 60; i++) q.update(world, still(), 1 / 60);
    expect(q.pos[3]! - 8.5).toBeLessThan(-3);
  });

  it('stops at a wall along W, and does nothing when flying or in spectator', () => {
    const wall = makeWorld((_x, _y, _z, w) => (w >= 14 ? B.stone : B.air));
    const p = newPlayer();
    p.windSpeed = 12;
    for (let i = 0; i < 240; i++) p.update(wall, still(), 1 / 60);
    expect(p.pos[3]!).toBeLessThan(14);
    expect(p.pos[3]!).toBeGreaterThan(13);
    const world = open();
    const f = newPlayer();
    f.mode = 'creative';
    f.flying = true;
    f.windSpeed = 12;
    for (let i = 0; i < 60; i++) f.update(world, still(), 1 / 60);
    expect(f.pos[3]).toBeCloseTo(8.5, 5);
  });

  it('falls slowly in light gravity: the same drop takes longer', () => {
    const flat = (_x: number, y: number) => (y < 40 ? B.stone : B.air);
    const time = (g: number): number => {
      const world = makeWorld(flat);
      const p = new Player(1, g);
      p.mode = 'survival';
      p.frozen = false;
      p.setPosition(8.5, 60, 8.5, 8.5);
      let t = 0;
      while (!p.onGround && t < 20) {
        p.update(world, still(), 1 / 60);
        t += 1 / 60;
      }
      return t;
    };
    expect(time(13)).toBeGreaterThan(time(32) * 1.4);
  });
});

describe('Wind Glider and the Sky Gate', () => {
  it('the glider is chest-slot wings that ride the wind; it is made of cloud cotton and feathers', () => {
    const d = IREG.def(IREG.id('wind_glider'));
    expect(d.tags).toEqual(expect.arrayContaining(['armor_chest', 'wings', 'glider']));
    expect(d.durability).toBeGreaterThan(300);
    const r = RECIPES.find((x) => x.result === 'wind_glider')!;
    expect(r.type).toBe('shaped');
    expect(JSON.stringify(r)).toContain('cloud_cotton');
    expect(IREG.drops[REG.id('cirrus_cotton')]!.map((x) => IREG.name(x.item))).toContain('cloud_cotton');
  });

  it('the Zephyr Feather (three feathers and a resonance crystal) is the gate\'s fuel', () => {
    const l = RIFT_LINKS.find((x) => x.rift === 'cloud_rift')!;
    expect(l.realms).toEqual(['surface', 'cloud']);
    expect(l.waker).toBe('zephyr_feather');
    expect(IREG.def(IREG.id('zephyr_feather')).use).toBe('rift_fuel');
    const r = RECIPES.find((x) => x.result === 'zephyr_feather')!;
    expect(JSON.stringify(r)).toContain('resonance_crystal');
    const cells = skyGateCells('dormant_cloud_rift');
    expect(cells.filter((c) => c.block === 'dormant_cloud_rift')).toHaveLength(2);
    expect(cells.some((c) => c.block === SKY_GATE_STONE) && cells.some((c) => c.block === SKY_GATE_LAMP)).toBe(true);
  });

  it('a Sky Gate stands on the high peaks of the Surface, with its dormant rift on a plinth', () => {
    const surface = new SurfaceGenerator(seed, REG.realm('surface'));
    for (const b of REG.biomes) {
      if (b.realm && b.realm !== 'surface') continue;
      expect((b.structures ?? []).includes('sky_gate'), b.name).toBe(SKY_GATE_HOSTS.includes(b.name));
    }
    const st = surface.structures.placer.nearest(['sky_gate'], 0, 0, 0, 6000);
    expect(st).not.toBeNull();
    const cx = Math.floor(st!.x / 16), cz = Math.floor(st!.z / 16), cw = Math.floor(st!.w / 16);
    const blocks = new Uint16Array(COLUMN_LAYER * surface.height);
    surface.generate(cx, cz, cw, blocks, new Uint8Array(COLUMN_LAYER * 4), {});
    const at = (y: number) => REG.name(blocks[(st!.x & 15) + 16 * (st!.z & 15) + 256 * (st!.w & 15) + COLUMN_LAYER * y]! & 0xfff);
    expect(at(st!.y)).toBe('dormant_cloud_rift');
    expect(at(st!.y - 1)).toBe(SKY_GATE_STONE);
  });
});
