// Mobs of the Cloud Archipelago (Phase 9.7). Bodies follow the conventions of mobs.ts (x right, y up,
// z forward, w the mob's own ana axis). Everything here is exclusive to the realm.
//
//  * Storm Kite (AI 'flyer' with a projectile): a diamond of canvas that hangs about nine blocks off and
//    spits bolts of static.
//  * Thunder Hawk (AI 'diver'): circles above you, then folds its wings and dives.
//  * Wind Sprite (AI 'sprite'): a knot of gust that shoves you along W every few seconds (it is a
//    prankster; keep your slice, or hold on: an Anchor charm or Kata Grip resists it).
//  * Cloud Whale (passive): a giant that drifts over the islands. (Riding comes with mounts, Phase 10.)
//  * Storm Sovereign: the boss of the Cloud Citadel (AI 'tempest', src/game/StormBoss.ts).

import type { MobDef, MobSpawn } from './types';
import { ball, box, capsule } from './mobs';

export const CLOUD_MOBS: MobDef[] = [
  {
    name: 'storm_kite',
    displayName: 'Storm Kite',
    hostile: true,
    ai: 'flyer',
    floats: true,
    health: 16,
    speed: 4.4,
    damage: 4,
    width: 0.6,
    height: 0.8,
    xp: 8,
    keepAway: 9,
    projectile: { item: 'static_bolt', cooldown: 3, damage: 4 },
    parts: [
      box([0, 0.5, 0, 0], [0.5, 0.04, 0.5, 0.06], '#e8f0ff', 'wing', 0),
      box([0, 0.5, 0, 0], [0.06, 0.04, 0.5, 0.5], '#d8e4f8', 'wing', 1),
      ball([0, 0.52, 0.1, 0], 0.16, '#ffe08a'),
      ball([0.06, 0.58, 0.24, 0], 0.035, '#ffffff', undefined, 0, true),
      ball([-0.06, 0.58, 0.24, 0], 0.035, '#ffffff', undefined, 0, true),
      capsule([0, 0.5, -0.4, 0], [0, 0.1, -1.0, 0], 0.03, '#ffb0c8', 'tail', 0),
      capsule([0, 0.5, -0.4, 0], [0.25, 0.2, -0.9, 0], 0.025, '#8ac8ff', 'tail', 1),
    ],
    drops: [{ item: 'feather', count: [1, 2] }, { item: 'cloud_cotton', count: [0, 2], chance: 0.6 }],
  },
  {
    name: 'thunder_hawk',
    displayName: 'Thunder Hawk',
    hostile: true,
    ai: 'diver',
    floats: true,
    health: 26,
    speed: 5.2,
    damage: 7,
    width: 0.55,
    height: 0.7,
    xp: 12,
    parts: [
      capsule([0, 0.45, 0.35, 0], [0, 0.45, -0.3, 0], 0.22, '#5a6684'),
      ball([0, 0.55, 0.5, 0], 0.17, '#8a96b4', 'head'),
      box([0, 0.5, 0.68, 0], [0.04, 0.04, 0.12, 0.04], '#ffd24a'),
      ball([0.07, 0.6, 0.58, 0], 0.03, '#fff08a', undefined, 0, true),
      ball([-0.07, 0.6, 0.58, 0], 0.03, '#fff08a', undefined, 0, true),
      box([0.7, 0.5, 0, 0], [0.55, 0.03, 0.22, 0.2], '#3e465a', 'wing', 0),
      box([-0.7, 0.5, 0, 0], [0.55, 0.03, 0.22, 0.2], '#3e465a', 'wing', Math.PI),
      box([0, 0.5, 0, 0.6], [0.2, 0.03, 0.22, 0.45], '#4a5266', 'wing', 1),
      box([0, 0.5, 0, -0.6], [0.2, 0.03, 0.22, 0.45], '#4a5266', 'wing', 2),
      { kind: 'box', at: [0, 0.42, -0.55, 0], size: [0.16, 0.03, 0.2, 0.16], color: '#fff08a', glow: true, anim: 'tail', phase: 0 },
    ],
    drops: [{ item: 'storm_feather', count: [1, 1], chance: 0.6 }, { item: 'feather', count: [1, 3] }],
  },
  {
    name: 'wind_sprite',
    displayName: 'Wind Sprite',
    hostile: true,
    ai: 'sprite',
    floats: true,
    health: 10,
    speed: 3.4,
    damage: 2,
    width: 0.4,
    height: 0.8,
    xp: 6,
    parts: [
      ball([0, 0.45, 0, 0], 0.26, '#dcecff', 'pulse', 0),
      ball([0, 0.45, 0.06, 0], 0.13, '#ffffff', 'pulse', 1, true),
      ball([0.1, 0.5, 0.22, 0], 0.035, '#5ab8ff', undefined, 0, true),
      ball([-0.1, 0.5, 0.22, 0], 0.035, '#5ab8ff', undefined, 0, true),
      capsule([0.3, 0.45, 0, 0], [0.5, 0.45, -0.2, 0.2], 0.07, '#bcd8f8', 'wing', 0),
      capsule([-0.3, 0.45, 0, 0], [-0.5, 0.45, -0.2, -0.2], 0.07, '#bcd8f8', 'wing', Math.PI),
      ball([0, 0.2, -0.1, 0], 0.15, '#c8e0fa', 'tail', 0),
      ball([0, 0.04, -0.2, 0], 0.09, '#b4d0f4', 'tail', 1),
    ],
    drops: [{ item: 'gale_dust', count: [1, 2] }, { item: 'cloud_cotton', count: [0, 1], chance: 0.4 }],
  },
  {
    name: 'cloud_whale',
    displayName: 'Cloud Whale',
    hostile: false,
    ai: 'flyer',
    floats: true,
    health: 120,
    speed: 1.6,
    width: 2.2,
    height: 2.6,
    xp: 12,
    parts: [
      ball([0, 1.5, 0, 0], 1.5, '#e8f0fc'),
      ball([0, 1.4, 1.5, 0], 1.0, '#dce8f8', 'head'),
      ball([0.4, 1.7, 2.3, 0], 0.09, '#2a3a5a'),
      ball([-0.4, 1.7, 2.3, 0], 0.09, '#2a3a5a'),
      capsule([0, 1.4, -1.2, 0], [0, 1.6, -3.2, 0], 0.7, '#cfdcf0', 'tail', 0),
      box([0, 1.7, -3.6, 0], [1.2, 0.12, 0.5, 0.4], '#bcd0ec', 'tail', 1),
      box([1.7, 0.9, 0.4, 0], [0.7, 0.1, 0.4, 0.3], '#bcd0ec', 'wing', 0),
      box([-1.7, 0.9, 0.4, 0], [0.7, 0.1, 0.4, 0.3], '#bcd0ec', 'wing', Math.PI),
      box([0, 0.9, 0.4, 1.7], [0.3, 0.1, 0.4, 0.7], '#bcd0ec', 'wing', 1),
      box([0, 0.9, 0.4, -1.7], [0.3, 0.1, 0.4, 0.7], '#bcd0ec', 'wing', 2),
      ball([0, 2.9, 0.3, 0], 0.4, '#ffffff', 'pulse', 0),
    ],
    drops: [{ item: 'cloud_cotton', count: [2, 5] }, { item: 'cloud_silk', count: [0, 1], chance: 0.3 }],
  },
  {
    // The boss of the Cloud Citadel: a thundercloud with a crown of lightning.
    name: 'storm_sovereign',
    displayName: 'The Storm Sovereign',
    hostile: true,
    ai: 'tempest',
    boss: true,
    persistent: true,
    floats: true,
    health: 650,
    speed: 4,
    damage: 12,
    width: 1.3,
    height: 4,
    xp: 10000,
    parts: [
      ball([0, 2.0, 0, 0], 1.5, '#4a5266'),
      ball([0.9, 2.5, 0.2, 0.2], 0.9, '#5a6684', 'pulse', 0),
      ball([-0.9, 2.5, 0.2, -0.2], 0.9, '#5a6684', 'pulse', 1),
      ball([0, 3.2, 0.1, 0], 0.7, '#3e465a', 'head'),
      ball([0.25, 3.3, 0.7, 0], 0.1, '#fff08a', undefined, 0, true),
      ball([-0.25, 3.3, 0.7, 0], 0.1, '#fff08a', undefined, 0, true),
      { kind: 'box', at: [0, 4.0, 0, 0], size: [0.07, 0.5, 0.07, 0.07], color: '#fff08a', glow: true, anim: 'pulse', phase: 0 },
      { kind: 'box', at: [0.45, 3.9, 0, 0], size: [0.06, 0.4, 0.06, 0.06], color: '#ffe84a', glow: true, anim: 'pulse', phase: 1 },
      { kind: 'box', at: [-0.45, 3.9, 0, 0], size: [0.06, 0.4, 0.06, 0.06], color: '#ffe84a', glow: true, anim: 'pulse', phase: 2 },
      { kind: 'box', at: [0, 3.9, 0, 0.45], size: [0.06, 0.4, 0.06, 0.06], color: '#ffe84a', glow: true, anim: 'pulse', phase: 3 },
      capsule([1.3, 2.4, 0, 0], [2.4, 1.2, 0.5, 0], 0.4, '#3e465a', 'leg', 0),
      capsule([-1.3, 2.4, 0, 0], [-2.4, 1.2, 0.5, 0], 0.4, '#3e465a', 'leg', Math.PI),
      capsule([0, 2.4, 0, 1.3], [0, 1.2, 0.5, 2.4], 0.4, '#3e465a', 'leg', Math.PI / 2),
      ball([2.4, 1.1, 0.5, 0], 0.4, '#fff08a', 'pulse', 0, true),
      ball([-2.4, 1.1, 0.5, 0], 0.4, '#fff08a', 'pulse', 1, true),
      ball([0, 0.9, 0, 0], 0.9, '#343c4e', 'tail', 0),
    ],
    drops: [
      { item: 'storm_heart', count: [1, 1] },
      { item: 'storm_feather', count: [6, 10] },
      { item: 'cloud_silk', count: [6, 10] },
      { item: 'prism_shard', count: [8, 14] },
      { item: 'enchanted_golden_apple', count: [1, 2] },
    ],
  },
];

