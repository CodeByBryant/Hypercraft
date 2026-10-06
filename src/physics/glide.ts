// Phase Wings (Phase 8): gliding in 4D. The model is Minecraft's elytra at 20 ticks a second,
// with "horizontal" meaning the three horizontal axes (x, z AND w). The heading is the view
// direction in 4D (the camera's `fwd`, a unit vector inside your slice): rotate the slice
// mid-flight (the XW / ZW slice rotation) and the heading turns through W, so you bank into the
// fourth dimension. Dive to gain speed, pull up to trade it back for height.
//
// Velocities are in blocks per second. Gravity is added per tick; every other term scales with
// the velocity itself, so the formulas carry over from blocks per tick unchanged.

/** Seconds per glide tick. */
export const GLIDE_TICK = 0.05;

/**
 * One tick of gliding: updates `vel` (4D; `up` is the vertical axis) for a unit look vector.
 * Pure, so it is unit tested (a real flight is just this called at 20 Hz).
 */
export function glideTick(vel: Float64Array, look: ArrayLike<number>, up: number, gravity: number): void {
  let lookH2 = 0, speedH2 = 0;
  for (let k = 0; k < 4; k++) {
    if (k === up) continue;
    lookH2 += look[k]! * look[k]!;
    speedH2 += vel[k]! * vel[k]!;
  }
  const lookH = Math.sqrt(lookH2);
  const speedH = Math.sqrt(speedH2);
  const e = Math.asin(Math.max(-1, Math.min(1, look[up]!))); // elevation: > 0 looking up
  const f = Math.cos(e) * Math.cos(e);
  vel[up] = vel[up]! + gravity * GLIDE_TICK * (-1 + f * 0.75);
  if (vel[up]! < 0 && lookH > 0) {
    // Falling while facing forward turns the fall into speed.
    const d = vel[up]! * -0.1 * f;
    for (let k = 0; k < 4; k++) if (k !== up) vel[k] = vel[k]! + (look[k]! / lookH) * d;
    vel[up] = vel[up]! + d;
  }
  if (e > 0 && lookH > 0) {
    // Looking up trades speed for height.
    const d = speedH * Math.sin(e) * 0.04;
    for (let k = 0; k < 4; k++) if (k !== up) vel[k] = vel[k]! - (look[k]! / lookH) * d;
    vel[up] = vel[up]! + d * 3.2;
  }
  if (lookH > 0) {
    // The velocity turns toward the heading.
    for (let k = 0; k < 4; k++) if (k !== up) vel[k] = vel[k]! + ((look[k]! / lookH) * speedH - vel[k]!) * 0.1;
  }
  for (let k = 0; k < 4; k++) vel[k] = vel[k]! * (k === up ? 0.98 : 0.99);
}

/** One tick of a Starlight Rocket's boost (blocks per second): shoves you along the heading toward a cruise speed. */
export function rocketTick(vel: Float64Array, look: ArrayLike<number>): void {
  for (let k = 0; k < 4; k++) vel[k] = vel[k]! + look[k]! * 2 + (look[k]! * 30 - vel[k]!) * 0.5;
}

/** Seconds a Starlight Rocket pushes. */
export const ROCKET_TIME = 1.2;

/** Kinetic damage (hit points) for striking something while gliding: speed lost in blocks per tick * 10 - 3. */
export function kineticDamage(speedBefore: number, speedAfter: number): number {
  return Math.max(0, ((speedBefore - speedAfter) / 20) * 10 - 3);
}
