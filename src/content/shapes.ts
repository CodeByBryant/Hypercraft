import type { ShapeDef } from './types';

// Sub-voxel shapes. Boxes are authored for the canonical orientation (facing +X / bottom)
// and expanded into variants by the registry. The ray marcher tests these analytically
// inside the 4D cell, so a slab really is half a tesseract and its cross-section is the
// true half-polytope in any slice orientation.
export const SHAPES: ShapeDef[] = [
  { name: 'full', kind: 'boxes', boxes: [[[0, 0, 0, 0], [1, 1, 1, 1]]], collision: 'full' },
  {
    name: 'slab',
    kind: 'boxes',
    boxes: [[[0, 0, 0, 0], [1, 0.5, 1, 1]]],
    variants: 'vertical2',
    collision: 'shape',
  },
  {
    name: 'stairs',
    kind: 'boxes',
    boxes: [
      [[0, 0, 0, 0], [1, 0.5, 1, 1]],
      [[0.5, 0.5, 0, 0], [1, 1, 1, 1]],
    ],
    variants: 'horizontal6',
    collision: 'shape',
  },
  {
    // Thin panel against the wall on the facing side.
    name: 'ladder',
    kind: 'boxes',
    boxes: [[[0.8125, 0, 0, 0], [1, 1, 1, 1]]],
    variants: 'horizontal6',
    collision: 'shape',
  },
  {
    name: 'torch',
    kind: 'boxes',
    boxes: [[[0.4375, 0, 0.4375, 0.4375], [0.5625, 0.625, 0.5625, 0.5625]]],
    collision: 'none',
  },
  {
    name: 'post',
    kind: 'boxes',
    boxes: [[[0.375, 0, 0.375, 0.375], [0.625, 1, 0.625, 0.625]]],
    collision: 'shape',
  },
  {
    // Chests are a little smaller than a full cell in every horizontal axis (x, z and w).
    name: 'chest',
    kind: 'boxes',
    boxes: [[[0.0625, 0, 0.0625, 0.0625], [0.9375, 0.875, 0.9375, 0.9375]]],
    collision: 'shape',
  },
  { name: 'plant', kind: 'plant', collision: 'none' },
  { name: 'fluid', kind: 'fluid', collision: 'none' },
];
