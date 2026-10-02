import { describe, expect, it } from 'vitest';
import { Experience, Hunger, armorReduce, epfReduce, orbSizes, xpForLevel, xpToNext } from '../../src/game/Survival';
import { EffectList } from '../../src/game/Effects';
import { IREG } from '../../src/content/itemRegistry';
import { CRAFTING } from '../../src/game/items/Crafting';
import { canMerge, loadStack, saveStack, withCount } from '../../src/game/items/ItemStack';
import { ARMOR_MATERIALS } from '../../src/content/armor';

describe('survival (Phase 7)', () => {
  it('reduces damage with armour like Minecraft 1.9+', () => {
    expect(armorReduce(10, 0, 0)).toBe(10);
    // Full iron (15 points): 10 damage -> 10 * (1 - max(3, 15 - 5) / 25) = 6.
    expect(armorReduce(10, 15, 0)).toBeCloseTo(6, 5);
    // Full hyperite (20 points, toughness 8): 10 -> 10 * (1 - (20 - 40/16)/25) = 3.
    expect(armorReduce(10, 20, 8)).toBeCloseTo(3, 5);
    // The cap: never more than 80% off.
    expect(armorReduce(4, 30, 20)).toBeCloseTo(0.8, 5);
    expect(epfReduce(10, 8)).toBeCloseTo(6.8, 5);
    expect(epfReduce(10, 99)).toBeCloseTo(2, 5);
  });

  it('defines four armour pieces per material with Minecraft durability', () => {
    for (const m of ARMOR_MATERIALS) {
      const pieces = ['helmet', 'chestplate', 'leggings', 'boots'].map((p) => IREG.id(`${m.name}_${p}`));
      expect(pieces.map((id) => IREG.armorSlot[id])).toEqual([0, 1, 2, 3]);
      expect(IREG.durability[pieces[1]!]).toBe(16 * m.durability);
      if (m.craftable) expect(CRAFTING.recipes.some((r) => r.result === pieces[0])).toBe(true);
    }
    expect(IREG.armorSlot[IREG.id('4d_glasses')]).toBe(0);
    expect(IREG.armor[IREG.id('4d_glasses')]!.points).toBe(0);
  });

  it('drains, heals and starves through the hunger bar', () => {
    const h = new Hunger();
    expect(h.food).toBe(20);
    // Saturated and full: fast healing paid from saturation.
    let healed = 0;
    for (let t = 0; t < 10; t += 0.05) healed += Math.max(0, h.tick(0.05, 10, 20, 2));
    expect(healed).toBeGreaterThan(0);
    // Exhaustion eats saturation first, then food.
    h.reset();
    h.saturation = 0;
    h.exhaust(8);
    h.tick(0.05, 20, 20, 2);
    expect(h.food).toBe(18);
    // Empty: starving hurts (normal stops at 1 health).
    h.food = 0;
    let hurt = 0;
    for (let t = 0; t < 9; t += 0.05) hurt += Math.min(0, h.tick(0.05, 5, 20, 2));
    expect(hurt).toBe(-2);
    expect(h.tick(4.1, 1, 20, 2)).toBe(0);
    h.eat(8, 12.8);
    expect(h.food).toBe(8);
    expect(h.saturation).toBe(8);
  });

  it('levels experience on Minecraft’s curve', () => {
    expect(xpToNext(0)).toBe(7);
    expect(xpToNext(16)).toBe(42);
    expect(xpToNext(31)).toBe(121);
    expect(xpForLevel(30)).toBe(1395);
    const x = new Experience();
    x.add(xpForLevel(30) + 10);
    expect(x.level).toBe(30);
    expect(x.spendLevels(3)).toBe(true);
    expect(x.level).toBe(27);
    expect(x.spendLevels(40)).toBe(false);
    expect(x.deathDrop()).toBe(100);
    expect(orbSizes(100).reduce((a, b) => a + b, 0)).toBe(100);
  });

  it('applies effects by Minecraft’s rules', () => {
    const e = new EffectList();
    expect(e.add('speed', 30, 0)).toBe(true);
    expect(e.add('speed', 10, 0)).toBe(false); // shorter, same level
    expect(e.add('speed', 10, 1)).toBe(true); // stronger wins
    expect(e.level('speed')).toBe(2);
    expect(e.add('not_an_effect', 10)).toBe(false);
    expect(e.tick(11)).toEqual(['speed']);
    expect(e.size).toBe(0);
  });

  it('keeps item data through saves, splits and merges', () => {
    const sword = { id: IREG.id('iron_sword'), count: 1, damage: 3, tag: { ench: [['sharpness', 3]] as [string, number][], name: 'Slicer' } };
    const back = loadStack(JSON.parse(JSON.stringify(saveStack(sword))));
    expect(back).toEqual(sword);
    const a = { id: IREG.id('stone'), count: 10, damage: 0, tag: { name: 'Rock' } };
    expect(canMerge(a, withCount(a, 3))).toBe(true);
    expect(canMerge(a, { id: a.id, count: 3, damage: 0 })).toBe(false);
    const half = withCount(a, 5);
    half.tag!.name = 'Changed';
    expect(a.tag.name).toBe('Rock'); // deep copy
  });

  it('knows how filling every food is', () => {
    expect(IREG.food[IREG.id('cooked_beef')]!.nutrition).toBe(8);
    expect(IREG.food[IREG.id('bread')]!.nutrition).toBe(5);
    expect(IREG.food[IREG.id('golden_apple')]!.always).toBe(true);
    expect(IREG.food[IREG.id('stone')]).toBeNull();
    expect(CRAFTING.smelt(IREG.id('raw_beef'), 'smoker')?.result).toBe(IREG.id('cooked_beef'));
  });
});
