import { describe, expect, it } from 'vitest';
import { B } from '../../src/content/registry';
import { LightEngine } from '../../src/world/light/LightEngine';
import { World } from '../../src/world/World';
import { makeColumn, realm } from './helpers';

function drain(le: LightEngine) {
  let guard = 0;
  while (le.pending() > 0 && guard++ < 1000) le.process(100000);
  expect(le.pending()).toBe(0);
}

// Solid stone below y=64 with a tunnel along +x at y=30, z=8, w=8; torch at x=13.
const tunnel = (x: number, y: number, z: number, w: number): number => {
  if (y >= 64) return B.air;
  if (y === 30 && z === 8 && w === 8 && x >= 13 && x <= 20) return x === 13 ? B.torch : B.air;
  return B.stone;
};

describe('light engine', () => {
  it('propagates block light across column seams in 4D', () => {
    const world = new World(realm, 2);
    world.moveWindow(-2, -2, -2);
    const a = makeColumn(0, 0, 0, tunnel);
    const b = makeColumn(1, 0, 0, tunnel);
    world.addColumn(a);
    world.addColumn(b);
    const le = new LightEngine(world);
    // Worker-computed light stops at the column border.
    expect(world.getLight(15, 30, 8, 8) & 15).toBe(12);
    expect(world.getLight(16, 30, 8, 8) & 15).toBe(0);
    le.seedSeam(a, b, 0);
    drain(le);
    expect(world.getLight(16, 30, 8, 8) & 15).toBe(11);
    expect(world.getLight(17, 30, 8, 8) & 15).toBe(10);
    expect(world.getLight(20, 30, 8, 8) & 15).toBe(7);
  });

  it('removes light when the source is removed and re-lights when placed', () => {
    const world = new World(realm, 2);
    world.moveWindow(-2, -2, -2);
    const a = makeColumn(0, 0, 0, tunnel);
    const b = makeColumn(1, 0, 0, tunnel);
    world.addColumn(a);
    world.addColumn(b);
    const le = new LightEngine(world);
    world.onBlockChange((x, y, z, w, o, n) => le.onBlockChanged(x, y, z, w, o, n));
    le.seedSeam(a, b, 0);
    drain(le);
    world.setBlock(13, 30, 8, 8, B.air);
    drain(le);
    for (let x = 13; x <= 20; x++) expect(world.getLight(x, 30, 8, 8) & 15).toBe(0);
    world.setBlock(18, 30, 8, 8, B.torch);
    drain(le);
    expect(world.getLight(18, 30, 8, 8) & 15).toBe(14);
    expect(world.getLight(16, 30, 8, 8) & 15).toBe(12);
    expect(world.getLight(13, 30, 8, 8) & 15).toBe(9);
  });

  it('keeps the vertical skylight rule and shadows under a placed block', () => {
    const world = new World(realm, 2);
    world.moveWindow(-2, -2, -2);
    const flat = (_x: number, y: number) => (y < 40 ? B.stone : B.air);
    const a = makeColumn(0, 0, 0, flat);
    world.addColumn(a);
    const le = new LightEngine(world);
    world.onBlockChange((x, y, z, w, o, n) => le.onBlockChanged(x, y, z, w, o, n));
    expect(world.getLight(8, 40, 8, 8) >> 4).toBe(15);
    // A 3x1x3x3 roof one block above ground.
    for (let x = 7; x <= 9; x++) for (let z = 7; z <= 9; z++) for (let w = 7; w <= 9; w++) world.setBlock(x, 42, z, w, B.stone);
    drain(le);
    // Directly under the roof centre: no straight skylight; lit sideways around the roof.
    const under = world.getLight(8, 41, 8, 8) >> 4;
    expect(under).toBeLessThan(15);
    expect(under).toBeGreaterThanOrEqual(12);
    expect(world.getLight(8, 43, 8, 8) >> 4).toBe(15);
    // Removing the roof restores full skylight.
    for (let x = 7; x <= 9; x++) for (let z = 7; z <= 9; z++) for (let w = 7; w <= 9; w++) world.setBlock(x, 42, z, w, B.air);
    drain(le);
    expect(world.getLight(8, 41, 8, 8) >> 4).toBe(15);
  });

  it('light spreads along W (4D neighbours), not only x/z', () => {
    const world = new World(realm, 2);
    world.moveWindow(-2, -2, -2);
    const wTunnel = (x: number, y: number, z: number, w: number): number => {
      if (y >= 64) return B.air;
      if (y === 30 && x === 8 && z === 8 && w >= 2 && w <= 12) return w === 2 ? B.lumen : B.air;
      return B.stone;
    };
    const a = makeColumn(0, 0, 0, wTunnel);
    world.addColumn(a);
    expect(world.getLight(8, 30, 8, 3) & 15).toBe(14);
    expect(world.getLight(8, 30, 8, 12) & 15).toBe(5);
  });
});
