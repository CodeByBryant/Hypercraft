// Chest loot tables (Phase 5). Each table has pools; each pool is rolled a random number of
// times and picks weighted entries. Chests in generated structures are filled from these when
// the column is generated (deterministic per world seed and chest position).

import type { LootTable } from './types';
import { FISHING_LOOT } from './forage';

const T = (pools: LootTable['pools']): LootTable => ({ pools });

export const LOOT_TABLES: Record<string, LootTable> = {
  // ---------------------------------------------------------------- villages
  village_house: T([
    {
      rolls: [3, 6],
      entries: [
        { item: 'bread', weight: 10, count: [1, 4] },
        { item: 'apple', weight: 8, count: [1, 3] },
        { item: 'wheat', weight: 8, count: [2, 6] },
        { item: 'stick', weight: 6, count: [2, 6] },
        { item: 'torch', weight: 6, count: [2, 6] },
        { item: 'coal', weight: 5, count: [1, 4] },
        { item: 'paper', weight: 3, count: [1, 3] },
        { item: 'egg', weight: 3, count: [1, 3] },
        { item: 'iron_nugget', weight: 3, count: [1, 4] },
        { item: 'verdant', weight: 1 },
      ],
    },
  ]),
  village_smith: T([
    {
      rolls: [3, 7],
      entries: [
        { item: 'iron_ingot', weight: 10, count: [1, 5] },
        { item: 'silver_ingot', weight: 5, count: [1, 4] },
        { item: 'sulfur', weight: 5, count: [2, 6] },
        { item: 'iron_nugget', weight: 8, count: [2, 8] },
        { item: 'coal', weight: 8, count: [2, 8] },
        { item: 'bread', weight: 6, count: [1, 3] },
        { item: 'iron_pickaxe', weight: 3, wear: [0.2, 0.8] },
        { item: 'iron_sword', weight: 3, wear: [0.2, 0.8] },
        { item: 'iron_axe', weight: 2, wear: [0.2, 0.8] },
        { item: 'gold_ingot', weight: 3, count: [1, 3] },
        { item: 'obsidian', weight: 2, count: [1, 3] },
        { item: 'verdant', weight: 1, count: [1, 2] },
      ],
    },
  ]),
  village_library: T([
    {
      rolls: [2, 5],
      entries: [
        { item: 'book', weight: 10, count: [1, 3] },
        { item: 'paper', weight: 10, count: [2, 8] },
        { item: 'compass', weight: 2 },
        { item: 'clock', weight: 2 },
        { item: 'ruins_atlas', weight: 1 },
        { item: 'lantern', weight: 3, count: [1, 2] },
        { item: 'verdant', weight: 2, count: [1, 2] },
      ],
    },
  ]),
  village_temple: T([
    {
      rolls: [2, 5],
      entries: [
        { item: 'phase_dust', weight: 8, count: [1, 4] },
        { item: 'glow_scale', weight: 5, count: [1, 3] },
        { item: 'amethyst_shard', weight: 6, count: [1, 4] },
        { item: 'lumen', weight: 4, count: [1, 3] },
        { item: 'bone', weight: 6, count: [1, 4] },
        { item: 'verdant', weight: 3, count: [1, 3] },
        { item: 'echo_shard', weight: 1 },
      ],
    },
  ]),
  village_farm: T([
    {
      rolls: [3, 6],
      entries: [
        { item: 'wheat', weight: 12, count: [3, 9] },
        { item: 'bread', weight: 8, count: [1, 4] },
        { item: 'apple', weight: 6, count: [1, 4] },
        { item: 'egg', weight: 5, count: [1, 4] },
        { item: 'hay_bale', weight: 3, count: [1, 2] },
        { item: 'iron_hoe', weight: 1, wear: [0.3, 0.8] },
      ],
    },
  ]),
  // ---------------------------------------------------------------- underground
  dungeon: T([
    {
      rolls: [2, 4],
      entries: [
        { item: 'bone', weight: 10, count: [1, 6] },
        { item: 'rotten_flesh', weight: 10, count: [1, 6] },
        { item: 'string', weight: 8, count: [1, 5] },
        { item: 'arrow', weight: 6, count: [2, 8] },
        { item: 'bread', weight: 6, count: [1, 3] },
        { item: 'coal', weight: 6, count: [2, 6] },
      ],
    },
    {
      rolls: [1, 3],
      entries: [
        { item: 'iron_ingot', weight: 10, count: [1, 4] },
        { item: 'gold_ingot', weight: 6, count: [1, 4] },
        { item: 'phase_dust', weight: 6, count: [1, 3] },
        { item: 'azurite', weight: 3, count: [1, 2] },
        { item: 'verdant', weight: 2, count: [1, 2] },
        { item: 'bow', weight: 2, wear: [0.1, 0.6] },
        { item: 'ruins_atlas', weight: 1 },
      ],
    },
  ]),
  hypermine: T([
    {
      rolls: [3, 6],
      entries: [
        { item: 'torch', weight: 10, count: [2, 8] },
        { item: 'coal', weight: 10, count: [3, 8] },
        { item: 'raw_copper', weight: 8, count: [2, 6] },
        { item: 'iron_ingot', weight: 8, count: [1, 5] },
        { item: 'silver_ingot', weight: 4, count: [1, 3] },
        { item: 'lumen_dust', weight: 4, count: [2, 6] },
        { item: 'gold_ingot', weight: 4, count: [1, 3] },
        { item: 'fluxite_dust', weight: 5, count: [2, 6] },
        { item: 'bread', weight: 5, count: [1, 3] },
        { item: 'string', weight: 4, count: [1, 4] },
        { item: 'iron_pickaxe', weight: 2, wear: [0.3, 0.9] },
        { item: 'azurite', weight: 2, count: [1, 3] },
        { item: 'echo_shard', weight: 1 },
        { item: 'hyperite', weight: 1 },
      ],
    },
  ]),
  library: T([
    {
      rolls: [3, 6],
      entries: [
        { item: 'book', weight: 10, count: [1, 4] },
        { item: 'paper', weight: 10, count: [2, 8] },
        { item: 'bookshelf', weight: 3, count: [1, 2] },
        { item: 'compass', weight: 2 },
        { item: 'clock', weight: 2 },
        { item: 'ruins_atlas', weight: 2 },
        { item: 'vault_atlas', weight: 1 },
        { item: 'phase_dust', weight: 3, count: [1, 3] },
      ],
    },
  ]),
  ana_vault: T([
    {
      rolls: [3, 6],
      entries: [
        { item: 'phase_dust', weight: 10, count: [2, 6] },
        { item: 'echo_shard', weight: 6, count: [1, 3] },
        { item: 'hyperite', weight: 4, count: [1, 3] },
        { item: 'tesserite_shard', weight: 4, count: [1, 3] },
        { item: 'phase_lens', weight: 1 },
        { item: 'hyper_rope', weight: 2 },
        { item: 'verdant', weight: 6, count: [1, 4] },
        { item: 'azurite', weight: 6, count: [1, 4] },
        { item: 'gold_ingot', weight: 6, count: [2, 5] },
        { item: 'tesseract_bricks', weight: 3, count: [2, 6] },
        { item: 'hyperite_sword', weight: 1, wear: [0.1, 0.5] },
        { item: 'temple_atlas', weight: 1 },
      ],
    },
  ]),
  deep_silent_vault: T([
    {
      rolls: [3, 6],
      entries: [
        { item: 'echo_shard', weight: 10, count: [1, 4] },
        { item: 'wraith_essence', weight: 6, count: [1, 3] },
        { item: 'hyperite', weight: 4, count: [1, 3] },
        { item: 'verdant', weight: 5, count: [1, 4] },
        { item: 'fluxite_dust', weight: 6, count: [2, 8] },
        { item: 'azurite', weight: 5, count: [1, 4] },
        { item: 'hyperite_pickaxe', weight: 1, wear: [0.2, 0.6] },
      ],
    },
  ]),
  // ---------------------------------------------------------------- temples and ruins
  desert_temple: T([
    {
      rolls: [2, 4],
      entries: [
        { item: 'bone', weight: 10, count: [2, 6] },
        { item: 'rotten_flesh', weight: 10, count: [2, 6] },
        { item: 'sand', weight: 6, count: [2, 8] },
      ],
    },
    {
      rolls: [2, 4],
      entries: [
        { item: 'gold_ingot', weight: 10, count: [2, 6] },
        { item: 'iron_ingot', weight: 8, count: [1, 5] },
        { item: 'verdant', weight: 5, count: [1, 3] },
        { item: 'azurite', weight: 4, count: [1, 3] },
        { item: 'phase_dust', weight: 5, count: [1, 4] },
        { item: 'gold_block', weight: 1 },
        { item: 'temple_atlas', weight: 1 },
      ],
    },
  ]),
  jungle_shrine: T([
    {
      rolls: [3, 6],
      entries: [
        { item: 'bamboo_block', weight: 8, count: [2, 6] },
        { item: 'bone', weight: 8, count: [2, 6] },
        { item: 'arrow', weight: 6, count: [2, 8] },
        { item: 'gold_ingot', weight: 8, count: [2, 5] },
        { item: 'iron_ingot', weight: 6, count: [1, 4] },
        { item: 'verdant', weight: 5, count: [1, 3] },
        { item: 'azurite', weight: 3, count: [1, 2] },
        { item: 'glow_scale', weight: 3, count: [1, 3] },
      ],
    },
  ]),
  tesseract_temple: T([
    {
      rolls: [4, 7],
      entries: [
        { item: 'hyperite', weight: 6, count: [1, 3] },
        { item: 'echo_shard', weight: 6, count: [1, 3] },
        { item: 'phase_dust', weight: 10, count: [3, 8] },
        { item: 'tesseract_bricks', weight: 6, count: [4, 12] },
        { item: 'verdant', weight: 6, count: [2, 5] },
        { item: 'azurite', weight: 6, count: [2, 5] },
        { item: 'vault_atlas', weight: 2 },
      ],
    },
  ]),
  ruins: T([
    {
      rolls: [2, 5],
      entries: [
        { item: 'stone_bricks', weight: 8, count: [2, 8] },
        { item: 'bone', weight: 8, count: [1, 5] },
        { item: 'coal', weight: 6, count: [1, 5] },
        { item: 'iron_nugget', weight: 6, count: [2, 8] },
        { item: 'gold_nugget', weight: 6, count: [2, 8] },
        { item: 'book', weight: 3 },
        { item: 'verdant', weight: 2 },
        { item: 'ruins_atlas', weight: 1 },
      ],
    },
  ]),
  ruined_portal: T([
    {
      rolls: [3, 6],
      entries: [
        { item: 'obsidian', weight: 10, count: [1, 4] },
        { item: 'flint', weight: 8, count: [1, 4] },
        { item: 'iron_nugget', weight: 8, count: [3, 9] },
        { item: 'gold_nugget', weight: 8, count: [3, 9] },
        { item: 'gold_ingot', weight: 5, count: [1, 3] },
        { item: 'flint_and_steel', weight: 4, wear: [0, 0.5] },
        { item: 'gold_sword', weight: 3, wear: [0.3, 0.9] },
        { item: 'gold_pickaxe', weight: 3, wear: [0.3, 0.9] },
        { item: 'phase_dust', weight: 4, count: [1, 3] },
        { item: 'magma_cream', weight: 2, count: [1, 2] },
      ],
    },
  ]),
  // ---------------------------------------------------------------- coast and sea
  shipwreck_supply: T([
    {
      rolls: [3, 7],
      entries: [
        { item: 'paper', weight: 8, count: [1, 6] },
        { item: 'wheat', weight: 8, count: [4, 12] },
        { item: 'bread', weight: 6, count: [1, 4] },
        { item: 'coal', weight: 6, count: [2, 8] },
        { item: 'feather', weight: 4, count: [1, 5] },
        { item: 'leather', weight: 4, count: [1, 3] },
        { item: 'apple', weight: 5, count: [1, 4] },
        { item: 'string', weight: 4, count: [1, 4] },
      ],
    },
  ]),
  shipwreck_treasure: T([
    {
      rolls: [3, 6],
      entries: [
        { item: 'iron_ingot', weight: 10, count: [1, 5] },
        { item: 'gold_ingot', weight: 8, count: [1, 5] },
        { item: 'iron_nugget', weight: 8, count: [2, 10] },
        { item: 'gold_nugget', weight: 8, count: [2, 10] },
        { item: 'verdant', weight: 4, count: [1, 3] },
        { item: 'azurite', weight: 4, count: [1, 3] },
        { item: 'temple_atlas', weight: 1 },
      ],
    },
  ]),
  buried_treasure: T([
    {
      rolls: [5, 8],
      entries: [
        { item: 'gold_ingot', weight: 10, count: [2, 6] },
        { item: 'iron_ingot', weight: 10, count: [2, 6] },
        { item: 'verdant', weight: 6, count: [2, 5] },
        { item: 'azurite', weight: 6, count: [2, 5] },
        { item: 'glow_scale', weight: 4, count: [1, 3] },
        { item: 'hyperite', weight: 2, count: [1, 2] },
        { item: 'echo_shard', weight: 1 },
      ],
    },
  ]),
  sunken_monument: T([
    {
      rolls: [3, 6],
      entries: [
        { item: 'glow_scale', weight: 10, count: [2, 6] },
        { item: 'sea_lantern', weight: 6, count: [1, 4] },
        { item: 'gold_ingot', weight: 6, count: [2, 5] },
        { item: 'verdant', weight: 5, count: [1, 4] },
        { item: 'azurite', weight: 5, count: [1, 4] },
        { item: 'gold_block', weight: 2 },
        { item: 'hyperite', weight: 2, count: [1, 2] },
        { item: 'echo_shard', weight: 2 },
      ],
    },
  ]),
  lighthouse: T([
    {
      rolls: [2, 5],
      entries: [
        { item: 'torch', weight: 10, count: [2, 8] },
        { item: 'lantern', weight: 5, count: [1, 3] },
        { item: 'coal', weight: 8, count: [2, 8] },
        { item: 'bread', weight: 6, count: [1, 4] },
        { item: 'compass', weight: 2 },
        { item: 'glow_scale', weight: 4, count: [1, 3] },
      ],
    },
  ]),
  // ---------------------------------------------------------------- small surface sites
  cabin: T([
    {
      rolls: [2, 5],
      entries: [
        { item: 'bread', weight: 8, count: [1, 3] },
        { item: 'apple', weight: 8, count: [1, 3] },
        { item: 'stick', weight: 6, count: [2, 6] },
        { item: 'torch', weight: 6, count: [2, 5] },
        { item: 'log', weight: 6, count: [2, 6] },
        { item: 'coal', weight: 5, count: [1, 4] },
        { item: 'iron_axe', weight: 2, wear: [0.3, 0.8] },
        { item: 'bow', weight: 2, wear: [0.2, 0.7] },
        { item: 'arrow', weight: 3, count: [2, 8] },
      ],
    },
  ]),
  watchtower: T([
    {
      rolls: [2, 4],
      entries: [
        { item: 'arrow', weight: 10, count: [3, 12] },
        { item: 'bow', weight: 3, wear: [0.2, 0.7] },
        { item: 'bread', weight: 6, count: [1, 3] },
        { item: 'torch', weight: 6, count: [2, 6] },
        { item: 'iron_nugget', weight: 5, count: [2, 6] },
        { item: 'compass', weight: 1 },
      ],
    },
  ]),
  outpost: T([
    {
      rolls: [3, 6],
      entries: [
        { item: 'arrow', weight: 10, count: [4, 16] },
        { item: 'bow', weight: 4, wear: [0.1, 0.6] },
        { item: 'iron_ingot', weight: 6, count: [1, 4] },
        { item: 'wheat', weight: 6, count: [3, 8] },
        { item: 'string', weight: 5, count: [1, 4] },
        { item: 'bread', weight: 5, count: [1, 3] },
        { item: 'verdant', weight: 2, count: [1, 2] },
        { item: 'iron_sword', weight: 2, wear: [0.2, 0.7] },
      ],
    },
  ]),
  campsite: T([
    {
      rolls: [2, 4],
      entries: [
        { item: 'bread', weight: 8, count: [1, 3] },
        { item: 'apple', weight: 8, count: [1, 3] },
        { item: 'stick', weight: 6, count: [2, 6] },
        { item: 'coal', weight: 6, count: [1, 4] },
        { item: 'raw_mutton', weight: 4, count: [1, 3] },
        { item: 'flint', weight: 4, count: [1, 3] },
        { item: 'string', weight: 3, count: [1, 3] },
      ],
    },
  ]),
  igloo: T([
    {
      rolls: [2, 4],
      entries: [
        { item: 'apple', weight: 8, count: [1, 3] },
        { item: 'coal', weight: 8, count: [1, 4] },
        { item: 'bread', weight: 6, count: [1, 3] },
        { item: 'gold_nugget', weight: 5, count: [1, 4] },
        { item: 'phase_dust', weight: 2, count: [1, 2] },
        { item: 'blue_ice', weight: 2, count: [1, 4] },
      ],
    },
  ]),
  witch_hut: T([
    {
      rolls: [3, 6],
      entries: [
        { item: 'phase_dust', weight: 8, count: [1, 4] },
        { item: 'glow_scale', weight: 6, count: [1, 3] },
        { item: 'magma_cream', weight: 4, count: [1, 2] },
        { item: 'slime_ball', weight: 6, count: [1, 4] },
        { item: 'ink_sac', weight: 6, count: [1, 4] },
        { item: 'bone', weight: 6, count: [1, 4] },
        { item: 'string', weight: 5, count: [1, 4] },
        { item: 'amethyst_shard', weight: 4, count: [1, 3] },
        { item: 'red_mushroom', weight: 4, count: [1, 3] },
      ],
    },
  ]),
  fossil_site: T([
    {
      rolls: [2, 4],
      entries: [
        { item: 'bone', weight: 12, count: [2, 8] },
        { item: 'bone_block', weight: 6, count: [1, 3] },
        { item: 'coal', weight: 6, count: [1, 4] },
        { item: 'amethyst_shard', weight: 4, count: [1, 3] },
        { item: 'fossil_stone', weight: 4, count: [1, 4] },
      ],
    },
  ]),
  sky_tower: T([
    {
      rolls: [3, 6],
      entries: [
        { item: 'phase_dust', weight: 10, count: [2, 6] },
        { item: 'feather', weight: 8, count: [2, 6] },
        { item: 'echo_shard', weight: 4, count: [1, 2] },
        { item: 'glow_scale', weight: 5, count: [1, 3] },
        { item: 'azurite', weight: 5, count: [1, 3] },
        { item: 'verdant', weight: 5, count: [1, 3] },
        { item: 'hyperite', weight: 2 },
        { item: 'vault_atlas', weight: 1 },
      ],
    },
  ]),
  windmill: T([
    {
      rolls: [2, 5],
      entries: [
        { item: 'wheat', weight: 12, count: [4, 12] },
        { item: 'bread', weight: 8, count: [2, 5] },
        { item: 'hay_bale', weight: 4, count: [1, 3] },
        { item: 'apple', weight: 5, count: [1, 3] },
      ],
    },
  ]),
  stone_circle: T([
    {
      rolls: [1, 3],
      entries: [
        { item: 'phase_dust', weight: 8, count: [1, 4] },
        { item: 'amethyst_shard', weight: 6, count: [1, 3] },
        { item: 'echo_shard', weight: 1 },
        { item: 'verdant', weight: 2 },
      ],
    },
  ]),

  // ---------------------------------------------------------------- Ember Depths (Phase 6)
  citadel_treasure: T([
    {
      rolls: [4, 7],
      entries: [
        { item: 'gold_ingot', weight: 12, count: [2, 6] },
        { item: 'ember_quartz', weight: 12, count: [4, 12] },
        { item: 'hypercinder', weight: 8, count: [2, 6] },
        { item: 'slag_scrap', weight: 4, count: [1, 2] },
        { item: 'ancient_slag_ingot', weight: 1 },
        { item: 'hyperite', weight: 3, count: [1, 2] },
        { item: 'gold_block', weight: 2 },
        { item: 'obsidian', weight: 4, count: [2, 6] },
        { item: 'flint_and_steel', weight: 3, wear: [0.1, 0.5] },
        { item: 'hyperite_sword', weight: 2, wear: [0.2, 0.7] },
      ],
    },
  ]),
  citadel_barracks: T([
    {
      rolls: [3, 6],
      entries: [
        { item: 'iron_sword', weight: 6, wear: [0.3, 0.9] },
        { item: 'bow', weight: 4, wear: [0.2, 0.8] },
        { item: 'arrow', weight: 10, count: [4, 16] },
        { item: 'hound_fang', weight: 8, count: [1, 3] },
        { item: 'gold_nugget', weight: 10, count: [3, 10] },
        { item: 'cinder_bricks', weight: 6, count: [4, 12] },
        { item: 'fire_charge', weight: 5, count: [1, 4] },
      ],
    },
  ]),
  citadel_storage: T([
    {
      rolls: [3, 6],
      entries: [
        { item: 'cinder_brick', weight: 10, count: [4, 16] },
        { item: 'sulfur', weight: 8, count: [2, 8] },
        { item: 'magma_cream', weight: 6, count: [1, 3] },
        { item: 'raw_beef', weight: 6, count: [1, 4] },
        { item: 'gold_nugget', weight: 8, count: [2, 8] },
        { item: 'obsidian', weight: 3, count: [1, 4] },
      ],
    },
  ]),
  forge: T([
    {
      rolls: [3, 6],
      entries: [
        { item: 'iron_ingot', weight: 10, count: [2, 6] },
        { item: 'gold_ingot', weight: 8, count: [1, 4] },
        { item: 'hypercinder', weight: 10, count: [2, 8] },
        { item: 'slag_scrap', weight: 3 },
        { item: 'iron_pickaxe', weight: 3, wear: [0.1, 0.6] },
        { item: 'hyperite_pickaxe', weight: 1, wear: [0.3, 0.8] },
        { item: 'coal', weight: 8, count: [4, 12] },
        { item: 'ember_quartz', weight: 6, count: [2, 8] },
      ],
    },
  ]),
  ziggurat: T([
    {
      rolls: [3, 5],
      entries: [
        { item: 'ember_quartz', weight: 10, count: [4, 10] },
        { item: 'gold_ingot', weight: 6, count: [1, 3] },
        { item: 'magma_cream', weight: 6, count: [1, 4] },
        { item: 'slag_scrap', weight: 3, count: [1, 2] },
        { item: 'drake_scale', weight: 4, count: [1, 3] },
        { item: 'obsidian', weight: 4, count: [2, 5] },
      ],
    },
  ]),
  magma_bridge: T([
    {
      rolls: [2, 4],
      entries: [
        { item: 'gold_nugget', weight: 10, count: [2, 8] },
        { item: 'fire_charge', weight: 6, count: [1, 3] },
        { item: 'hypercinder', weight: 6, count: [1, 4] },
        { item: 'cinder_brick', weight: 8, count: [2, 8] },
        { item: 'ember_atlas', weight: 2 },
      ],
    },
  ]),
  ember_ruined_portal: T([
    {
      rolls: [3, 6],
      entries: [
        { item: 'obsidian', weight: 12, count: [2, 6] },
        { item: 'flint_and_steel', weight: 6, wear: [0, 0.4] },
        { item: 'fire_charge', weight: 6, count: [1, 3] },
        { item: 'gold_ingot', weight: 6, count: [1, 3] },
        { item: 'gold_nugget', weight: 8, count: [4, 12] },
        { item: 'ember_atlas', weight: 3 },
        { item: 'gold_sword', weight: 3, wear: [0.2, 0.8] },
      ],
    },
  ]),
  regent_caldera: T([
    {
      rolls: [4, 6],
      entries: [
        { item: 'ancient_slag_ingot', weight: 3 },
        { item: 'slag_scrap', weight: 6, count: [1, 3] },
        { item: 'hyperite', weight: 5, count: [1, 3] },
        { item: 'gold_block', weight: 5, count: [1, 2] },
        { item: 'ember_quartz', weight: 10, count: [6, 16] },
        { item: 'hypercinder', weight: 10, count: [4, 10] },
      ],
    },
  ]),
};

