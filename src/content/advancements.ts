// Advancements v1 (Phase 8): goals to chase, in eight categories. Each has a parent (a tree you
// can read at a glance), an icon, a title, a description and ONE criterion; completing it shows
// a toast and pays a little experience. Data only: the tracker is src/game/Advancements.ts, the
// screen (key L) is src/ui/AdvancementsScreen.ts, and docs/how-to/add-an-advancement.md is the
// recipe for adding one.
//
// Criteria:
//   start   the world was entered (the first root)
//   have    any of these items is in your inventory or worn (#tag: any item with that tag)
//   mine    you broke any of these blocks
//   kill    you killed any of these mobs ('*hostile': any hostile mob)
//   eat     you ate any of these
//   realm   you entered this realm
//   biome   you have been in `count` different biomes
//   event   something happened (see EVENTS: the game calls them out)
//   stat    a counter reached a value (see STATS)

export type AdvCategory = 'surface' | 'mining' | 'husbandry' | 'combat' | 'magic' | 'fourd' | 'ember' | 'void';

export interface AdvCategoryDef {
  id: AdvCategory;
  name: string;
  /** Icon (an item name). */
  icon: string;
  blurb: string;
}

export const ADV_CATEGORIES: AdvCategoryDef[] = [
  { id: 'surface', name: 'Surface', icon: 'crafting_table', blurb: 'The first days' },
  { id: 'mining', name: 'Mining', icon: 'iron_pickaxe', blurb: 'What lies below' },
  { id: 'husbandry', name: 'Husbandry', icon: 'bread', blurb: 'Fields, fish and friends' },
  { id: 'combat', name: 'Combat', icon: 'iron_sword', blurb: 'Things that bite back' },
  { id: 'magic', name: 'Magic', icon: 'enchanting_table', blurb: 'Books, brews and anvils' },
  { id: 'fourd', name: 'The Fourth Dimension', icon: 'slicer_compass', blurb: 'Slices, kata and ana' },
  { id: 'ember', name: 'Ember Depths', icon: 'hypercinder', blurb: 'The burning realm' },
  { id: 'void', name: 'Hollow Void', icon: 'void_eye', blurb: 'Islands in the dark' },
];

/** Things the game reports (Game calls Advancements.event with these names). */
export const EVENTS = ['sleep', 'trade', 'plant', 'breed', 'fish', 'block', 'enchant', 'anvil', 'phase_strike', 'void_gate', 'phase_step', 'rocket'] as const;
export type AdvEvent = (typeof EVENTS)[number];

/** Counters the game keeps: the largest slice tilt (degrees), blocks walked along the hidden axis, blocks glided. */
export const STATS = ['slice_tilt', 'w_walk', 'glide'] as const;
export type AdvStat = (typeof STATS)[number];

export type Criterion =
  | { type: 'start' }
  | { type: 'have'; items: string[]; count?: number }
  | { type: 'mine'; blocks: string[] }
  | { type: 'kill'; mobs: string[] }
  | { type: 'eat'; items: string[] }
  | { type: 'realm'; realm: string }
  | { type: 'biome'; count: number }
  | { type: 'event'; name: AdvEvent }
  | { type: 'stat'; stat: AdvStat; value: number };

export interface AdvancementDef {
  id: string;
  category: AdvCategory;
  title: string;
  description: string;
  /** Icon: an item name. */
  icon: string;
  parent?: string;
  criterion: Criterion;
  /** Experience paid when completed. */
  xp: number;
}

const A = (id: string, category: AdvCategory, title: string, description: string, icon: string, criterion: Criterion, xp: number, parent?: string): AdvancementDef => ({ id, category, title, description, icon, criterion, xp, ...(parent ? { parent } : {}) });

