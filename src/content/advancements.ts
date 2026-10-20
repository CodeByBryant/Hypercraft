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

export type AdvCategory = 'surface' | 'mining' | 'husbandry' | 'combat' | 'magic' | 'fourd' | 'ember' | 'void' | 'mirror' | 'abyss' | 'cloud';

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
  { id: 'mirror', name: 'Mirror Realm', icon: 'hand_mirror', blurb: 'Up is W, left is right' },
  { id: 'abyss', name: 'Crystal Abyss', icon: 'prism_shard', blurb: 'Light is the only map' },
  { id: 'cloud', name: 'Cloud Archipelago', icon: 'wind_glider', blurb: 'Low gravity, high wind' },
];

/** Things the game reports (Game calls Advancements.event with these names). */
export const EVENTS = ['sleep', 'trade', 'plant', 'breed', 'fish', 'block', 'enchant', 'anvil', 'phase_strike', 'void_gate', 'phase_step', 'rocket', 'rift_wake', 'rift', 'reflect', 'twin_wake', 'gate_wake', 'beam_reflect', 'fork_answer', 'bell_wake', 'sky_wake'] as const;
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

  // ---------------------------------------------------------------- Mirror Realm
  A('mirror/root', 'mirror', 'Hand Mirror', 'Craft a hand mirror', 'hand_mirror', { type: 'have', items: ['hand_mirror'] }, 20),
  A('mirror/wake', 'mirror', 'Wake the Rift', 'Wake a rift in a Silver Arch', 'hand_mirror', { type: 'event', name: 'rift_wake' }, 25, 'mirror/root'),
  A('mirror/cross', 'mirror', 'Through the Looking Glass', 'Cross a rift', 'mirror_shard', { type: 'event', name: 'rift' }, 30, 'mirror/wake'),
  A('mirror/enter', 'mirror', 'The Reflection', 'Enter the Mirror Realm', 'mirror_shard', { type: 'realm', realm: 'mirror' }, 40, 'mirror/cross'),
  A('mirror/ore', 'mirror', 'Seven Years of Luck', 'Mine a mirror shard', 'mirror_shard', { type: 'have', items: ['mirror_shard'] }, 25, 'mirror/enter'),
  A('mirror/ingot', 'mirror', 'Mirrorite', 'Smelt a mirrorite ingot', 'mirror_ingot', { type: 'have', items: ['mirror_ingot'] }, 25, 'mirror/ore'),
  A('mirror/shambler', 'mirror', 'Upside Down', 'Defeat a reflection shambler', 'reflection_dust', { type: 'kill', mobs: ['reflection_shambler'] }, 15, 'mirror/enter'),
  A('mirror/stalker', 'mirror', 'Copycat', 'Defeat a mirror stalker', 'reflection_dust', { type: 'kill', mobs: ['mirror_stalker'] }, 20, 'mirror/enter'),
  A('mirror/wraith', 'mirror', 'Silver Lining Again', 'Defeat a silver wraith', 'silver_nugget', { type: 'kill', mobs: ['silver_wraith'] }, 20, 'mirror/enter'),
  A('mirror/armor', 'mirror', 'Reflective Surface', 'Craft or find a mirror chestplate', 'mirror_chestplate', { type: 'have', items: ['mirror_chestplate'] }, 35, 'mirror/ingot'),
  A('mirror/palace', 'mirror', 'Face Your Reflection', 'Wake the Mirror Twin at its altar', 'twin_core', { type: 'event', name: 'twin_wake' }, 40, 'mirror/enter'),
  A('mirror/twin', 'mirror', 'Mirror, Mirror', 'Defeat the Mirror Twin', 'twin_core', { type: 'kill', mobs: ['mirror_twin'] }, 300, 'mirror/palace'),
  A('mirror/reflect', 'mirror', 'Not My Problem', 'Reflect a blow with a full set of mirror armour', 'mirror_helmet', { type: 'event', name: 'reflect' }, 40, 'mirror/armor'),

  // ---------------------------------------------------------------- Crystal Abyss
  A('abyss/root', 'abyss', 'Resonance', 'Collect a resonance crystal', 'resonance_crystal', { type: 'have', items: ['resonance_crystal'] }, 20),
  A('abyss/compass', 'abyss', 'Tuned In', 'Attune a slicer compass to the deep', 'resonance_compass', { type: 'have', items: ['resonance_compass'] }, 25, 'abyss/root'),
  A('abyss/wake', 'abyss', 'Wake the Gate', 'Feed a resonance crystal to a Geode Gate', 'resonance_crystal', { type: 'event', name: 'gate_wake' }, 25, 'abyss/root'),
  A('abyss/enter', 'abyss', 'Into the Abyss', 'Enter the Crystal Abyss', 'prism_shard', { type: 'realm', realm: 'abyss' }, 40, 'abyss/wake'),
  A('abyss/prism', 'abyss', 'Prismatic', 'Mine a prism shard', 'prism_shard', { type: 'have', items: ['prism_shard'] }, 30, 'abyss/enter'),
  A('abyss/ingot', 'abyss', 'Light Through Glass', 'Smelt a prism ingot', 'prism_ingot', { type: 'have', items: ['prism_ingot'] }, 30, 'abyss/prism'),
  A('abyss/pickaxe', 'abyss', 'Cut Like Light', 'Craft a prism pickaxe', 'prism_pickaxe', { type: 'have', items: ['prism_pickaxe'] }, 50, 'abyss/ingot'),
  A('abyss/spider', 'abyss', 'Light Show', 'Defeat a prism spider', 'prism_shard', { type: 'kill', mobs: ['prism_spider'] }, 20, 'abyss/enter'),
  A('abyss/golem', 'abyss', 'Noise Complaint', 'Defeat a resonance golem', 'resonance_crystal', { type: 'kill', mobs: ['resonance_golem'] }, 25, 'abyss/enter'),
  A('abyss/slime', 'abyss', 'Rock and a Hard Place', 'Defeat a geode slime', 'amethyst_shard', { type: 'kill', mobs: ['geode_slime'] }, 20, 'abyss/enter'),
  A('abyss/armor', 'abyss', 'Faceted', 'Craft or find a prism chestplate', 'prism_chestplate', { type: 'have', items: ['prism_chestplate'] }, 50, 'abyss/ingot'),
  A('abyss/beam', 'abyss', 'Returned to Sender', 'Reflect a light beam with a full set of prism armour', 'prism_helmet', { type: 'event', name: 'beam_reflect' }, 40, 'abyss/armor'),
  A('abyss/fork', 'abyss', 'Perfect Pitch', 'Craft a tuning fork', 'mid_fork', { type: 'have', items: ['low_fork', 'mid_fork', 'high_fork', 'shrill_fork'] }, 30, 'abyss/ingot'),
  A('abyss/answer', 'abyss', 'Call and Response', 'Silence a sound pulse with the matching fork', 'mid_fork', { type: 'event', name: 'fork_answer' }, 30, 'abyss/fork'),
  A('abyss/bell', 'abyss', 'For Whom the Bell Tolls', 'Ring a tuning fork at the Resonance Bell', 'resonance_block', { type: 'event', name: 'bell_wake' }, 40, 'abyss/answer'),
  A('abyss/titan', 'abyss', 'Resonance Cascade', 'Defeat the Resonance Titan', 'resonance_heart', { type: 'kill', mobs: ['resonance_titan'] }, 400, 'abyss/bell'),
  A('abyss/block', 'abyss', 'Crystal Clear', 'Craft a block of resonance crystal', 'resonance_block', { type: 'have', items: ['resonance_block'] }, 25, 'abyss/root'),

  // ---------------------------------------------------------------- Cloud Archipelago
  A('cloud/root', 'cloud', 'Feather Light', 'Craft a zephyr feather', 'zephyr_feather', { type: 'have', items: ['zephyr_feather'] }, 20),
  A('cloud/wake', 'cloud', 'Wake the Sky Gate', 'Feed a zephyr feather to a Sky Gate', 'zephyr_feather', { type: 'event', name: 'sky_wake' }, 25, 'cloud/root'),
  A('cloud/enter', 'cloud', 'Head in the Clouds', 'Enter the Cloud Archipelago', 'cloud_cotton', { type: 'realm', realm: 'cloud' }, 40, 'cloud/wake'),
  A('cloud/cotton', 'cloud', 'Cotton Picking', 'Gather cloud cotton', 'cloud_cotton', { type: 'have', items: ['cloud_cotton'] }, 20, 'cloud/enter'),
  A('cloud/glider', 'cloud', 'Wind Rider', 'Craft a wind glider', 'wind_glider', { type: 'have', items: ['wind_glider'] }, 50, 'cloud/cotton'),
  A('cloud/kite', 'cloud', 'Fly a Kite', 'Defeat a storm kite', 'feather', { type: 'kill', mobs: ['storm_kite'] }, 20, 'cloud/enter'),
  A('cloud/hawk', 'cloud', 'Thunderstruck', 'Defeat a thunder hawk', 'storm_feather', { type: 'kill', mobs: ['thunder_hawk'] }, 30, 'cloud/enter'),
  A('cloud/sprite', 'cloud', 'Wind Sprite Wrangler', 'Defeat a wind sprite', 'gale_dust', { type: 'kill', mobs: ['wind_sprite'] }, 20, 'cloud/enter'),
  A('cloud/silk', 'cloud', 'Woven Weather', 'Weave cloud silk', 'cloud_silk', { type: 'have', items: ['cloud_silk'] }, 25, 'cloud/cotton'),
  A('cloud/armor', 'cloud', 'Light as Air', 'Craft a cloud chestplate', 'cloud_chestplate', { type: 'have', items: ['cloud_chestplate'] }, 50, 'cloud/silk'),
  A('cloud/far', 'cloud', 'Jet Stream', 'Glide five hundred blocks', 'wind_glider', { type: 'stat', stat: 'glide', value: 500 }, 60, 'cloud/glider'),
];

export const ADV_BY_ID = new Map(ADVANCEMENTS.map((a) => [a.id, a]));
