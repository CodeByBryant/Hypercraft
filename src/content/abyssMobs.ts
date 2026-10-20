// Mobs of the Crystal Abyss (Phase 9.5). Bodies follow the conventions of mobs.ts (x right, y up, z
// forward, w the mob's own ana axis). Everything here is exclusive to the realm.
//
//  * Prism Spider (AI 'prism'): climbs walls and, from a distance, shoots LIGHT BEAMS (projectiles
//    flagged `beam`: a full set of Prism armour reflects them).
//  * Resonance Golem (AI 'resonant'): sings. Every few seconds it sends out a SOUND PULSE: an
//    expanding 4D shell (a sphere in your slice) of one of four tones. Take cover (stone stops a
//    pulse), outrun it, or answer with a Tuning Fork of the same tone, which cancels it.
//  * Geode Slime (AI 'hopper'): a jelly in a stone shell; for a moment after every hit the shell
//    hardens (a quarter damage), so strike, step back, strike. It splits when it dies.
//  * Resonance Titan: the boss of the Crystal Cathedral (AI 'titan', src/game/ResonanceBoss.ts).

import type { MobDef, MobSpawn } from './types';
import { ball, box, capsule, spiderLegs } from './mobs';
import { TITAN_PARTS } from './titanBody';

export const ABYSS_MOBS: MobDef[] = [
  {
    // A glittering spider: faceted crystal for a body, prisms for eyes.
    name: 'prism_spider',
    displayName: 'Prism Spider',
    hostile: true,
    ai: 'prism',
    arthropod: true,
    health: 22,
    speed: 3.2,
    damage: 4,
    width: 0.5,
    height: 0.7,
    xp: 9,
    projectile: { item: 'prism_shard', cooldown: 3.4, damage: 4, beam: true },
    parts: [
      ball([0, 0.38, 0, 0], 0.3, '#b890f0'),
      box([0, 0.7, -0.05, 0], [0.08, 0.2, 0.08, 0.08], '#f0e0ff'),
      ball([0.1, 0.5, 0.26, 0], 0.06, '#ffffff', undefined, 0, true),
      ball([-0.1, 0.5, 0.26, 0], 0.06, '#ffffff', undefined, 0, true),
      ...spiderLegs('#7a58c8', 0.38, 0.55),
    ],
    drops: [{ item: 'string', count: [0, 2] }, { item: 'prism_shard', count: [1, 1], chance: 0.12 }, { item: 'resonance_crystal', count: [1, 1], chance: 0.1 }],
  },
  {
    // A tall hum of crystal: the pulse shell leaves its chest.
    name: 'resonance_golem',
    displayName: 'Resonance Golem',
    hostile: true,
    ai: 'resonant',
    health: 52,
    speed: 2.2,
    damage: 8,
    width: 0.8,
    height: 2.6,
    xp: 16,
    parts: [
      box([0, 1.0, 0, 0], [0.5, 0.7, 0.36, 0.36], '#4a6aa8'),
      box([0, 1.95, 0, 0], [0.32, 0.3, 0.3, 0.3], '#5a82d0'),
      ball([0, 1.2, 0.36, 0], 0.26, '#9ad8ff', 'pulse', 0, true),
      ball([0.12, 2.0, 0.31, 0], 0.05, '#ffffff', undefined, 0, true),
      ball([-0.12, 2.0, 0.31, 0], 0.05, '#ffffff', undefined, 0, true),
      box([0, 2.45, 0, 0], [0.08, 0.24, 0.08, 0.08], '#d8eaff'),
      capsule([0.62, 1.55, 0, 0], [0.8, 0.5, 0.2, 0], 0.17, '#3a5290', 'leg', 0),
      capsule([-0.62, 1.55, 0, 0], [-0.8, 0.5, 0.2, 0], 0.17, '#3a5290', 'leg', Math.PI),
      capsule([0.2, 0.4, 0, 0], [0.22, 0, 0, 0], 0.2, '#2e4478', 'leg', 0),
      capsule([-0.2, 0.4, 0, 0], [-0.22, 0, 0, 0], 0.2, '#2e4478', 'leg', Math.PI),
      // Crystals along the back that stand out in w.
      { kind: 'box', at: [0, 1.4, -0.1, 0.5], size: [0.06, 0.4, 0.1, 0.18], color: '#a8c8ff', glow: true, anim: 'pulse', phase: 1 },
      { kind: 'box', at: [0, 1.4, -0.1, -0.5], size: [0.06, 0.4, 0.1, 0.18], color: '#a8c8ff', glow: true, anim: 'pulse', phase: 2 },
    ],
    drops: [{ item: 'resonance_crystal', count: [1, 3] }, { item: 'prism_shard', count: [0, 1], chance: 0.35 }],
  },
  {
    // Jelly in a stone shell.
    name: 'geode_slime',
    displayName: 'Geode Slime',
    hostile: true,
    ai: 'hopper',
    hardens: true,
    health: 16,
    speed: 2.2,
    damage: 4,
    width: 0.55,
    height: 1,
    xp: 7,
    splits: 2,
    scale: [0.7, 1.3],
    parts: [
      ball([0, 0.5, 0, 0], 0.5, '#c8a0ff', 'pulse'),
      ball([0, 0.5, 0.05, 0], 0.24, '#8a5ad8'),
      box([0, 0.9, 0, 0], [0.18, 0.22, 0.18, 0.18], '#e0d8f0'),
      box([0.34, 0.5, 0.1, 0], [0.12, 0.3, 0.14, 0.14], '#b4a2d6'),
      box([-0.34, 0.5, 0.1, 0], [0.12, 0.3, 0.14, 0.14], '#b4a2d6'),
    ],
    drops: [{ item: 'slime_ball', count: [0, 2] }, { item: 'resonance_crystal', count: [0, 1], chance: 0.2 }, { item: 'amethyst_shard', count: [0, 2], chance: 0.5 }],
  },
  {
    // The boss of the Crystal Cathedral; its body is rebuilt each frame (plates broken or whole).
    name: 'resonance_titan',
    displayName: 'The Resonance Titan',
    hostile: true,
    ai: 'titan',
    boss: true,
    persistent: true,
    health: 700,
    speed: 2.4,
    damage: 14,
    width: 1.5,
    height: 5.2,
    xp: 9000,
    parts: TITAN_PARTS,
    drops: [
      { item: 'resonance_heart', count: [1, 1] },
      { item: 'prism_shard', count: [14, 22] },
      { item: 'resonance_crystal', count: [10, 16] },
      { item: 'enchanted_golden_apple', count: [1, 2] },
    ],
  },
];

/** What spawns where (every unlit cavern is dark here: the enclosed-realm tables). */
export const ABYSS_SPAWNS: Record<string, MobSpawn[]> = {
  prism_forest: [{ mob: 'prism_spider', weight: 10 }, { mob: 'geode_slime', weight: 5 }],
  geode_hollows: [{ mob: 'geode_slime', weight: 10, group: [1, 2] }, { mob: 'prism_spider', weight: 5 }],
  resonance_caverns: [{ mob: 'resonance_golem', weight: 10 }, { mob: 'prism_spider', weight: 5 }],
  lumen_grotto: [{ mob: 'geode_slime', weight: 8 }, { mob: 'crystal_crawler', weight: 6 }, { mob: 'prism_spider', weight: 4 }],
  shard_barrens: [{ mob: 'prism_spider', weight: 10 }, { mob: 'resonance_golem', weight: 6 }, { mob: 'geode_slime', weight: 4 }],
  echo_lakes: [{ mob: 'crystal_crawler', weight: 6 }],
};
