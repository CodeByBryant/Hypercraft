import { describe, expect, it } from 'vitest';
import { B } from '../../src/content/registry';
import { Pathfinder, type BlockSource } from '../../src/game/mobs/Pathfinder';

// A tiny procedural world: floor below y = 10, optional walls.
function world(solid: (x: number, y: number, z: number, w: number) => boolean): BlockSource {
  return { getBlock: (x, y, z, w) => (y < 10 || solid(x, y, z, w) ? B.stone : B.air) };
}

describe('4D pathfinding', () => {
  it('walks straight along any horizontal axis, including W', () => {
    const pf = new Pathfinder(world(() => false));
    const path = pf.find([0, 10, 0, 0], [0, 10, 0, 7]);
    expect(path.length).toBe(7);
    expect(path[path.length - 1]).toEqual([0, 10, 0, 7]);
    for (const c of path) expect([c[0], c[2]]).toEqual([0, 0]);
  });

  it('goes around a wall through the fourth dimension when X and Z are blocked', () => {
    // A wall at x = 3 spanning every z (a full 3D "plane" in the x,z view) except where w = 2.
    // In 3D this is impassable; in 4D the mob sidesteps along W, crosses, and comes back.
    const pf = new Pathfinder(world((x, y, _z, w) => x === 3 && y < 14 && w !== 2));
    const path = pf.find([0, 10, 0, 0], [6, 10, 0, 0]);
    const last = path[path.length - 1]!;
    expect(last).toEqual([6, 10, 0, 0]);
    const crossing = path.find((c) => c[0] === 3)!;
    expect(crossing[3]).toBe(2);
  });

  it('steps up one block and drops down', () => {
    const pf = new Pathfinder(world((x, y) => x >= 3 && x <= 5 && y === 10));
    const path = pf.find([0, 10, 0, 0], [8, 10, 0, 0]);
    expect(path[path.length - 1]).toEqual([8, 10, 0, 0]);
    expect(path.some((c) => c[1] === 11)).toBe(true);
  });

  it('returns a partial path toward an unreachable goal within its node budget', () => {
    const pf = new Pathfinder(world((x, y) => x === 4 && y < 30), 300);
    const path = pf.find([0, 10, 0, 0], [8, 10, 0, 0]);
    expect(pf.expanded).toBeLessThanOrEqual(300);
    expect(path.length).toBeGreaterThan(0);
    expect(path[path.length - 1]![0]).toBe(3); // as close as it gets
  });
});
