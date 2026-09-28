// Column-local light, computed in the generation worker on the dense column arrays.
// Light is packed per voxel as (sky << 4) | block. Propagation is 4D: each voxel has
// eight face neighbours (±x, ±y, ±z, ±w). Sky light at level 15 travels straight down
// through fully transparent blocks without decaying (Minecraft rule), everything else
// loses 1 + lightOpacity per step. Light crossing into neighbouring columns is handled on
// the main thread by LightEngine (seam propagation), because workers never see neighbours.

import { REG } from '../../content/registry';
import { COLUMN_LAYER } from '../constants';

const QSIZE = 1 << 21;
const QMASK = QSIZE - 1;
let queue: Int32Array | null = null;

export function computeColumnLight(blocks: Uint16Array, light: Uint8Array, heightmap: Uint8Array, H: number): void {
  const opacity = REG.lightOpacity;
  const emission = REG.emission;
  const q = (queue ??= new Int32Array(QSIZE));
  let head = 0;
  let tail = 0;
  light.fill(0);

  // 1. Vertical sky pass + heightmap (highest light-attenuating block + 1).
  for (let i = 0; i < COLUMN_LAYER; i++) {
    let level = 15;
    let hm = 0;
    for (let y = H - 1; y >= 0; y--) {
      const idx = i + y * COLUMN_LAYER;
      const op = opacity[blocks[idx]! & 0xfff]!;
      if (op > 0 && hm === 0) hm = y + 1;
      if (op >= 15) level = 0;
      else if (op > 0) level = level > op ? level - op : 0;
      if (level > 0) light[idx] = level << 4;
      else if (op >= 15) {
        // Everything below the first opaque block starts dark; BFS fills caves/overhangs.
        break;
      }
    }
    heightmap[i] = hm;
  }

  // 2. Seeds: emitters, and lit voxels next to darker transparent neighbours.
  for (let i = 0; i < COLUMN_LAYER; i++) {
    const x = i & 15, z = (i >> 4) & 15, w = (i >> 8) & 15;
    let maxH = heightmap[i]!;
    if (x > 0) maxH = Math.max(maxH, heightmap[i - 1]!);
    if (x < 15) maxH = Math.max(maxH, heightmap[i + 1]!);
    if (z > 0) maxH = Math.max(maxH, heightmap[i - 16]!);
    if (z < 15) maxH = Math.max(maxH, heightmap[i + 16]!);
    if (w > 0) maxH = Math.max(maxH, heightmap[i - 256]!);
    if (w < 15) maxH = Math.max(maxH, heightmap[i + 256]!);
    for (let y = 0; y < H; y++) {
      const idx = i + y * COLUMN_LAYER;
      const id = blocks[idx]! & 0xfff;
      const e = emission[id]!;
      if (e > 0) {
        light[idx] = (light[idx]! & 0xf0) | e;
        q[tail] = idx;
        tail = (tail + 1) & QMASK;
        continue;
      }
      if (y >= maxH) continue;
      const s = light[idx]! >> 4;
      if (s <= 1) continue;
      // Only seed if some horizontal neighbour could be brightened.
      let seed = false;
      if (x > 0 && (light[idx - 1]! >> 4) < s - 1 && opacity[blocks[idx - 1]! & 0xfff]! < 15) seed = true;
      else if (x < 15 && (light[idx + 1]! >> 4) < s - 1 && opacity[blocks[idx + 1]! & 0xfff]! < 15) seed = true;
      else if (z > 0 && (light[idx - 16]! >> 4) < s - 1 && opacity[blocks[idx - 16]! & 0xfff]! < 15) seed = true;
      else if (z < 15 && (light[idx + 16]! >> 4) < s - 1 && opacity[blocks[idx + 16]! & 0xfff]! < 15) seed = true;
      else if (w > 0 && (light[idx - 256]! >> 4) < s - 1 && opacity[blocks[idx - 256]! & 0xfff]! < 15) seed = true;
      else if (w < 15 && (light[idx + 256]! >> 4) < s - 1 && opacity[blocks[idx + 256]! & 0xfff]! < 15) seed = true;
      else if (y > 0 && (light[idx - COLUMN_LAYER]! >> 4) < s - 1 && opacity[blocks[idx - COLUMN_LAYER]! & 0xfff]! < 15) seed = true;
      if (seed) {
        q[tail] = idx;
        tail = (tail + 1) & QMASK;
      }
    }
  }

  // 3. BFS increase propagation within the column.
  const tryN = (j: number, s: number, b: number, down: boolean): void => {
    const op = opacity[blocks[j]! & 0xfff]!;
    if (op >= 15) return;
    const ns = down && s === 15 && op === 0 ? 15 : s - 1 - op;
    const nb = b - 1 - op;
    const lj = light[j]!;
    const sj = lj >> 4;
    const bj = lj & 15;
    if (ns > sj || nb > bj) {
      light[j] = ((ns > sj ? ns : sj) << 4) | (nb > bj ? nb : bj);
      q[tail] = j;
      tail = (tail + 1) & QMASK;
    }
  };
  while (head !== tail) {
    const i = q[head]!;
    head = (head + 1) & QMASK;
    const l = light[i]!;
    const s = l >> 4;
    const b = l & 15;
    if (s <= 1 && b <= 1) continue;
    const x = i & 15, z = (i >> 4) & 15, w = (i >> 8) & 15, y = i >> 12;
    if (x > 0) tryN(i - 1, s, b, false);
    if (x < 15) tryN(i + 1, s, b, false);
    if (z > 0) tryN(i - 16, s, b, false);
    if (z < 15) tryN(i + 16, s, b, false);
    if (w > 0) tryN(i - 256, s, b, false);
    if (w < 15) tryN(i + 256, s, b, false);
    if (y > 0) tryN(i - COLUMN_LAYER, s, b, true);
    if (y < H - 1) tryN(i + COLUMN_LAYER, s, b, false);
  }
}
