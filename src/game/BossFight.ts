// What the game needs from a realm boss's fight (Phase 9): the Void Sovereign, the Mirror Twin,
// the Resonance Titan and the Storm Sovereign each run their own attacks, arena rules, world
// changes and saved state behind this interface; Game keeps a list and asks each in turn.

import type { Mob } from './mobs/MobManager';

/** What the hidden-axis radar shows for a fight (pylons, announced and struck beams, a boss off your slice). */
export interface Mark {
  x: number;
  y: number;
  z: number;
  w: number;
  kind: 'pylon' | 'lance' | 'boss';
  /** Blinks (announced, not yet struck). */
  pending: boolean;
}

/** What the player did (the Mirror Twin copies it). */
export type PlayerAction = 'swing' | 'shoot' | 'block' | 'unblock';

export interface BossFight {
  /** The realm the fight happens in, and the name of the boss mob. */
  readonly realm: string;
  readonly mobName: string;
  /** The world remembers: a defeated boss does not come back. */
  defeated: boolean;
  /** Said (now and then) when the arena refuses a block change. */
  readonly lockMessage: string;
  /** HUD line (announced attacks, what to do) or ''. */
  warning: string;
  /** Saved with the world (SavedState.data). */
  save(): unknown;
  load(d: unknown): void;
  update(dt: number): void;
  /** May this cell not be broken or built in right now? (`id` is the block being placed or broken.) */
  protects(x: number, y: number, z: number, w: number, id?: number): boolean;
  /** A block changed (pylons that shatter together). */
  blockChanged(x: number, y: number, z: number, w: number, oldV: number, newV: number): void;
  /** A projectile hit a block: true if it was used up. */
  projectileHit(x: number, y: number, z: number, w: number, id: number, byPlayer: boolean): boolean;
  /** The player swung, shot or raised/lowered a shield. */
  onPlayerAction?(kind: PlayerAction): void;
  /** The boss died. */
  onDefeat(m: Mob): void;
  marks(): Mark[];
  find(): Mob | null;
}
