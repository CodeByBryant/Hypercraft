// Phase 3 blocks: crafting stations, storage, extra planks and storage blocks.

import type { BlockDef, Hex, TextureDef } from './types';

export const FUNCTIONAL_TEXTURES: TextureDef[] = [
  { name: 'crafting_table_top', pattern: 'table_top', colors: ['#a8864f', '#947445', '#5a4428'] },
  { name: 'crafting_table_side', pattern: 'planks', colors: ['#9a7a48', '#86683c', '#5a4428'], amount: 0.06 },
  { name: 'furnace_top', pattern: 'noise', colors: ['#7a7a7a', '#686868'], amount: 0.1 },
  { name: 'furnace_front', pattern: 'furnace', colors: ['#7f7f7f', '#5f5f5f'] },
  { name: 'furnace_front_lit', pattern: 'furnace', colors: ['#7f7f7f', '#5f5f5f', '#ffb13a'] },
  { name: 'blast_furnace_front', pattern: 'furnace', colors: ['#6d6d74', '#4d4d55'] },
  { name: 'blast_furnace_front_lit', pattern: 'furnace', colors: ['#6d6d74', '#4d4d55', '#ff8a2a'] },
  { name: 'smoker_front', pattern: 'furnace', colors: ['#6b5a44', '#4f4232'] },
  { name: 'smoker_front_lit', pattern: 'furnace', colors: ['#6b5a44', '#4f4232', '#ffc85a'] },
  { name: 'chest_side', pattern: 'chest', colors: ['#a8783a', '#8a602c', '#d8d8d0'] },
  { name: 'chest_top', pattern: 'planks', colors: ['#a8783a', '#96692f', '#6f4a20'], amount: 0.05 },
  { name: 'birch_planks', pattern: 'planks', colors: ['#d8c68f', '#c9b67e', '#a8955f'], amount: 0.05 },
  { name: 'spruce_planks', pattern: 'planks', colors: ['#735335', '#65482d', '#4a3420'], amount: 0.06 },
  { name: 'acacia_planks', pattern: 'planks', colors: ['#b85e33', '#a3522c', '#7f3f20'], amount: 0.06 },
];

export const FUNCTIONAL_BLOCKS: BlockDef[] = [
  { name: 'crafting_table', render: 'opaque', solid: true, textures: { top: 'crafting_table_top', side: 'crafting_table_side', bottom: 'planks' }, hardness: 2.5, tags: ['station'] },
  { name: 'furnace', render: 'opaque', solid: true, textures: { top: 'furnace_top', bottom: 'furnace_top', side: 'furnace_front' }, hardness: 3.5, tags: ['station', 'furnace'] },
  { name: 'lit_furnace', displayName: 'Furnace', render: 'opaque', solid: true, textures: { top: 'furnace_top', bottom: 'furnace_top', side: 'furnace_front_lit' }, emission: 13, hardness: 3.5, tags: ['station', 'furnace'] },
  { name: 'blast_furnace', render: 'opaque', solid: true, textures: { top: 'furnace_top', bottom: 'furnace_top', side: 'blast_furnace_front' }, hardness: 3.5, tags: ['station', 'furnace'] },
  { name: 'lit_blast_furnace', displayName: 'Blast Furnace', render: 'opaque', solid: true, textures: { top: 'furnace_top', bottom: 'furnace_top', side: 'blast_furnace_front_lit' }, emission: 13, hardness: 3.5, tags: ['station', 'furnace'] },
  { name: 'smoker', render: 'opaque', solid: true, textures: { top: 'furnace_top', bottom: 'furnace_top', side: 'smoker_front' }, hardness: 3.5, tags: ['station', 'furnace'] },
  { name: 'lit_smoker', displayName: 'Smoker', render: 'opaque', solid: true, textures: { top: 'furnace_top', bottom: 'furnace_top', side: 'smoker_front_lit' }, emission: 13, hardness: 3.5, tags: ['station', 'furnace'] },
  { name: 'chest', render: 'opaque', solid: true, shape: 'chest', opaque: false, textures: { top: 'chest_top', bottom: 'chest_top', side: 'chest_side' }, hardness: 2.5, tags: ['container'] },
  { name: 'birch_planks', render: 'opaque', solid: true, textures: { all: 'birch_planks' }, hardness: 2, tags: ['planks'] },
  { name: 'spruce_planks', render: 'opaque', solid: true, textures: { all: 'spruce_planks' }, hardness: 2, tags: ['planks'] },
  { name: 'acacia_planks', render: 'opaque', solid: true, textures: { all: 'acacia_planks' }, hardness: 2, tags: ['planks'] },
];

// Storage blocks (9 ingots/gems <-> 1 block).
for (const [n, c, shade, hi] of [
  ['coal_block', '#252525', '#141414', '#3a3a3a'],
  ['copper_block', '#c8714a', '#9a5436', '#e89a74'],
  ['iron_block', '#d8d8d8', '#a8a8a8', '#f4f4f4'],
  ['gold_block', '#f4d03f', '#c9a227', '#fff08a'],
  ['azurite_block', '#2f5fe0', '#1f45b0', '#6e9bff'],
  ['verdant_block', '#2fd870', '#1fa850', '#8affb8'],
  ['hyperite_block', '#5ff4ff', '#2fc4d8', '#c8fcff'],
] as [string, Hex, Hex, Hex][]) {
  FUNCTIONAL_TEXTURES.push({ name: n, pattern: 'metal', colors: [c, shade, hi] });
  FUNCTIONAL_BLOCKS.push({ name: n, render: 'opaque', solid: true, textures: { all: n }, hardness: 5, emission: n === 'hyperite_block' ? 6 : 0, tags: ['storage'] });
}
