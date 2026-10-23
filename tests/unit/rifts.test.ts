import { describe, expect, it } from 'vitest';
import { REG } from '../../src/content/registry';
import { IREG } from '../../src/content/itemRegistry';
import { RECIPES } from '../../src/content/recipes';
import { STRUCTURES } from '../../src/content/structures';
import { LOOT_TABLES } from '../../src/content/loot';
import { SurfaceGenerator } from '../../src/world/gen/SurfaceGen';
import { ATLAS_RANGE } from '../../src/game/Game';

const names = (): string[] => IREG.def(IREG.id('rift_compass')).atlas!;

describe('Rift Compass: a way to find the rifts', () => {
  it('points at every Surface end of a rift link and at the two realm keeps, all real structures', () => {
    const n = names();
    expect(n).toEqual(expect.arrayContaining(['silver_arch', 'geode_gate', 'sky_gate', 'crystal_cathedral', 'cloud_citadel']));
    for (const s of n) expect(STRUCTURES.some((d) => d.name === s)).toBe(true);
    expect(IREG.def(IREG.id('rift_compass')).readout).toBe('atlas');
  });

  it('is cheap: a compass, an amethyst shard and a gold ingot, so it comes before the items it helps you use', () => {
    const r = RECIPES.find((x) => x.result === 'rift_compass')!;
    expect(r.type).toBe('shapeless');
    if (r.type === 'shapeless') expect([...r.ingredients].sort()).toEqual(['amethyst_shard', 'compass', 'gold_ingot']);
  });

  it('turns up in library chests', () => {
    expect(JSON.stringify(LOOT_TABLES.library)).toContain('rift_compass');
    expect(JSON.stringify(LOOT_TABLES.village_library)).toContain('rift_compass');
  });

  it('finds an Arch and a Geode Gate within its range on the Surface', () => {
    const gen = new SurfaceGenerator(20240601, REG.realm('surface'));
    for (const s of ['silver_arch', 'geode_gate']) {
      const hit = gen.nearestStructure([s], 0, 0, 0, ATLAS_RANGE);
      expect(hit, s).not.toBeNull();
      expect(hit!.name).toBe(s);
    }
  });
});
