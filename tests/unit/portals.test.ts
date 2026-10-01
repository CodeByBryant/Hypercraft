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
      // Remove the face block under a corner cell: no portal there (neither the hyper-portal
      // nor a flat layer through that cell has a whole frame).
      wd.set(min[0], 9, min[2], min[3], AIR);
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

  it('lights flat Minecraft-style frames (4 x 5, corners optional) in all three vertical planes', () => {
    for (const width of [0, 2, 3]) {
      const [axis, thin] = [0, 2, 3].filter((a) => a !== width) as [number, number];
      const min: PortalBox['min'] = [5, 30, 5, 5];
      const max: PortalBox['max'] = [5, 32, 5, 5];
      max[width] = 6;
      const box: PortalBox = { axis, thin, min, max };
      expect([...interiorCells(box)].length).toBe(6);
      expect([...frameCells(box)].length).toBe(10);
      expect([...frameCells(box, true)].length).toBe(14);
      const wd = world(AIR);
      for (const c of frameCells(box)) wd.set(c[0]!, c[1]!, c[2]!, c[3]!, OBS);
      const found = findPortal(wd.get, max[0], 31, max[2], max[3], open, frame);
      expect(found, `width ${width}`).not.toBeNull();
      expect(found!.thin).toBe(thin);
      expect(found!.min).toEqual(min);
      expect(found!.max).toEqual(max);
      // Break one side block: no portal.
      const side = [...min];
      side[width] = min[width]! - 1;
      wd.set(side[0]!, 31, side[2]!, side[3]!, AIR);
      expect(findPortal(wd.get, max[0], 31, max[2], max[3], open, frame)).toBeNull();
    }
  });

  it('flat frames need a 2 x 3 interior, like Minecraft', () => {
    const narrow: PortalBox = { axis: 2, thin: 3, min: [0, 10, 0, 0], max: [0, 12, 0, 0] };
    const wd = world(AIR);
    for (const c of frameCells(narrow, true)) wd.set(c[0]!, c[1]!, c[2]!, c[3]!, OBS);
    expect(findPortal(wd.get, 0, 11, 0, 0, open, frame)).toBeNull();
    const low: PortalBox = { axis: 2, thin: 3, min: [0, 30, 0, 0], max: [1, 31, 0, 0] };
    const wd2 = world(AIR);
    for (const c of frameCells(low, true)) wd2.set(c[0]!, c[1]!, c[2]!, c[3]!, OBS);
    expect(findPortal(wd2.get, 0, 30, 0, 0, open, frame)).toBeNull();
  });

  it('a hyper-frame lights as one 3D portal, not as its flat layers', () => {
    const box: PortalBox = { axis: 0, min: [0, 10, 0, 0], max: [0, 12, 1, 1] };
    const wd = world(AIR);
    build(wd, box);
    const found = findPortal(wd.get, 0, 11, 1, 1, open, frame);
    expect(found!.thin).toBeUndefined();
    expect([...interiorCells(found!)].length).toBe(12);
    // Without one of its w faces, the layer that still has a whole frame lights flat.
    wd.set(0, 11, 0, -1, AIR);
    const layer = findPortal(wd.get, 0, 11, 1, 1, open, frame);
    expect(layer!.thin).toBeDefined();
    expect([...interiorCells(layer!)].length).toBe(6);
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
