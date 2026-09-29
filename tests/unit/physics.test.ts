import { describe, expect, it } from 'vitest';
import { B, REG, makeVoxel } from '../../src/content/registry';
import { Player, type MoveInput } from '../../src/physics/Player';
import { makeWorld } from './helpers';

const still = (): MoveInput => ({ forward: 0, strafe: 0, ana: 0, jump: false, sneak: false, sprint: false });

function sim(p: Player, world: ReturnType<typeof makeWorld>, input: MoveInput, seconds: number, dt = 1 / 60) {
  for (let t = 0; t < seconds; t += dt) p.update(world, input, dt);
}

function newPlayer(x: number, y: number, z: number, w: number, mode: 'survival' | 'creative' = 'survival') {
  const p = new Player(1, 32);
  p.mode = mode;
  p.frozen = false;
  p.setPosition(x, y, z, w);
  return p;
}

// Flat ground: solid below y=40.
const flat = (_x: number, y: number) => (y < 40 ? B.stone : B.air);

describe('player physics (4D hyperbox)', () => {
  it('falls under gravity and lands on the ground', () => {
    const world = makeWorld(flat);
    const p = newPlayer(8.5, 50, 8.5, 8.5);
    sim(p, world, still(), 2);
    expect(p.onGround).toBe(true);
    expect(p.pos[1]).toBeCloseTo(40, 3);
    expect(p.lastFall).toBeGreaterThan(9);
  });

  it('jumps about 1.25 blocks', () => {
    const world = makeWorld(flat);
    const p = newPlayer(8.5, 40, 8.5, 8.5);
    sim(p, world, still(), 0.2);
    let maxY = 0;
    const input = { ...still(), jump: true };
    for (let i = 0; i < 60; i++) {
      p.update(world, input, 1 / 60);
      input.jump = false;
      maxY = Math.max(maxY, p.pos[1]!);
    }
    expect(maxY - 40).toBeGreaterThan(1.1);
    expect(maxY - 40).toBeLessThan(1.4);
  });

  it('collides with walls along W (the fourth axis)', () => {
    const wall = (_x: number, y: number, _z: number, w: number) => (y < 40 || (w >= 12 && y < 45) ? B.stone : B.air);
    const world = makeWorld(wall);
    const p = newPlayer(8.5, 40, 8.5, 8.5);
    // Base frame: hidden axis H = +W, so "ana" walks toward +W.
    sim(p, world, { ...still(), ana: 1 }, 3);
    expect(p.pos[3]).toBeCloseTo(12 - 0.3, 2);
    expect(p.pos[0]).toBeCloseTo(8.5, 6);
  });

  it('kata/ana follows the current hidden axis, not a fixed world axis', () => {
    const world = makeWorld(flat, [[0, 0, 0], [1, 0, 0], [0, 0, 1], [1, 0, 1], [-1, 0, 0], [-1, 0, 1]]);
    const p = newPlayer(8.5, 40, 8.5, 8.5);
    p.cam.rotateWorldPlane(0, 3, Math.PI / 6); // 30° XW tilt: H = (-sin30, 0, 0, cos30)
    const x0 = p.pos[0]!, w0 = p.pos[3]!;
    sim(p, world, { ...still(), ana: 1 }, 1);
    const dx = p.pos[0]! - x0, dw = p.pos[3]! - w0;
    expect(Math.hypot(dx, dw)).toBeGreaterThan(3);
    expect(dx / dw).toBeCloseTo(-Math.tan(Math.PI / 6), 2);
  });

  it('sneaking never walks off an edge (in any horizontal 4D direction)', () => {
    const platform = (x: number, y: number, _z: number, w: number) => (y < 40 && x < 10 && w < 10 ? B.stone : B.air);
    const world = makeWorld(platform);
    const p = newPlayer(8.5, 40, 8.5, 8.5);
    sim(p, world, still(), 0.1);
    sim(p, world, { ...still(), strafe: 1, sneak: true }, 3); // +X
    sim(p, world, { ...still(), ana: 1, sneak: true }, 3); // +W
    expect(p.onGround).toBe(true);
    expect(p.pos[1]).toBeCloseTo(40, 3);
    expect(p.pos[0]).toBeLessThan(10.3);
    expect(p.pos[3]).toBeLessThan(10.3);
    // Without sneaking we walk off and fall.
    sim(p, world, { ...still(), strafe: 1 }, 2);
    expect(p.pos[1]).toBeLessThan(39);
  });

  it('steps up onto slabs but not onto full blocks', () => {
    const slab = makeVoxel(B.stone_slab, 0);
    const steps = (x: number, y: number) => (y < 40 ? B.stone : y === 40 && x >= 10 && x < 12 ? slab : y === 40 && x >= 12 ? B.stone : B.air);
    const world = makeWorld(steps);
    const p = newPlayer(8.5, 40, 8.5, 8.5);
    sim(p, world, { ...still(), strafe: 1 }, 0.6);
    expect(p.pos[1]).toBeCloseTo(40.5, 2); // on the slab
    sim(p, world, { ...still(), strafe: 1 }, 1);
    expect(p.pos[1]).toBeCloseTo(41, 2); // stepped from slab (40.5) onto the block (41)
  });

  it('climbs ladders', () => {
    const lad = makeVoxel(B.ladder, 2); // hugs +Z
    const tower = (_x: number, y: number, z: number) => (y < 40 ? B.stone : z === 10 && y < 50 ? B.planks : z === 9 && y < 50 ? lad : B.air);
    const world = makeWorld(tower);
    const p = newPlayer(8.5, 40, 9.5, 8.5);
    sim(p, world, { ...still(), forward: 1 }, 2); // face +Z (base frame forward) into the ladder
    expect(p.pos[1]).toBeGreaterThan(44);
  });

  it('swims up in water and sinks slowly', () => {
    const pool = (_x: number, y: number) => (y < 30 ? B.stone : y < 45 ? B.water : B.air);
    const world = makeWorld(pool);
    const p = newPlayer(8.5, 38, 8.5, 8.5);
    sim(p, world, still(), 1);
    expect(p.inWater).toBe(true);
    expect(p.pos[1]).toBeGreaterThan(33); // sinks slowly, not free-fall
    const y0 = p.pos[1]!;
    sim(p, world, { ...still(), jump: true }, 1);
    expect(p.pos[1]!).toBeGreaterThan(y0 + 1.5);
  });

  it('flies in creative mode without gravity', () => {
    const world = makeWorld(flat);
    const p = newPlayer(8.5, 45, 8.5, 8.5, 'creative');
    p.flying = true;
    sim(p, world, still(), 1);
    expect(p.pos[1]).toBeCloseTo(45, 1);
  });

  it('walking into a wall in a tilted slice never drifts the slice along the hidden axis', () => {
    // Regression: collision was resolved per world axis, so when a wall stopped the X part of
    // a tilted "right" step, the W part kept going and the view hyperplane slid kata/ana.
    const wall = (x: number, y: number) => (y < 40 || (x >= 12 && y < 45) ? B.stone : B.air);
    const world = makeWorld(wall, [[0, 0, 0], [0, 0, 1], [0, 0, -1]]);
    const p = newPlayer(8.5, 40, 8.5, 8.5);
    p.cam.rotateWorldPlane(0, 3, Math.PI / 6); // XW 30°: right = (cos30, 0, 0, sin30)
    p.cam.yaw(0.3);
    const H = p.cam.hidden;
    const h0 = p.pos[0]! * H[0]! + p.pos[2]! * H[2]! + p.pos[3]! * H[3]!;
    sim(p, world, { ...still(), strafe: 1 }, 3); // walk right into the wall at x = 12 and keep pushing
    sim(p, world, { ...still(), strafe: 1, forward: 0.5 }, 2); // slide along it
    const h1 = p.pos[0]! * H[0]! + p.pos[2]! * H[2]! + p.pos[3]! * H[3]!;
    expect(p.pos[0]).toBeGreaterThan(11); // really reached the wall
    expect(Math.abs(h1 - h0)).toBeLessThan(1e-6);
  });

  it('cobwebs slow you to a crawl and break falls', () => {
    const web = (x: number, y: number) => (y < 40 ? B.stone : x >= 10 && x < 14 && y < 44 ? REG.id('cobweb') : B.air);
    const world = makeWorld(web);
    const free = newPlayer(4.5, 40, 8.5, 8.5);
    const stuck = newPlayer(11.5, 40, 8.5, 8.5);
    const fwdX = { ...still(), strafe: 1 }; // right = +X
    sim(free, world, still(), 0.1);
    sim(stuck, world, still(), 0.1);
    const x0 = free.pos[0]!, x1 = stuck.pos[0]!;
    sim(free, world, fwdX, 0.5);
    sim(stuck, world, fwdX, 0.5);
    expect(stuck.slow).toBeLessThan(1);
    expect(stuck.pos[0]! - x1).toBeLessThan((free.pos[0]! - x0) * 0.25);
    // Dropping into a web from 3.5 blocks up: no fall is recorded on landing.
    const faller = newPlayer(12.5, 43.5, 8.5, 8.5);
    sim(faller, world, still(), 3);
    expect(faller.lastFall).toBeLessThan(1);
  });
});
