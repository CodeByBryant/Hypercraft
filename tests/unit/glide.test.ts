import { describe, expect, it } from 'vitest';
import { GLIDE_TICK, ROCKET_TIME, glideTick, kineticDamage, rocketTick } from '../../src/physics/glide';

const G = 32;
// Axes: 0 = x, 1 = y (up), 2 = z, 3 = w.
const unit = (x: number, y: number, z: number, w: number): Float64Array => {
  const l = Math.hypot(x, y, z, w);
  return Float64Array.from([x / l, y / l, z / l, w / l]);
};

/** Fly `seconds` of 20 Hz ticks from `vel`, returning the final velocity and the distance covered. */
function fly(vel: Float64Array, look: Float64Array, seconds: number, tick = glideTick) {
  const v = Float64Array.from(vel);
  const pos = [0, 0, 0, 0];
  for (let t = 0; t < seconds / GLIDE_TICK; t++) {
    tick(v, look, 1, G);
    for (let k = 0; k < 4; k++) pos[k] += v[k]! * GLIDE_TICK;
  }
  return { v, pos };
}

describe('glide: the Phase Wings flight model', () => {
  it('a level glide settles to a gentle sink and keeps most of its speed', () => {
    const { v, pos } = fly(Float64Array.from([20, 0, 0, 0]), unit(1, 0, 0, 0), 10);
    expect(v[1]).toBeLessThan(-2);
    expect(v[1]).toBeGreaterThan(-8); // a steady sink, not a fall
    expect(v[0]).toBeGreaterThan(9);
    expect(pos[0]).toBeGreaterThan(120); // ten seconds carry you a long way
    expect(pos[1]).toBeLessThan(-20);
  });

  it('diving builds speed far beyond walking pace; pulling up trades it for height', () => {
    const dive = fly(Float64Array.from([10, 0, 0, 0]), unit(1, -1, 0, 0), 4);
    const speed = Math.hypot(dive.v[0]!, dive.v[1]!);
    expect(speed).toBeGreaterThan(28);
    const climb = fly(dive.v, unit(1, 0.9, 0, 0), 3);
    expect(climb.v[1]).toBeGreaterThan(0); // now going up
    expect(climb.pos[1]).toBeGreaterThan(-10); // gained back most of what the climb loses
  });

  it('straight down is a plain fall to terminal speed; straight up stalls, with no NaNs', () => {
    const down = fly(Float64Array.from([0, 0, 0, 0]), unit(0, -1, 0, 0), 5);
    expect(down.v[1]).toBeLessThan(-40);
    expect(Number.isFinite(down.v[1]!)).toBe(true);
    const up = fly(Float64Array.from([5, 0, 0, 0]), unit(0, 1, 0, 0), 3);
    for (const x of up.v) expect(Number.isFinite(x)).toBe(true);
  });

  it('banks through W: turning the heading toward +w sends your speed into the fourth dimension', () => {
    const start = Float64Array.from([20, 0, 0, 0]);
    const straight = fly(start, unit(1, 0, 0, 0), 2);
    expect(Math.abs(straight.pos[3]!)).toBeLessThan(0.001);
    // Rotate the slice 45 degrees through XW: the heading is half x, half w.
    const bank = fly(start, unit(1, 0, 0, 1), 2);
    expect(bank.pos[3]).toBeGreaterThan(15);
    expect(bank.v[3]).toBeGreaterThan(8);
    expect(bank.pos[0]).toBeLessThan(straight.pos[0]!);
    // And it is symmetric: ana and kata, or z instead of w.
    const kata = fly(start, unit(1, 0, 0, -1), 2);
    expect(kata.pos[3]).toBeCloseTo(-bank.pos[3]!, 5);
    const side = fly(start, unit(1, 0, 1, 0), 2);
    expect(side.pos[2]).toBeCloseTo(bank.pos[3]!, 5);
  });

  it('a Starlight Rocket shoves you up to cruise speed along the heading, for about a second', () => {
    const look = unit(1, 0.3, 0, 0.2);
    const { v } = fly(Float64Array.from([6, 0, 0, 0]), look, ROCKET_TIME, (vel, l) => {
      rocketTick(vel, l);
      glideTick(vel, l, 1, G);
    });
    expect(Math.hypot(v[0]!, v[1]!, v[2]!, v[3]!)).toBeGreaterThan(24);
    expect(v[3]).toBeGreaterThan(3); // along the heading, w included
  });

  it('hurts by the speed you lose: a wall at full tilt, nothing for a scrape', () => {
    expect(kineticDamage(20, 0)).toBeCloseTo(7, 5);
    expect(kineticDamage(30, 0)).toBeCloseTo(12, 5);
    expect(kineticDamage(5, 0)).toBe(0);
    expect(kineticDamage(10, 9)).toBe(0);
  });
});