LOOT_TABLES.fishing = FISHING_LOOT;

// ---------------------------------------------------------------- Phase 7 additions
// Armour, golden apples and food in the chests where Minecraft keeps them.
const W = (lo: number, hi: number): [number, number] => [lo, hi];
const extra: Record<string, LootTable['pools'][number]> = {
  village_smith: { rolls: W(0, 2), entries: [{ item: 'iron_helmet', weight: 3, wear: W(0.1, 0.6) }, { item: 'iron_chestplate', weight: 2, wear: W(0.1, 0.6) }, { item: 'iron_leggings', weight: 2, wear: W(0.1, 0.6) }, { item: 'iron_boots', weight: 3, wear: W(0.1, 0.6) }, { item: 'leather_chestplate', weight: 4 }] },
  village_house: { rolls: W(0, 2), entries: [{ item: 'cooked_beef', weight: 4, count: W(1, 3) }, { item: 'baked_potato', weight: 4, count: W(1, 4) }, { item: 'carrot', weight: 4, count: W(1, 4) }, { item: 'potato', weight: 4, count: W(1, 4) }, { item: 'bowl', weight: 2, count: W(1, 3) }] },
  village_farm: { rolls: W(1, 3), entries: [{ item: 'carrot', weight: 5, count: W(2, 6) }, { item: 'potato', weight: 5, count: W(2, 6) }, { item: 'beetroot', weight: 4, count: W(2, 6) }, { item: 'melon_slice', weight: 3, count: W(2, 8) }, { item: 'milk_bucket', weight: 1 }] },
  dungeon: { rolls: W(1, 2), entries: [{ item: 'golden_apple', weight: 4 }, { item: 'enchanted_golden_apple', weight: 1 }, { item: 'iron_chestplate', weight: 3, wear: W(0.2, 0.7) }, { item: 'gold_helmet', weight: 3, wear: W(0.2, 0.7) }, { item: 'copper_boots', weight: 3, wear: W(0.2, 0.7) }, { item: 'rotten_flesh', weight: 6, count: W(1, 6) }] },
  hypermine: { rolls: W(0, 2), entries: [{ item: 'iron_helmet', weight: 3, wear: W(0.3, 0.8) }, { item: 'copper_chestplate', weight: 3, wear: W(0.3, 0.8) }, { item: 'cooked_mutton', weight: 4, count: W(1, 4) }, { item: 'golden_apple', weight: 1 }] },
  ana_vault: { rolls: W(1, 2), entries: [{ item: 'verdant_helmet', weight: 2, wear: W(0, 0.4) }, { item: 'verdant_boots', weight: 2, wear: W(0, 0.4) }, { item: 'golden_apple', weight: 3 }, { item: '4d_glasses', weight: 2 }] },
  deep_silent_vault: { rolls: W(1, 3), entries: [{ item: 'hyperite_chestplate', weight: 2, wear: W(0, 0.4) }, { item: 'hyperite_helmet', weight: 2, wear: W(0, 0.4) }, { item: 'enchanted_golden_apple', weight: 1 }, { item: 'golden_apple', weight: 3, count: W(1, 2) }, { item: '4d_glasses', weight: 2 }] },
  desert_temple: { rolls: W(0, 2), entries: [{ item: 'golden_apple', weight: 4 }, { item: 'enchanted_golden_apple', weight: 1 }, { item: 'gold_chestplate', weight: 3 }, { item: 'rotten_flesh', weight: 6, count: W(1, 7) }] },
  jungle_shrine: { rolls: W(0, 2), entries: [{ item: 'golden_apple', weight: 2 }, { item: 'leather_leggings', weight: 4 }, { item: 'azurite_helmet', weight: 1 }] },
  tesseract_temple: { rolls: W(1, 2), entries: [{ item: '4d_glasses', weight: 3 }, { item: 'azurite_chestplate', weight: 2 }, { item: 'golden_apple', weight: 2 }] },
  shipwreck_supply: { rolls: W(1, 2), entries: [{ item: 'leather_helmet', weight: 3 }, { item: 'leather_boots', weight: 3 }, { item: 'dried_kelp', weight: 6, count: W(2, 8) }, { item: 'carrot', weight: 4, count: W(2, 5) }, { item: 'potato', weight: 4, count: W(2, 5) }] },
  sunken_monument: { rolls: W(1, 2), entries: [{ item: 'reefshell_helmet', weight: 3 }, { item: 'golden_apple', weight: 2 }] },
  ruined_portal: { rolls: W(0, 2), entries: [{ item: 'gold_helmet', weight: 3, wear: W(0.2, 0.8) }, { item: 'gold_boots', weight: 3, wear: W(0.2, 0.8) }, { item: 'golden_carrot', weight: 3, count: W(1, 4) }, { item: 'golden_apple', weight: 2 }] },
  citadel_treasure: { rolls: W(1, 2), entries: [{ item: 'gold_chestplate', weight: 3 }, { item: 'golden_apple', weight: 3 }, { item: 'hyperite_boots', weight: 1 }] },
  citadel_barracks: { rolls: W(1, 2), entries: [{ item: 'iron_chestplate', weight: 3, wear: W(0.3, 0.9) }, { item: 'gold_leggings', weight: 3, wear: W(0.3, 0.9) }, { item: 'cooked_beef', weight: 4, count: W(1, 4) }] },
  forge: { rolls: W(0, 2), entries: [{ item: 'iron_boots', weight: 3 }, { item: 'gold_helmet', weight: 3 }] },
  regent_caldera: { rolls: W(1, 1), entries: [{ item: 'enchanted_golden_apple', weight: 2 }, { item: 'hyperite_leggings', weight: 2 }] },
  igloo: { rolls: W(0, 2), entries: [{ item: 'golden_apple', weight: 2 }, { item: 'cooked_rabbit', weight: 4, count: W(1, 3) }, { item: 'leather_boots', weight: 3 }] },
  cabin: { rolls: W(0, 2), entries: [{ item: 'mushroom_stew', weight: 4 }, { item: 'leather_chestplate', weight: 3 }, { item: 'bowl', weight: 3, count: W(1, 2) }] },
};
for (const [name, pool] of Object.entries(extra)) LOOT_TABLES[name]?.pools.push(pool);

