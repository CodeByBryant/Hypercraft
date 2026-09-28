import type { TreeDef } from './types';

// Tree and large-plant archetypes. Shapes are 4D-native: canopies are balls/cones/ellipsoids in
// the three horizontal axes (x, z, w), so every slice shows a different cross-section.
export const TREES: TreeDef[] = [
  { name: 'oak', shape: 'ball', log: 'log', leaves: 'leaves', height: [4, 6], radius: [2.2, 2.9] },
  { name: 'big_oak', shape: 'ball', log: 'log', leaves: 'leaves', height: [6, 8], radius: [3.0, 3.6] },
  { name: 'apple', shape: 'ball', log: 'log', leaves: 'apple_leaves', height: [4, 5], radius: [2.2, 2.6] },
  { name: 'birch', shape: 'birch', log: 'birch_log', leaves: 'birch_leaves', height: [5, 7], radius: [1.8, 2.2] },
  { name: 'spruce', shape: 'cone', log: 'spruce_log', leaves: 'spruce_leaves', height: [7, 11], radius: [2.4, 3.2] },
  { name: 'frost_spruce', shape: 'cone', log: 'spruce_log', leaves: 'frosted_spruce_leaves', height: [6, 10], radius: [2.2, 3.0] },
  { name: 'acacia', shape: 'acacia', log: 'acacia_log', leaves: 'acacia_leaves', height: [4, 6], radius: [2.6, 3.4] },
  { name: 'cherry', shape: 'wide', log: 'cherry_log', leaves: 'cherry_leaves', height: [4, 6], radius: [2.8, 3.6] },
  { name: 'azalea', shape: 'ball', log: 'log', leaves: 'azalea_leaves', height: [2, 3], radius: [1.6, 2.1] },
  { name: 'bamboo', shape: 'bamboo', log: 'bamboo_block', leaves: 'leaves', height: [6, 14], radius: [0, 0] },
  { name: 'red_giant_mushroom', shape: 'mushroom', log: 'mushroom_stem', leaves: 'red_mushroom_cap', height: [4, 7], radius: [2.4, 3.2] },
  { name: 'brown_giant_mushroom', shape: 'mushroom', log: 'mushroom_stem', leaves: 'brown_mushroom_cap', height: [4, 6], radius: [2.8, 3.6] },
  { name: 'dead_tree', shape: 'dead', log: 'dead_log', height: [3, 5], radius: [0, 0] },
  { name: 'cactus', shape: 'cactus', log: 'cactus', height: [2, 4], radius: [0, 0] },
  { name: 'kelp', shape: 'kelp', log: 'kelp', height: [4, 20], radius: [0, 0] },
  { name: 'frost_kelp', shape: 'kelp', log: 'frost_kelp', height: [3, 12], radius: [0, 0] },
];
