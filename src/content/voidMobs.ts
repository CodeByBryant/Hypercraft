// Mobs of the Hollow Void (Phase 8). Bodies follow the conventions of mobs.ts (x right, y up, z
// forward, w the mob's own ana axis). Their AI lives in MobManager: the Walker's gaze rule in
// src/game/mobs/gaze.ts, the Sentinel's wake-up when a vault chest opens (Game.useHeld).
//
// Void spawns happen on island tops only (RealmDef.islandSpawns) and, as in the other realms,
// in the dark: there is no day here, so everything not lit by a torch or a crystal is dark.

import type { MobDef, MobSpawn } from './types';
import { ball, box, capsule } from './mobs';

export const VOID_MOBS: MobDef[] = [
  {
    // Tall, silent and fast, and it only moves while you are NOT looking at it.
    name: 'void_walker',
    displayName: 'Void Walker',
    hostile: true,
    ai: 'walker',
    health: 40,
    speed: 5,
    damage: 9,
    width: 0.4,
    height: 3,
    xp: 12,
    parts: [
      capsule([0, 1.7, 0, 0], [0, 2.45, 0, 0], 0.2, '#150c26'),
      ball([0, 2.78, 0.04, 0], 0.19, '#1d1236', 'head'),
      ball([0.07, 2.82, 0.2, 0], 0.04, '#9affc8', undefined, 0, true),
      ball([-0.07, 2.82, 0.2, 0], 0.04, '#9affc8', undefined, 0, true),
      // A third eye on its ana side: it looks back at you from kata/ana of your slice.
      ball([0, 2.82, 0.18, 0.1], 0.04, '#9affc8', undefined, 0, true),
      // Three legs (two in its own plane, one toward +w) and three long arms.
      capsule([0.1, 0, 0, 0], [0.08, 1.7, 0, 0], 0.09, '#0f0820', 'leg', 0),
      capsule([-0.1, 0, 0, 0], [-0.08, 1.7, 0, 0], 0.09, '#0f0820', 'leg', Math.PI),
      capsule([0, 0, -0.05, 0.22], [0, 1.7, 0, 0.06], 0.09, '#0f0820', 'leg', Math.PI / 2),
      capsule([0.24, 2.35, 0, 0], [0.34, 0.95, 0.1, 0], 0.065, '#1d1236', 'leg', Math.PI),
      capsule([-0.24, 2.35, 0, 0], [-0.34, 0.95, 0.1, 0], 0.065, '#1d1236', 'leg', 0),
      capsule([0, 2.35, 0, 0.24], [0, 1.0, 0.1, 0.34], 0.065, '#1d1236', 'leg', Math.PI / 2),
    ],
    drops: [{ item: 'phase_dust', count: [1, 2] }, { item: 'starlight_shard', count: [0, 1], chance: 0.5 }],
  },
  {
    // Nine glowing motes spread through x, z AND w: a cloud you see different pieces of from
    // every slice. Weak, fast, and its sting slows you.
    name: 'whisper_swarm',
    displayName: 'Whisper Swarm',
    hostile: true,
    ai: 'flyer',
    floats: true,
    health: 10,
    speed: 3.6,
    damage: 2,
    width: 0.45,
    height: 0.9,
    xp: 4,
    inflicts: { effect: 'slowness', seconds: 4, amp: 0 },
    parts: [
      ball([0.2, 0.5, 0.1, 0.15], 0.1, '#c8a0ff', 'wing', 0, true),
      ball([-0.25, 0.7, -0.1, 0.1], 0.09, '#9affc8', 'wing', 1, true),
      ball([0.05, 0.3, 0.25, -0.2], 0.09, '#ff9af0', 'wing', 2, true),
      ball([-0.1, 0.85, 0.2, -0.25], 0.08, '#ffffff', 'wing', 3, true),
      ball([0.3, 0.65, -0.2, -0.1], 0.08, '#c8a0ff', 'wing', 4, true),
      ball([-0.3, 0.4, -0.25, 0.2], 0.09, '#9affc8', 'wing', 5, true),
      ball([0, 0.55, 0, 0.3], 0.08, '#ff9af0', 'wing', 6, true),
      ball([0.1, 0.9, -0.05, -0.3], 0.07, '#ffffff', 'wing', 7, true),
      ball([-0.05, 0.5, 0.05, 0], 0.15, '#b890ff', 'pulse', 0, true),
    ],
    drops: [{ item: 'starlight_shard', count: [0, 1], chance: 0.4 }, { item: 'whisper_fruit', count: [1, 1], chance: 0.25 }],
  },
  {
    // A long flier that undulates through x and w (its slice is an S), keeping its distance and
    // spitting starlight.
    name: 'starlight_serpent',
    displayName: 'Starlight Serpent',
    hostile: true,
    ai: 'flyer',
    floats: true,
    health: 30,
    speed: 3.6,
    damage: 5,
    width: 0.5,
    height: 1,
    keepAway: 10,
    xp: 14,
    projectile: { item: 'starlight_shard', cooldown: 3, damage: 6 },
    parts: [
      capsule([0, 0.55, 0.85, 0], [0, 0.55, 1.15, 0], 0.24, '#5a7aff', 'wave', 0),
      ball([0.1, 0.65, 1.1, 0], 0.05, '#ffffff', undefined, 0, true),
      ball([-0.1, 0.65, 1.1, 0], 0.05, '#ffffff', undefined, 0, true),
      capsule([0, 0.55, 0.85, 0], [0, 0.55, 0.2, 0], 0.24, '#3a56b8', 'wave', 0.4),
      capsule([0, 0.55, 0.2, 0], [0, 0.55, -0.5, 0], 0.22, '#6a8aff', 'wave', 0.8),
      capsule([0, 0.55, -0.5, 0], [0, 0.55, -1.2, 0], 0.2, '#3a56b8', 'wave', 1.2),
      capsule([0, 0.55, -1.2, 0], [0, 0.55, -1.9, 0], 0.18, '#6a8aff', 'wave', 1.6),
      capsule([0, 0.55, -1.9, 0], [0, 0.55, -2.6, 0], 0.16, '#3a56b8', 'wave', 2),
      capsule([0, 0.55, -2.6, 0], [0, 0.55, -3.2, 0], 0.13, '#6a8aff', 'wave', 2.4),
      capsule([0, 0.55, -3.2, 0], [0, 0.55, -3.7, 0], 0.1, '#3a56b8', 'wave', 2.8),
      capsule([0, 0.55, -3.7, 0], [0, 0.55, -4.1, 0], 0.07, '#6a8aff', 'wave', 3.2),
      // A glowing stripe down its back, and a fin reaching along ana.
      ball([0, 0.76, 0.3, 0], 0.1, '#c8e0ff', 'pulse', 0, true),
      ball([0, 0.7, -1, 0], 0.09, '#c8e0ff', 'pulse', 1, true),
      box([0, 0.62, 0.2, 0.4], [0.04, 0.03, 0.4, 0.25], '#8ab0ff', 'wing', 0),
    ],
    drops: [{ item: 'starlight_shard', count: [1, 3] }, { item: 'phase_dust', count: [0, 2] }],
  },
  {
    // Guards of the Sky Vault: crystal obelisks that never move. Dormant until a vault chest is
    // opened (or you strike one, or walk right up to it), then they fan starlight at you.
    name: 'sky_sentinel',
    displayName: 'Sky Vault Sentinel',
    hostile: true,
    ai: 'sentinel',
    persistent: true,
    health: 60,
    speed: 0,
    damage: 6,
    width: 0.6,
    height: 2.6,
    xp: 20,
    projectile: { item: 'starlight_shard', cooldown: 2.6, damage: 5 },
    parts: [
      box([0, 0.2, 0, 0], [0.5, 0.2, 0.5, 0.5], '#241a3a'),
      box([0, 1.1, 0, 0], [0.3, 0.7, 0.3, 0.3], '#2e2250'),
      ball([0, 2.1, 0, 0], 0.35, '#9ad8ff', 'pulse', 0, true),
      ball([0, 2.12, 0.3, 0], 0.12, '#ffffff', undefined, 0, true),
      // Six shards floating around the crystal, one toward each of +-x, +-z and +-w.
      ball([0.55, 1.9, 0, 0], 0.1, '#c8e0ff', 'wing', 0, true),
      ball([-0.55, 1.9, 0, 0], 0.1, '#c8e0ff', 'wing', 1, true),
      ball([0, 1.9, 0.55, 0], 0.1, '#c8e0ff', 'wing', 2, true),
      ball([0, 1.9, -0.55, 0], 0.1, '#c8e0ff', 'wing', 3, true),
      ball([0, 1.9, 0, 0.55], 0.1, '#c8e0ff', 'wing', 4, true),
      ball([0, 1.9, 0, -0.55], 0.1, '#c8e0ff', 'wing', 5, true),
    ],
    drops: [{ item: 'starlight_shard', count: [2, 4] }, { item: 'phase_dust', count: [1, 3] }],
  },
];

/** What spawns where on the islands (night tables: everything unlit is dark here). */
export const VOID_SPAWNS: Record<string, MobSpawn[]> = {
  hollow_plateau: [{ mob: 'void_walker', weight: 10 }, { mob: 'whisper_swarm', weight: 8, group: [2, 3] }],
  whisper_gardens: [{ mob: 'whisper_swarm', weight: 14, group: [2, 4] }, { mob: 'void_walker', weight: 5 }],
  starlight_crags: [{ mob: 'starlight_serpent', weight: 9 }, { mob: 'void_walker', weight: 8 }],
  void_spires: [{ mob: 'void_walker', weight: 14 }, { mob: 'starlight_serpent', weight: 6 }],
  glimmer_meadows: [{ mob: 'whisper_swarm', weight: 10, group: [2, 3] }, { mob: 'starlight_serpent', weight: 6 }],
  shattered_reach: [{ mob: 'void_walker', weight: 12 }, { mob: 'whisper_swarm', weight: 6, group: [2, 3] }, { mob: 'starlight_serpent', weight: 6 }],
};