// Enchanted books and gear (Minecraft: dungeons, mineshafts, temples, strongholds...).
const enchanted: Record<string, LootTable['pools'][number]> = {
  dungeon: { rolls: W(0, 1), entries: [{ item: 'book', weight: 3, enchant: 'random' }, { item: 'iron_sword', weight: 1, enchant: [5, 20] }] },
  hypermine: { rolls: W(0, 1), entries: [{ item: 'book', weight: 3, enchant: 'random' }, { item: 'iron_pickaxe', weight: 2, enchant: [5, 15] }] },
  library: { rolls: W(1, 3), entries: [{ item: 'book', weight: 5, enchant: 'random' }] },
  ana_vault: { rolls: W(1, 2), entries: [{ item: 'book', weight: 4, enchant: 'random' }, { item: 'verdant_sword', weight: 1, enchant: [20, 30] }, { item: 'iron_helmet', weight: 1, enchant: [20, 30] }] },
  deep_silent_vault: { rolls: W(1, 2), entries: [{ item: 'book', weight: 4, enchant: [20, 39] }, { item: 'hyperite_pickaxe', weight: 1, enchant: [25, 39] }, { item: 'hyperite_boots', weight: 1, enchant: [25, 39] }] },
  desert_temple: { rolls: W(0, 1), entries: [{ item: 'book', weight: 3, enchant: 'random' }] },
  jungle_shrine: { rolls: W(0, 1), entries: [{ item: 'book', weight: 3, enchant: 'random' }, { item: 'bow', weight: 2, enchant: [5, 20] }] },
  tesseract_temple: { rolls: W(1, 1), entries: [{ item: 'book', weight: 3, enchant: [15, 30] }, { item: 'iron_helmet', weight: 1, enchant: [15, 30] }] },
  shipwreck_treasure: { rolls: W(0, 1), entries: [{ item: 'book', weight: 2, enchant: 'random' }] },
  sunken_monument: { rolls: W(0, 1), entries: [{ item: 'book', weight: 2, enchant: [10, 25] }] },
  ruined_portal: { rolls: W(0, 1), entries: [{ item: 'gold_sword', weight: 2, enchant: [5, 15] }, { item: 'gold_helmet', weight: 2, enchant: [5, 15] }] },
  citadel_treasure: { rolls: W(0, 2), entries: [{ item: 'book', weight: 3, enchant: 'random' }, { item: 'gold_chestplate', weight: 2, enchant: [10, 30] }, { item: 'hyperite_sword', weight: 1, enchant: [20, 39] }] },
  regent_caldera: { rolls: W(1, 1), entries: [{ item: 'book', weight: 2, enchant: [25, 39] }] },
  village_library: { rolls: W(0, 1), entries: [{ item: 'book', weight: 2, enchant: 'random' }] },
};
for (const [name, pool] of Object.entries(enchanted)) LOOT_TABLES[name]?.pools.push(pool);

