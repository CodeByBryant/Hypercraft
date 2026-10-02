// Active status effects on the player or a mob: amplifier (0 = level I) and seconds left.
// Minecraft's rules for re-applying: a stronger effect replaces a weaker one; the same level
// only extends the time.

import { EFFECT_BY_NAME } from '../content/effects';

export interface ActiveEffect {
  name: string;
  /** 0 = level I. */
  amp: number;
  /** Seconds left. */
  time: number;
  /** Seconds it started with (HUD fade). */
  total: number;
}

export class EffectList {
  readonly map = new Map<string, ActiveEffect>();
  /** Bumped on every change (HUD refresh). */
  version = 0;

  /** Add or strengthen an effect; returns true if it changed anything. */
  add(name: string, seconds: number, amp = 0): boolean {
    if (!EFFECT_BY_NAME.has(name) || seconds <= 0) return false;
    const cur = this.map.get(name);
    if (cur && (cur.amp > amp || (cur.amp === amp && cur.time >= seconds))) return false;
    this.map.set(name, { name, amp, time: seconds, total: seconds });
    this.version++;
    return true;
  }

  has(name: string): boolean {
    return this.map.has(name);
  }

  /** Amplifier of an effect (-1 when absent). */
  amp(name: string): number {
    return this.map.get(name)?.amp ?? -1;
  }

  /** Level of an effect (0 when absent, 1 = level I). */
  level(name: string): number {
    return this.amp(name) + 1;
  }

  remove(name: string): boolean {
    if (!this.map.delete(name)) return false;
    this.version++;
    return true;
  }

  clear(): void {
    if (this.map.size === 0) return;
    this.map.clear();
    this.version++;
  }

  get size(): number {
    return this.map.size;
  }

  /** Count down; returns the names that ran out this step. */
  tick(dt: number): string[] {
    const out: string[] = [];
    for (const e of this.map.values()) {
      e.time -= dt;
      if (e.time <= 0) out.push(e.name);
    }
    for (const n of out) this.map.delete(n);
    if (out.length) this.version++;
    return out;
  }

  save(): [string, number, number][] {
    return [...this.map.values()].map((e) => [e.name, e.amp, Math.round(e.time * 10) / 10]);
  }

  load(v: unknown): void {
    this.map.clear();
    if (Array.isArray(v))
      for (const e of v) {
        if (!Array.isArray(e) || typeof e[0] !== 'string' || !EFFECT_BY_NAME.has(e[0])) continue;
        const amp = Math.max(0, Math.min(9, Number(e[1]) | 0));
        const t = Math.max(0, Number(e[2]) || 0);
        if (t > 0) this.map.set(e[0], { name: e[0], amp, time: t, total: t });
      }
    this.version++;
  }
}
