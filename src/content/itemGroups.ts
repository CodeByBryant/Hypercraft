// Creative tabs and recipe book sections, like Minecraft's creative categories. Items without
// a block carry their own group; block items are sorted by what they are: crafted and
// decorative blocks are Building, terrain, ores, logs, leaves and plants are Natural,
// stations, containers, lights and beds are Functional, markers and fire are Technical.

import type { ItemGroup } from './types';
import { IREG } from './itemRegistry';
import { REG } from './registry';
import { RECIPES } from './recipes';

export interface ItemTab {
  id: string;
  label: string;
  /** Item whose icon marks the tab. */
  icon: string;
  /** Groups shown (null: everything, as sections). */
  groups: ItemGroup[] | null;
}

/** Creative inventory tabs, in display order. */
export const CREATIVE_TABS: ItemTab[] = [
  { id: 'all', label: 'All Items', icon: 'compass', groups: null },
  { id: 'building', label: 'Building Blocks', icon: 'bricks', groups: ['building'] },
  { id: 'natural', label: 'Natural Blocks', icon: 'grass', groups: ['natural'] },
  { id: 'functional', label: 'Functional Blocks', icon: 'crafting_table', groups: ['functional'] },
  { id: 'tools', label: 'Tools & Utilities', icon: 'iron_pickaxe', groups: ['tools'] },
  { id: 'combat', label: 'Combat', icon: 'iron_sword', groups: ['combat'] },
  { id: 'food', label: 'Food & Drinks', icon: 'apple', groups: ['food'] },
  { id: 'materials', label: 'Ingredients', icon: 'iron_ingot', groups: ['materials'] },
  { id: 'misc', label: 'Technical', icon: 'marker_w', groups: ['misc'] },
];

/** Recipe book sections (a few creative groups each). */
export const BOOK_TABS: ItemTab[] = [
  { id: 'all', label: 'All Recipes', icon: 'compass', groups: null },
  { id: 'equipment', label: 'Tools, Weapons & Armour', icon: 'iron_pickaxe', groups: ['tools', 'combat'] },
  { id: 'building', label: 'Building Blocks', icon: 'bricks', groups: ['building', 'natural'] },
  { id: 'functional', label: 'Stations & Lights', icon: 'crafting_table', groups: ['functional'] },
  { id: 'food', label: 'Food & Drinks', icon: 'bread', groups: ['food'] },
  { id: 'materials', label: 'Ingredients & Misc', icon: 'iron_ingot', groups: ['materials', 'misc'] },
];

/** Section order when a tab shows everything. */
export const GROUP_ORDER: ItemGroup[] = ['building', 'natural', 'functional', 'tools', 'combat', 'food', 'materials', 'misc'];
export const GROUP_LABEL: Record<ItemGroup, string> = {
  building: 'Building Blocks',
  natural: 'Natural Blocks',
  functional: 'Functional Blocks',
  tools: 'Tools & Utilities',
  combat: 'Combat',
  food: 'Food & Drinks',
  materials: 'Ingredients',
  misc: 'Technical',
};

const NATURAL_TAGS = new Set(['plant', 'log', 'pillar', 'leaves', 'ore', 'sapling', 'coral', 'crystal', 'crop', 'fruit', 'farmland', 'bush', 'web', 'underwater']);
const DECOR_TAGS = new Set(['planks', 'stone_bricks', 'cinder_bricks', 'wool', 'storage', 'glass']);
const DECOR_NAME = /(^|_)bricks$|_planks$|_slab$|_stairs$|cobble|^chiseled_|^cut_|^smooth_|^polished_|_fence$|^thatch$|^plaster$|^hay_bale$|^glass$/;
const FUNCTIONAL_NAMES = new Set(['torch', 'lantern', 'campfire', 'ladder', 'bookshelf', 'sea_lantern', 'tnt']);

let groups: ItemGroup[] | null = null;
const lists = new Map<ItemGroup, number[]>();

function blockGroup(id: number, crafted: Set<string>): ItemGroup {
  const def = IREG.def(id);
  const bid = REG.id(def.block!);
  const b = REG.blocks[bid]!;
  const n = b.name, t = b.tags ?? [];
  if (n.startsWith('marker_') || t.includes('fire')) return 'misc';
  if (def.group === 'functional' || FUNCTIONAL_NAMES.has(n) || ['station', 'container', 'furnace', 'bed', 'portal_frame'].some((k) => t.includes(k))) return 'functional';
  // Wood sets (stripped logs, slabs, stairs, fences, doors) are building blocks.
  if (t.includes('stripped') || t.includes('wooden')) return 'building';
  if (t.some((k) => NATURAL_TAGS.has(k))) return 'natural';
  if (t.includes('storage')) return 'building';
  if (crafted.has(n) || t.some((k) => DECOR_TAGS.has(k)) || DECOR_NAME.test(n)) return REG.emission[bid]! > 0 ? 'functional' : 'building';
  return 'natural';
}

function build(): ItemGroup[] {
  const crafted = new Set(RECIPES.map((r) => r.result));
  const out: ItemGroup[] = [];
  for (let id = 0; id < IREG.count; id++) {
    const def = IREG.def(id);
    const g = def.block && REG.has(def.block) ? blockGroup(id, crafted) : (def.group ?? 'misc');
    out.push(g);
    let l = lists.get(g);
    if (!l) lists.set(g, (l = []));
    l.push(id);
  }
  return out;
}

/** The creative group of an item. */
export function groupOf(id: number): ItemGroup {
  groups ??= build();
  return groups[id] ?? 'misc';
}

/** Every item in a group, in registry order. */
export function itemsInGroup(g: ItemGroup): readonly number[] {
  groups ??= build();
  return lists.get(g) ?? [];
}
