// Phase 7 stations: enchanting table, anvil, grindstone, brewing stand, smithing table. Each
// opens a screen (InventoryScreen); none stores items (inputs go back to you when you close it),
// except the brewing stand, which brews on its own like a furnace.

import type { BlockDef, ShapeDef, TextureDef } from './types';

export const STATION_TEXTURES: TextureDef[] = [
  { name: 'enchanting_table_top', pattern: 'quilt', colors: ['#a8202a', '#7a1420', '#e8d8b0'] },
  { name: 'enchanting_table_side', pattern: 'speckle', colors: ['#16121e', '#0e0b14', '#5a3aa8'], density: 0.08 },
  { name: 'enchanting_table_bottom', pattern: 'noise', colors: ['#16121e', '#0e0b14'], amount: 0.08 },
  { name: 'anvil', pattern: 'metal', colors: ['#4a4a50', '#36363c', '#6a6a72'] },
  { name: 'grindstone_wheel', pattern: 'noise', colors: ['#8a8a86', '#767672'], amount: 0.12 },
  { name: 'brewing_stand', pattern: 'metal', colors: ['#6a6460', '#4a4440', '#e8c060'] },
  { name: 'smithing_table_top', pattern: 'metal', colors: ['#3a3a42', '#2a2a30', '#5a5a66'] },
  { name: 'smithing_table_side', pattern: 'planks', colors: ['#5a3a2a', '#4a3020', '#2a1a10'], amount: 0.06 },
  { name: 'frosted_ice', pattern: 'cracks', colors: ['#b8d8ff', '#8ab0e8', '#e8f4ff'], alpha: 0.6 },
];

export const STATION_SHAPES: ShapeDef[] = [
  { name: 'enchanting_table', kind: 'boxes', boxes: [[[0, 0, 0, 0], [1, 0.75, 1, 1]]], collision: 'shape' },
  {
    // A wide top on a waist on a foot: an anvil is an anvil in any number of dimensions.
    name: 'anvil',
    kind: 'boxes',
    boxes: [
      [[0.125, 0, 0.125, 0.125], [0.875, 0.25, 0.875, 0.875]],
      [[0.3125, 0.25, 0.3125, 0.3125], [0.6875, 0.625, 0.6875, 0.6875]],
      [[0, 0.625, 0.1875, 0.1875], [1, 1, 0.8125, 0.8125]],
    ],
    collision: 'shape',
  },
  {
    name: 'grindstone',
    kind: 'boxes',
    boxes: [
      [[0.25, 0.25, 0.125, 0.125], [0.75, 0.875, 0.875, 0.875]],
      [[0.0625, 0, 0.375, 0.375], [0.25, 0.625, 0.625, 0.625]],
      [[0.75, 0, 0.375, 0.375], [0.9375, 0.625, 0.625, 0.625]],
    ],
    collision: 'shape',
  },
  {
    name: 'brewing_stand',
    kind: 'boxes',
    boxes: [
      [[0.0625, 0, 0.0625, 0.0625], [0.9375, 0.125, 0.9375, 0.9375]],
      [[0.4375, 0.125, 0.4375, 0.4375], [0.5625, 0.875, 0.5625, 0.5625]],
      [[0.125, 0.125, 0.375, 0.375], [0.3125, 0.5, 0.625, 0.625]],
      [[0.6875, 0.125, 0.375, 0.375], [0.875, 0.5, 0.625, 0.625]],
      [[0.375, 0.125, 0.125, 0.6875], [0.625, 0.5, 0.3125, 0.875]],
    ],
    collision: 'shape',
  },
];

export const STATION_BLOCKS: BlockDef[] = [
  { name: 'enchanting_table', render: 'opaque', solid: true, shape: 'enchanting_table', opaque: false, textures: { top: 'enchanting_table_top', bottom: 'enchanting_table_bottom', side: 'enchanting_table_side' }, emission: 7, hardness: 5, tags: ['station'] },
  { name: 'anvil', render: 'opaque', solid: true, shape: 'anvil', opaque: false, textures: { all: 'anvil' }, hardness: 5, tags: ['station'] },
  { name: 'grindstone', render: 'opaque', solid: true, shape: 'grindstone', opaque: false, textures: { all: 'grindstone_wheel', side: 'grindstone_wheel' }, hardness: 2, tags: ['station'] },
  { name: 'brewing_stand', render: 'opaque', solid: true, shape: 'brewing_stand', opaque: false, textures: { all: 'brewing_stand' }, emission: 1, hardness: 0.5, tags: ['station'] },
  { name: 'smithing_table', render: 'opaque', solid: true, textures: { top: 'smithing_table_top', bottom: 'smithing_table_side', side: 'smithing_table_side' }, hardness: 2.5, tags: ['station'] },
  // Frost Walker's ice: melts back into water after a few seconds (no item).
  { name: 'frosted_ice', render: 'translucent', solid: true, textures: { all: 'frosted_ice' }, tint: '#b8d8ff', alpha: 0.6, lightOpacity: 2, hardness: 0.5 },
];
