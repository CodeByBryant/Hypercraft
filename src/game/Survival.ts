// Survival numbers (Phase 7): hunger and saturation, experience levels, armour damage
// reduction. Pure state + formulas (Minecraft's), unit-tested; Game wires them to the world.

export const MAX_FOOD = 20;

/** Kinds of damage: they decide what armour, enchantments and effects can reduce. */
export type DamageKind =
  | 'melee'
  | 'projectile'
  | 'explosion'
  | 'fire'
  | 'lava'
  | 'burn'
  | 'contact'
  | 'fall'
  | 'drown'
  | 'void'
  | 'magic'
  | 'wither'
  | 'starve'
  | 'generic';

/** Armour points and toughness reduce these kinds (the rest go straight through). */
export function armorApplies(kind: DamageKind): boolean {
  return kind === 'melee' || kind === 'projectile' || kind === 'explosion' || kind === 'fire' || kind === 'lava' || kind === 'contact' || kind === 'generic';
}

export function isFireDamage(kind: DamageKind): boolean {
  return kind === 'fire' || kind === 'lava' || kind === 'burn';
}

/**
 * Minecraft 1.9+ armour: damage x (1 - min(20, max(armor / 5, armor - 4 damage / (toughness + 8))) / 25).
 */
export function armorReduce(damage: number, armor: number, toughness: number): number {
  if (armor <= 0) return damage;
  const eff = Math.min(20, Math.max(armor / 5, armor - (4 * damage) / (toughness + 8)));
  return damage * (1 - eff / 25);
}

/** Enchantment protection factor (summed over armour, capped at 20): 4% each. */
export function epfReduce(damage: number, epf: number): number {
  return damage * (1 - Math.min(20, Math.max(0, epf)) / 25);
}

/** Durability an armour piece loses from a hit (Minecraft: a quarter of the damage, at least 1). */
export function armorWear(damage: number): number {
  return Math.max(1, Math.floor(damage / 4));
}

// ------------------------------------------------------------------ hunger

/**
 * Hunger (food 0..20), saturation (0..food: eaten first) and exhaustion (every 4 points costs
 * one saturation, or one food once saturation is gone).
 */
export class Hunger {
  food = MAX_FOOD;
  saturation = 5;
  exhaustion = 0;
  private healTimer = 0;
  private starveTimer = 0;
  version = 0;

  exhaust(amount: number): void {
    this.exhaustion = Math.min(40, this.exhaustion + amount);
  }

  eat(nutrition: number, saturation: number): void {
    this.food = Math.min(MAX_FOOD, this.food + nutrition);
    this.saturation = Math.min(this.food, this.saturation + saturation);
    this.version++;
  }

  /** Can eat ordinary food (not full). */
  get hungry(): boolean {
    return this.food < MAX_FOOD;
  }

  /** Sprinting needs more than 3 drumsticks. */
  get canSprint(): boolean {
    return this.food > 6;
  }

  /**
   * Advance by `dt` seconds. Returns health to heal (positive) or starvation damage
   * (negative). `difficulty` 0 peaceful (food refills), 1 easy (starving stops at 10 health),
   * 2 normal (stops at 1), 3 hard (can kill). `regen` false disables natural regeneration.
   */
  tick(dt: number, health: number, maxHealth: number, difficulty: number, regen = true): number {
    let out = 0;
    if (difficulty === 0 && this.food < MAX_FOOD) {
      this.healTimer += dt;
      if (this.healTimer >= 0.5) {
        this.healTimer = 0;
        this.food++;
        this.version++;
      }
    }
    while (this.exhaustion >= 4) {
      this.exhaustion -= 4;
      if (this.saturation > 0) this.saturation = Math.max(0, this.saturation - 1);
      else if (difficulty > 0) this.food = Math.max(0, this.food - 1);
      this.version++;
    }
    if (regen && health < maxHealth && health > 0) {
      if (this.food >= MAX_FOOD && this.saturation > 0) {
        // Saturated: fast healing (1 per half second), paid from saturation.
        this.healTimer += dt;
        if (this.healTimer >= 0.5) {
          this.healTimer = 0;
          const cost = Math.min(this.saturation, 6);
          out = cost / 6;
          this.exhaust(cost);
        }
      } else if (this.food >= 18) {
        this.healTimer += dt;
        if (this.healTimer >= 4) {
          this.healTimer = 0;
          out = 1;
          this.exhaust(6);
        }
      } else if (difficulty > 0) this.healTimer = 0;
    }
    if (this.food <= 0 && difficulty > 0) {
      this.starveTimer += dt;
      if (this.starveTimer >= 4) {
        this.starveTimer = 0;
        const floor = difficulty === 1 ? 10 : difficulty === 2 ? 1 : 0;
        if (health > floor) out = -1;
      }
    } else this.starveTimer = 0;
    return out;
  }