// Potions and brewing ingredients.
const brews: Record<string, LootTable['pools'][number]> = {
  witch_hut: { rolls: W(2, 4), entries: [{ item: 'potion_healing', weight: 4 }, { item: 'potion_swiftness', weight: 3 }, { item: 'splash_potion_poison', weight: 3 }, { item: 'potion_night_vision', weight: 3 }, { item: 'weaver_eye', weight: 4, count: W(1, 3) }, { item: 'sugar', weight: 4, count: W(1, 4) }, { item: 'glass_bottle', weight: 4, count: W(1, 3) }, { item: 'ember_wart', weight: 3, count: W(1, 3) }] },
  dungeon: { rolls: W(0, 1), entries: [{ item: 'potion_healing', weight: 2 }, { item: 'xp_bottle', weight: 2, count: W(1, 4) }] },
  citadel_storage: { rolls: W(1, 2), entries: [{ item: 'ember_wart', weight: 6, count: W(2, 7) }, { item: 'cinder_powder', weight: 3, count: W(1, 3) }] },
  citadel_treasure: { rolls: W(0, 1), entries: [{ item: 'potion_fire_resistance', weight: 3 }, { item: 'ember_wart', weight: 4, count: W(3, 8) }] },
  deep_silent_vault: { rolls: W(0, 2), entries: [{ item: 'potion_anchor', weight: 2 }, { item: 'potion_phase_sight', weight: 2 }, { item: 'xp_bottle', weight: 3, count: W(2, 6) }] },
  ana_vault: { rolls: W(0, 1), entries: [{ item: 'potion_phase_sight_long', weight: 2 }, { item: 'xp_bottle', weight: 2, count: W(1, 4) }] },
  library: { rolls: W(0, 1), entries: [{ item: 'xp_bottle', weight: 3, count: W(1, 3) }] },
  shipwreck_supply: { rolls: W(0, 1), entries: [{ item: 'potion_water_breathing', weight: 2 }] },
};
for (const [name, pool] of Object.entries(brews)) LOOT_TABLES[name]?.pools.push(pool);

