// Mobs of the Mirror Realm (Phase 9). Bodies follow the conventions of mobs.ts (x right, y up, z
// forward, w the mob's own ana axis). Everything here is exclusive to the realm.
//
//  * Reflection Shambler: stands on its hands with its legs in the air, and throws arrows back.
//  * Mirror Stalker: keeps to your reflection in a mirror that creeps toward you (AI 'mirror').
//  * Silver Wraith: a fast, weakening, undead flier (silver and Smite hurt it twice as much).
//  * Mirror Twin: the boss of the Mirror Palace; it is you (AI 'twin', src/game/MirrorBoss.ts).

import type { MobDef, MobSpawn } from './types';
import { ball, box, capsule } from './mobs';
import { dollParts, newDollState, type DollPalette } from '../game/PlayerModel';

/** The Twin wears your body in silver (MirrorBoss rebuilds the pose and your armour on top of this). */
export const TWIN_PALETTE: DollPalette = { skin: '#d6def2', hair: '#8c98b8', shirt: '#b8c4de', pants: '#7c88ac', shoes: '#5c668a', face: '#2c3252' };


export const MIRROR_MOBS: MobDef[] = [
  {
    // Inverted: the head hangs near the ground between two arms it walks on, and the legs wave
    // overhead. Slow and sturdy; arrows you shoot at it come back.
    name: 'reflection_shambler',
    displayName: 'Reflection Shambler',
    hostile: true,
    ai: 'melee',
    reflects: true,
    health: 32,
    speed: 2.4,
    damage: 5,
    width: 0.45,
    height: 2.2,
    xp: 8,
    parts: [
      box([0, 1.2, 0, 0], [0.27, 0.42, 0.15, 0.15], '#8a96b4'),
      ball([0, 0.45, 0.06, 0], 0.2, '#c4d0e8', 'head'),
      ball([0.08, 0.5, 0.24, 0], 0.045, '#ffffff', undefined, 0, true),
      ball([-0.08, 0.5, 0.24, 0], 0.045, '#ffffff', undefined, 0, true),
      capsule([0.3, 0, 0, 0], [0.32, 0.95, 0, 0], 0.09, '#6a769a', 'leg', 0),
      capsule([-0.3, 0, 0, 0], [-0.32, 0.95, 0, 0], 0.09, '#6a769a', 'leg', Math.PI),
      capsule([0, 0, 0, 0.28], [0, 0.95, 0, 0.3], 0.09, '#6a769a', 'leg', Math.PI / 2),
      capsule([0.13, 1.6, 0, 0], [0.22, 2.15, 0.12, 0], 0.1, '#aab6d2', 'leg', Math.PI),
      capsule([-0.13, 1.6, 0, 0], [-0.22, 2.15, 0.12, 0], 0.1, '#aab6d2', 'leg', 0),
    ],
    drops: [{ item: 'reflection_dust', count: [0, 2] }, { item: 'silver_nugget', count: [0, 2], chance: 0.5 }],
  },
  {
    // A silver figure that is only ever where your reflection would be.
    name: 'mirror_stalker',
    displayName: 'Mirror Stalker',
    hostile: true,
    ai: 'mirror',
    health: 24,
    speed: 4.6,
    damage: 6,
    width: 0.4,
    height: 1.9,
    xp: 10,
    parts: [
      capsule([0, 0.75, 0, 0], [0, 1.4, 0, 0], 0.24, '#d2dcf0'),
      ball([0, 1.75, 0.02, 0], 0.21, '#eaf0ff', 'head'),
      ball([0.08, 1.78, 0.2, 0], 0.04, '#6a78c8', undefined, 0, true),
      ball([-0.08, 1.78, 0.2, 0], 0.04, '#6a78c8', undefined, 0, true),
      capsule([0.12, 0, 0, 0], [0.1, 0.8, 0, 0], 0.1, '#b4c0dc', 'leg', 0),
      capsule([-0.12, 0, 0, 0], [-0.1, 0.8, 0, 0], 0.1, '#b4c0dc', 'leg', Math.PI),
      capsule([0.3, 1.35, 0, 0], [0.34, 0.6, 0.08, 0], 0.08, '#c4d0e8', 'leg', Math.PI),
      capsule([-0.3, 1.35, 0, 0], [-0.34, 0.6, 0.08, 0], 0.08, '#c4d0e8', 'leg', 0),
      // The glass it keeps: a thin pane before it, shining.
      { kind: 'box', at: [0, 1, 0.42, 0], size: [0.5, 0.95, 0.012, 0.5], color: '#ffffff', glow: true },
    ],
    drops: [{ item: 'reflection_dust', count: [1, 2] }, { item: 'mirror_shard', count: [0, 1], chance: 0.12 }],
  },
  {
    // Weak, quick, cold: its touch drains your strength. Silver and Smite hurt it double.
    name: 'silver_wraith',
    displayName: 'Silver Wraith',
    hostile: true,
    ai: 'flyer',
    floats: true,
    undead: true,
    health: 18,
    speed: 4,
    damage: 4,
    width: 0.4,
    height: 1.4,
    xp: 9,
    inflicts: { effect: 'weakness', seconds: 8, amp: 0 },
    parts: [
      capsule([0, 0.9, 0.35, 0], [0, 0.9, -0.3, 0], 0.32, '#c8d4ec', 'wing', 0),
      ball([0, 1.0, 0.45, 0], 0.22, '#e8f0ff', 'head'),
      ball([0.08, 1.04, 0.62, 0], 0.045, '#9a8aff', undefined, 0, true),
      ball([-0.08, 1.04, 0.62, 0], 0.045, '#9a8aff', undefined, 0, true),
      // A tail of drifting mist.
      ball([0, 0.8, -0.5, 0], 0.22, '#aebce0', 'tail', 0),
      ball([0, 0.65, -0.95, 0], 0.16, '#98a8d4', 'tail', 1),
      ball([0, 0.5, -1.3, 0], 0.1, '#8a9ac8', 'tail', 2),
      // Wings that spread through w: you see them from the side only when your slice cuts them.
      box([0, 1.0, -0.1, 0.55], [0.04, 0.3, 0.45, 0.5], '#b4c2e8', 'wing', 0),
      box([0, 1.0, -0.1, -0.55], [0.04, 0.3, 0.45, 0.5], '#b4c2e8', 'wing', Math.PI),
    ],
    drops: [{ item: 'silver_nugget', count: [1, 3] }, { item: 'reflection_dust', count: [0, 1], chance: 0.5 }],
  },
  {
    // The boss of the Mirror Palace. Its parts are rebuilt every frame (Mob.dyn) from your pose.
    name: 'mirror_twin',
    displayName: 'The Mirror Twin',
    hostile: true,
    ai: 'twin',
    boss: true,
    persistent: true,
    health: 400,
    speed: 4.2,
    damage: 8,
    width: 0.6,
    height: 1.9,
    xp: 6000,
    parts: dollParts(newDollState(), [], TWIN_PALETTE),
    drops: [
      { item: 'twin_core', count: [1, 1] },
      { item: 'mirror_shard', count: [10, 16] },
      { item: 'silver_ingot', count: [6, 10] },
      { item: 'enchanted_golden_apple', count: [1, 2] },
    ],
  },
];

/** What spawns where (night tables: hostile mobs spawn in the dark here as everywhere). */
export const MIRROR_SPAWNS: Record<string, MobSpawn[]> = {
  silver_plains: [{ mob: 'reflection_shambler', weight: 10 }, { mob: 'mirror_stalker', weight: 4 }],
  glass_forest: [{ mob: 'reflection_shambler', weight: 8 }, { mob: 'silver_wraith', weight: 6 }],
  quicksilver_fen: [{ mob: 'silver_wraith', weight: 10 }, { mob: 'reflection_shambler', weight: 6 }],
  shard_dunes: [{ mob: 'mirror_stalker', weight: 9 }, { mob: 'reflection_shambler', weight: 6 }],
  frost_mirror: [{ mob: 'silver_wraith', weight: 8 }, { mob: 'mirror_stalker', weight: 6 }],
  echo_peaks: [{ mob: 'mirror_stalker', weight: 8 }, { mob: 'silver_wraith', weight: 8 }, { mob: 'reflection_shambler', weight: 6 }],
  chrome_sea: [{ mob: 'silver_wraith', weight: 8 }],
};
