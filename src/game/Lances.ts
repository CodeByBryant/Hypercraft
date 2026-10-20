// Telegraphed columns of damaging blocks (the Void Sovereign's lances, the Mirror Twin's beams).
// A lance is announced on the radar and with sparks, erupts as a stack of blocks standing on the
// floor, burns for a while and is removed. Bosses call `announce` for the cells they want and
// `update` every frame; the field owns the blocks it places.

import { REG } from '../content/registry';
import { VOID_VOXEL } from '../world/constants';
import type { World } from '../world/World';
import type { Mark } from './BossFight';

export interface Lance {
  x: number;
  y: number;
  z: number;
  w: number;
  /** Seconds until it strikes (<= 0: struck). */
  erupt: number;
  burn: number;
  cells: number[][];
}

export interface LanceHost {
  world: World;
  glow(x: number, y: number, z: number, w: number, color: string, n?: number): void;
}

export interface LanceStyle {
  /** The block id a lance is made of. */
  block: number;
  warning: number;
  burn: number;
  height: number;
  /** Spark colour while it is announced. */
  color: string;
}

export class LanceField {
  readonly list: Lance[] = [];

  constructor(private readonly host: LanceHost, private readonly style: LanceStyle) {}

  /**
   * Announce a lance in the column (x, z, w) on the first floor between `top` and 12 below
   * `top - 3`. False if the column has no floor there (or is not loaded).
   */
  announce(x: number, z: number, w: number, top: number): boolean {
    const world = this.host.world;
    let y = -1;
    for (let yy = Math.floor(top + 3); yy > Math.floor(top) - 12 && yy > 1; yy--) {
      const v = world.getBlock(x, yy - 1, z, w);
      const a = world.getBlock(x, yy, z, w);
      if (v === VOID_VOXEL || a === VOID_VOXEL) break;
      if (REG.solid[v & 0xfff] && !REG.solid[a & 0xfff]) {
        y = yy;
        break;
      }
    }
    if (y < 0) return false;
    this.list.push({ x, y, z, w, erupt: this.style.warning, burn: this.style.burn, cells: [] });
    return true;
  }

  update(dt: number): void {
    const world = this.host.world, st = this.style;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const l = this.list[i]!;
      if (l.erupt > 0) {
        l.erupt -= dt;
        if (Math.random() < dt * 8) this.host.glow(l.x + 0.5, l.y + 0.1, l.z + 0.5, l.w + 0.5, st.color, 1);
        if (l.erupt <= 0) {
          for (let k = 0; k < st.height; k++) {
            const v = world.getBlock(l.x, l.y + k, l.z, l.w);
            if (v === VOID_VOXEL || (v !== 0 && !REG.replaceable[v & 0xfff])) break;
            world.setBlock(l.x, l.y + k, l.z, l.w, st.block);
            l.cells.push([l.x, l.y + k, l.z, l.w]);
          }
        }
        continue;
      }
      l.burn -= dt;
      if (l.burn > 0) continue;
      this.remove(l);
      this.list.splice(i, 1);
    }
  }

  private remove(l: Lance): void {
    const world = this.host.world;
    for (const c of l.cells) if ((world.getBlock(c[0]!, c[1]!, c[2]!, c[3]!) & 0xfff) === this.style.block) world.setBlock(c[0]!, c[1]!, c[2]!, c[3]!, 0);
  }

  /** Remove every lance at once (the boss fell, or the player left). */
  clear(): void {
    for (const l of this.list) this.remove(l);
    this.list.length = 0;
  }

  /** How many are announced, and how many of those stand in the slice of a camera at p with hidden axis H. */
  pending(p: ArrayLike<number>, H: ArrayLike<number>): { pending: number; inSlice: number } {
    let pending = 0, inSlice = 0;
    for (const l of this.list) {
      if (l.erupt <= 0) continue;
      pending++;
      const dh = (l.x + 0.5 - p[0]!) * H[0]! + (l.z + 0.5 - p[2]!) * H[2]! + (l.w + 0.5 - p[3]!) * H[3]!;
      if (Math.abs(dh) < 0.75) inSlice++;
    }
    return { pending, inSlice };
  }

  marks(out: Mark[]): void {
    for (const l of this.list) out.push({ x: l.x, y: l.y, z: l.z, w: l.w, kind: 'lance', pending: l.erupt > 0 });
  }
}
