// Villager trading (Phase 5): per-villager offers drawn from the profession's levels, prices
// that react to reputation and demand, trade experience and levelling, and restocking.
// Pure data + functions: the state lives on the villager (Mob.data) and is saved with it.

import { IREG } from '../content/itemRegistry';
import { randomEnchantment, rollEnchantments } from '../content/enchanting';
import type { ItemTag } from './items/ItemStack';
import { MERCHANT_TRADES, PROFESSIONS, TRADE_LEVEL_XP } from '../content/trades';
import type { TradeDef } from '../content/types';
import { Rng } from '../math/rng';

export interface Offer {
  cost: [string, number][];
  result: [string, number];
  maxUses: number;
  xp: number;
  uses: number;
  /** Rises when an offer sells out between restocks; raises its price. */
  demand: number;
  /** Enchantments on the result (Phase 7: enchanted books, enchanted gear). */
  tag?: ItemTag;
}

export interface VillagerData {
  profession: string;
  /** 0 novice .. 4 master. */
  level: number;
  xp: number;
  offers: Offer[];
  /** The player's standing with this villager (trading raises it, hitting lowers it). */
  rep: number;
  /** In-game half-day index of the last restock. */
  restock: number;
  seed: number;
  home?: [number, number, number, number];
  village?: string;
}

const OFFERS_PER_LEVEL = 2;

function offer(t: TradeDef, rng?: Rng): Offer {
  const o: Offer = { cost: t.cost.map(([n, c]) => [n, c] as [string, number]), result: [t.result[0], t.result[1]], maxUses: t.maxUses, xp: t.xp, uses: 0, demand: 0 };
  if (t.enchant && rng) {
    const r = () => rng.next();
    const id = IREG.id(t.result[0]);
    let ench: [string, number][] = [];
    if (t.enchant === 'random') {
      // Books: any enchantment (treasure too); the price grows with the level, like Minecraft's.
      const e = randomEnchantment(IREG.id('book'), r);
      if (e) {
        ench = [e];
        o.cost[0]![1] = Math.min(64, o.cost[0]![1] + 3 * e[1] + rng.int(5));
      }
    } else ench = rollEnchantments(id, t.enchant[0] + rng.int(t.enchant[1] - t.enchant[0] + 1), r);
    if (ench.length) o.tag = { ench };
  }
  return o;
}

/** Pick `n` distinct trades from a list with a seeded RNG. */
function pick(list: TradeDef[], n: number, rng: Rng): TradeDef[] {
  const pool = list.slice();
  const out: TradeDef[] = [];
  while (pool.length && out.length < n) out.push(pool.splice(rng.int(pool.length), 1)[0]!);
  return out;
}

/** A fresh villager of a profession ('merchant' = the Wandering Merchant). */
export function newVillager(profession: string, seed: number): VillagerData {
  const d: VillagerData = { profession, level: 0, xp: 0, offers: [], rep: 0, restock: -1, seed };
  if (profession === 'merchant') {
    const rng = new Rng(seed);
    d.offers = pick(MERCHANT_TRADES, 6, rng).map((t) => offer(t, rng));
    d.level = 4;
  } else unlockLevel(d, 0);
  return d;
}

/** Add the offers of `level` (called on creation and on every level up). */
function unlockLevel(d: VillagerData, level: number): void {
  const prof = PROFESSIONS.find((p) => p.name === d.profession);
  if (!prof) return;
  const rng = new Rng(d.seed ^ (level * 0x9e3779b1));
  for (const t of pick(prof.levels[level] ?? [], OFFERS_PER_LEVEL, rng)) d.offers.push(offer(t, rng));
}

/** Reputation discount (up to 35% off) or markup (up to 50% more when disliked). */
export function repFactor(rep: number): number {
  return 1 - Math.max(-0.5, Math.min(0.35, rep * 0.03));
}

/** The price actually charged for cost stack `i` of an offer. Only the first stack moves. */
export function price(o: Offer, i: number, rep: number): number {
  const [name, base] = o.cost[i]!;
  if (i > 0) return base;
  const max = IREG.has(name) ? IREG.maxStack[IREG.id(name)]! : 64;
  return Math.max(1, Math.min(max, Math.round(base * (1 + 0.05 * o.demand) * repFactor(rep))));
}

export function soldOut(o: Offer): boolean {
  return o.uses >= o.maxUses;
}

/**
 * Record one completed trade: uses, experience, reputation, and a level up when the
 * experience reaches the next threshold. Returns true if the villager levelled up.
 */
export function recordTrade(d: VillagerData, o: Offer): boolean {
  o.uses++;
  d.xp += o.xp;
  d.rep = Math.min(20, d.rep + 1);
  if (d.profession === 'merchant') return false;
  if (d.level < TRADE_LEVEL_XP.length - 1 && d.xp >= TRADE_LEVEL_XP[d.level + 1]!) {
    d.level++;
    unlockLevel(d, d.level);
    return true;
  }
  return false;
}

/** The player hit this villager: reputation falls. */
export function offend(d: VillagerData, amount = 5): void {
  d.rep = Math.max(-20, d.rep - amount);
}

/**
 * Restock twice a day (Minecraft villagers restock at their workstation). `halfDay` is the
 * in-game half-day index; offers that sold out raise their demand, others let it fall.
 */
export function restock(d: VillagerData, halfDay: number): boolean {
  if (d.restock === halfDay || d.profession === 'merchant') return false;
  const first = d.restock < 0;
  d.restock = halfDay;
  if (first) return false;
  for (const o of d.offers) {
    o.demand = soldOut(o) ? Math.min(10, o.demand + 1) : Math.max(0, o.demand - 1);
    o.uses = 0;
  }
  return true;
}

export function levelProgress(d: VillagerData): number {
  if (d.level >= TRADE_LEVEL_XP.length - 1) return 1;
  const a = TRADE_LEVEL_XP[d.level]!, b = TRADE_LEVEL_XP[d.level + 1]!;
  return Math.max(0, Math.min(1, (d.xp - a) / (b - a)));
}
