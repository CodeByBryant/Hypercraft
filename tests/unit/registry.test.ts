import { describe, expect, it } from 'vitest';
import {
  ALL_BLOCKS,
  ALL_TEXTURES,
  B,
  REG,
  Registry,
  makeVoxel,
  voxelId,
  voxelMeta,
  RENDER_OPAQUE,
  RENDER_FLUID,
  COLLISION_FULL,
  COLLISION_NONE,
  COLLISION_SHAPE,
} from '../../src/content/registry';
import { TREES } from '../../src/content/trees';
import { SHAPES } from '../../src/content/shapes';
import { TEXTURES } from '../../src/content/textures';
import { BIOMES } from '../../src/content/biomes';
import { REALMS } from '../../src/content/realms';
import { buildAtlas, generateTexture } from '../../src/content/textureGen';

describe('content registry', () => {
  it('compiles the shipped content', () => {
    expect(REG.count).toBe(ALL_BLOCKS.length);
    expect(REG.count).toBeGreaterThan(150);
    expect(B.air).toBe(0);
    expect(REG.render[B.stone]).toBe(RENDER_OPAQUE);
    expect(REG.opaque[B.stone]).toBe(1);
    expect(REG.opaque[B.glass]).toBe(0);
    expect(REG.render[B.water]).toBe(RENDER_FLUID);
    expect(REG.emission[B.lava]).toBe(15);
    expect(REG.collision[B.stone]).toBe(COLLISION_FULL);
    expect(REG.collision[B.stone_slab]).toBe(COLLISION_SHAPE);
    expect(REG.collision[B.torch]).toBe(COLLISION_NONE);
    expect(REG.lightOpacity[B.stone]).toBe(15);
  });

  it('packs voxels as id + meta nibble', () => {
    const v = makeVoxel(B.stone_stairs, 5);
    expect(voxelId(v)).toBe(B.stone_stairs);
    expect(voxelMeta(v)).toBe(5);
    expect(v).toBeLessThan(65536);
  });

  it('expands orientation variants of shapes', () => {
    // slab: bottom vs top
    const bottom = REG.shapes[REG.shapeIndex(makeVoxel(B.stone_slab, 0))]!;
    const top = REG.shapes[REG.shapeIndex(makeVoxel(B.stone_slab, 1))]!;
    expect(Array.from(bottom.boxes.slice(0, 8))).toEqual([0, 0, 0, 0, 1, 0.5, 1, 1]);
    expect(Array.from(top.boxes.slice(0, 8))).toEqual([0, 0.5, 0, 0, 1, 1, 1, 1]);
    // ladder facing +X hugs x=1; facing -W hugs w=0
    const lpx = REG.shapes[REG.shapeIndex(makeVoxel(B.ladder, 0))]!;
    const lmw = REG.shapes[REG.shapeIndex(makeVoxel(B.ladder, 5))]!;
    expect(lpx.boxes[0]).toBeCloseTo(0.8125);
    expect(lpx.boxes[4]).toBe(1);
    expect(lmw.boxes[3]).toBe(0); // min w
    expect(lmw.boxes[7]).toBeCloseTo(0.1875); // max w
    expect(lmw.boxes[4]).toBe(1); // x spans the whole cell
  });

  it('builds GPU tables', () => {
    const info = REG.gpuBlockInfo();
    expect(info[B.stone * 4]! & 7).toBe(RENDER_OPAQUE);
    expect((info[B.lava * 4]! >>> 15) & 15).toBe(15);
    expect((info[B.stone * 4]! >>> 23) & 1).toBe(1);
    const shapes = REG.gpuShapeTable();
    expect(shapes.length).toBe(REG.shapes.length * 16 * 4);
    expect(shapes[0]).toBe(0); // full cube: kind boxes
    expect(shapes[1]).toBe(1); // one box
  });

  it('reports content errors clearly', () => {
    const bad = [...ALL_BLOCKS, { name: 'stone', render: 'opaque' as const, solid: true, textures: { all: 'nope' } }];
    expect(() => new Registry(bad, SHAPES, ALL_TEXTURES, BIOMES, REALMS, TREES)).toThrow(/duplicate block "stone"[\s\S]*unknown texture "nope"/);
    const noAir = ALL_BLOCKS.slice(1);
    expect(() => new Registry(noAir, SHAPES, ALL_TEXTURES, BIOMES, REALMS, TREES)).toThrow(/air/);
    const badBiome = [{ ...BIOMES[0]!, name: 'x', trees: [{ tree: 'nonexistent', density: 1 }] }];
    expect(() => new Registry(ALL_BLOCKS, SHAPES, ALL_TEXTURES, badBiome, REALMS, TREES)).toThrow(/unknown tree "nonexistent"/);
  });

  it('gives every biome at least 3 unique blocks and 2 unique plants', () => {
    // Blocks a biome references (surface layers, stone, ceiling, tree logs/leaves, plants),
    // counted as unique when no other biome references them.
    const blocksOf = new Map<string, Set<string>>();
    const plantsOf = new Map<string, Set<string>>();
    const use = (m: Map<string, Set<string>>, block: string, biome: string) => {
      if (!m.has(block)) m.set(block, new Set());
      m.get(block)!.add(biome);
    };
    for (const b of REG.biomes) {
      for (const n of [b.surface, b.subsurface, b.underwater, b.stone, b.ceiling]) if (n) use(blocksOf, n, b.name);
      for (const t of b.trees) {
        const d = REG.tree(t.tree);
        use(blocksOf, d.log, b.name);
        if (d.leaves) use(blocksOf, d.leaves, b.name);
      }
      for (const p of b.plants) {
        use(blocksOf, p.block, b.name);
        use(plantsOf, p.block, b.name);
      }
    }
    const short: string[] = [];
    for (const b of REG.biomes) {
      const ub = [...blocksOf].filter(([, s]) => s.size === 1 && s.has(b.name)).length;
      const up = [...plantsOf].filter(([, s]) => s.size === 1 && s.has(b.name)).length;
      if (ub < 3 || up < 2) short.push(`${b.name}: ${ub} blocks, ${up} plants`);
    }
    expect(short).toEqual([]);
  });

  it('generates deterministic textures and an atlas', () => {
    const a = generateTexture(TEXTURES[0]!, 0);
    const b = generateTexture(TEXTURES[0]!, 0);
    expect(a).toEqual(b);
    const atlas = buildAtlas(TEXTURES);
    expect(atlas.width).toBe(1024);
    expect(atlas.height % 64).toBe(0);
    expect(atlas.data.length).toBe(atlas.width * atlas.height * 4);
    // leaves have holes, glass is mostly transparent
    const leaves = generateTexture(TEXTURES.find((t) => t.name === 'leaves')!, 3);
    let holes = 0;
    for (let i = 3; i < leaves.length; i += 4) if (leaves[i] === 0) holes++;
    expect(holes).toBeGreaterThan(200);
  });
});
