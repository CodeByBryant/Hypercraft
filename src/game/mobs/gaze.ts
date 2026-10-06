// Gaze (Phase 8): what the player's eyes pin. Void Walkers freeze while they are looked at.
// You can only see a body in your own slice (the view is a 3D cross-section of 4D space), so a
// Walker one step kata or ana of you is NOT watched, however you turn your head: that is the
// whole trick of them. Pure, so it is unit tested.

/** Radians between the view direction and a body that still counts as looked at (about 26 degrees). */
export const GAZE_CONE = 0.46;
/** How far off the slice (along the hidden axis, in blocks) a body can be and still be in view. */
export const GAZE_SLAB = 0.8;

/**
 * Is the point `at` being looked at by an eye at `eye` facing along `fwd`, with `hidden` the
 * hidden axis of the view? True when it lies within GAZE_SLAB of the slice and within
 * GAZE_CONE of the view direction (anything this close is always in view).
 */
export function gazePins(eye: ArrayLike<number>, fwd: ArrayLike<number>, hidden: ArrayLike<number>, at: ArrayLike<number>, cone = GAZE_CONE, slab = GAZE_SLAB): boolean {
  let dh = 0, len2 = 0, dot = 0;
  for (let k = 0; k < 4; k++) {
    const d = at[k]! - eye[k]!;
    dh += d * hidden[k]!;
    len2 += d * d;
    dot += d * fwd[k]!;
  }
  if (Math.abs(dh) > slab) return false;
  const len = Math.sqrt(len2);
  if (len < 0.6) return true;
  return dot / len > Math.cos(cone);
}
