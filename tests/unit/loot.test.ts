import { describe, expect, it } from 'vitest';
import { IREG } from '../../src/content/itemRegistry';
import { LOOT } from '../../src/content/lootRegistry';
import { Rng } from '../../src/math/rng';

describe('loot tables', () => {
  it('roll only known items, within stack sizes and durability, into 27 slots', () => {
    expect(LOOT.names.length).toBeGreaterThanOrEqual(25);
    for (const name of LOOT.names) {
      const rng = new Rng(1234);
      for (let i = 0; i < 40; i++) {
        const slots = LOOT.roll(name, () => rng.next());
        expect(slots.length).toBe(27);
        const filled = slots.filter((s) => s !== null);
        expect(filled.length).toBeGreaterThan(0);
        for (const s of filled) {
          const id = IREG.id(s![0]);
          expect(s![1]).toBeGreaterThan(0);
          expect(s![1]).toBeLessThanOrEqual(IREG.maxStack[id]!);
          if (s![2] !== undefined) expect(s![2]).toBeLessThan(IREG.durability[id]!);
        }
      }
    }
  });

  it('is deterministic for a given random source', () => {
    const a = new Rng(99), b = new Rng(99);
    expect(LOOT.roll('dungeon', () => a.next())).toEqual(LOOT.roll('dungeon', () => b.next()));
  });

  it('scatters results over random slots instead of packing them at the front', () => {
    const rng = new Rng(7);
    let late = 0;
    for (let i = 0; i < 30; i++) {
      const slots = LOOT.roll('village_house', () => rng.next());
      if (slots.slice(9).some((s) => s !== null)) late++;
    }
    expect(late).toBeGreaterThan(20);
  });
});
