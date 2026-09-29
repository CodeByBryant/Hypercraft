// Phase 5 blocks: building materials for structures (villages, dungeons, temples, ruins),
// decoration (lanterns, bookshelves, fences, hay) and the mob spawner.

import type { BlockDef, Hex, TextureDef } from './types';

export const STRUCTURE_TEXTURES: TextureDef[] = [
  { name: 'stone_bricks', pattern: 'bricks', colors: ['#8c8c8c', '#808080', '#5c5c5c'] },
  { name: 'mossy_stone_bricks', pattern: 'bricks', colors: ['#7c8c68', '#6c7c5a', '#4c5a42'] },
  { name: 'cracked_stone_bricks', pattern: 'bricks', colors: ['#848484', '#6c6c6c', '#343434'] },
  { name: 'chiseled_stone_bricks', pattern: 'metal', colors: ['#8e8e8e', '#5e5e5e', '#a8a8a8'] },
  { name: 'thatch', pattern: 'thatch', colors: ['#caa44c', '#a98a3a', '#6a5020'] },
  { name: 'plaster', pattern: 'noise', colors: ['#e8e0cc', '#d6ccb4'], amount: 0.04 },
  { name: 'dirt_path', pattern: 'noise', colors: ['#9c7c4a', '#86683c'], amount: 0.1 },
  { name: 'hay_bale', pattern: 'thatch', colors: ['#d8b848', '#b89a38', '#8a6a1a'] },
  { name: 'bookshelf', pattern: 'shelf', colors: ['#9a7a48', '#5a4428', '#a83030', '#3050a8', '#2f8a4a', '#c8a040', '#6a3a8a'] },
  { name: 'lantern', pattern: 'glow', colors: ['#ffcf6a', '#ff9a3a', '#fff2c0'] },
  { name: 'mob_spawner', pattern: 'cage', colors: ['#2a2e3a', '#10121a'] },
  { name: 'sea_bricks', pattern: 'bricks', colors: ['#4aa89a', '#3a8a80', '#24605a'] },
  { name: 'sea_lantern', pattern: 'glow', colors: ['#c8fff4', '#8ae8d8', '#ffffff'] },
  { name: 'tesseract_bricks', pattern: 'bricks', colors: ['#6a4ab8', '#5a3aa0', '#d0b0ff'] },
  { name: 'campfire', pattern: 'glow', colors: ['#ff8a2a', '#ff5a1a', '#ffe08a'] },
  { name: 'red_wool', pattern: 'noise', colors: ['#b03030', '#962828'], amount: 0.05 },
  { name: 'blue_wool', pattern: 'noise', colors: ['#3a4ab0', '#2e3c96'], amount: 0.05 },
  { name: 'gilded_bricks', pattern: 'bricks', colors: ['#e8c048', '#c8a030', '#8a6a1a'] },
];

/** Beds (sleep through the night, set your respawn point): colour, stitch shade. */
export const BED_COLORS: [string, Hex, Hex][] = [
  ['red_bed', '#b83232', '#8e2424'],
  ['blue_bed', '#3a4ec0', '#2a3a96'],
  ['white_bed', '#e8e8e2', '#c8c8c0'],
];
for (const [name, c0, c1] of BED_COLORS) {
  STRUCTURE_TEXTURES.push({ name: `${name}_top`, pattern: 'quilt', colors: [c0, c1, '#f4f4f0'] });
  STRUCTURE_TEXTURES.push({ name: `${name}_side`, pattern: 'bed_side', colors: [c0, c1, '#8a6a3c'] });
}

export const STRUCTURE_BLOCKS: BlockDef[] = [
  { name: 'stone_bricks', render: 'opaque', solid: true, textures: { all: 'stone_bricks' }, hardness: 3, tags: ['stone_bricks'] },
  { name: 'mossy_stone_bricks', render: 'opaque', solid: true, textures: { all: 'mossy_stone_bricks' }, hardness: 3, tags: ['stone_bricks'] },
  { name: 'cracked_stone_bricks', render: 'opaque', solid: true, textures: { all: 'cracked_stone_bricks' }, hardness: 3, tags: ['stone_bricks'] },
  { name: 'chiseled_stone_bricks', render: 'opaque', solid: true, textures: { all: 'chiseled_stone_bricks' }, hardness: 3, tags: ['stone_bricks'] },
  { name: 'thatch', render: 'opaque', solid: true, textures: { all: 'thatch' }, hardness: 0.8 },
  { name: 'plaster', render: 'opaque', solid: true, textures: { all: 'plaster' }, hardness: 1.5 },
  { name: 'dirt_path', displayName: 'Dirt Path', render: 'opaque', solid: true, shape: 'path', opaque: false, textures: { top: 'dirt_path', side: 'dirt', bottom: 'dirt' }, hardness: 0.6 },
  { name: 'hay_bale', render: 'opaque', solid: true, textures: { all: 'hay_bale' }, hardness: 0.6 },
  { name: 'bookshelf', render: 'opaque', solid: true, textures: { top: 'planks', bottom: 'planks', side: 'bookshelf' }, hardness: 1.5 },
  { name: 'lantern', render: 'opaque', solid: true, shape: 'lantern', opaque: false, textures: { all: 'lantern' }, emission: 15, hardness: 1 },
  { name: 'oak_fence', displayName: 'Fence', render: 'opaque', solid: true, shape: 'post', opaque: false, textures: { all: 'planks' }, hardness: 2 },
  { name: 'mob_spawner', displayName: 'Mob Spawner', render: 'cutout', solid: true, opaque: false, textures: { all: 'mob_spawner' }, emission: 3, hardness: 5 },
  { name: 'sea_bricks', render: 'opaque', solid: true, textures: { all: 'sea_bricks' }, hardness: 3 },
  { name: 'sea_lantern', render: 'opaque', solid: true, textures: { all: 'sea_lantern' }, emission: 15, hardness: 0.3 },
  { name: 'tesseract_bricks', render: 'opaque', solid: true, textures: { all: 'tesseract_bricks' }, emission: 6, hardness: 4 },
  { name: 'campfire', render: 'opaque', solid: true, shape: 'campfire', opaque: false, textures: { all: 'campfire' }, emission: 14, damage: 1, hardness: 2 },
  { name: 'red_wool', render: 'opaque', solid: true, textures: { all: 'red_wool' }, hardness: 0.8, tags: ['wool'] },
  { name: 'blue_wool', render: 'opaque', solid: true, textures: { all: 'blue_wool' }, hardness: 0.8, tags: ['wool'] },
  { name: 'gilded_bricks', render: 'opaque', solid: true, textures: { all: 'gilded_bricks' }, hardness: 3 },
];
for (const [name] of BED_COLORS)
  STRUCTURE_BLOCKS.push({ name, render: 'opaque', solid: true, shape: 'bed', opaque: false, textures: { top: `${name}_top`, side: `${name}_side`, bottom: 'planks' }, hardness: 0.3, tags: ['bed'] });