export const ADVANCEMENTS: AdvancementDef[] = [
  // ---------------------------------------------------------------- Surface
  A('surface/root', 'surface', 'Hypercraft', 'Slice into a four-dimensional world', 'crafting_table', { type: 'start' }, 0),
  A('surface/timber', 'surface', 'Getting Wood', 'Chop down a tree', 'log', { type: 'have', items: ['#log'] }, 3, 'surface/root'),
  A('surface/workbench', 'surface', 'Benchmarking', 'Craft a crafting table', 'crafting_table', { type: 'have', items: ['crafting_table'] }, 3, 'surface/timber'),
  A('surface/pickaxe', 'surface', 'Time to Mine', 'Craft a wooden pickaxe', 'wood_pickaxe', { type: 'have', items: ['wood_pickaxe'] }, 3, 'surface/workbench'),
  A('surface/stone_age', 'surface', 'Stone Age', 'Mine stone with your pickaxe', 'cobblestone', { type: 'have', items: ['cobblestone'] }, 5, 'surface/pickaxe'),
  A('surface/furnace', 'surface', 'Hot Topic', 'Build a furnace', 'furnace', { type: 'have', items: ['furnace'] }, 5, 'surface/stone_age'),
  A('surface/iron', 'surface', 'Acquire Hardware', 'Smelt an iron ingot', 'iron_ingot', { type: 'have', items: ['iron_ingot'] }, 8, 'surface/furnace'),
  A('surface/bed', 'surface', 'Sweet Dreams', 'Sleep through a night in a bed', 'red_bed', { type: 'event', name: 'sleep' }, 8, 'surface/workbench'),
  A('surface/trade', 'surface', 'A Fair Price', 'Trade with a villager', 'gold_ingot', { type: 'event', name: 'trade' }, 10, 'surface/root'),
  A('surface/explorer', 'surface', 'Adventuring Time', 'Walk through eight different biomes', 'compass', { type: 'biome', count: 8 }, 25, 'surface/root'),

  // ---------------------------------------------------------------- Mining
  A('mining/root', 'mining', 'Mining', 'Dig into the ground', 'stone_pickaxe', { type: 'mine', blocks: ['stone'] }, 3),
  A('mining/coal', 'mining', 'Black Gold', 'Find coal', 'coal', { type: 'have', items: ['coal'] }, 4, 'mining/root'),
  A('mining/copper', 'mining', 'Copper Age', 'Smelt a copper ingot', 'copper_ingot', { type: 'have', items: ['copper_ingot'] }, 6, 'mining/coal'),
  A('mining/silver', 'mining', 'Silver Lining', 'Smelt a silver ingot', 'silver_ingot', { type: 'have', items: ['silver_ingot'] }, 8, 'mining/copper'),
  A('mining/gold', 'mining', 'Covered in Gold', 'Smelt a gold ingot', 'gold_ingot', { type: 'have', items: ['gold_ingot'] }, 8, 'mining/silver'),
  A('mining/azurite', 'mining', 'Deep Blue', 'Mine azurite', 'azurite', { type: 'have', items: ['azurite'] }, 12, 'mining/gold'),
  A('mining/hyperite', 'mining', 'Hyperite!', 'Mine hyperite with an iron pickaxe', 'hyperite', { type: 'have', items: ['hyperite'] }, 25, 'mining/azurite'),
  A('mining/hyperite_pick', 'mining', 'Serious Dedication', 'Craft a hyperite pickaxe', 'hyperite_pickaxe', { type: 'have', items: ['hyperite_pickaxe'] }, 25, 'mining/hyperite'),

  // ---------------------------------------------------------------- Husbandry
  A('husbandry/root', 'husbandry', 'Husbandry', 'Plant a seed', 'wheat_seeds', { type: 'event', name: 'plant' }, 3),
  A('husbandry/wheat', 'husbandry', 'Farmer', 'Harvest wheat', 'wheat', { type: 'have', items: ['wheat'] }, 5, 'husbandry/root'),
  A('husbandry/bread', 'husbandry', 'Baker', 'Bake bread', 'bread', { type: 'have', items: ['bread'] }, 6, 'husbandry/wheat'),
  A('husbandry/breed', 'husbandry', 'Two by Two', 'Breed two animals', 'wheat', { type: 'event', name: 'breed' }, 12, 'husbandry/root'),
  A('husbandry/fish', 'husbandry', 'Fishy Business', 'Catch something with a fishing rod', 'fishing_rod', { type: 'event', name: 'fish' }, 8, 'husbandry/root'),
  A('husbandry/golden', 'husbandry', 'Gilded Meal', 'Eat a golden apple', 'golden_apple', { type: 'eat', items: ['golden_apple', 'enchanted_golden_apple'] }, 12, 'husbandry/bread'),

  // ---------------------------------------------------------------- Combat
  A('combat/root', 'combat', 'Combat', 'Defeat a hostile mob', 'wood_sword', { type: 'kill', mobs: ['*hostile'] }, 5),
  A('combat/shield', 'combat', 'Not Today, Thank You', 'Block a hit with a shield', 'shield', { type: 'event', name: 'block' }, 8, 'combat/root'),
  A('combat/archer', 'combat', 'Beat the Archer', 'Defeat a bone archer', 'bow', { type: 'kill', mobs: ['bone_archer'] }, 8, 'combat/root'),
  A('combat/weaver', 'combat', 'Spun Out', 'Defeat a web weaver', 'string', { type: 'kill', mobs: ['web_weaver'] }, 8, 'combat/root'),
  A('combat/stalker', 'combat', 'Eyes in the Back of Your Head', 'Defeat an ana stalker', 'phase_dust', { type: 'kill', mobs: ['ana_stalker'] }, 15, 'combat/archer'),
  A('combat/golem', 'combat', 'Heavy Metal', 'Defeat a phase golem', 'iron_ingot', { type: 'kill', mobs: ['phase_golem'] }, 15, 'combat/weaver'),

  // ---------------------------------------------------------------- Magic
  A('magic/root', 'magic', 'Magic', 'Build an enchanting table', 'enchanting_table', { type: 'have', items: ['enchanting_table'] }, 8),
  A('magic/enchant', 'magic', 'Enchanter', 'Enchant an item', 'enchanted_book', { type: 'event', name: 'enchant' }, 10, 'magic/root'),
  A('magic/book', 'magic', 'Bibliophile', 'Hold an enchanted book', 'enchanted_book', { type: 'have', items: ['enchanted_book'] }, 10, 'magic/enchant'),
  A('magic/anvil', 'magic', 'Heavy Duty', 'Use an anvil', 'anvil', { type: 'event', name: 'anvil' }, 10, 'magic/enchant'),
  A('magic/potion', 'magic', 'Local Brewery', 'Brew a potion', 'glass_bottle', { type: 'have', items: ['#potion'] }, 12, 'magic/root'),

  // ---------------------------------------------------------------- The Fourth Dimension
  A('fourd/root', 'fourd', 'The Fourth Dimension', 'Rotate your slice a little', 'slicer_compass', { type: 'stat', stat: 'slice_tilt', value: 15 }, 5),
  A('fourd/kata', 'fourd', 'Kata, Ana', 'Walk along the hidden axis', 'phase_dust', { type: 'stat', stat: 'w_walk', value: 3 }, 8, 'fourd/root'),
  A('fourd/perpendicular', 'fourd', 'Perpendicular', 'Rotate your slice nearly a quarter turn', 'slicer_compass', { type: 'stat', stat: 'slice_tilt', value: 80 }, 15, 'fourd/root'),
  A('fourd/slicer', 'fourd', 'Cutting Edge', 'Hold a slicer compass', 'slicer_compass', { type: 'have', items: ['slicer_compass'] }, 10, 'fourd/root'),
  A('fourd/glasses', 'fourd', 'See Differently', 'Put on 4D glasses', '4d_glasses', { type: 'have', items: ['4d_glasses'] }, 15, 'fourd/slicer'),
  A('fourd/lens', 'fourd', 'Look Through the Walls', 'Craft a phase lens', 'phase_lens', { type: 'have', items: ['phase_lens'] }, 15, 'fourd/slicer'),
  A('fourd/anchor', 'fourd', 'Anchored', 'Craft a W anchor', 'w_anchor', { type: 'have', items: ['w_anchor'] }, 15, 'fourd/glasses'),
  A('fourd/strike', 'fourd', 'Phase Strike', 'Hit a mob kata or ana of your slice', 'ana_pick', { type: 'event', name: 'phase_strike' }, 20, 'fourd/kata'),

  // ---------------------------------------------------------------- Ember Depths
  A('ember/root', 'ember', 'Into the Depths', 'Enter the Ember Depths', 'hypercinder', { type: 'realm', realm: 'ember' }, 20),
  A('ember/hound', 'ember', 'Hounded', 'Defeat a cinder hound', 'hypercinder', { type: 'kill', mobs: ['cinder_hound'] }, 15, 'ember/root'),
  A('ember/cinder', 'ember', 'Burnt Offering', 'Collect hypercinder', 'hypercinder', { type: 'have', items: ['hypercinder'] }, 15, 'ember/root'),
  A('ember/regent', 'ember', 'Regent Slayer', 'Defeat the Magma Regent', 'regent_heart', { type: 'kill', mobs: ['magma_regent'] }, 100, 'ember/hound'),
  A('ember/slag', 'ember', 'Fireproof', 'Forge an ancient slag ingot', 'ancient_slag_ingot', { type: 'have', items: ['ancient_slag_ingot'] }, 30, 'ember/regent'),

  // ---------------------------------------------------------------- Hollow Void
  A('void/root', 'void', 'The Eye Opens', 'Craft a void eye', 'void_eye', { type: 'have', items: ['void_eye'] }, 20),
  A('void/gate', 'void', 'Open the Gate', 'Fill the six frames of a void gate', 'void_eye', { type: 'event', name: 'void_gate' }, 30, 'void/root'),
  A('void/enter', 'void', 'Beyond the Dark', 'Enter the Hollow Void', 'whisper_fruit', { type: 'realm', realm: 'void' }, 40, 'void/gate'),
  A('void/walker', 'void', "Don't Blink", 'Defeat a void walker', 'phase_dust', { type: 'kill', mobs: ['void_walker'] }, 20, 'void/enter'),
  A('void/swarm', 'void', 'Whispers', 'Defeat a whisper swarm', 'whisper_fruit', { type: 'kill', mobs: ['whisper_swarm'] }, 15, 'void/enter'),
  A('void/serpent', 'void', 'Starlit Serpent', 'Defeat a starlight serpent', 'starlight_shard', { type: 'kill', mobs: ['starlight_serpent'] }, 20, 'void/enter'),
  A('void/starstuff', 'void', 'Starstuff', 'Smelt a starlight ingot', 'starlight_ingot', { type: 'have', items: ['starlight_ingot'] }, 25, 'void/enter'),
  A('void/sovereign', 'void', 'The Void Sovereign', 'Defeat the Void Sovereign', 'sovereign_heart', { type: 'kill', mobs: ['void_sovereign'] }, 500, 'void/enter'),
  A('void/vault', 'void', 'Vault Raider', 'Find Phase Wings in a Sky Vault', 'phase_wings', { type: 'have', items: ['phase_wings'] }, 50, 'void/sovereign'),
  A('void/flight', 'void', 'Take Flight', 'Glide a hundred blocks', 'phase_wings', { type: 'stat', stat: 'glide', value: 100 }, 40, 'void/vault'),
  A('void/rocket', 'void', 'To the Stars', 'Fire a starlight rocket in flight', 'starlight_rocket', { type: 'event', name: 'rocket' }, 30, 'void/flight'),
  A('void/far', 'void', 'Over the Edge', 'Glide a thousand blocks', 'phase_wings', { type: 'stat', stat: 'glide', value: 1000 }, 100, 'void/flight'),
  A('void/step', 'void', 'Phase Step', 'Have a blow phased away by a full starlight set', 'starlight_chestplate', { type: 'event', name: 'phase_step' }, 40, 'void/starstuff'),
];

export const ADV_BY_ID = new Map(ADVANCEMENTS.map((a) => [a.id, a]));
