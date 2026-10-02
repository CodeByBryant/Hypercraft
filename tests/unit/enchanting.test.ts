import { describe, expect, it } from 'vitest';
import { IREG } from '../../src/content/itemRegistry';
import { ENCHANTMENTS, ENCHANT_BY_NAME } from '../../src/content/enchantments';
import { anvil, canApply, compatible, grindstone, offerLevels, randomEnchantment, rollEnchantments } from '../../src/content/enchanting';
import { enchantOffers, applyOffer } from '../../src/game/Stations';
import { LOOT } from '../../src/content/lootRegistry';
import { Rng } from '../../src/math/rng';
import { newVillager } from '../../src/game/Trading';
import { breakInfo, rollDrops } from '../../src/game/items/Mining';
import { REG } from '../../src/content/registry';

const id = (n: string) => IREG.id(n);
const E = (n: string) => ENCHANT_BY_NAME.get(n)!;

describe('enchanting (Phase 7)', () => {
  it('knows what goes on what', () => {
    expect(canApply(E('sharpness'), id('iron_sword'))).toBe(true);
    expect(canApply(E('sharpness'), id('iron_axe'))).toBe(true);
    expect(canApply(E('sharpness'), id('iron_pickaxe'))).toBe(false);
    expect(canApply(E('efficiency'), id('iron_pickaxe'))).toBe(true);
    expect(canApply(E('protection'), id('iron_chestplate'))).toBe(true);
    expect(canApply(E('feather_falling'), id('iron_boots'))).toBe(true);
    expect(canApply(E('feather_falling'), id('iron_helmet'))).toBe(false);
    expect(canApply(E('power'), id('bow'))).toBe(true);
    // 4D Vision: any helmet but the 4D Glasses (they see in 4D already).
    expect(canApply(E('4d_vision'), id('iron_helmet'))).toBe(true);
    expect(canApply(E('4d_vision'), id('leather_helmet'))).toBe(true);
    expect(canApply(E('4d_vision'), id('4d_glasses'))).toBe(false);
    expect(canApply(E('4d_vision'), id('iron_boots'))).toBe(false);
    expect(canApply(E('slice_sense'), id('iron_pickaxe'))).toBe(true);
    expect(canApply(E('reach_through'), id('iron_shovel'))).toBe(true);
    expect(canApply(E('kata_grip'), id('iron_boots'))).toBe(true);
    // Books take anything.
    for (const e of ENCHANTMENTS) expect(canApply(e, id('book'))).toBe(true);
    expect(compatible('sharpness', 'smite')).toBe(false);
    expect(compatible('silk_touch', 'fortune')).toBe(false);
    expect(compatible('sharpness', 'unbreaking')).toBe(true);
  });

  it('rolls table offers like Minecraft', () => {
    const r = new Rng(7);
    for (let k = 0; k < 50; k++) {
      const [a, b, c] = offerLevels(15, () => r.next());
      expect(c).toBeGreaterThanOrEqual(30); // 15 shelves: the bottom offer is level 30
      expect(a).toBeGreaterThanOrEqual(1);
      expect(b).toBeGreaterThanOrEqual(a);
    }
    const sword = { id: id('hyperite_sword'), count: 1, damage: 0 };
    const offers = enchantOffers(sword, 15, 1234);
    expect(offers.every((o) => o !== null)).toBe(true);
    expect(enchantOffers(sword, 15, 1234)).toEqual(offers); // stable until you enchant
    for (const o of offers) for (const [n] of o!.ench) expect(canApply(E(n), sword.id)).toBe(true);
    const out = applyOffer(sword, offers[2]!);
    expect(out.tag!.ench!.length).toBeGreaterThan(0);
    const book = applyOffer({ id: id('book'), count: 1, damage: 0 }, offers[0]!);
    expect(IREG.name(book.id)).toBe('enchanted_book');
    // Treasure (Mending, Frost Walker) never comes from the table.
    const rr = new Rng(99);
    for (let k = 0; k < 300; k++) for (const [n] of rollEnchantments(id('iron_boots'), 30, () => rr.next())) expect(E(n).treasure).toBeFalsy();
    // No enchantability, no offers.
    expect(enchantOffers({ id: id('stone'), count: 1, damage: 0 }, 15, 1).every((o) => o === null)).toBe(true);
    expect(enchantOffers({ id: id('4d_glasses'), count: 1, damage: 0 }, 15, 1).every((o) => o === null)).toBe(true);
  });

  it('combines, repairs and renames at the anvil', () => {
    const a = { id: id('iron_sword'), count: 1, damage: 200, tag: { ench: [['sharpness', 3]] as [string, number][] } };
    const b = { id: id('iron_sword'), count: 1, damage: 100, tag: { ench: [['sharpness', 3], ['unbreaking', 2]] as [string, number][] } };
    const r = anvil(a, b, null)!;
    expect(r.out.tag!.ench).toEqual([['sharpness', 4], ['unbreaking', 2]]);
    expect(r.out.damage).toBeLessThan(100);
    expect(r.out.tag!.rc).toBe(1);
    // Material repair: each ingot fixes a quarter.
    const rep = anvil({ id: id('iron_sword'), count: 1, damage: 240 }, { id: id('iron_ingot'), count: 10, damage: 0 }, null)!;
    expect(rep.used).toBe(4);
    expect(rep.out.damage).toBe(0);
    // A book onto a pickaxe; conflicting enchantments are refused (cost, no change).
    const bk = { id: id('enchanted_book'), count: 1, damage: 0, tag: { ench: [['efficiency', 5]] as [string, number][] } };
    expect(anvil({ id: id('iron_pickaxe'), count: 1, damage: 0 }, bk, null)!.out.tag!.ench).toEqual([['efficiency', 5]]);
    const silk = { id: id('iron_pickaxe'), count: 1, damage: 0, tag: { ench: [['silk_touch', 1]] as [string, number][] } };
    expect(anvil(silk, { id: id('enchanted_book'), count: 1, damage: 0, tag: { ench: [['fortune', 3]] } }, null)).toBeNull();
    // Renaming.
    const named = anvil({ id: id('stone'), count: 12, damage: 0 }, null, 'Moon Rock')!;
    expect(named.out.tag!.name).toBe('Moon Rock');
    expect(named.out.count).toBe(12);
    expect(named.cost).toBe(1);
    // Prior work doubles the next job.
    const twice = anvil(r.out, bk.tag ? { ...bk, tag: { ench: [['unbreaking', 3]] } } : null, null)!;
    expect(twice.cost).toBeGreaterThan(1);
  });

  it('grinds enchantments off (curses stay) for experience', () => {
    const g = grindstone({ id: id('iron_sword'), count: 1, damage: 5, tag: { ench: [['sharpness', 3], ['curse_of_vanishing', 1]], rc: 3 } }, null)!;
    expect(g.out.tag!.ench).toEqual([['curse_of_vanishing', 1]]);
    expect(g.out.tag!.rc).toBeUndefined();
    expect(g.xp).toBeGreaterThan(0);
    const b = grindstone({ id: id('enchanted_book'), count: 1, damage: 0, tag: { ench: [['mending', 1]] } }, null)!;
    expect(IREG.name(b.out.id)).toBe('book');
    expect(grindstone({ id: id('stone'), count: 1, damage: 0 }, null)).toBeNull();
  });

  it('enchants loot and librarian books', () => {
    const r = new Rng(3);
    let books = 0;
    for (let k = 0; k < 40; k++)
      for (const s of LOOT.roll('library', () => r.next())) if (s && s[0] === 'enchanted_book') {
        books++;
        expect((s[3] as { ench: unknown[] }).ench.length).toBe(1);
      }
    expect(books).toBeGreaterThan(5);
    const one = randomEnchantment(id('book'), () => 0.5);
    expect(one).not.toBeNull();
    let tagged = 0;
    for (let seed = 1; seed < 30; seed++) if (newVillager('librarian', seed).offers.some((o) => o.tag?.ench?.length)) tagged++;
    expect(tagged).toBeGreaterThan(5);
  });

  it('applies Efficiency, Silk Touch and Fortune when mining', () => {
    const stone = REG.id('stone'), coal = REG.id('coal_ore');
    const pick = id('iron_pickaxe');
    expect(breakInfo(stone, pick, true, false, 5).seconds).toBeLessThan(breakInfo(stone, pick).seconds);
    expect(rollDrops(coal, pick, Math.random, true).map((s) => IREG.name(s.id))).toEqual(['coal_ore']);
    let plain = 0, lucky = 0;
    const r = new Rng(11);
    for (let k = 0; k < 400; k++) {
      plain += rollDrops(coal, pick, () => r.next())[0]!.count;
      lucky += rollDrops(coal, pick, () => r.next(), false, 3)[0]!.count;
    }
    expect(lucky / plain).toBeGreaterThan(1.8); // Fortune III: x2.2 on average
  });
});
