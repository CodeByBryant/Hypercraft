// Compiles mob definitions: validation (parts, drops, biome spawn tables) and precomputed
// bounding radii. Main thread only.

import { IREG } from './itemRegistry';
import { REG, hexToRgb } from './registry';
import { MOBS } from './mobs';
import { ANIMALS } from './animals';
import { VOID_MOBS } from './voidMobs';
import type { MobDef } from './types';

export const MAX_MOB_PARTS = 16;

export interface CompiledMob {
  def: MobDef;
  index: number;
  /** Radius of a 4-ball around the mob origin containing every part (unscaled). */
  radius: number;
  /** Part colours as linear 0..1 RGB. */
  colors: Float32Array;
  drops: { item: number; min: number; max: number; chance: number }[];
}

export class MobRegistry {
  readonly mobs: CompiledMob[] = [];
  private readonly byName = new Map<string, number>();

  constructor(defs: MobDef[]) {
    const errors: string[] = [];
    defs.forEach((def, index) => {
      if (this.byName.has(def.name)) errors.push(`duplicate mob "${def.name}"`);
      this.byName.set(def.name, index);
      if (def.parts.length === 0 || def.parts.length > MAX_MOB_PARTS) errors.push(`mob "${def.name}": needs 1..${MAX_MOB_PARTS} parts`);
      let radius = 0;
      const colors = new Float32Array(def.parts.length * 3);
      def.parts.forEach((p, i) => {
        const ext = p.kind === 'box' ? Math.hypot(...(p.size ?? [0, 0, 0, 0])) : p.r ?? 0;
        if (p.kind === 'box' && !p.size) errors.push(`mob "${def.name}": box part ${i} needs size`);
        if (p.kind !== 'box' && !p.r) errors.push(`mob "${def.name}": ${p.kind} part ${i} needs r`);
        if (p.kind === 'capsule' && !p.to) errors.push(`mob "${def.name}": capsule part ${i} needs to`);
        // Undulating parts (the Starlight Serpent) sway up to ~0.5 off their rest position.
        const sway = p.anim === 'wave' ? 0.5 : 0;
        radius = Math.max(radius, Math.hypot(...p.at) + ext + 0.35 + sway);
        if (p.to) radius = Math.max(radius, Math.hypot(...p.to) + ext + 0.35 + sway);
        const [r, g, b] = hexToRgb(p.color);
        colors[i * 3] = r;
        colors[i * 3 + 1] = g;
        colors[i * 3 + 2] = b;
      });
      const drops: CompiledMob['drops'] = [];
      for (const d of def.drops ?? []) {
        if (!IREG.has(d.item)) errors.push(`mob "${def.name}": unknown drop "${d.item}"`);
        else drops.push({ item: IREG.id(d.item), min: d.count?.[0] ?? 1, max: d.count?.[1] ?? d.count?.[0] ?? 1, chance: d.chance ?? 1 });
      }
      if (def.projectile && !IREG.has(def.projectile.item)) errors.push(`mob "${def.name}": unknown projectile "${def.projectile.item}"`);
      if (def.lays && !IREG.has(def.lays.item)) errors.push(`mob "${def.name}": unknown laid item "${def.lays.item}"`);
      if (def.spins && !REG.has(def.spins.block)) errors.push(`mob "${def.name}": unknown spun block "${def.spins.block}"`);
      if (def.hostile && def.damage === undefined && def.ai !== 'exploder') errors.push(`mob "${def.name}": hostile mobs need damage`);
      this.mobs.push({ def, index, radius, colors, drops });
    });
    for (const b of REG.biomes) {
      for (const list of Object.values(b.mobs ?? {})) for (const m of list ?? []) if (!this.byName.has(m.mob)) errors.push(`biome "${b.name}": unknown mob "${m.mob}"`);
    }
    if (errors.length) throw new Error('Mob registry errors:\n  ' + errors.join('\n  '));
  }

  has(name: string): boolean {
    return this.byName.has(name);
  }

  get(name: string): CompiledMob {
    const i = this.byName.get(name);
    if (i === undefined) throw new Error(`unknown mob "${name}"`);
    return this.mobs[i]!;
  }
}

export const MOB_REG = new MobRegistry([...MOBS, ...ANIMALS, ...VOID_MOBS]);
