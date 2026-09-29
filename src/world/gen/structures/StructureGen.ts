// Applies structures to a generated column: finds every structure start whose footprint can
// reach the column, builds (and caches) its plan, writes the column's share of blocks and turns
// its markers into column data: chest contents (rolled from loot tables), spawner entities and
// villager spawn records. Runs in the generation worker right after terrain and vegetation.

import { REG } from '../../../content/registry';
import { LOOT } from '../../../content/lootRegistry';
import type { StructureDef } from '../../../content/types';
import { Rng, hash4 } from '../../../math/rng';
import type { ColumnSample, SurfaceGenerator } from '../SurfaceGen';
import { ORIENTS, Builder } from './Builder';
import { BUILDERS } from './builders';
import { IF_AIR, IF_SOFT, StructurePlan } from './Plan';
import { StructurePlacer, type Start } from './Placement';

/** Per-column data produced by generation (merged into Column.extra). */
export interface GenExtra {
  be?: Record<string, unknown>;
  npcs?: { mob: string; x: number; y: number; z: number; w: number; data?: Record<string, unknown> }[];
}

export class StructureGen {
  readonly placer: StructurePlacer;
  private readonly gen: SurfaceGenerator;
  private readonly plans = new Map<string, StructurePlan>();
  private readonly starts: Start[] = [];
  private readonly s: ColumnSample = { height: 0, biome: 0, grass: [0, 0, 0] };
  private readonly soft: Uint8Array;

  constructor(gen: SurfaceGenerator) {
    this.gen = gen;
    this.placer = new StructurePlacer(gen);
    for (const d of this.placer.defs) if (!BUILDERS[d.builder]) throw new Error(`structure "${d.name}": unknown builder "${d.builder}"`);
    // Cells a structure may overwrite in IF_SOFT mode: air, fluids, plants, snow layers.
    this.soft = new Uint8Array(4096);
    for (let i = 0; i < REG.count; i++) this.soft[i] = REG.solid[i] && REG.fluid[i] === 0 ? 0 : 1;
  }

  /** Terrain height used by builders (land surface, or the sea surface over water). */
  private ground = (x: number, z: number, w: number): number => {
    const s = this.gen.sample(x, z, w, this.s);
    return s.height;
  };

  /** The plan for a start (built on first use). */
  plan(st: Start): StructurePlan {
    const key = `${st.def.salt},${st.i},${st.j},${st.k}`;
    let p = this.plans.get(key);
    if (p) {
      // LRU: move to the back.
      this.plans.delete(key);
      this.plans.set(key, p);
      return p;
    }
    p = new StructurePlan(st.def.name, this.gen.height);
    const b = new Builder(p, new Rng(st.seed), this.ground, this.gen.sea);
    b.frame(st.x, st.y, st.z, st.w, ORIENTS[st.orient]!);
    BUILDERS[st.def.builder]!(b, st);
    this.plans.set(key, p);
    if (this.plans.size > 40) this.plans.delete(this.plans.keys().next().value!);
    return p;
  }

  /** Write every structure overlapping column (cx, cz, cw) into `blocks`; fill `extra`. */
  apply(cx: number, cz: number, cw: number, blocks: Uint16Array, extra: GenExtra): void {
    const X0 = cx * 16, Z0 = cz * 16, W0 = cw * 16;
    const starts = this.starts;
    for (const def of this.placer.defs) {
      starts.length = 0;
      this.placer.startsNear(def, X0, Z0, W0, X0 + 15, Z0 + 15, W0 + 15, starts);
      for (const st of starts) this.applyOne(st, def, cx, cz, cw, blocks, extra);
    }
  }

  private applyOne(st: Start, def: StructureDef, cx: number, cz: number, cw: number, blocks: Uint16Array, extra: GenExtra): void {
    const plan = this.plan(st);
    const list = plan.column(cx, cz, cw);
    if (list) {
      const soft = this.soft;
      for (let i = 0; i < list.length; i += 3) {
        const idx = list[i]!, v = list[i + 1]!, mode = list[i + 2]!;
        if (mode === IF_AIR && blocks[idx] !== 0) continue;
        if (mode === IF_SOFT && !soft[blocks[idx]! & 0xfff]) continue;
        blocks[idx] = v;
      }
    }
    for (const m of plan.markersIn(cx, cz, cw)) {
      const lx = m.x - cx * 16, lz = m.z - cz * 16, lw = m.w - cw * 16;
      const key = `${lx},${m.y},${lz},${lw}`;
      if (m.kind === 'chest' && m.loot) {
        const rng = new Rng(hash4(m.x, m.y, m.z, m.w, st.seed));
        (extra.be ??= {})[key] = { type: 'chest', slots: LOOT.roll(m.loot, () => rng.next()) };
      } else if (m.kind === 'spawner' && m.mob) {
        (extra.be ??= {})[key] = { type: 'spawner', mob: m.mob, delay: 2 };
      } else if (m.kind === 'npc' && m.mob) {
        (extra.npcs ??= []).push({ mob: m.mob, x: m.x + 0.5, y: m.y, z: m.z + 0.5, w: m.w + 0.5, data: { ...m.data, structure: def.name } });
      }
    }
  }
}
