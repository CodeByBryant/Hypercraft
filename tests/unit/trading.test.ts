import { describe, expect, it } from 'vitest';
import { IREG } from '../../src/content/itemRegistry';
import { MOB_REG } from '../../src/content/mobRegistry';
import { MERCHANT_TRADES, PROFESSIONS, TRADE_LEVEL_XP } from '../../src/content/trades';
import { levelProgress, newVillager, offend, price, recordTrade, restock, soldOut } from '../../src/game/Trading';

describe('trading', () => {
  it('only trades known items, and every profession has a villager mob', () => {
    for (const p of PROFESSIONS) {
      expect(MOB_REG.has(`villager_${p.name}`)).toBe(true);
      expect(p.levels.length).toBe(5);
      for (const lvl of p.levels)
        for (const t of lvl) {
          for (const [n, c] of t.cost) {
            expect(IREG.has(n), `${p.name}: ${n}`).toBe(true);
            expect(c).toBeLessThanOrEqual(IREG.maxStack[IREG.id(n)]!);
          }
          expect(IREG.has(t.result[0]), `${p.name}: ${t.result[0]}`).toBe(true);
        }
    }
    for (const t of MERCHANT_TRADES) expect(IREG.has(t.result[0]), t.result[0]).toBe(true);
    expect(MOB_REG.has('wandering_merchant')).toBe(true);
  });

  it('offers two novice trades, deterministic per villager seed', () => {
    const a = newVillager('smith', 42), b = newVillager('smith', 42);
    expect(a.offers.length).toBe(2);
    expect(a.offers).toEqual(b.offers);
  });

  it('levels up from trade experience and unlocks new offers', () => {
    const d = newVillager('librarian', 7);
    const first = d.offers[0]!;
    let ups = 0;
    for (let i = 0; i < 12; i++) if (recordTrade(d, first)) ups++;
    expect(d.xp).toBeGreaterThanOrEqual(TRADE_LEVEL_XP[1]!);
    expect(d.level).toBeGreaterThanOrEqual(1);
    expect(ups).toBe(d.level);
    expect(d.offers.length).toBeGreaterThan(2);
    expect(levelProgress(d)).toBeGreaterThanOrEqual(0);
  });

  it('prices react to reputation and demand, and restocking resets uses', () => {
    const d = newVillager('smith', 3);
    const o = d.offers[0]!;
    const base = price(o, 0, 0);
    expect(price(o, 0, 10)).toBeLessThanOrEqual(base); // liked: cheaper (never below 1)
    offend(d, 20);
    expect(price(o, 0, d.rep)).toBeGreaterThanOrEqual(base); // disliked: dearer
    // Sell out, restock: demand rises, uses reset.
    o.uses = o.maxUses;
    expect(soldOut(o)).toBe(true);
    restock(d, 1); // first restock only sets the clock
    o.uses = o.maxUses;
    expect(restock(d, 2)).toBe(true);
    expect(o.uses).toBe(0);
    expect(o.demand).toBe(1);
    expect(restock(d, 2)).toBe(false); // once per half day
  });

  it('gives the Wandering Merchant six random offers and no levels', () => {
    const m = newVillager('merchant', 11);
    expect(m.offers.length).toBe(6);
    expect(recordTrade(m, m.offers[0]!)).toBe(false);
  });
});
