import { describe, expect, it } from 'vitest';
import { IREG } from '../../src/content/itemRegistry';
import { REG } from '../../src/content/registry';
import { BUSHES } from '../../src/content/farming';
import { LEAF_FRUIT } from '../../src/content/forage';
import { LOOT } from '../../src/content/lootRegistry';
import { CRAFTING } from '../../src/game/items/Crafting';
import { rollDrops } from '../../src/game/items/Mining';
import { stackOf, type ItemStack } from '../../src/game/items/ItemStack';

const made = (cells: (string | null)[], size = 3) => {
  const m = CRAFTING.match(cells.map((c) => (c ? stackOf(c) : null)) as (ItemStack | null)[], size);
  return m ? [IREG.name(m.result), m.count] : null;
};

describe('foraging and fishing (playtest: plants that look like food are food)', () => {
  it('every berry bush gives its berries, which are food and plant a young bush', () => {
    for (const b of BUSHES) {
      expect(REG.has(b.mature) && REG.has(b.young), b.mature).toBe(true);
      expect(IREG.food[IREG.id(b.berry)], b.berry).toBeTruthy();
      expect(IREG.has(b.young), `${b.young} has no item`).toBe(false);
      expect(rollDrops(REG.id(b.mature), -1, () => 0).map((s) => IREG.name(s.id))).toEqual([b.berry]);
      expect(rollDrops(REG.id(b.young), -1, () => 0)).toEqual([]);
    }
    for (const n of ['blueberry_bush', 'cranberry', 'lingonberry']) expect(BUSHES.some((b) => b.mature === n), n).toBe(true);
  });

  it('fruit trees drop fruit, cacti and sunflowers too', () => {
    for (const [leaves, [fruit]] of Object.entries(LEAF_FRUIT)) {
      expect(IREG.food[IREG.id(fruit)], fruit).toBeTruthy();
      expect(rollDrops(REG.id(leaves), -1, () => 0).map((s) => IREG.name(s.id)), leaves).toContain(fruit);
    }
    expect(rollDrops(REG.id('barrel_cactus'), -1, () => 0).map((s) => IREG.name(s.id))).toContain('cactus_fruit');
    expect(rollDrops(REG.id('sunflower'), -1, () => 0).map((s) => IREG.name(s.id))).toContain('sunflower_seeds');
    for (const n of ['glow_berries', 'sea_grape', 'puffball']) expect(IREG.food[IREG.id(n)], n).toBeTruthy();
  });

  it('plant fibre makes string, and string a fishing rod; fish cook and stew', () => {
    expect(made(['plant_fibre', 'plant_fibre', 'plant_fibre', null, null, null, null, null, null], 3)).toEqual(['string', 1]);
    expect(made([null, null, 'stick', null, 'stick', 'string', 'stick', null, 'string'])).toEqual(['fishing_rod', 1]);
    expect(IREG.def(IREG.id('fishing_rod')).use).toBe('fishing');
    expect(IREG.durability[IREG.id('fishing_rod')]).toBeGreaterThan(0);
    expect(made(['raw_fish', 'potato', 'brown_mushroom', 'bowl', null, null, null, null, null])).toEqual(['fish_stew', 1]);
    expect(made(['sweet_berries', 'blueberries', 'cranberries', 'sugar', 'egg', null, null, null, null])).toEqual(['berry_pie', 1]);
  });

  it('the fishing table mostly gives fish', () => {
    let s = 5;
    const rnd = () => ((s = (s * 1103515245 + 12345) >>> 0) / 4294967296);
    let fish = 0;
    const n = 600;
    for (let i = 0; i < n; i++) {
      const got = LOOT.roll('fishing', rnd, 1).find((x) => x !== null);
      expect(got).toBeTruthy();
      if (got![0] === 'raw_fish' || got![0] === 'raw_salmon') fish++;
    }
    expect(fish / n).toBeGreaterThan(0.7);
  });
});
