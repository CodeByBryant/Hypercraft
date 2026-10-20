import { describe, expect, it } from 'vitest';
import { REG } from '../../src/content/registry';
import { IREG } from '../../src/content/itemRegistry';
import { MIRROR_BIOMES, MIRROR_PALETTES, archCells, flipCell, mirrorBiomeFor } from '../../src/content/mirror';
import { SurfaceGenerator, type ColumnSample } from '../../src/world/gen/SurfaceGen';
import { MirrorGenerator } from '../../src/world/gen/MirrorGen';
import { createGenerator } from '../../src/world/gen/generators';
import { scalePosition } from '../../src/game/Portals';
import { COLUMN_LAYER } from '../../src/world/constants';
import { RECIPES } from '../../src/content/recipes';
import { LOOT_TABLES } from '../../src/content/loot';

const realm = REG.realm('mirror');
const surfaceRealm = REG.realm('surface');
const smp = (): ColumnSample => ({ height: 0, biome: 0, grass: [0, 0, 0] });

describe('Mirror Realm (Phase 9.2): the realm', () => {
  it('is the Surface reflected: same height, a sun below the horizon, W up, left and right swapped', () => {
    expect(realm.generator).toBe('mirror');
    expect(realm.heightChunks).toBe(surfaceRealm.heightChunks);
    expect(realm.invertedSky).toBe(true);
    expect(realm.mirrorX).toBe(true);
    expect(realm.mirrorControls).toBe(true);
    expect(realm.axisLabels).toEqual(['X', 'W', 'Z', 'Y']);
    expect(createGenerator(1, realm)).toBeInstanceOf(MirrorGenerator);
  });

  it('has seven biomes, every Surface land and sea biome reflects into one, and each is reached', () => {
    const mirror = REG.biomes.filter((b) => b.realm === 'mirror');
    expect(mirror.map((b) => b.name).sort()).toEqual(['chrome_sea', 'echo_peaks', 'frost_mirror', 'glass_forest', 'quicksilver_fen', 'shard_dunes', 'silver_plains']);
    const names = new Set(mirror.map((b) => b.name));
    const hit = new Set<string>();
    for (const b of REG.biomes) {
      if (b.realm && b.realm !== 'surface') continue;
      if (b.kind === 'underground') continue;
      const m = mirrorBiomeFor(b);
      expect(names.has(m)).toBe(true);
      hit.add(m);
    }
    expect([...names].filter((n) => !hit.has(n))).toEqual([]);
    // A few the player will recognise.
    const surf = (n: string) => REG.biomes.find((b) => b.name === n)!;
    expect(mirrorBiomeFor(surf('ocean'))).toBe('chrome_sea');
    expect(mirrorBiomeFor(surf('frost_spires'))).toBe('echo_peaks');
    expect(mirrorBiomeFor(surf('ice_plains'))).toBe('frost_mirror');
    expect(mirrorBiomeFor(surf('glass_marsh'))).toBe('quicksilver_fen');
    expect(mirrorBiomeFor(surf('dune_sea'))).toBe('shard_dunes');
    expect(mirrorBiomeFor(surf('dense_taiga'))).toBe('glass_forest');
    expect(mirrorBiomeFor(surf('plains'))).toBe('silver_plains');
  });

  it('gives each biome four ground blocks of its own that exist', () => {
    const seen = new Map<string, string>();
    for (const b of MIRROR_BIOMES) {
      const p = MIRROR_PALETTES[b.name]!;
      for (const n of [p.surface, p.subsurface, p.underwater, p.stone]) {
        expect(REG.has(n)).toBe(true);
        expect(seen.get(n)).toBeUndefined();
        seen.set(n, b.name);
      }
    }
  });
});

