// Wood families: every tree's log makes its own planks, and the planks make slabs, stairs,
// fences and doors; an axe strips a log (use it on one). All generated from one table, so a
// new tree is one line here. Colours come from the log's own rings unless given.
//
// Doors are two blocks (a lower half, the item, and an upper half) with the `door` shape: a
// thin panel on the near side of the cell, swung onto a side when open (meta 6..11).

import type { BlockDef, Hex, IconDef, MiningDef, RecipeDef, TextureDef, TexturePattern } from './types';
import { BLOCKS } from './blocks';
import { TEXTURES } from './textures';
import { TERRAIN_BLOCKS, TERRAIN_TEXTURES } from './terrain';
import { FUNCTIONAL_BLOCKS, FUNCTIONAL_TEXTURES } from './functional';
import { EMBER_BLOCKS, EMBER_TEXTURES } from './ember';
import { WILDS_BLOCKS, WILDS_TEXTURES } from './wilds';
import { CAVE_BLOCKS, CAVE_TEXTURES } from './caves';

export interface WoodDef {
  /** Key used in block names: `${name}_planks`, `${name}_door`, `stripped_${name}_log`. */
  name: string;
  /** Display prefix ("Dark Oak"). */
  display: string;
  /** Logs that saw into these planks; the axe strips each of them into the stripped log. */
  logs: string[];
  /** Existing planks / fence blocks (the original five woods). */
  planks?: string;
  fence?: string;
  /** Planks colours (light, dark, seams); default from the first log's rings. */
  colors?: Hex[];
  /** Stems (fungi): "Stripped Crimson Stem". */
  stem?: boolean;
  /** No stripped variant (bamboo, mushroom stems). */
  noStrip?: boolean;
  /** Ember Depths wood: does not burn. */
  ember?: boolean;
}

export const WOODS: WoodDef[] = [
  { name: 'oak', display: 'Tesseract', logs: ['log', 'dead_log'], planks: 'planks', fence: 'oak_fence' },
  { name: 'birch', display: 'Birch', logs: ['birch_log'], planks: 'birch_planks' },
  { name: 'spruce', display: 'Spruce', logs: ['spruce_log'], planks: 'spruce_planks' },
  { name: 'acacia', display: 'Acacia', logs: ['acacia_log'], planks: 'acacia_planks' },
  { name: 'cherry', display: 'Cherry', logs: ['cherry_log'], planks: 'cherry_planks' },
  { name: 'dark_oak', display: 'Dark Oak', logs: ['dark_oak_log'] },
  { name: 'jungle', display: 'Jungle', logs: ['jungle_log'] },
  { name: 'maple', display: 'Maple', logs: ['maple_log'] },
  { name: 'juniper', display: 'Juniper', logs: ['juniper_log'] },
  { name: 'redwood', display: 'Redwood', logs: ['redwood_log'] },
  { name: 'mangrove', display: 'Mangrove', logs: ['mangrove_log'], colors: ['#8a4a3a', '#743c2e', '#562a20'] },
  { name: 'baobab', display: 'Baobab', logs: ['baobab_log'] },
  { name: 'ghost_gum', display: 'Ghost Gum', logs: ['ghost_gum_log'], colors: ['#e8dcc8', '#d6c8b0', '#b0a088'] },
  { name: 'aspen', display: 'Aspen', logs: ['aspen_log'], colors: ['#e8e0b8', '#d8cea0', '#b0a678'] },
  { name: 'kapok', display: 'Kapok', logs: ['kapok_log'] },
  { name: 'cloud_oak', display: 'Cloud Oak', logs: ['mossy_bark_log'], colors: ['#8a7a5a', '#766848', '#5a4e34'] },
  { name: 'cliff_pine', display: 'Cliff Pine', logs: ['cliff_pine_log'] },
  { name: 'pitch_pine', display: 'Pitch Pine', logs: ['pitch_pine_log'] },
  { name: 'wisteria', display: 'Wisteria', logs: ['wisteria_log'], colors: ['#a88a98', '#947684', '#6a5260'] },
  { name: 'black_spruce', display: 'Black Spruce', logs: ['black_spruce_log'] },
  { name: 'chroma', display: 'Chroma', logs: ['chroma_log'] },
  { name: 'olive', display: 'Olive', logs: ['olive_log'] },
  { name: 'palm', display: 'Palm', logs: ['palm_log'] },
  { name: 'bamboo', display: 'Bamboo', logs: ['bamboo_block'], colors: ['#d8c060', '#c8ac4a', '#a08a38'], noStrip: true },
  { name: 'mushroom', display: 'Mushroom', logs: ['mushroom_stem', 'cave_shroom_stem'], colors: ['#d8c8b0', '#c8b498', '#a08c70'], noStrip: true },
  { name: 'glowshroom', display: 'Glowshroom', logs: ['glowshroom_stem'], colors: ['#c8d4e8', '#b4c0d8', '#7a8ab0'], stem: true },
  // The Ember Depths (fireproof, like the Nether's stems).
  { name: 'emberwood', display: 'Emberwood', logs: ['emberwood_log'], ember: true },
  { name: 'charred', display: 'Charred', logs: ['charred_log', 'scorched_log'], colors: ['#4a3a34', '#3a2c28', '#1e1614'], ember: true },
  { name: 'sulfur', display: 'Sulfur', logs: ['sulfur_stem'], stem: true, ember: true },
  { name: 'crimson', display: 'Crimson', logs: ['crimson_stem'], stem: true, ember: true },
  { name: 'warped', display: 'Warped', logs: ['warped_stem'], stem: true, ember: true },
  { name: 'ashwood', display: 'Ashwood', logs: ['ashwood_log'], ember: true },
  { name: 'blazewood', display: 'Blazewood', logs: ['blazewood_log'], ember: true },
];

