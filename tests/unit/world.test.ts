import { describe, expect, it } from 'vitest';
import { B, makeVoxel } from '../../src/content/registry';
import { makeRayHit, raycast } from '../../src/world/raycast';
import { VOID_VOXEL, columnKey } from '../../src/world/constants';
import { Chunk } from '../../src/world/Chunk';
import { makeColumn, makeWorld } from './helpers';

const flat = (_x: number, y: number) => (y < 40 ? B.stone : B.air);

describe('4D picking', () => {
  it('hits the top facet looking down', () => {
    const world = makeWorld(flat);
    const hit = makeRayHit();
    expect(raycast(world, [8.5, 42, 8.5, 8.5], [0, -1, 0, 0], 6, hit)).toBe(true);
    expect([hit.x, hit.y, hit.z, hit.w]).toEqual([8, 39, 8, 8]);
    expect(hit.axis).toBe(1);
    expect(hit.sign).toBe(1);
    expect(hit.t).toBeCloseTo(2, 9);
  });

  it('hits a W facet when the ray travels along W (tilted slice)', () => {
    const wall = (_x: number, y: number, _z: number, w: number) => (y < 40 || w >= 12 ? B.stone : B.air);
    const world = makeWorld(wall);
    const hit = makeRayHit();
    const s = Math.SQRT1_2;
    expect(raycast(world, [8.5, 42.5, 8.5, 8.5], [0, 0, s, s], 10, hit)).toBe(true);
    expect(hit.w).toBe(12);
    expect(hit.axis).toBe(3);
    expect(hit.sign).toBe(-1);
    expect(hit.p[3]).toBeCloseTo(12, 9);
    expect(hit.p[2]).toBeCloseTo(12, 9);
  });

  it('tests sub-voxel shapes analytically (slab)', () => {
    const slab = makeVoxel(B.stone_slab, 0);
    const world = makeWorld((x, y) => (y < 40 ? B.stone : y === 40 && x === 10 ? slab : B.air));
    const hit = makeRayHit();
    // Straight down onto the slab top at y = 40.5.
    expect(raycast(world, [10.5, 43, 8.5, 8.5], [0, -1, 0, 0], 6, hit)).toBe(true);
    expect(hit.x).toBe(10);
    expect(hit.y).toBe(40);
    expect(hit.p[1]).toBeCloseTo(40.5, 9);
    expect(hit.bmax[1]).toBe(0.5);
    // A ray passing over the slab's empty upper half continues to the ground behind it.
    const hit2 = makeRayHit();
    expect(raycast(world, [8.5, 40.75, 8.5, 8.5], [1, 0, 0, 0], 6, hit2)).toBe(false);
  });
});

describe('world window & storage', () => {
  it('returns VOID for unloaded space and below the world', () => {
    const world = makeWorld(flat);
    expect(world.getBlock(8, -1, 8, 8)).toBe(VOID_VOXEL);
    expect(world.getBlock(100, 40, 8, 8)).toBe(VOID_VOXEL);
    expect(world.getBlock(8, 500, 8, 8)).toBe(0);
    expect(world.getBlock(8, 39, 8, 8)).toBe(B.stone);
  });

  it('materialises uniform bricks on edit and keeps the heightmap', () => {
    const world = makeWorld(flat);
    const col = world.column(0, 0, 0)!;
    const ch = col.chunks[3]!; // y 48..63, all air -> uniform
    expect(ch.uniformBlock()).toBe(0);
    world.setBlock(5, 50, 5, 5, B.stone);
    expect(ch.uniformBlock()).toBe(-1);
    expect(world.getBlock(5, 50, 5, 5)).toBe(B.stone);
    expect(world.skyHeight(5, 5, 5)).toBe(51);
    world.setBlock(5, 50, 5, 5, B.air);
    expect(world.skyHeight(5, 5, 5)).toBe(40);
    expect(ch.bSlots).toBe(1);
  });

  it('moving the window drops columns outside and retains edited ones', () => {
    const world = makeWorld(flat, [[0, 0, 0], [1, 0, 0]]);
    world.setBlock(20, 45, 3, 3, B.glass); // edits column (1,0,0)
    const removed = world.moveWindow(-10, -2, -2); // x window [-10, -6]
    expect(removed.length).toBe(2);
    expect(world.columns.size).toBe(0);
    expect(world.retained.has(columnKey(1, 0, 0))).toBe(true);
    expect(world.retained.has(columnKey(0, 0, 0))).toBe(false);
    world.moveWindow(-2, -2, -2);
    const back = world.takeRetained(1, 0, 0)!;
    world.addColumn(back);
    expect(world.getBlock(20, 45, 3, 3)).toBe(B.glass);
  });

  it('chunk storage round-trips every voxel under random edits', () => {
    const ch = Chunk.uniform(B.stone, 0);
    const ref = new Uint16Array(65536).fill(B.stone);
    let s = 12345;
    for (let i = 0; i < 20000; i++) {
      s = (s * 1103515245 + 12345) >>> 0;
      const idx = s & 65535;
      const v = (s >>> 16) & 7;
      const x = idx & 15, y = (idx >> 4) & 15, z = (idx >> 8) & 15, w = (idx >> 12) & 15;
      ch.setBlock(x, y, z, w, v);
      ref[idx] = v;
    }
    for (let idx = 0; idx < 65536; idx++) {
      const x = idx & 15, y = (idx >> 4) & 15, z = (idx >> 8) & 15, w = (idx >> 12) & 15;
      if (ch.getBlock(x, y, z, w) !== ref[idx]) throw new Error(`mismatch at ${idx}`);
    }
    expect(ch.bSlots).toBeLessThanOrEqual(256);
  });

  it('builds columns whose chunks know their owner', () => {
    const c = makeColumn(2, -1, 3, flat);
    expect(c.chunks.every((ch, i) => ch.cy === i && ch.column === c)).toBe(true);
  });
});
