import { describe, expect, it } from 'vitest';
import { REG } from '../../src/content/registry';
import { findPortal, frameCells, interiorCells, portalDestination, scalePosition, type PortalBox } from '../../src/game/Portals';

const OBS = 1, AIR = 0, STONE = 2;
/** A sparse 4D block map for tests (default: stone, so frames must be carved). */
function world(fill = AIR) {
  const m = new Map<string, number>();
  return {
    get: (x: number, y: number, z: number, w: number) => m.get(`${x},${y},${z},${w}`) ?? fill,
    set: (x: number, y: number, z: number, w: number, v: number) => void m.set(`${x},${y},${z},${w}`, v),
  };
}
const open = (v: number) => v === AIR;
const frame = (v: number) => v === OBS;

function build(wd: ReturnType<typeof world>, box: PortalBox): void {
  for (const c of interiorCells(box)) wd.set(c[0]!, c[1]!, c[2]!, c[3]!, AIR);
  for (const c of frameCells(box)) wd.set(c[0]!, c[1]!, c[2]!, c[3]!, OBS);
}

describe('4D portals', () => {
  it('a minimal frame is 10 blocks around a 1 x 2 x 1 interior (like Minecraft)', () => {
    const box: PortalBox = { axis: 3, min: [0, 10, 0, 5], max: [0, 11, 0, 5] };
    expect([...interiorCells(box)].length).toBe(2);
    expect([...frameCells(box)].length).toBe(10);
  });

  it('finds frames along each normal axis (x, z or w) and rejects broken ones', () => {
    for (const axis of [0, 2, 3]) {
      const wd = world(STONE);
      const min: PortalBox['min'] = [0, 10, 0, 0];
      const max: PortalBox['max'] = [0, 12, 0, 0];
      // Interior 2 x 3 x 2 in the plane of the other axes.
      for (const a of [0, 2, 3]) if (a !== axis) max[a] = 1;
      const box: PortalBox = { axis, min, max };
      build(wd, box);
      const found = findPortal(wd.get, 1 - (axis === 0 ? 1 : 0), 11, axis === 2 ? 0 : 1, 0, open, frame);
      expect(found, `axis ${axis}`).not.toBeNull();
      expect(found!.axis).toBe(axis);
      expect(found!.min).toEqual(min);
      expect(found!.max).toEqual(max);
      // Remove one face block: no portal.
      const face = [...frameCells(box)][3]!;
      wd.set(face[0]!, face[1]!, face[2]!, face[3]!, AIR);
      expect(findPortal(wd.get, min[0], 11, min[2], min[3], open, frame)).toBeNull();
    }
  });

  it('does not need corner or edge blocks, and needs two cells of height', () => {
    const wd = world(AIR);
    const box: PortalBox = { axis: 0, min: [3, 20, 3, 3], max: [3, 21, 3, 3] };
    for (const c of frameCells(box)) wd.set(c[0]!, c[1]!, c[2]!, c[3]!, OBS);
    expect(findPortal(wd.get, 3, 20, 3, 3, open, frame)).not.toBeNull();
    const flat: PortalBox = { axis: 0, min: [3, 40, 3, 3], max: [3, 40, 3, 3] };
    const wd2 = world(AIR);
    for (const c of frameCells(flat)) wd2.set(c[0]!, c[1]!, c[2]!, c[3]!, OBS);
    expect(findPortal(wd2.get, 3, 40, 3, 3, open, frame)).toBeNull();
  });

  it('links the Surface and the Ember Depths at 8:1 along x, z and w (not y)', () => {
    const surface = REG.realm('surface'), ember = REG.realm('ember');
    expect(portalDestination('surface')).toBe('ember');
    expect(portalDestination('ember')).toBe('surface');
    expect(scalePosition([800, 70, -1600, 240], surface, ember)).toEqual([100, 70, -200, 30]);
    expect(scalePosition([100, 70, -200, 30], ember, surface)).toEqual([800, 70, -1600, 240]);
    // y is clamped into the destination.
    expect(scalePosition([0, 500, 0, 0], surface, ember)[1]).toBeLessThan(128);
  });
});
