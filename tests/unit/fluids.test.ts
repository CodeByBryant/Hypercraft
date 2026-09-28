import { describe, expect, it } from 'vitest';
import { B, makeVoxel, voxelId, voxelMeta } from '../../src/content/registry';
import { FluidSim } from '../../src/world/fluids/Fluids';
import { makeWorld, type Fill } from './helpers';

const flat = (_x: number, y: number) => (y < 40 ? B.stone : B.air);

function setup(fill: Fill = flat) {
  const world = makeWorld(fill);
  const fluids = new FluidSim(world);
  world.onBlockChange((x, y, z, w, o, n) => fluids.onBlockChanged(x, y, z, w, o, n));
  const run = (ticks: number) => {
    for (let i = 0; i < ticks; i++) fluids.tick();
  };
  return { world, fluids, run };
}

describe('4D fluids', () => {
  it('water spreads along X, Z and W with increasing level', () => {
    const { world, run } = setup();
    world.setBlock(8, 40, 8, 8, B.water);
    run(5 * 12);
    const lvl = (x: number, z: number, w: number) => {
      const v = world.getBlock(x, 40, z, w);
      return voxelId(v) === B.water ? voxelMeta(v) : -1;
    };
    expect(lvl(8, 8, 8)).toBe(0);
    expect(lvl(11, 8, 8)).toBe(3); // +X
    expect(lvl(8, 5, 8)).toBe(3); // -Z
    expect(lvl(8, 8, 11)).toBe(3); // +W
    expect(lvl(8, 8, 5)).toBe(3); // -W
    expect(lvl(9, 8, 9)).toBe(2); // diagonal in XW = Manhattan distance
    expect(lvl(15, 8, 8)).toBe(7);
    expect(lvl(8, 8, 1)).toBe(7);
    expect(lvl(8, 8, 0)).toBe(-1); // range 7
  });

  it('water falls straight down before spreading', () => {
    const pillar = (x: number, y: number, z: number, w: number) => (y < 40 || (x === 8 && z === 8 && w === 8 && y < 45) ? B.stone : B.air);
    const { world, run } = setup(pillar);
    world.setBlock(8, 45, 8, 8, B.water);
    run(5 * 20);
    // Spreads on top of the pillar (level 1) then falls beside it all the way down.
    expect(voxelId(world.getBlock(9, 45, 8, 8))).toBe(B.water);
    expect(voxelId(world.getBlock(9, 42, 8, 8))).toBe(B.water);
    expect(voxelMeta(world.getBlock(9, 42, 8, 8))).toBe(8); // falling
    expect(voxelId(world.getBlock(9, 40, 8, 8))).toBe(B.water);
  });

  it('flow dries up when the source is removed', () => {
    const { world, run } = setup();
    world.setBlock(8, 40, 8, 8, B.water);
    run(5 * 12);
    expect(voxelId(world.getBlock(10, 40, 8, 8))).toBe(B.water);
    world.setBlock(8, 40, 8, 8, B.air);
    run(5 * 20);
    let water = 0;
    for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) for (let w = 0; w < 16; w++) if (voxelId(world.getBlock(x, 40, z, w)) === B.water) water++;
    expect(water).toBe(0);
  });

  it('water touching lava makes obsidian (source) or cobblestone (flow)', () => {
    const { world, run } = setup();
    world.setBlock(8, 40, 8, 8, B.lava);
    world.setBlock(8, 40, 8, 10, makeVoxel(B.lava, 1));
    run(1);
    world.setBlock(8, 40, 8, 9, B.water);
    run(40);
    expect(world.getBlock(8, 40, 8, 8)).toBe(B.obsidian);
    expect(world.getBlock(8, 40, 8, 10)).toBe(B.cobblestone);
  });

  it('two adjacent sources refill the gap (infinite water)', () => {
    const { world, run } = setup();
    world.setBlock(8, 40, 8, 8, B.water);
    world.setBlock(8, 40, 8, 10, B.water);
    run(5 * 6);
    expect(world.getBlock(8, 40, 8, 9)).toBe(B.water); // meta 0 = source
  });
});
