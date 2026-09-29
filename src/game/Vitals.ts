// Player health and air (Phase 4). Damage sources: mobs, projectiles, explosions, falling,
// lava, contact blocks (cactus, magma), drowning, the void. Health regenerates slowly while
// undamaged (hunger arrives in Phase 7). Creative and spectator players are invulnerable.

export const MAX_HEALTH = 20;
export const MAX_AIR = 15;

export class Vitals {
  health = MAX_HEALTH;
  air = MAX_AIR;
  /** Seconds of invulnerability after a hit. */
  hurtCooldown = 0;
  /** Time since the last damage (regeneration waits for 4 s). */
  sinceHurt = 99;
  private regenTimer = 0;
  private drownTimer = 0;
  dead = false;
  deathCause = '';
  /** Damage flash for the screen (0..1), decays. */
  flash = 0;
  /** Last hit direction in the slice (for the HUD damage indicator): -1 kata .. +1 ana. */
  lastHitSide = 0;

  /** Apply damage; returns the amount actually taken. */
  damage(amount: number, cause: string, invulnerable: boolean): number {
    if (invulnerable || this.dead || amount <= 0 || this.hurtCooldown > 0) return 0;
    this.health = Math.max(0, this.health - amount);
    this.hurtCooldown = 0.5;
    this.sinceHurt = 0;
    this.flash = 1;
    if (this.health <= 0) {
      this.dead = true;
      this.deathCause = cause;
    }
    return amount;
  }

  heal(amount: number): void {
    if (this.dead) return;
    this.health = Math.min(MAX_HEALTH, this.health + amount);
  }

  /**
   * Per-frame update. `eyeInWater` drains air (2 damage per second once empty); regeneration
   * gives 1 health every 2 s after 4 s without damage.
   */
  update(dt: number, eyeInWater: boolean, invulnerable: boolean): number {
    this.hurtCooldown = Math.max(0, this.hurtCooldown - dt);
    this.sinceHurt += dt;
    this.flash = Math.max(0, this.flash - dt * 2.5);
    let drown = 0;
    if (eyeInWater && !invulnerable) {
      this.air = Math.max(0, this.air - dt);
      if (this.air <= 0) {
        this.drownTimer += dt;
        if (this.drownTimer >= 1) {
          this.drownTimer = 0;
          drown = 2;
        }
      }
    } else {
      this.air = Math.min(MAX_AIR, this.air + dt * 5);
      this.drownTimer = 0;
    }
    if (!this.dead && this.health < MAX_HEALTH && this.sinceHurt > 4) {
      this.regenTimer += dt;
      if (this.regenTimer >= 2) {
        this.regenTimer = 0;
        this.heal(1);
      }
    }
    return drown;
  }

  respawn(): void {
    this.health = MAX_HEALTH;
    this.air = MAX_AIR;
    this.dead = false;
    this.deathCause = '';
    this.hurtCooldown = 1;
    this.flash = 0;
  }

  /** Fall damage for a landing after falling `blocks` (Minecraft: 1 per block beyond 3). */
  static fallDamage(blocks: number): number {
    return Math.max(0, Math.floor(blocks - 3));
  }

  save(): { health: number; air: number } {
    return { health: this.health, air: this.air };
  }

  load(d: unknown): void {
    const v = d as { health?: number; air?: number } | undefined;
    if (!v) return;
    if (typeof v.health === 'number') this.health = Math.max(1, Math.min(MAX_HEALTH, v.health));
    if (typeof v.air === 'number') this.air = Math.max(0, Math.min(MAX_AIR, v.air));
  }
}