describe('Mirror Realm: the generator reflects the Surface', () => {
  const seed = 4242;
  const surface = new SurfaceGenerator(seed, surfaceRealm, { structures: false });
  const mirror = new MirrorGenerator(seed, realm);
  const H = mirror.height;

  function pair(cx: number, cz: number, cw: number) {
    const mb = new Uint16Array(COLUMN_LAYER * H), ms = new Uint8Array(COLUMN_LAYER * 4);
    mirror.generate(cx, cz, cw, mb, ms, {});
    const sb = new Uint16Array(COLUMN_LAYER * H), ss = new Uint8Array(COLUMN_LAYER * 4);
    surface.generate(-cx - 1, cz, cw, sb, ss);
    return { mb, ms, sb, ss };
  }

  it('is the same terrain mirrored in x: where there is rock there is rock, where air, air', () => {
    for (const [cx, cz, cw] of [[0, 0, 0], [3, -2, 1], [-4, 5, -3]] as [number, number, number][]) {
      const { mb, sb } = pair(cx, cz, cw);
      let diff = 0, solid = 0;
      for (let w = 0; w < 16; w++)
        for (let z = 0; z < 16; z++)
          for (let x = 0; x < 16; x++)
            for (let y = 0; y < H; y++) {
              const a = (mb[x + 16 * z + 256 * w + y * COLUMN_LAYER]! & 0xfff) === 0;
              const b = (sb[15 - x + 16 * z + 256 * w + y * COLUMN_LAYER]! & 0xfff) === 0;
              if (a !== b) diff++;
              if (!a) solid++;
            }
      expect(diff).toBe(0);
      expect(solid).toBeGreaterThan(1000);
    }
  });

  it('is repainted: the ground is the Mirror biome\'s, and nothing from the Surface\'s grass palette is left on top', () => {
    const { mb, ms } = pair(0, 0, 0);
    const mirrorBiomeIdx = new Set(REG.biomes.map((b, i) => (b.realm === 'mirror' ? i : -1)).filter((i) => i >= 0));
    const ground = new Set<string>();
    for (let col = 0; col < 4096; col++) {
      expect(mirrorBiomeIdx.has(ms[col * 4 + 3]!)).toBe(true);
      for (let y = H - 1; y >= 0; y--) {
        const id = mb[col + y * COLUMN_LAYER]! & 0xfff;
        if (REG.solid[id] && REG.opaque[id]) {
          ground.add(REG.name(id));
          break;
        }
      }
    }
    const palette = new Set(Object.values(MIRROR_PALETTES).flatMap((p) => [p.surface, p.subsurface, p.underwater, p.stone]));
    const overlap = [...ground].filter((n) => palette.has(n));
    expect(overlap.length).toBeGreaterThan(0);
    expect(ground.has('grass_block')).toBe(false);
  });

  it('samples agree with the generated columns and with the reflected Surface', () => {
    const { ms } = pair(2, 1, -1);
    const s = smp();
    for (const [x, z, w] of [[32, 16, -16], [35, 20, -9], [47, 31, -1]]) {
      mirror.sample(x, z, w, s);
      const col = (x & 15) + ((z & 15) << 4) + ((w & 15) << 8);
      expect(s.biome).toBe(ms[col * 4 + 3]);
      const t = smp();
      surface.sample(flipCell(x), z, w, t);
      expect(s.height).toBe(t.height);
    }
  });

  it('is deterministic', () => {
    const a = pair(1, 1, 1), b = pair(1, 1, 1);
    expect(a.mb).toEqual(b.mb);
    expect(a.ms).toEqual(b.ms);
  });
});

