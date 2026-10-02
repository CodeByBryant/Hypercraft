import { describe, expect, it } from 'vitest';
import { IREG } from '../../src/content/itemRegistry';
import { smith } from '../../src/content/smithing';
import { shieldCovers } from '../../src/game/combat';
import type { ItemStack } from '../../src/game/items/ItemStack';

const st = (n: string, count = 1, damage = 0, tag?: ItemStack['tag']): ItemStack => ({ id: IREG.id(n), count, damage, ...(tag ? { tag } : {}) });

describe('smithing and shields (Phase 7)', () => {
  it('upgrades hyperite gear to Ancient Slag, keeping enchantments and names', () => {
    const out = smith(st('slag_upgrade_template'), st('hyperite_sword', 1, 100, { ench: [['sharpness', 3]], name: 'Edge' }), st('ancient_slag_ingot'))!;
    expect(IREG.name(out.id)).toBe('slag_sword');
    expect(out.tag?.ench).toEqual([['sharpness', 3]]);
    expect(out.tag?.name).toBe('Edge');
    expect(out.damage).toBe(100);
    expect(IREG.name(smith(st('slag_upgrade_template'), st('hyperite_chestplate'), st('ancient_slag_ingot'))!.id)).toBe('slag_chestplate');
    // Wrong material, wrong base, missing template.
    expect(smith(st('slag_upgrade_template'), st('hyperite_sword'), st('iron_ingot'))).toBeNull();
    expect(smith(st('slag_upgrade_template'), st('iron_sword'), st('ancient_slag_ingot'))).toBeNull();
    expect(smith(null, st('hyperite_sword'), st('ancient_slag_ingot'))).toBeNull();
  });

  it('trims armour with a pattern and a material colour', () => {
    const out = smith(st('kata_armor_trim'), st('iron_chestplate'), st('gold_ingot'))!;
    expect(IREG.name(out.id)).toBe('iron_chestplate');
    expect(out.tag?.trim).toEqual(['kata', 'gold_ingot']);
    // The same trim again does nothing; a new one replaces it.
    expect(smith(st('kata_armor_trim'), out, st('gold_ingot'))).toBeNull();
    expect(smith(st('ember_armor_trim'), out, st('azurite'))!.tag?.trim).toEqual(['ember', 'azurite']);
    // Not armour, the 4D Glasses (no armour points), not a trim material.
    expect(smith(st('kata_armor_trim'), st('iron_sword'), st('gold_ingot'))).toBeNull();
    expect(smith(st('kata_armor_trim'), st('4d_glasses'), st('gold_ingot'))).toBeNull();
    expect(smith(st('kata_armor_trim'), st('iron_helmet'), st('dirt'))).toBeNull();
  });

  it('blocks hits from the front of the slice, not from behind or the hidden axis', () => {
    const F = [0, 0, 1, 0], H = [0, 0, 0, 1];
    expect(shieldCovers([0, 0, 5, 0], F, H, 1)).toBe(true);
    expect(shieldCovers([0, 3, 5, 0], F, H, 1)).toBe(true); // height does not matter
    expect(shieldCovers([5, 0, 0.1, 0], F, H, 1)).toBe(true); // wide arc
    expect(shieldCovers([0, 0, -5, 0], F, H, 1)).toBe(false); // behind
    expect(shieldCovers([0, 0, 1, 5], F, H, 1)).toBe(false); // from ana
    expect(shieldCovers([0, 0, 1, -5], F, H, 1)).toBe(false); // from kata
    expect(shieldCovers([0, 0, 5, 2], F, H, 1)).toBe(true); // mostly in front
  });
});
