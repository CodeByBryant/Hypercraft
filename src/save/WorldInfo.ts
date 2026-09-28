// World metadata (one per saved world) and seed handling.

import { hashString } from '../math/rng';

export type Difficulty = 'peaceful' | 'easy' | 'normal' | 'hard';
export type SavedGameMode = 'survival' | 'creative' | 'adventure' | 'spectator';

export interface SavedPlayer {
  pos: number[];
  F: number[];
  R: number[];
  H: number[];
  pitch: number;
  mode: SavedGameMode;
  flying: boolean;
  /** Free-form per-phase player data (inventory, health, xp, effects...). */
  data?: Record<string, unknown>;
}

export interface SavedState {
  realm: string;
  player: SavedPlayer;
  ticks: number;
  weather: string;
  weatherLeft: number;
  hotbar?: string[];
  hotbarIndex?: number;
  /** Free-form world data added by later phases (advancements, bosses defeated, ...). */
  data?: Record<string, unknown>;
}

export interface WorldInfo {
  id: string;
  name: string;
  seedText: string;
  seed: number;
  mode: SavedGameMode;
  difficulty: Difficulty;
  hardcore: boolean;
  cheats: boolean;
  created: number;
  lastPlayed: number;
  version: number;
  /** Block names at save time (index = numeric id) so saves survive registry changes. */
  palette: string[];
  state?: SavedState;
}

export const SAVE_VERSION = 1;

/** Seed from user text: integers are used as-is (like Minecraft), text is hashed, empty = random. */
export function seedFromText(text: string): number {
  const t = text.trim();
  if (t === '') return (Math.random() * 4294967296) >>> 0;
  if (/^-?\d{1,10}$/.test(t)) {
    const n = Number(t);
    if (Number.isSafeInteger(n) && n >= -2147483648 && n <= 4294967295) return n >>> 0;
  }
  return hashString(t);
}

export function randomSeedText(): string {
  return String(Math.floor(Math.random() * 2147483647));
}

export function newWorldId(): string {
  const a = new Uint8Array(8);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** A few named seeds that make good first worlds. */
export const SEED_IDEAS: { seed: string; note: string }[] = [
  { seed: 'hypercraft', note: 'the reference world (docs screenshots)' },
  { seed: 'tesseract', note: 'rolling 4D hills' },
  { seed: 'kata ana', note: 'lots of coastline' },
  { seed: 'penteract', note: 'mixed climates' },
  { seed: '4', note: 'just the number four' },
  { seed: 'hollow peaks', note: 'dramatic terrain' },
];
