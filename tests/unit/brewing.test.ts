import { describe, expect, it } from 'vitest';
import { BREWING, BREW_INGREDIENTS, POTION_ITEMS, POTION_TYPES, potionEffect, potionItem } from '../../src/content/potions';
import { IREG } from '../../src/content/itemRegistry';
import { EFFECT_BY_NAME } from '../../src/content/effects';
import { brewable } from '../../src/game/items/BlockEntities';

const brew = (bottle: string, ing: string) => BREWING.get(`${bottle}|${ing}`);

describe('brewing (Phase 7)', () => {
  it('brews Minecraft’s chain: water -> awkward -> effect -> longer / stronger / splash', () => {
    expect(brew('potion_water', 'ember_wart')).toBe('potion_awkward');
    expect(brew('potion_awkward', 'sugar')).toBe('potion_swiftness');
    expect(brew('potion_swiftness', 'fluxite_dust')).toBe('potion_swiftness_long');
    expect(brew('potion_swiftness', 'emberglass_dust')).toBe('potion_swiftness_strong');
    expect(brew('potion_swiftness_long', 'sulfur')).toBe('splash_potion_swiftness_long');
    expect(brew('potion_swiftness', 'fermented_eye')).toBe('potion_slowness');
    expect(brew('potion_healing_strong', 'fermented_eye')).toBe('potion_harming_strong');
    expect(brew('potion_night_vision_long', 'fermented_eye')).toBe('potion_invisibility_long');
    expect(brew('potion_water', 'fermented_eye')).toBe('potion_weakness');
    expect(brew('potion_awkward', 'phase_dust')).toBe('potion_phase_sight');
    expect(brew('potion_awkward', 'echo_shard')).toBe('potion_anchor');
    expect(brew('potion_water', 'sugar')).toBe('potion_mundane');
    expect(brew('potion_fire_resistance', 'emberglass_dust')).toBeUndefined(); // no stronger version
  });

  it('gives every potion item a valid effect, drinkable or thrown', () => {
    for (const it of POTION_ITEMS) {
      expect(IREG.has(it.name)).toBe(true);
      const e = potionEffect(it.name);
      if (e) expect(EFFECT_BY_NAME.has(e[0])).toBe(true);
      if (it.name.startsWith('splash_')) expect(it.use).toBe('splash_potion');
      else expect(IREG.food[IREG.id(it.name)]!.remainder).toBe('glass_bottle');
    }
    expect(potionEffect('potion_swiftness_strong')).toEqual(['speed', 90, 1]);
    expect(potionEffect('splash_potion_poison_long')).toEqual(['poison', 90, 0]);
    expect(potionEffect('potion_awkward')).toBeNull();
    for (const t of POTION_TYPES) expect(IREG.has(potionItem(t.name))).toBe(true);
    for (const ing of BREW_INGREDIENTS) expect(IREG.has(ing), ing).toBe(true);
  });

  it('knows when a stand can brew', () => {
    expect(brewable([['potion_water', 1], null, null, ['ember_wart', 1], null])).toBe(true);
    expect(brewable([['potion_water', 1], null, null, ['sugar', 1], null])).toBe(true); // mundane
    expect(brewable([['potion_awkward', 1], null, null, ['stone', 1], null])).toBe(false);
    expect(brewable([null, null, null, ['ember_wart', 1], null])).toBe(false);
  });
});