  reset(): void {
    this.food = MAX_FOOD;
    this.saturation = 5;
    this.exhaustion = 0;
    this.version++;
  }

  save(): { food: number; sat: number; exh: number } {
    return { food: this.food, sat: Math.round(this.saturation * 100) / 100, exh: Math.round(this.exhaustion * 100) / 100 };
  }

  load(v: unknown): void {
    const d = v as { food?: number; sat?: number; exh?: number } | undefined;
    if (!d) return;
    if (typeof d.food === 'number') this.food = Math.max(0, Math.min(MAX_FOOD, Math.round(d.food)));
    if (typeof d.sat === 'number') this.saturation = Math.max(0, Math.min(this.food, d.sat));
    if (typeof d.exh === 'number') this.exhaustion = Math.max(0, Math.min(40, d.exh));
    this.version++;
  }
}

// ------------------------------------------------------------------ experience

/** Points needed to go from `level` to the next (Minecraft). */
export function xpToNext(level: number): number {
  if (level >= 31) return 9 * level - 158;
  if (level >= 16) return 5 * level - 38;
  return 2 * level + 7;
}

/** Total points at the start of `level`. */
export function xpForLevel(level: number): number {
  if (level <= 16) return level * level + 6 * level;
  if (level <= 31) return Math.round(2.5 * level * level - 40.5 * level + 360);
  return Math.round(4.5 * level * level - 162.5 * level + 2220);
}

export class Experience {
  /** Total points. */
  points = 0;
  version = 0;

  get level(): number {
    let l = 0;
    while (xpForLevel(l + 1) <= this.points) l++;
    return l;
  }

  /** Progress through the current level, 0..1. */
  get progress(): number {
    const l = this.level;
    return (this.points - xpForLevel(l)) / xpToNext(l);
  }

  add(n: number): void {
    if (n <= 0) return;
    this.points += n;
    this.version++;
  }

  /** Spend whole levels (enchanting, the anvil), keeping the progress fraction. */
  spendLevels(n: number): boolean {
    const l = this.level;
    if (n > l) return false;
    const f = this.progress;
    const nl = l - n;
    this.points = xpForLevel(nl) + Math.floor(f * xpToNext(nl));
    this.version++;
    return true;
  }

  /** Points dropped on death (Minecraft: 7 per level, at most 100); the rest are lost. */
  deathDrop(): number {
    return Math.min(100, this.level * 7);
  }

  clear(): void {
    this.points = 0;
    this.version++;
  }

  save(): number {
    return this.points;
  }

  load(v: unknown): void {
    if (typeof v === 'number' && Number.isFinite(v)) this.points = Math.max(0, Math.floor(v));
    this.version++;
  }
}

/** Split an amount of experience into orb values (Minecraft's sizes). */
export function orbSizes(points: number): number[] {
  const sizes = [2477, 1237, 617, 307, 149, 73, 37, 17, 7, 3, 1];
  const out: number[] = [];
  let left = Math.floor(points);
  while (left > 0 && out.length < 40) {
    const s = sizes.find((v) => v <= left) ?? 1;
    out.push(s);
    left -= s;
  }
  if (left > 0) out[out.length - 1] = out[out.length - 1]! + left;
  return out;
}
