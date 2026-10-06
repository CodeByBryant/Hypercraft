import { describe, expect, it } from 'vitest';
import { IREG } from '../../src/content/itemRegistry';
import { REG } from '../../src/content/registry';
import { MAX_GRAVES, STARTER_KIT } from '../../src/content/survival';
import { CRAFTING } from '../../src/game/items/Crafting';
import { stackOf, type ItemStack } from '../../src/game/items/ItemStack';
import { DAY_FRACTION, Environment, TICKS_PER_DAY, sunAngle } from '../../src/env/Environment';

const made = (cells: (string | null)[]) => {
  const m = CRAFTING.match(cells.map((c) => (c ? stackOf(c) : null)) as (ItemStack | null)[], 3);
  return m ? IREG.name(m.result) : null;
};

describe('survival QOL (0.7.1)', () => {
  it('the day is Minecraft-shaped: about ten minutes of full light, a short dusk, a long night', () => {
    expect(sunAngle(0)).toBe(0);
    expect(sunAngle(DAY_FRACTION)).toBeCloseTo(Math.PI);
    expect(sunAngle(1)).toBeCloseTo(2 * Math.PI);
    const env = new Environment(REG.realm('surface'), 1);
    let bright = 0, dark = 0, n = 0;
    for (let t = 0; t < TICKS_PER_DAY; t += 20) {
      env.setTime(t);
      env.update(0.05, null, 0);
      n++;
      if (env.sky.daylight > 0.95) bright++;
      if (env.sky.daylight < 0.05) dark++;
    }
    const minutes = (k: number) => (k / n) * 20;
    expect(minutes(bright)).toBeGreaterThan(9);
    expect(minutes(bright)).toBeLessThan(11.5);
    expect(minutes(dark)).toBeGreaterThan(6);
    expect(minutes(dark)).toBeLessThan(8.5);
  });

  it('the sleeping bag is craftable from fibre or leather, the starter kit exists, graves are remembered', () => {
    expect(made(['plant_fibre', 'plant_fibre', 'plant_fibre', 'plant_fibre', 'plant_fibre', 'plant_fibre', null, null, null])).toBe('sleeping_bag');
    expect(made(['leather', 'leather', 'leather', 'plant_fibre', 'plant_fibre', 'plant_fibre', null, null, null])).toBe('sleeping_bag');
    for (const [name] of STARTER_KIT) expect(IREG.has(name), name).toBe(true);
    expect(STARTER_KIT.map((k) => k[0])).toContain('sleeping_bag');
    expect(MAX_GRAVES).toBeGreaterThanOrEqual(3);
    expect(REG.blocks[REG.id('grave')]!.tags).toContain('grave');
    expect(IREG.has('grave')).toBe(false); // you cannot craft or place one
  });
});
