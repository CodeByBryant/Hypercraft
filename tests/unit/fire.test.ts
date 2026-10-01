import { describe, expect, it } from 'vitest';
import { REG } from '../../src/content/registry';
import { FireSystem, type FireHost } from '../../src/game/Fire';
import { makeWorld } from './helpers';
import type { World } from '../../src/world/World';

/** Deterministic random numbers (mulberry32). */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const STONE = REG.id('stone'), PLANKS = REG.id('planks'), FIRE = REG.id('fire');

/** Stone below y 20, air above, and a fire system hooked to the world. */
function setup(seed = 1, raining = false): { world: World; fire: FireSystem } {
  const world = makeWorld((_x, y) => (y < 20 ? STONE : 0));
  const host: FireHost = { world, random: rng(seed), rainingAt: () => raining, difficulty: () => 2 };
  const fire = new FireSystem(host);
  world.onBlockChange((x, y, z, w, o, n) => fire.blockChanged(x, y, z, w, o, n));
  return { world, fire };
}

function count(world: World, id: number, y0: number, y1: number): number {
  let n = 0;
  for (let y = y0; y <= y1; y++) for (let w = 0; w < 16; w++) for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) if ((world.getBlock(x, y, z, w) & 0xfff) === id) n++;
  return n;
}

describe('fire', () => {
  it('reads flammability from the data: wood and plants burn, Ember wood and stone do not', () => {
    expect(REG.burn[PLANKS]).toBeGreaterThan(0);
    expect(REG.ignite[REG.id('log')]).toBeGreaterThan(0);
    expect(REG.burn[REG.id('leaves')]).toBeGreaterThan(0);
    expect(REG.ignite[REG.id('tall_grass')]).toBeGreaterThan(0);
    expect(REG.burn[REG.id('emberwood_log')]).toBe(0);
    expect(REG.burn[REG.id('ember_grass')]).toBe(0);
    expect(REG.burn[STONE]).toBe(0);
    expect(REG.infiniburn[REG.id('cinder')]).toBe(1);
    expect(REG.infiniburn[REG.id('magma_block')]).toBe(1);
    expect(REG.anim[FIRE]).toBe(1);
  });

  it('spreads through a wooden floor and burns it away', () => {
    const { world, fire } = setup(7);
    // A 12 x 12 x 12 deck of planks at y 20, a fire on it.
    for (let w = 2; w < 14; w++) for (let z = 2; z < 14; z++) for (let x = 2; x < 14; x++) world.setBlock(x, 20, z, w, PLANKS);
    const before = count(world, PLANKS, 20, 20);
    world.setBlock(8, 21, 8, 8, FIRE);
    expect(fire.count).toBe(1);
    let most = 0;
    for (let t = 0; t < 20 * 120; t++) {
      fire.tick();
      most = Math.max(most, fire.count);
    }
    expect(most).toBeGreaterThan(20);
    expect(count(world, PLANKS, 20, 20)).toBeLessThan(before * 0.5);
  });

  it('burns out on stone, and burns forever on cinder', () => {
    const { world, fire } = setup(3);
    world.setBlock(4, 20, 4, 4, FIRE);
    world.setBlock(10, 19, 10, 10, REG.id('cinder'));
    world.setBlock(10, 20, 10, 10, FIRE);
    for (let t = 0; t < 20 * 60; t++) fire.tick();
    expect(world.getBlock(4, 20, 4, 4) & 0xfff).toBe(0);
    expect(world.getBlock(10, 20, 10, 10) & 0xfff).toBe(FIRE);
  });

  it('goes out in the rain', () => {
    const { world, fire } = setup(5, true);
    for (let x = 2; x < 14; x++) world.setBlock(x, 20, 8, 8, PLANKS);
    world.setBlock(8, 21, 8, 8, FIRE);
    for (let t = 0; t < 20 * 60; t++) fire.tick();
    expect(count(world, FIRE, 20, 30)).toBe(0);
    // The rain stopped it before it ate the plank row.
    expect(count(world, PLANKS, 20, 20)).toBeGreaterThan(6);
  });

  it('leaves the Ember Depths wood alone', () => {
    const { world, fire } = setup(9);
    const log = REG.id('emberwood_log');
    for (let y = 20; y < 26; y++) world.setBlock(8, y, 9, 8, log);
    world.setBlock(7, 19, 8, 8, REG.id('cinder'));
    world.setBlock(7, 20, 8, 8, FIRE);
    for (let t = 0; t < 20 * 60; t++) fire.tick();
    expect(count(world, log, 20, 26)).toBe(6);
  });
});
