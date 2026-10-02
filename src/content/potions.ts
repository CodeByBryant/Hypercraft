// Potions and brewing (Phase 7), Minecraft's system with this world's ingredients:
//
//   water bottle + Ember Wart          -> Awkward Potion (the base of everything)
//   Awkward + ingredient               -> effect potion
//   effect + Fluxite Dust              -> longer (+)          (Minecraft's redstone)
//   effect + Emberglass Dust           -> stronger (II)       (glowstone)
//   effect + Fermented Weaver Eye      -> corrupted           (swiftness -> slowness...)
//   any potion + Sulfur                -> splash potion       (gunpowder)
//
// Brewing stands burn Cinder Powder (blaze powder: 20 brews each). Every potion is its own
// item (potion_<name>[_long|_strong], splash_potion_...), so recipes, loot and trades name them.

import type { Hex, ItemDef, RecipeDef } from './types';

export interface PotionType {
  name: string;
  displayName: string;
  color: Hex;
  /** Effect, seconds and amplifier of the plain potion (none: water, awkward...). */
  effect?: [string, number, number];
  /** Extended version (Fluxite Dust): seconds. */
  long?: number;
  /** Enhanced version (Emberglass Dust): [amplifier, seconds]. */
  strong?: [number, number];
  /** Brewed from an Awkward Potion with this ingredient. */
  ingredient?: string;
}

export const POTION_TYPES: PotionType[] = [
  { name: 'water', displayName: 'Water Bottle', color: '#3f76e4' },
  { name: 'awkward', displayName: 'Awkward Potion', color: '#385dc6' },
  { name: 'mundane', displayName: 'Mundane Potion', color: '#385dc6' },
  { name: 'thick', displayName: 'Thick Potion', color: '#385dc6' },
  { name: 'swiftness', displayName: 'Swiftness', color: '#7cafc6', effect: ['speed', 180, 0], long: 480, strong: [1, 90], ingredient: 'sugar' },
  { name: 'slowness', displayName: 'Slowness', color: '#5a6c81', effect: ['slowness', 90, 0], long: 240, strong: [3, 20] },
  { name: 'leaping', displayName: 'Leaping', color: '#22ff4c', effect: ['jump_boost', 180, 0], long: 480, strong: [1, 90], ingredient: 'raw_rabbit' },
  { name: 'strength', displayName: 'Strength', color: '#932423', effect: ['strength', 180, 0], long: 480, strong: [1, 90], ingredient: 'cinder_powder' },
  { name: 'healing', displayName: 'Healing', color: '#f82423', effect: ['instant_health', 0, 0], strong: [1, 0], ingredient: 'glistering_melon' },
  { name: 'harming', displayName: 'Harming', color: '#430a09', effect: ['instant_damage', 0, 0], strong: [1, 0] },
  { name: 'poison', displayName: 'Poison', color: '#4e9331', effect: ['poison', 45, 0], long: 90, strong: [1, 21], ingredient: 'weaver_eye' },
  { name: 'regeneration', displayName: 'Regeneration', color: '#cd5cab', effect: ['regeneration', 45, 0], long: 90, strong: [1, 22], ingredient: 'wraith_essence' },
  { name: 'fire_resistance', displayName: 'Fire Resistance', color: '#e49a3a', effect: ['fire_resistance', 180, 0], long: 480, ingredient: 'magma_cream' },
  { name: 'night_vision', displayName: 'Night Vision', color: '#1f1fa1', effect: ['night_vision', 180, 0], long: 480, ingredient: 'golden_carrot' },
  { name: 'invisibility', displayName: 'Invisibility', color: '#7f8392', effect: ['invisibility', 180, 0], long: 480 },
  { name: 'water_breathing', displayName: 'Water Breathing', color: '#2e5299', effect: ['water_breathing', 180, 0], long: 480, ingredient: 'glow_scale' },
  { name: 'slow_falling', displayName: 'Slow Falling', color: '#f3cfb9', effect: ['slow_falling', 90, 0], long: 240, ingredient: 'wisp_essence' },
  { name: 'weakness', displayName: 'Weakness', color: '#484d48', effect: ['weakness', 90, 0], long: 240 },
  // 4D potions.
  { name: 'phase_sight', displayName: 'Phase Sight', color: '#c86aff', effect: ['phase_sight', 60, 0], long: 180, ingredient: 'phase_dust' },
  { name: 'anchor', displayName: 'the Anchor', color: '#6a8aa8', effect: ['anchor', 120, 0], long: 300, ingredient: 'echo_shard' },
];

