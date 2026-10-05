// Doors (two cells tall, open and closed) and axe stripping, for the wood families in
// content/woods.ts. Pure lookups over the block registry, used by Game and the structures.

import { REG, DOOR_OPEN, makeVoxel, voxelId, voxelMeta } from '../content/registry';
import { STRIP } from '../content/woods';
import { VOID_VOXEL } from '../world/constants';

/** Door halves by block id: 1 lower (the item), 2 upper. */
export const DOOR_PART = new Uint8Array(REG.count);
/** Door half id -> the other half's id. */
export const DOOR_OTHER = new Int16Array(REG.count).fill(-1);
/** Log id -> its stripped log's id (-1: cannot be stripped). */
export const STRIP_ID = new Int16Array(REG.count).fill(-1);

REG.blocks.forEach((b, i) => {
  if (b.tags?.includes('door')) {
    const top = b.tags.includes('door_top');
    DOOR_PART[i] = top ? 2 : 1;
    const other = top ? b.name.replace(/_top$/, '') : `${b.name}_top`;
    if (REG.has(other)) DOOR_OTHER[i] = REG.id(other);
  }
  const s = STRIP[b.name];
  if (s && REG.has(s)) STRIP_ID[i] = REG.id(s);
});

export const isDoor = (v: number): boolean => v !== VOID_VOXEL && DOOR_PART[voxelId(v)]! > 0;
export const doorOpen = (v: number): boolean => voxelMeta(v) >= DOOR_OPEN;
/** The same door half, opened if closed and closed if open (same facing). */
export const toggledDoor = (v: number): number => makeVoxel(voxelId(v), doorOpen(v) ? voxelMeta(v) - DOOR_OPEN : voxelMeta(v) + DOOR_OPEN);

interface Blocks {
  getBlock(x: number, y: number, z: number, w: number): number;
}

/** The other half of the door at (x, y, z, w) whose voxel is `v`, or null if it is missing. */
export function doorPartner(world: Blocks, x: number, y: number, z: number, w: number, v: number): [number, number, number, number] | null {
  const id = voxelId(v);
  const part = DOOR_PART[id];
  if (!part || v === VOID_VOXEL) return null;
  const p: [number, number, number, number] = [x, y + (part === 1 ? 1 : -1), z, w];
  const pv = world.getBlock(p[0], p[1], p[2], p[3]);
  return pv !== VOID_VOXEL && voxelId(pv) === DOOR_OTHER[id] ? p : null;
}
