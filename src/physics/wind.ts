// Wind currents of the Cloud Archipelago (Phase 9.6). The wind blows along W (the one axis no slice
// can see along unless you rotate into it), in layers about 24 blocks thick stacked in y: one layer
// blows toward +W (ana, when your slice is aligned), the next toward -W (kata). The layers bend with
// x and z and drift up and down with time, so a current that carried you ana a minute ago may carry
// you kata now: glide to find the layer you want. Pure, so it is unit tested.

/** Thickness of a current (blocks); two currents (one each way) make one full period. */
export const WIND_LAYER = 24;

/**
 * The wind at a point, as a fraction -1..1 of the realm's top wind speed (positive: toward +W).
 * `t` is the world clock in seconds. Smooth: it ramps through zero between layers.
 */
export function windAt(x: number, y: number, z: number, t: number): number {
  const s = Math.sin((y * Math.PI) / WIND_LAYER + t * 0.02 + Math.sin(x * 0.01) * 1.2 + Math.cos(z * 0.013) * 1.2);
  const f = Math.max(-1, Math.min(1, s * 2.2));
  return f;
}

/** How much of the wind carries you, by what you are doing. */
export const WIND_GROUND = 0.1;
export const WIND_AIR = 0.5;
export const WIND_GLIDE = 0.6;
/** Gliding with a Wind Glider: it rides the current at full strength. */
export const WIND_RIDE = 1;
