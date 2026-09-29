// A built structure: block writes bucketed by column (so generating a column only touches its
// own writes) plus markers for chests, spawners and villagers. Built once per structure start
// in a generation worker and cached; every column the structure overlaps applies its bucket.

import { COLUMN_LAYER } from '../../constants';

/** Write modes. */
export const REPLACE = 0;
/** Only into air (decoration that must not cut terrain). */
export const IF_AIR = 1;
/** Only into non-solid cells: air, water, plants (foundations, supports). */
export const IF_SOFT = 2;

export interface Marker {
  kind: 'chest' | 'spawner' | 'npc';
  x: number;
  y: number;
  z: number;
  w: number;
  /** Chest loot table. */
  loot?: string;
  /** Spawner / villager mob name. */
  mob?: string;
  /** Villager data (home position, village id). */
  data?: Record<string, unknown>;
}

const colKey = (cx: number, cz: number, cw: number): number => ((cx & 0x3ff) << 20) | ((cz & 0x3ff) << 10) | (cw & 0x3ff);

export class StructurePlan {
  readonly name: string;
  readonly min = [Infinity, Infinity, Infinity, Infinity];
  readonly max = [-Infinity, -Infinity, -Infinity, -Infinity];
  /** Column key -> flat [denseIndex, voxel, mode, ...]. */
  private readonly cols = new Map<number, number[]>();
  readonly markers: Marker[] = [];
  private readonly height: number;
  writes = 0;

  constructor(name: string, height: number) {
    this.name = name;
    this.height = height;
  }

  set(x: number, y: number, z: number, w: number, v: number, mode = REPLACE): void {
    if (y < 1 || y >= this.height - 1) return;
    const cx = Math.floor(x / 16), cz = Math.floor(z / 16), cw = Math.floor(w / 16);
    const k = colKey(cx, cz, cw);
    let list = this.cols.get(k);
    if (!list) {
      list = [];
      this.cols.set(k, list);
    }
    list.push((x - cx * 16) + ((z - cz * 16) << 4) + ((w - cw * 16) << 8) + y * COLUMN_LAYER, v, mode);
    this.writes++;
    if (x < this.min[0]!) this.min[0] = x;
    if (y < this.min[1]!) this.min[1] = y;
    if (z < this.min[2]!) this.min[2] = z;
    if (w < this.min[3]!) this.min[3] = w;
    if (x > this.max[0]!) this.max[0] = x;
    if (y > this.max[1]!) this.max[1] = y;
    if (z > this.max[2]!) this.max[2] = z;
    if (w > this.max[3]!) this.max[3] = w;
  }

  mark(m: Marker): void {
    this.markers.push(m);
  }

  /** Writes for one column (or undefined). */
  column(cx: number, cz: number, cw: number): number[] | undefined {
    return this.cols.get(colKey(cx, cz, cw));
  }

  /** Does the plan touch the column's horizontal footprint? */
  touches(cx: number, cz: number, cw: number): boolean {
    return this.cols.has(colKey(cx, cz, cw));
  }

  markersIn(cx: number, cz: number, cw: number): Marker[] {
    const out: Marker[] = [];
    for (const m of this.markers) if (Math.floor(m.x / 16) === cx && Math.floor(m.z / 16) === cz && Math.floor(m.w / 16) === cw) out.push(m);
    return out;
  }
}