/** Generated per wood (names), for code that needs them. */
export interface WoodBlocks {
  planks: string;
  stripped: string | null;
  slab: string;
  stairs: string;
  fence: string;
  door: string;
  doorTop: string;
}

export const WOOD_TEXTURES: TextureDef[] = [];
export const WOOD_BLOCKS: BlockDef[] = [];
export const WOOD_RECIPES: RecipeDef[] = [];
export const WOOD_MINING: Record<string, MiningDef> = {};
/** Block item extras (icons, fuel) for generated blocks. */
export const WOOD_ITEM_EXTRAS: Record<string, { icon?: IconDef; fuel?: number }> = {};
/** Log -> stripped log (what an axe does). */
export const STRIP: Record<string, string> = {};
/** Door upper halves (no item of their own). */
export const DOOR_TOPS: string[] = [];
export const WOOD_SETS = new Map<string, WoodBlocks>();

const ALL_SRC_BLOCKS = [...BLOCKS, ...TERRAIN_BLOCKS, ...FUNCTIONAL_BLOCKS, ...EMBER_BLOCKS, ...WILDS_BLOCKS, ...CAVE_BLOCKS];
const ALL_SRC_TEXTURES = [...TEXTURES, ...TERRAIN_TEXTURES, ...FUNCTIONAL_TEXTURES, ...EMBER_TEXTURES, ...WILDS_TEXTURES, ...CAVE_TEXTURES];
const blockDef = (n: string): BlockDef => {
  const b = ALL_SRC_BLOCKS.find((d) => d.name === n);
  if (!b) throw new Error(`woods: unknown block "${n}"`);
  return b;
};
const texDef = (n: string): TextureDef | undefined => ALL_SRC_TEXTURES.find((t) => t.name === n);

function shade(hex: Hex, k: number): Hex {
  const n = parseInt(hex.slice(1), 16);
  const c = (s: number) => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) * k)));
  return `#${((c(16) << 16) | (c(8) << 8) | c(0)).toString(16).padStart(6, '0')}` as Hex;
}

/** The inner-wood colours of a log: its top texture's rings (or its only texture). */
function rings(log: BlockDef): Hex[] {
  const t = texDef(log.textures.top ?? log.textures.all ?? log.textures.side!);
  return t?.colors ?? ['#a8864f', '#947445'];
}

const tex = (name: string, pattern: TexturePattern, colors: Hex[], amount?: number): string => {
  const t: TextureDef = { name, pattern, colors };
  if (amount !== undefined) t.amount = amount;
  WOOD_TEXTURES.push(t);
  return name;
};

