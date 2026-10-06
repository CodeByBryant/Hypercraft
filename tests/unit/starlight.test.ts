import { describe, expect, it } from 'vitest';
import { IREG } from '../../src/content/itemRegistry';
import { RECIPES } from '../../src/content/recipes';
import { LOOT } from '../../src/content/lootRegistry';
import { TIERS } from '../../src/content/tiers';
import { ARMOR_MATERIALS } from '../../src/content/armor';
import { Rng } from '../../src/math/rng';

describe('Starlight tier and the Phase Wings kit (Phase 8.5)', () => {
  it('adds a Starlight tool tier above Hyperite, with a full set of tools made from ingots', () => {
    const t = TIERS.find((x) => x.name === 'starlight')!;
    expect(t.material).toBe('starlight_ingot');
    expect(t.speed).toBeGreaterThan(TIERS.find((x) => x.name === 'hyperite')!.speed);
    expect(t.durability).toBeGreaterThan(TIERS.find((x) => x.name === 'hyperite')!.durability);
    for (const k of ['pickaxe', 'axe', 'shovel', 'hoe', 'sword']) {
      expect(IREG.has(`starlight_${k}`), k).toBe(true);
      expect(RECIPES.some((r) => r.result === `starlight_${k}`), k).toBe(true);
    }
  });

  it('has a Starlight armour set whose pieces carry the set bonus, smelts shards into ingots, and builds rockets', () => {
    const m = ARMOR_MATERIALS.find((x) => x.name === 'starlight')!;
    expect(m.set).toBe('starlight');
    expect(m.craftable).toBe(true);
    for (const piece of ['helmet', 'chestplate', 'leggings', 'boots']) {
      const id = IREG.id(`starlight_${piece}`);
      expect(IREG.armor[id]?.set).toBe('starlight');
    }
    const smelt = RECIPES.find((r) => r.type === 'smelting' && r.result === 'starlight_ingot');
    expect(smelt && smelt.type === 'smelting' && smelt.input).toBe('starlight_shard');
    const rocket = RECIPES.find((r) => r.result === 'starlight_rocket')!;
    expect(rocket.type).toBe('shapeless');
    expect(rocket.count).toBe(2);
    expect(IREG.def(IREG.id('starlight_rocket')).use).toBe('starlight_rocket');
  });

  it('makes the Phase Wings a chest-slot item with 432 wear, found only in Sky Vaults', () => {
    const id = IREG.id('phase_wings');
    expect(IREG.armor[id]?.slot).toBe('chest');
    expect(IREG.armor[id]?.points).toBe(0);
    expect(IREG.durability[id]).toBe(432);
    expect(IREG.tags[id]!.has('wings')).toBe(true);
    expect(RECIPES.some((r) => r.result === 'phase_wings')).toBe(false);
    // Every Sky Vault holds a pair, a little used.
    const rng = new Rng(42);
    for (let n = 0; n < 60; n++) {
      const wings = LOOT.roll('sky_vault', () => rng.next()).filter((s) => s && s[0] === 'phase_wings');
      expect(wings.length, `vault ${n}`).toBe(1);
      const dmg = wings[0]![2] ?? 0;
      expect(dmg).toBeGreaterThanOrEqual(Math.floor(432 * 0.05));
      expect(dmg).toBeLessThanOrEqual(Math.ceil(432 * 0.4));
    }
    for (const t of ['void_city', 'starlight_garden', 'stronghold']) expect(LOOT.roll(t, Math.random).some((s) => s && s[0] === 'phase_wings')).toBe(false);
  });
});
