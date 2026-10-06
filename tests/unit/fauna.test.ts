import { describe, expect, it } from 'vitest';
import { IREG } from '../../src/content/itemRegistry';
import { REG } from '../../src/content/registry';
import { MOB_REG } from '../../src/content/mobRegistry';
import { ANIMALS } from '../../src/content/animals';

describe('fauna (playtest: more passive animals, food from every one)', () => {
  it('every land biome has at least two kinds of passive animals', () => {
    for (const b of REG.biomes) {
      if (b.kind !== 'land' || (b.realm ?? 'surface') !== 'surface') continue;
      const kinds = new Set((b.mobs?.day ?? []).filter((e) => !MOB_REG.get(e.mob).def.hostile).map((e) => e.mob));
      expect(kinds.size, `${b.name}: ${[...kinds].join(', ')}`).toBeGreaterThanOrEqual(2);
    }
  });

  it('the new animals are real: food or materials, something to breed with', () => {
    expect(ANIMALS.length).toBe(8);
    for (const d of ANIMALS) {
      expect(d.hostile).toBe(false);
      expect(d.drops?.length, d.name).toBeGreaterThan(0);
      for (const dr of d.drops!) expect(IREG.has(dr.item), `${d.name} drops ${dr.item}`).toBe(true);
      expect(d.breed?.length, d.name).toBeGreaterThan(0);
      for (const b of d.breed!) expect(IREG.has(b), `${d.name} breeds with ${b}`).toBe(true);
    }
    // Every raw meat cooks into something better.
    for (const n of ['raw_pork', 'raw_venison', 'raw_duck', 'raw_crab', 'raw_fish', 'raw_salmon']) {
      const id = IREG.id(n);
      expect(IREG.food[id], n).toBeTruthy();
    }
  });

  it('animals are spread over the world: several kinds appear in the day tables', () => {
    const seen = new Set<string>();
    for (const b of REG.biomes) for (const e of b.mobs?.day ?? []) seen.add(e.mob);
    for (const d of ANIMALS) expect(seen.has(d.name), `${d.name} lives nowhere`).toBe(true);
  });
});