/** What spawns where (day and night tables: islands spawn on whatever is lit or dark). */
export const CLOUD_SPAWNS: Record<string, { day: MobSpawn[]; night: MobSpawn[] }> = {
  cirrus_meadow: {
    day: [{ mob: 'cloud_whale', weight: 3 }, { mob: 'wind_sprite', weight: 6 }],
    night: [{ mob: 'wind_sprite', weight: 8 }, { mob: 'storm_kite', weight: 4 }],
  },
  storm_reef: {
    day: [{ mob: 'storm_kite', weight: 8 }, { mob: 'thunder_hawk', weight: 6 }, { mob: 'wind_sprite', weight: 4 }],
    night: [{ mob: 'thunder_hawk', weight: 10 }, { mob: 'storm_kite', weight: 6 }],
  },
  aurora_ridge: {
    day: [{ mob: 'thunder_hawk', weight: 5 }, { mob: 'wind_sprite', weight: 5 }],
    night: [{ mob: 'wind_sprite', weight: 8 }, { mob: 'thunder_hawk', weight: 5 }],
  },
  zephyr_terraces: {
    day: [{ mob: 'wind_sprite', weight: 10 }, { mob: 'storm_kite', weight: 4 }],
    night: [{ mob: 'wind_sprite', weight: 10 }, { mob: 'thunder_hawk', weight: 4 }],
  },
  sunbreak_gardens: {
    day: [{ mob: 'cloud_whale', weight: 4 }, { mob: 'wind_sprite', weight: 5 }],
    night: [{ mob: 'wind_sprite', weight: 8 }, { mob: 'storm_kite', weight: 4 }],
  },
  nimbus_sea: {
    day: [{ mob: 'cloud_whale', weight: 6 }, { mob: 'wind_sprite', weight: 4 }],
    night: [{ mob: 'storm_kite', weight: 6 }, { mob: 'wind_sprite', weight: 6 }],
  },
};