describe('Mirror Realm: the way in', () => {
  it('a portal trip mirrors x; other realms are untouched', () => {
    const ember = REG.realm('ember');
    expect(scalePosition([100.5, 70, 20.5, 3.5], surfaceRealm, realm)).toEqual([-100.5, 70, 20.5, 3.5]);
    expect(scalePosition([-100.5, 70, 20.5, 3.5], realm, surfaceRealm)).toEqual([100.5, 70, 20.5, 3.5]);
    expect(scalePosition([80, 70, 16, 8], surfaceRealm, ember)).toEqual([10, 70, 2, 1]);
  });

  it('the arch has a plinth, four corner pillars, a roof and two rift cells', () => {
    for (const rift of ['dormant_rift', 'mirror_rift']) {
      const cells = archCells(rift);
      const at = (a: number, y: number, b: number, c: number) => cells.find((k) => k.d[0] === a && k.d[1] === y && k.d[2] === b && k.d[3] === c)?.block;
      expect(at(0, 0, 0, 0)).toBe(rift);
      expect(at(0, 1, 0, 0)).toBe(rift);
      expect(at(0, -1, 0, 0)).toBe('arch_stone');
      expect(at(1, 1, -1, 0)).toBe('arch_stone');
      expect(at(1, 2, 1, 0)).toBe('mirror_glass');
      expect(at(0, 3, 0, 0)).toBe('arch_stone');
      expect(at(1, 0, 0, 0)).toBeUndefined(); // open at the sides: walk in from any direction
      for (const k of cells) expect(REG.has(k.block)).toBe(true);
    }
  });

  it('the Hand Mirror needs silver, Mirror Glass and a starlight shard', () => {
    const r = RECIPES.find((x) => x.result === 'hand_mirror')!;
    expect(r.type).toBe('shapeless');
    expect([...(r as { ingredients: string[] }).ingredients].sort()).toEqual(['mirror_glass', 'silver_ingot', 'starlight_shard']);
    expect(IREG.has('hand_mirror')).toBe(true);
    expect(IREG.def(IREG.id('hand_mirror')).use).toBe('hand_mirror');
  });
});

describe('Mirror Palace (Phase 9.3)', () => {
  const g = new MirrorGenerator(4242, realm);

  it('stands in the Mirror Realm: built inside its radius, with an altar, four chests of the palace loot and two spawners', () => {
    const st = g.structures.placer.nearest(['mirror_palace'], 0, 0, 0, 3000);
    expect(st).not.toBeNull();
    const plan = g.structures.plan(st!);
    const r = st!.def.radius + 3;
    expect(plan.min[0]!).toBeGreaterThanOrEqual(st!.x - r);
    expect(plan.max[0]!).toBeLessThanOrEqual(st!.x + r);
    expect(plan.min[2]!).toBeGreaterThanOrEqual(st!.z - r);
    expect(plan.max[2]!).toBeLessThanOrEqual(st!.z + r);
    expect(plan.min[3]!).toBeGreaterThanOrEqual(st!.w - r - 3);
    expect(plan.max[3]!).toBeLessThanOrEqual(st!.w + r + 3);
    const chests = plan.markers.filter((m) => m.kind === 'chest');
    const spawners = plan.markers.filter((m) => m.kind === 'spawner');
    expect(chests).toHaveLength(4);
    for (const c of chests) expect(c.loot).toBe('mirror_palace');
    expect(spawners.map((m) => m.mob)).toEqual(['reflection_shambler', 'reflection_shambler']);
    // The altar stands at the middle of the dais, one above the floor.
    const cx = Math.floor(st!.x / 16), cz = Math.floor(st!.z / 16), cw = Math.floor(st!.w / 16);
    const blocks = new Uint16Array(COLUMN_LAYER * g.height);
    g.generate(cx, cz, cw, blocks, new Uint8Array(COLUMN_LAYER * 4), {});
    const i = (st!.x & 15) + 16 * (st!.z & 15) + 256 * (st!.w & 15) + COLUMN_LAYER * (st!.y + 1);
    expect(blocks[i]! & 0xfff).toBe(REG.id('mirror_altar'));
  });

  it('is hosted by Mirror land biomes only, and its loot holds mirror armour', () => {
    for (const b of REG.biomes) {
      const hosts = (b.structures ?? []).includes('mirror_palace');
      expect(hosts, b.name).toBe(b.realm === 'mirror' && b.kind === 'land');
    }
    const table = LOOT_TABLES.mirror_palace!;
    const items = new Set(table.pools.flatMap((p) => p.entries.map((e) => e.item)));
    for (const n of ['mirror_helmet', 'mirror_chestplate', 'mirror_leggings', 'mirror_boots']) expect(items.has(n), n).toBe(true);
  });
});