// Husbandry: name tags and leads.
for (const [name, pool] of Object.entries({
  dungeon: { rolls: W(0, 1), entries: [{ item: 'name_tag', weight: 3 }, { item: 'lead', weight: 2 }] },
  hypermine: { rolls: W(0, 1), entries: [{ item: 'name_tag', weight: 2 }] },
  village_farm: { rolls: W(0, 1), entries: [{ item: 'lead', weight: 2 }, { item: 'wheat_seeds', weight: 4, count: W(2, 6) }] },
  witch_hut: { rolls: W(0, 1), entries: [{ item: 'name_tag', weight: 1 }] },
} as Record<string, LootTable['pools'][number]>)) LOOT_TABLES[name]?.pools.push(pool);

// Smithing templates and the Anchor Charm.
for (const [name, pool] of Object.entries({
  citadel_treasure: { rolls: W(0, 1), entries: [{ item: 'slag_upgrade_template', weight: 3 }, { item: 'citadel_armor_trim', weight: 2 }] },
  regent_caldera: { rolls: W(1, 1), entries: [{ item: 'slag_upgrade_template', weight: 3 }, { item: 'anchor_charm', weight: 2 }, { item: 'ember_armor_trim', weight: 1 }] },
  forge: { rolls: W(0, 1), entries: [{ item: 'ember_armor_trim', weight: 2 }, { item: 'slag_upgrade_template', weight: 1 }] },
  ziggurat: { rolls: W(0, 1), entries: [{ item: 'ember_armor_trim', weight: 2 }] },
  ana_vault: { rolls: W(0, 1), entries: [{ item: 'ana_armor_trim', weight: 3 }, { item: 'kata_armor_trim', weight: 3 }] },
  deep_silent_vault: { rolls: W(0, 1), entries: [{ item: 'vault_armor_trim', weight: 3 }, { item: 'anchor_charm', weight: 1 }] },
  tesseract_temple: { rolls: W(0, 1), entries: [{ item: 'tesseract_armor_trim', weight: 3 }, { item: 'hyperline_armor_trim', weight: 1 }] },
  sunken_monument: { rolls: W(0, 1), entries: [{ item: 'reef_armor_trim', weight: 3 }] },
  shipwreck_treasure: { rolls: W(0, 1), entries: [{ item: 'reef_armor_trim', weight: 2 }] },
  dungeon: { rolls: W(0, 1), entries: [{ item: 'kata_armor_trim', weight: 1 }, { item: 'shield', weight: 2 }] },
} as Record<string, LootTable['pools'][number]>)) LOOT_TABLES[name]?.pools.push(pool);
