// Smithing (Phase 7): the smithing table takes a template, an item and a material.
//
//  * Ancient Slag upgrade: Slag Upgrade template + any hyperite armour or tool + an Ancient
//    Slag ingot -> the Ancient Slag version, keeping its enchantments, name and wear (Minecraft's
//    netherite upgrade). Slag armour is only made this way.
//  * Armour trims: a trim template + any armour piece + a trim material -> the piece wearing
//    that trim pattern in the material's colour (cosmetic; shown on its icon and tooltip).
// Templates are found in structures and copied with seven hyperite and a block of their realm.

import type { Hex, ItemDef, RecipeDef } from './types';
import type { ItemStack } from '../game/items/ItemStack';
import { IREG } from './itemRegistry';

export interface TrimPattern {
  name: string;
  displayName: string;
  /** Block used (with 7 hyperite) to copy the template. */
  copy: string;
}

export const TRIM_PATTERNS: TrimPattern[] = [
  { name: 'kata', displayName: 'Kata', copy: 'cobblestone' },
  { name: 'ana', displayName: 'Ana', copy: 'cobblestone' },
  { name: 'tesseract', displayName: 'Tesseract', copy: 'mossy_cobblestone' },
  { name: 'ember', displayName: 'Ember', copy: 'cinder' },
  { name: 'reef', displayName: 'Reef', copy: 'sand' },
  { name: 'vault', displayName: 'Vault', copy: 'deepstone' },
  { name: 'citadel', displayName: 'Citadel', copy: 'cinder' },
  { name: 'hyperline', displayName: 'Hyperline', copy: 'glass' },
];

/** Trim materials and the colour they paint the trim. */
export const TRIM_MATERIALS: Record<string, Hex> = {
  iron_ingot: '#e8e8e8',
  copper_ingot: '#e08a50',
  gold_ingot: '#f8d848',
  azurite: '#3f6ff0',
  verdant: '#3fe880',
  hyperite: '#6ff8ff',
  amethyst_shard: '#b07ae8',
  ember_quartz: '#f8e8e0',
  ancient_slag_ingot: '#7a4a30',
  fluxite_dust: '#ff3a3a',
};

export const SMITHING_ITEMS: ItemDef[] = [
  { name: 'slag_upgrade_template', displayName: 'Slag Upgrade', icon: { shape: 'template', colors: ['#3a2418', '#5a3a2a', '#c8844a'] }, group: 'materials' },
  ...TRIM_PATTERNS.map((p): ItemDef => ({ name: `${p.name}_armor_trim`, displayName: `${p.displayName} Armour Trim`, icon: { shape: 'template', colors: ['#4a4a5a', '#6a6a7a', '#c8c8e0'] }, group: 'materials' })),
];

export const SMITHING_RECIPES: RecipeDef[] = [
  { type: 'shaped', pattern: ['hth', 'hch', 'hhh'], key: { h: 'hyperite', t: 'slag_upgrade_template', c: 'cinder' }, result: 'slag_upgrade_template', count: 2 },
  ...TRIM_PATTERNS.map((p): RecipeDef => ({ type: 'shaped', pattern: ['hth', 'hch', 'hhh'], key: { h: 'hyperite', t: `${p.name}_armor_trim`, c: p.copy }, result: `${p.name}_armor_trim`, count: 2 })),
  { type: 'shaped', pattern: ['ii', 'pp', 'pp'], key: { i: 'iron_ingot', p: '#planks' }, result: 'smithing_table' },
];

/** What the smithing table makes of template + base + material (null: nothing). */
export function smith(template: ItemStack | null, base: ItemStack | null, material: ItemStack | null): ItemStack | null {
  if (!template || !base || !material || base.count !== 1) return null;
  const t = IREG.name(template.id), b = IREG.name(base.id), m = IREG.name(material.id);
  const tag = base.tag ? JSON.parse(JSON.stringify(base.tag)) : {};
  if (t === 'slag_upgrade_template') {
    if (m !== 'ancient_slag_ingot' || !b.startsWith('hyperite_')) return null;
    const up = b.replace(/^hyperite_/, 'slag_');
    if (!IREG.has(up)) return null;
    const out: ItemStack = { id: IREG.id(up), count: 1, damage: Math.min(base.damage, IREG.durability[IREG.id(up)]! - 1) };
    if (Object.keys(tag).length) out.tag = tag;
    return out;
  }
  const pattern = TRIM_PATTERNS.find((p) => `${p.name}_armor_trim` === t);
  if (!pattern || !IREG.armor[base.id] || IREG.armor[base.id]!.points <= 0 || !TRIM_MATERIALS[m]) return null;
  if (tag.trim && tag.trim[0] === pattern.name && tag.trim[1] === m) return null;
  tag.trim = [pattern.name, m];
  return { id: base.id, count: 1, damage: base.damage, tag };
}
