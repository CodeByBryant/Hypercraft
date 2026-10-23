// Rifts (Phase 9): the links between the Surface and the realms reached through a rift in an arch
// instead of a portal. Each link names its awake and dormant rift blocks, the realms it joins, what
// wakes it, the cells of the arch built around an arrival, and how the arrival stands in each realm.
// Game (updateRift, arriveAtRift, the wake items) reads this table; add a row for a new link.

import { ARCH_AIR, archCells, type ArchCell } from './mirror';
import { gateCells } from './abyss';
import { skyGateCells } from './cloud';
import type { ItemDef, RecipeDef } from './types';

export interface RiftLink {
  /** The awake and dormant rift blocks. */
  rift: string;
  dormant: string;
  /** The two realms it joins (travel goes to the other one). */
  realms: [string, string];
  /** The cells of the arch around a rift's base cell, for the given rift block. */
  cells(rift: string): ArchCell[];
  /** The block under the arch's four corner pillars when an arrival builds one. */
  foot: string;
  /** What wakes a dormant rift: the item held up to it (the Hand Mirror, a Resonance Crystal). */
  waker: string;
  /** The line shown on arrival, by the realm you arrive in. */
  arrival: Record<string, string>;
  /**
   * How an arrival gate stands in each realm: 'ground' on the top of the terrain (open sky), or
   * 'depth' at about the height you came from, in a chamber carved for it (enclosed realms).
   */
  stand: Record<string, 'ground' | 'depth'>;
}

export const RIFT_LINKS: RiftLink[] = [
  {
    rift: 'mirror_rift',
    dormant: 'dormant_rift',
    realms: ['surface', 'mirror'],
    cells: archCells,
    foot: 'arch_stone',
    waker: 'hand_mirror',
    arrival: { mirror: 'The Mirror Realm: up is W, and left and right swap (Settings turns that off)', surface: 'Back on the Surface' },
    stand: { surface: 'ground', mirror: 'ground' },
  },
  {
    rift: 'abyss_rift',
    dormant: 'dormant_abyss_rift',
    realms: ['surface', 'abyss'],
    cells: gateCells,
    foot: 'gate_stone',
    waker: 'resonance_crystal',
    arrival: { abyss: 'The Crystal Abyss: no sun, no sky, and only the crystals for light', surface: 'Back on the Surface' },
    stand: { surface: 'ground', abyss: 'depth' },
  },
  {
    rift: 'cloud_rift',
    dormant: 'dormant_cloud_rift',
    realms: ['surface', 'cloud'],
    cells: skyGateCells,
    foot: 'sky_gate_stone',
    waker: 'zephyr_feather',
    arrival: { cloud: 'The Cloud Archipelago: light gravity, and the wind blows along W (a Wind Glider rides it)', surface: 'Back on the Surface' },
    stand: { surface: 'ground', cloud: 'ground' },
  },
];

/**
 * The Rift Compass: a Hypercompass tuned to rifts. Held, its arrow points to the nearest Silver Arch,
 * Geode Gate or Sky Gate (the three Surface ends of the links above) or, deeper in, to the Crystal
 * Cathedral and the Cloud Citadel. It needs only a compass, an amethyst shard and a gold ingot, so it
 * is there long before the Hand Mirror, Resonance Compass or Zephyr Feather it helps you use.
 */
export const RIFT_ITEMS: ItemDef[] = [
  { name: 'rift_compass', displayName: 'Rift Compass', maxStack: 1, icon: { shape: 'compass', colors: ['#d8a0ff', '#6a3a9a', '#fff0d0'] }, readout: 'atlas', atlas: ['silver_arch', 'geode_gate', 'sky_gate', 'crystal_cathedral', 'cloud_citadel'], group: 'tools', tags: ['glint'] },
];

export const RIFT_RECIPES: RecipeDef[] = [
  { type: 'shapeless', ingredients: ['compass', 'amethyst_shard', 'gold_ingot'], result: 'rift_compass' },
];

export const riftLinkOf = (rift: string | undefined): RiftLink => RIFT_LINKS.find((l) => l.rift === rift) ?? RIFT_LINKS[0]!;

/** The air an arrival gate needs around it in a realm where it stands in rock ('depth'): a 5 x 5 x 5 x 5 chamber over its floor. */
export const ARRIVAL_ROOM: [number, number, number, number][] = (() => {
  const out: [number, number, number, number][] = [];
  for (let c = -2; c <= 2; c++) for (let b = -2; b <= 2; b++) for (let a = -2; a <= 2; a++) for (let y = 0; y <= 4; y++) out.push([a, y, b, c]);
  return out;
})();

export { ARCH_AIR };
