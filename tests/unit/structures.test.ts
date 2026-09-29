import { describe, expect, it } from 'vitest';
import { REG } from '../../src/content/registry';
import { STRUCTURES } from '../../src/content/structures';
import { LOOT } from '../../src/content/lootRegistry';
import { MOB_REG } from '../../src/content/mobRegistry';
import { SurfaceGenerator } from '../../src/world/gen/SurfaceGen';
import { StructurePlacer } from '../../src/world/gen/structures/Placement';
import { StructureGen } from '../../src/world/gen/structures/StructureGen';
import { ORIENTS } from '../../src/world/gen/structures/Builder';
import { COLUMN_LAYER } from '../../src/world/constants';
import { RECIPES } from '../../src/content/recipes';
import { IREG } from '../../src/content/itemRegistry';

const realm = REG.realm('surface');

describe('structures', () => {
  it('defines every structure the biomes ask for, each with a builder', () => {
    const names = new Set(STRUCTURES.map((s) => s.name));
    expect(names.size).toBe(STRUCTURES.length);
    for (const b of REG.biomes) for (const s of b.structures ?? []) expect(names, `${b.name} -> ${s}`).toContain(s);
    // Constructing the generator validates builder names.
    expect(() => new StructureGen(new SurfaceGenerator(1, realm))).not.toThrow();
  });

  it('has 48 distinct horizontal orientations (all axis permutations and signs of x, z, w)', () => {
    expect(ORIENTS.length).toBe(48);
    const keys = new Set(ORIENTS.map((o) => `${o.axes.join()}|${o.signs.join()}`));
    expect(keys.size).toBe(48);
  });

  it('places starts deterministically from the seed', () => {
    const a = new StructurePlacer(new SurfaceGenerator(777, realm));
    const b = new StructurePlacer(new SurfaceGenerator(777, realm));
    const c = new StructurePlacer(new SurfaceGenerator(778, realm));
    const names = STRUCTURES.map((s) => s.name);
    const sa = a.nearest(names, 0, 0, 0, 600);
    const sb = b.nearest(names, 0, 0, 0, 600);
    expect(sa).not.toBeNull();
    expect([sa!.x, sa!.y, sa!.z, sa!.w, sa!.def.name]).toEqual([sb!.x, sb!.y, sb!.z, sb!.w, sb!.def.name]);
    const sc = c.nearest(names, 0, 0, 0, 600);
    expect(sc && [sc.x, sc.z, sc.w, sc.def.name].join()).not.toBe([sa!.x, sa!.z, sa!.w, sa!.def.name].join());
  });

  it('builds every structure within its radius, with valid chests, spawners and villagers', () => {
    const gen = new SurfaceGenerator(4242, realm);
    const sg = gen.structures;
    const found: string[] = [];
    for (const def of STRUCTURES) {
      const st = sg.placer.nearest([def.name], 0, 0, 0, 3000);
      if (!st) continue;
      found.push(def.name);
      const plan = sg.plan(st);
      expect(plan.writes, def.name).toBeGreaterThanOrEqual(2);
      const r = def.radius + 3;
      expect(plan.min[0]!, def.name).toBeGreaterThanOrEqual(st.x - r);
      expect(plan.max[0]!, def.name).toBeLessThanOrEqual(st.x + r);
      expect(plan.min[2]!, def.name).toBeGreaterThanOrEqual(st.z - r);
      expect(plan.max[2]!, def.name).toBeLessThanOrEqual(st.z + r);
      expect(plan.min[3]!, def.name).toBeGreaterThanOrEqual(st.w - r - 3);
      expect(plan.max[3]!, def.name).toBeLessThanOrEqual(st.w + r + 3);
      for (const m of plan.markers) {
        if (m.kind === 'chest') expect(LOOT.has(m.loot!), `${def.name}: loot ${m.loot}`).toBe(true);
        else expect(MOB_REG.has(m.mob!), `${def.name}: mob ${m.mob}`).toBe(true);
      }
    }
    // Most structure kinds occur within 3000 blocks of the origin for this seed.
    expect(found.length).toBeGreaterThan(STRUCTURES.length * 0.6);
  });

  it('writes a village into the columns it covers, with chests and villagers in their data', () => {
    const gen = new SurfaceGenerator(4242, realm);
    const villages = STRUCTURES.filter((s) => s.builder === 'village').map((s) => s.name);
    const v = gen.nearestStructure(villages, 0, 0, 0, 3000);
    expect(v).not.toBeNull();
    const cx = Math.floor(v!.x / 16), cz = Math.floor(v!.z / 16), cw = Math.floor(v!.w / 16);
    const blocks = new Uint16Array(COLUMN_LAYER * gen.height);
    const surface = new Uint8Array(COLUMN_LAYER * 4);
    const extra: Record<string, unknown> = {};
    gen.generate(cx, cz, cw, blocks, surface, extra);
    const path = REG.id('dirt_path'), sandstone = REG.id('sandstone');
    let paths = 0;
    for (let i = 0; i < blocks.length; i++) if ((blocks[i]! & 0xfff) === path || (blocks[i]! & 0xfff) === sandstone) paths++;
    expect(paths).toBeGreaterThan(20);
    // The plaza's column holds at least one villager or chest somewhere in the village plan.
    const plan = gen.structures.plan(gen.structures.placer.nearest(villages, 0, 0, 0, 3000)!);
    expect(plan.markers.some((m) => m.kind === 'npc')).toBe(true);
    expect(plan.markers.some((m) => m.kind === 'chest')).toBe(true);
  });

  it('furnishes village houses with beds, and beds are craftable, one-cell, sleep-tagged blocks', () => {
    const gen = new SurfaceGenerator(4242, realm);
    const villages = STRUCTURES.filter((st) => st.builder === 'village').map((st) => st.name);
    const plan = gen.structures.plan(gen.structures.placer.nearest(villages, 0, 0, 0, 3000)!);
    let beds = 0;
    for (let cw = Math.floor(plan.min[3]! / 16); cw <= Math.floor(plan.max[3]! / 16); cw++)
      for (let cz = Math.floor(plan.min[2]! / 16); cz <= Math.floor(plan.max[2]! / 16); cz++)
        for (let cx = Math.floor(plan.min[0]! / 16); cx <= Math.floor(plan.max[0]! / 16); cx++) {
          const list = plan.column(cx, cz, cw) ?? [];
          for (let i = 0; i < list.length; i += 3) if (REG.blocks[list[i + 1]! & 0xfff]!.tags?.includes('bed')) beds++;
        }
    expect(beds).toBeGreaterThan(0);
    for (const name of ['red_bed', 'blue_bed', 'white_bed']) {
      const id = REG.id(name);
      expect(REG.blocks[id]!.tags).toContain('bed');
      expect(REG.solid[id]).toBe(1);
      expect(REG.isFullShape[id]).toBe(0);
      expect(IREG.maxStack[IREG.id(name)]).toBe(1);
      expect(RECIPES.some((r) => r.result === name)).toBe(true);
    }
  });
});