const BASES = new Set(['water', 'awkward', 'mundane', 'thick']);

/** Fermented Weaver Eye corruptions (Minecraft's fermented spider eye). */
const CORRUPT: Record<string, string> = { swiftness: 'slowness', leaping: 'slowness', healing: 'harming', poison: 'harming', night_vision: 'invisibility', water: 'weakness' };

export type PotionVariant = '' | '_long' | '_strong';

export function potionItem(type: string, variant: PotionVariant = '', splash = false): string {
  return `${splash ? 'splash_' : ''}potion_${type}${variant}`;
}

/** [effect, seconds, amp] of a potion item name, or null (base potions, unknown names). */
export function potionEffect(item: string): [string, number, number] | null {
  const m = /^(?:splash_)?potion_(.+?)(_long|_strong)?$/.exec(item);
  if (!m) return null;
  const t = POTION_TYPES.find((p) => p.name === m[1]);
  if (!t?.effect) return null;
  if (m[2] === '_long' && t.long) return [t.effect[0], t.long, t.effect[2]];
  if (m[2] === '_strong' && t.strong) return [t.effect[0], t.strong[1], t.strong[0]];
  return t.effect;
}

export const POTION_ITEMS: ItemDef[] = [];
/** Brewing: "<input potion item>|<ingredient>" -> output potion item. */
export const BREWING = new Map<string, string>();

const roman = ['', 'I', 'II', 'III', 'IV'];
for (const t of POTION_TYPES) {
  const variants: PotionVariant[] = [''];
  if (t.long) variants.push('_long');
  if (t.strong) variants.push('_strong');
  for (const v of variants)
    for (const splash of [false, true]) {
      const name = potionItem(t.name, v, splash);
      let display = BASES.has(t.name) ? t.displayName : `Potion of ${t.displayName}`;
      if (splash) display = t.name === 'water' ? 'Splash Water Bottle' : `Splash ${display}`;
      if (v === '_long') display += ' +';
      if (v === '_strong') display += ` ${roman[(t.strong?.[0] ?? 0) + 1]}`;
      const eff = potionEffect(name);
      POTION_ITEMS.push({
        name,
        displayName: display,
        maxStack: 1,
        icon: { shape: splash ? 'splash' : 'potion', colors: [t.color, t.color, '#ffffff'] },
        use: splash ? 'splash_potion' : undefined,
        // Drinking reuses the food pipeline: no hunger, effects certain, the bottle stays.
        food: splash ? undefined : { nutrition: 0, saturation: 0, always: true, effects: eff ? [[eff[0], eff[1], eff[2], 1]] : [], remainder: 'glass_bottle' },
        group: 'food',
        tags: ['potion', ...(splash ? ['splash'] : [])],
      });
      // Gunpowder -> splash.
      if (!splash) BREWING.set(`${name}|sulfur`, potionItem(t.name, v, true));
    }
  if (t.ingredient) BREWING.set(`${potionItem('awkward')}|${t.ingredient}`, potionItem(t.name));
  if (t.long) BREWING.set(`${potionItem(t.name)}|fluxite_dust`, potionItem(t.name, '_long'));
  if (t.strong) BREWING.set(`${potionItem(t.name)}|emberglass_dust`, potionItem(t.name, '_strong'));
}
// Bases.
BREWING.set(`${potionItem('water')}|ember_wart`, potionItem('awkward'));
BREWING.set(`${potionItem('water')}|fluxite_dust`, potionItem('mundane'));
BREWING.set(`${potionItem('water')}|emberglass_dust`, potionItem('thick'));
for (const ing of ['sugar', 'glistering_melon', 'weaver_eye', 'wraith_essence', 'magma_cream', 'cinder_powder', 'glow_scale']) BREWING.set(`${potionItem('water')}|${ing}`, potionItem('mundane'));
// Corruptions keep the variant (and splash-ness) where the target has it.
for (const [from, to] of Object.entries(CORRUPT)) {
  const tf = POTION_TYPES.find((p) => p.name === from)!, tt = POTION_TYPES.find((p) => p.name === to)!;
  for (const splash of [false, true]) {
    BREWING.set(`${potionItem(from, '', splash)}|fermented_eye`, potionItem(to, '', splash));
    if (tf.long && tt.long) BREWING.set(`${potionItem(from, '_long', splash)}|fermented_eye`, potionItem(to, '_long', splash));
    if (tf.strong && tt.strong) BREWING.set(`${potionItem(from, '_strong', splash)}|fermented_eye`, potionItem(to, '_strong', splash));
  }
}

