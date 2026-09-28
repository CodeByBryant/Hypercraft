// World layout constants. Chunks are 16^4 voxels, split into 4^4 bricks of 4^4 voxels.
//   brick index in chunk:  bx | by << 2 | bz << 4 | bw << 6
//   voxel index in brick:  vx | vy << 2 | vz << 4 | vw << 6
// A column is the stack of chunks at one (cx, cz, cw); Y is bounded per realm.

export const CHUNK = 16;
export const CHUNK_SHIFT = 4;
export const CHUNK_MASK = 15;
export const BRICK = 4;
export const BRICK_SHIFT = 2;
export const BRICK_MASK = 3;
export const BRICKS_PER_CHUNK = 256;
export const VOXELS_PER_BRICK = 256;
export const VOXELS_PER_CHUNK = 65536;
/** Voxels in one Y layer of a column (16 x 16 x 16 in x, z, w). */
export const COLUMN_LAYER = 4096;

/** Sentinel voxel for unloaded space / below the world (never registered as a block). */
export const VOID_VOXEL = 0x0fff;
/** Packed light value: sky light in the high nibble, block light in the low nibble. */
export const FULL_SKY = 0xf0;

export function brickIndex(lx: number, ly: number, lz: number, lw: number): number {
  return (lx >> 2) | ((ly >> 2) << 2) | ((lz >> 2) << 4) | ((lw >> 2) << 6);
}

export function voxelInBrick(lx: number, ly: number, lz: number, lw: number): number {
  return (lx & 3) | ((ly & 3) << 2) | ((lz & 3) << 4) | ((lw & 3) << 6);
}

/** Dense column index used by the generator/worker: x fastest, then z, w, y. */
export function denseIndex(x: number, y: number, z: number, w: number): number {
  return x + (z << 4) + (w << 8) + (y << 12);
}

/** Pack column coordinates into a single safe-integer key (±32767 chunks per axis). */
export function columnKey(cx: number, cz: number, cw: number): number {
  return ((cx + 32768) * 65536 + (cz + 32768)) * 65536 + (cw + 32768);
}

export function floorDiv(a: number, b: number): number {
  return Math.floor(a / b);
}

export function mod(a: number, n: number): number {
  const r = a % n;
  return r < 0 ? r + n : r;
}
