// Advancement tracking (Phase 8): which goals are done, and the counters behind the numeric ones.
// Pure state: the game calls in (have / mined / killed / ate / realm / biome / event / stat) and
// gets onUnlock for each goal reached. Saved with the world (SavedState.data.advancements).

import { ADVANCEMENTS, ADV_BY_ID, type AdvCategory, type AdvEvent, type AdvStat, type AdvancementDef } from '../content/advancements';

export interface SavedAdvancements {
  /** Advancement id -> when it was done (ms since the epoch). */
  done: Record<string, number>;
  stats: Record<string, number>;
  biomes: string[];
}

export class Advancements {
  readonly done = new Map<string, number>();
  readonly stats: Record<string, number> = {};
  readonly biomes = new Set<string>();
  /** Called for every goal reached (not for ones loaded from a save). */
  onUnlock: ((a: AdvancementDef) => void) | null = null;

  constructor(readonly defs: AdvancementDef[] = ADVANCEMENTS) {}

  has(id: string): boolean {
    return this.done.has(id);
  }

  /** Complete an advancement (false if it already was, or does not exist). */
  grant(id: string): boolean {
    const a = ADV_BY_ID.get(id);
    if (!a || this.done.has(id)) return false;
    this.done.set(id, Date.now());
    this.onUnlock?.(a);
    return true;
  }

  private each(type: string, f: (a: AdvancementDef) => boolean): void {
    for (const a of this.defs) if (a.criterion.type === type && !this.done.has(a.id) && f(a)) this.grant(a.id);
  }

  /** The world was entered. */
  start(): void {
    this.each('start', () => true);
  }

  /** The inventory as counts by item name and by '#tag' (polled about once a second). */
  have(counts: ReadonlyMap<string, number>): void {
    this.each('have', (a) => {
      const c = a.criterion as { type: 'have'; items: string[]; count?: number };
      let n = 0;
      for (const it of c.items) n += counts.get(it) ?? 0;
      return n >= (c.count ?? 1);
    });
  }

  mined(block: string): void {
    this.each('mine', (a) => (a.criterion as { blocks: string[] }).blocks.includes(block));
  }

  killed(mob: string, hostile: boolean): void {
    this.each('kill', (a) => {
      const m = (a.criterion as { mobs: string[] }).mobs;
      return m.includes(mob) || (hostile && m.includes('*hostile'));
    });
  }

  ate(item: string): void {
    this.each('eat', (a) => (a.criterion as { items: string[] }).items.includes(item));
  }

  realm(name: string): void {
    this.each('realm', (a) => (a.criterion as { realm: string }).realm === name);
  }

  /** Been in a biome (counts distinct ones). */
  biome(name: string): void {
    if (this.biomes.has(name)) return;
    this.biomes.add(name);
    this.each('biome', (a) => this.biomes.size >= (a.criterion as { count: number }).count);
  }

  event(name: AdvEvent): void {
    this.each('event', (a) => (a.criterion as { name: string }).name === name);
  }

  /** A counter that only ever records its largest value (the slice tilt). */
  maxStat(name: AdvStat, value: number): void {
    if (value <= (this.stats[name] ?? 0)) return;
    this.stats[name] = value;
    this.checkStat(name);
  }

  /** A counter that adds up (blocks walked along the hidden axis, blocks glided). */
  addStat(name: AdvStat, delta: number): void {
    if (delta <= 0) return;
    this.stats[name] = (this.stats[name] ?? 0) + delta;
    this.checkStat(name);
  }

  private checkStat(name: AdvStat): void {
    this.each('stat', (a) => {
      const c = a.criterion as { stat: string; value: number };
      return c.stat === name && (this.stats[name] ?? 0) >= c.value;
    });
  }

  /** Done and total, for everything or one category. */
  progress(category?: AdvCategory): { done: number; total: number } {
    let done = 0, total = 0;
    for (const a of this.defs) {
      if (category && a.category !== category) continue;
      total++;
      if (this.done.has(a.id)) done++;
    }
    return { done, total };
  }

  save(): SavedAdvancements {
    return { done: Object.fromEntries(this.done), stats: { ...this.stats }, biomes: [...this.biomes] };
  }

  /** Restore from a save (unknown ids and bad values are dropped; nothing fires onUnlock). */
  load(d: unknown): void {
    this.done.clear();
    this.biomes.clear();
    for (const k of Object.keys(this.stats)) delete this.stats[k];
    if (typeof d !== 'object' || d === null) return;
    const s = d as Partial<SavedAdvancements>;
    if (s.done && typeof s.done === 'object') for (const [id, t] of Object.entries(s.done)) if (ADV_BY_ID.has(id) && typeof t === 'number') this.done.set(id, t);
    if (s.stats && typeof s.stats === 'object') for (const [k, v] of Object.entries(s.stats)) if (typeof v === 'number' && Number.isFinite(v)) this.stats[k] = v;
    if (Array.isArray(s.biomes)) for (const b of s.biomes) if (typeof b === 'string') this.biomes.add(b);
  }
}