for (const w of WOODS) {
  const log0 = blockDef(w.logs[0]!);
  const r = rings(log0);
  const colors = w.colors ?? [r[0]!, r[1] ?? r[0]!, shade(r[1] ?? r[0]!, 0.75)];
  const tags = (...t: string[]) => (w.ember ? [...t, 'ember_wood', 'fireproof'] : t);
  const D = w.display;

  // Planks.
  const planks = w.planks ?? `${w.name}_planks`;
  if (!w.planks) {
    tex(planks, 'planks', colors, 0.06);
    WOOD_BLOCKS.push({ name: planks, displayName: `${D} Planks`, render: 'opaque', solid: true, textures: { all: planks }, hardness: 2, tags: tags('planks') });
  }
  const ptex = w.planks ? blockDef(w.planks).textures.all! : planks;

  // Stripped log: the log's own top (rings), clean grain on the sides.
  let stripped: string | null = null;
  if (!w.noStrip) {
    stripped = `stripped_${w.name}_${w.stem ? 'stem' : 'log'}`;
    const side = tex(`${stripped}_side`, 'stripped', [shade(colors[0]!, 1.04), colors[1]!]);
    const top = log0.textures.top ?? log0.textures.all!;
    WOOD_BLOCKS.push({ name: stripped, displayName: `Stripped ${D} ${w.stem ? 'Stem' : 'Log'}`, render: 'opaque', solid: true, textures: { top, bottom: top, side }, hardness: 2, ...(log0.emission ? { emission: log0.emission } : {}), tags: tags('log', 'stripped') });
    for (const l of w.logs) STRIP[l] = stripped;
  }

  // Slab, stairs, fence (a post), door (lower + upper half).
  const slab = `${w.name}_slab`, stairs = `${w.name}_stairs`, fence = w.fence ?? `${w.name}_fence`, door = `${w.name}_door`, doorTop = `${w.name}_door_top`;
  WOOD_BLOCKS.push({ name: slab, displayName: `${D} Slab`, render: 'opaque', solid: true, shape: 'slab', opaque: false, textures: { all: ptex }, hardness: 2, tags: tags('wooden', 'wooden_slab') });
  WOOD_BLOCKS.push({ name: stairs, displayName: `${D} Stairs`, render: 'opaque', solid: true, shape: 'stairs', opaque: false, textures: { all: ptex }, hardness: 2, tags: tags('wooden', 'wooden_stairs') });
  if (!w.fence) WOOD_BLOCKS.push({ name: fence, displayName: `${D} Fence`, render: 'opaque', solid: true, shape: 'post', opaque: false, textures: { all: ptex }, hardness: 2, tags: tags('wooden', 'fence') });
  const dtex = tex(`${w.name}_door`, 'door', [colors[0]!, shade(colors[1]!, 0.85), '#3a3a40'], 0.05);
  WOOD_BLOCKS.push({ name: door, displayName: `${D} Door`, render: 'opaque', solid: true, shape: 'door', opaque: false, textures: { all: dtex }, hardness: 3, tags: tags('wooden', 'door') });
  WOOD_BLOCKS.push({ name: doorTop, displayName: `${D} Door`, render: 'opaque', solid: true, shape: 'door', opaque: false, textures: { all: dtex }, hardness: 3, tags: tags('wooden', 'door', 'door_top') });
  DOOR_TOPS.push(doorTop);
  WOOD_SETS.set(w.name, { planks, stripped, slab, stairs, fence, door, doorTop });

  // Recipes: a log (or its stripped log) saws into 4 planks; the rest as in Minecraft.
  for (const l of [...w.logs, ...(stripped ? [stripped] : [])]) WOOD_RECIPES.push({ type: 'shapeless', ingredients: [l], result: planks, count: l === 'bamboo_block' ? 2 : 4 });
  WOOD_RECIPES.push(
    { type: 'shaped', pattern: ['ppp'], key: { p: planks }, result: slab, count: 6 },
    { type: 'shaped', pattern: ['p  ', 'pp ', 'ppp'], key: { p: planks }, result: stairs, count: 4 },
    { type: 'shaped', pattern: ['psp', 'psp'], key: { p: planks, s: 'stick' }, result: fence, count: 3 },
    { type: 'shaped', pattern: ['pp', 'pp', 'pp'], key: { p: planks }, result: door, count: 3 },
  );

  // Mining: wood is for axes; either door half drops the door.
  for (const n of [planks, slab, stairs, fence, door, ...(stripped ? [stripped] : []), ...w.logs]) WOOD_MINING[n] = { tool: 'axe' };
  WOOD_MINING[doorTop] = { tool: 'axe', drops: [{ item: door }] };

  WOOD_ITEM_EXTRAS[door] = { icon: { shape: 'door', colors: [colors[0]!, shade(colors[1]!, 0.8), '#3a3a40'] }, fuel: 10 };
  WOOD_ITEM_EXTRAS[stairs] = { icon: { shape: 'stairs', colors: [colors[0]!, shade(colors[1]!, 0.8)] }, fuel: 15 };
  if (!w.fence) WOOD_ITEM_EXTRAS[fence] = { icon: { shape: 'fence', colors: [shade(colors[0]!, 1.05), shade(colors[1]!, 0.85)] }, fuel: 15 };
  WOOD_ITEM_EXTRAS[slab] = { fuel: 7.5 };
}
