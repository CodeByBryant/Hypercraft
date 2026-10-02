import { describe, expect, it } from 'vitest';
import { IREG } from '../../src/content/itemRegistry';
import { CRAFTING } from '../../src/game/items/Crafting';
import { stackOf, type ItemStack } from '../../src/game/items/ItemStack';
import { anaSheetCells, hiddenAxisIndex, slicerReadout } from '../../src/game/Tools4D';
import { attackCooldown, attackDamage, hitWear } from '../../src/game/combat';
import { canApply } from '../../src/content/enchanting';
import { ENCHANT_BY_NAME } from '../../src/content/enchantments';

const made = (cells: (string | null)[]) => {
  const m = CRAFTING.match(cells.map((c) => (c ? stackOf(c) : null)) as (ItemStack | null)[], 3);
  return m ? IREG.name(m.result) : null;
};

describe('4D tools and weapons (Phase 7.7)', () => {
  it('the Ana Pick breaks a sheet through the neighbouring slices', () => {
    // Hidden axis +W: the sheet is in the y-w plane.
    const cells = anaSheetCells(10, 20, 30, 40, [0, 0, 0, 1]);
    expect(cells.length).toBe(8);
    for (const c of cells) {
      expect(c[0]).toBe(10);
      expect(c[2]).toBe(30);
      expect(Math.abs(c[1] - 20)).toBeLessThanOrEqual(1);
      expect(Math.abs(c[3] - 40)).toBeLessThanOrEqual(1);
    }
    expect(cells).toContainEqual([10, 21, 30, 41]);
    expect(cells).toContainEqual([10, 19, 30, 39]);
    // A slice turned 60° toward x: the sheet follows the axis nearest the hidden one.
    expect(hiddenAxisIndex([Math.sin(1.05), 0, 0, Math.cos(1.05)])).toBe(0);
    for (const c of anaSheetCells(0, 5, 0, 0, [Math.sin(1.05), 0, 0, Math.cos(1.05)])) expect(c[3]).toBe(0);
  });

  it('the Slicer Compass reads the slice orientation', () => {
    expect(slicerReadout([0, 0, 0, 1])).toContain('+W (aligned)');
    expect(slicerReadout([0, 0, 0, -1])).toContain('−W (aligned)');
    const t = slicerReadout([Math.sin(0.5), 0, 0, Math.cos(0.5)]);
    expect(t).toContain('tilted 29°');
    expect(t).toContain('+X');
  });

  it('weapons: spears hit hard and slow, the whip fast; all take sword enchantments', () => {
    const id = (n: string) => IREG.id(n);
    expect(attackDamage(id('spear'))).toBeGreaterThan(attackDamage(id('iron_sword')));
    expect(attackCooldown(id('spear'))).toBeGreaterThan(attackCooldown(id('iron_sword')));
    expect(attackDamage(id('tesserite_spear'))).toBeGreaterThan(attackDamage(id('spear')));
    expect(IREG.def(id('tesserite_spear')).weapon!.hiddenReach).toBeGreaterThan(IREG.def(id('spear')).weapon!.hiddenReach!);
    expect(IREG.def(id('hyper_whip')).weapon!.area).toBeGreaterThan(2);
    expect(hitWear(id('spear'))).toBe(1);
    const E = (n: string) => ENCHANT_BY_NAME.get(n)!;
    for (const n of ['spear', 'tesserite_spear', 'hyper_whip', 'hyper_chakram']) expect(canApply(E('sharpness'), id(n)), n).toBe(true);
    expect(canApply(E('unbreaking'), id('crossbow'))).toBe(true);
    // The Phase Lens is a helmet-slot item (wear it or hold it).
    expect(IREG.armorSlot[id('phase_lens')]).toBe(0);
  });

  it('crafts from tesserite', () => {
    expect(made(['tesserite_shard', 'tesserite_shard', 'tesserite_shard', null, 'stick', null, null, 'stick', null])).toBe('ana_pick');
    expect(made([null, 'tesserite_shard', null, 'tesserite_shard', 'compass', 'tesserite_shard', null, 'tesserite_shard', null])).toBe('slicer_compass');
    expect(made([null, 'iron_ingot', null, 'glass', 'tesserite_shard', 'glass', null, 'iron_ingot', null])).toBe('phase_lens');
    expect(made([null, 'tesserite_shard', null, null, 'iron_ingot', null, 'iron_ingot', 'iron_ingot', 'iron_ingot'])).toBe('w_anchor');
    expect(made(['string', 'string', 'string', 'tesserite_shard', null, null, null, null, null])).toBe('hyper_rope');
    expect(made([null, null, 'iron_ingot', null, 'stick', null, 'stick', null, null])).toBe('spear');
    expect(made(['iron_ingot', 'tesserite_shard', 'iron_ingot', 'tesserite_shard', null, 'tesserite_shard', 'iron_ingot', 'tesserite_shard', 'iron_ingot'])).toBe('hyper_chakram');
    expect(made(['stick', 'iron_ingot', 'stick', 'string', 'iron_ingot', 'string', null, 'stick', null])).toBe('crossbow');
  });
});