// Lumen dust (Lumenite) enhances potions like emberglass dust (Minecraft's glowstone).
for (const [k, v] of [...BREWING]) if (k.endsWith('|emberglass_dust')) BREWING.set(k.replace('|emberglass_dust', '|lumen_dust'), v);

/** Every item that can go in a brewing stand's ingredient slot. */
export const BREW_INGREDIENTS = new Set([...BREWING.keys()].map((k) => k.split('|')[1]!));

/** Brewing stand fuel: brews per item. */
export const BREW_FUEL: Record<string, number> = { cinder_powder: 20 };

/** Seconds per brew. */
export const BREW_TIME = 20;

const mat = (name: string, displayName: string, shape: NonNullable<ItemDef['icon']>['shape'], colors: Hex[], extra: Partial<ItemDef> = {}): ItemDef => ({ name, displayName, icon: { shape, colors }, group: 'materials', ...extra });

export const BREWING_ITEMS: ItemDef[] = [
  mat('glass_bottle', 'Glass Bottle', 'bottle', ['#d8e8f4', '#a8c0d8', '#ffffff'], { use: 'glass_bottle', maxStack: 64 }),
  mat('ember_wart', 'Ember Wart', 'berries', ['#c8302a', '#7a1414', '#4a1a14']),
  mat('cinder_powder', 'Cinder Powder', 'dust', ['#ffb030', '#d86a10', '#fff0a0']),
  mat('sugar', 'Sugar', 'dust', ['#f8f8f8', '#d8d8d8', '#ffffff']),
  mat('glistering_melon', 'Glistering Melon Slice', 'slice', ['#f0c040', '#3a8a2a', '#fff6b0']),
  mat('weaver_eye', 'Weaver Eye', 'ball', ['#a8203a', '#5a0a1a', '#ff8a8a']),
  mat('fermented_eye', 'Fermented Weaver Eye', 'ball', ['#7a3a5a', '#4a1a3a', '#c86a9a']),
  mat('emberglass_dust', 'Emberglass Dust', 'dust', ['#ffc860', '#d88a20', '#fff4c0']),
  { name: 'xp_bottle', displayName: "Bottle o' Enchanting", icon: { shape: 'xp_bottle', colors: ['#8aff3a', '#3a9a1a', '#fff880'] }, use: 'xp_bottle', group: 'tools', tags: ['glint'] },
];

export const BREWING_RECIPES: RecipeDef[] = [
  { type: 'shaped', pattern: ['g g', ' g '], key: { g: 'glass' }, result: 'glass_bottle', count: 3 },
  { type: 'shaped', pattern: [' c ', 'sss'], key: { c: 'cinder_powder', s: 'cobblestone' }, result: 'brewing_stand' },
  { type: 'shapeless', ingredients: ['drake_scale'], result: 'cinder_powder', count: 2 },
  { type: 'shapeless', ingredients: ['hound_fang', 'hound_fang', 'cinder'], result: 'cinder_powder', count: 1 },
  { type: 'shapeless', ingredients: ['reeds'], result: 'sugar' },
  { type: 'shaped', pattern: ['nnn', 'nmn', 'nnn'], key: { n: 'gold_nugget', m: 'melon_slice' }, result: 'glistering_melon' },
  { type: 'shapeless', ingredients: ['weaver_eye', 'brown_mushroom', 'sugar'], result: 'fermented_eye' },
  { type: 'shaped', pattern: ['dd', 'dd'], key: { d: 'emberglass_dust' }, result: 'emberglass' },
];
