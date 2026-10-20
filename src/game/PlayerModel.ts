// The player's body (Phase 9.1): a humanoid built from the same analytic parts as the mobs, so
// the ray marcher draws it in third person and the HUD's paper doll draws the very same part list
// as flat rectangles. Local frame like a mob's: a = right, y = up, b = forward, c = the body's own
// hidden axis. Pure and allocation-light (called every frame).
//
// The body frame is the camera's frame without pitch, so the model turns with you and rotating
// the slice rotates your body with it: you always see yourself as a clean 3D figure in the slice
// (the hitbox, as for mobs, is a separate thing).

import type { Hex, MobPart } from '../content/types';

export interface DollState {
  /** Walk cycle phase (radians) and stride amplitude 0..1. */
  walk: number;
  moving: number;
  /** Arm swing progress 0..1, or -1 when idle. */
  swing: number;
  sneak: boolean;
  /** Prone, wings spread. */
  glide: boolean;
  /** Wing spread 0..1 outside a glide (the doll shows wings open while you glide). */
  wingSpread: number;
  /** Shield raised. */
  blocking: boolean;
  /** Bow draw 0..1. */
  draw: number;
  /** Main colours of the helmet, chestplate, leggings and boots (null = nothing worn). */
  armor: [Hex | null, Hex | null, Hex | null, Hex | null];
  /** Wings worn: main and shade colours. */
  wings: [Hex, Hex] | null;
  /** The held item as it should look in the hand. */
  held: { color: Hex; kind: 'tool' | 'block' | 'item' } | null;
}

/** A body the mob packer draws without simulating it (the player's own model). */
export interface ExtraBody {
  pos: ArrayLike<number>;
  R: ArrayLike<number>;
  F: ArrayLike<number>;
  H: ArrayLike<number>;
  radius: number;
  parts: MobPart[];
  hurt: boolean;
}

/** Radius of a 4-ball around the feet that contains every part in every pose. */
export const DOLL_RADIUS = 2.4;

export const SKIN: Hex = '#e0ac82';

/** The colours of the parts that are not armour (the Mirror Twin wears the same body in silver). */
export interface DollPalette {
  skin: Hex;
  hair: Hex;
  shirt: Hex;
  pants: Hex;
  shoes: Hex;
  face: Hex;
}

export const DEFAULT_PALETTE: DollPalette = { skin: SKIN, hair: '#3b2a1c', shirt: '#3d8fbf', pants: '#3a4a8a', shoes: '#4a4a50', face: '#2a2118' };

export function newDollState(): DollState {
  return { walk: 0, moving: 0, swing: -1, sneak: false, glide: false, wingSpread: 0, blocking: false, draw: 0, armor: [null, null, null, null], wings: null, held: null };
}

function box(out: MobPart[], x: number, y: number, z: number, hx: number, hy: number, hz: number, color: Hex, hw = hz, glow = false): void {
  const p: MobPart = { kind: 'box', at: [x, y, z, 0], size: [hx, hy, hz, hw], color };
  if (glow) p.glow = true;
  out.push(p);
}

/** Fill `out` with the body parts for this pose (at most 16). */
export function dollParts(s: DollState, out: MobPart[] = [], pal: DollPalette = DEFAULT_PALETTE): MobPart[] {
  out.length = 0;
  const sw = Math.sin(s.walk) * 0.3 * s.moving;
  const sw2 = Math.sin(s.walk + Math.PI) * 0.3 * s.moving;
  const [helm, chest, legs, boots] = s.armor;
  const shirt = chest ?? pal.shirt, pants = legs ?? pal.pants;
  // Swing: the right arm comes up and forward and back.
  const sp = s.swing >= 0 ? Math.sin(Math.PI * Math.min(1, s.swing)) : 0;
  const draw = s.draw;

  if (s.glide) {
    // Prone along the heading, arms at the sides, wings out.
    const y = 0.95;
    box(out, -0.12, y, -0.69, 0.11, 0.11, 0.35, pants, 0.12);
    box(out, 0.12, y, -0.69, 0.11, 0.11, 0.35, pants, 0.12);
    box(out, 0, y, 0, 0.24, 0.13, 0.34, shirt, 0.13);
    if (chest) box(out, 0, y, 0, 0.26, 0.15, 0.35, chest, 0.15);
    box(out, -0.355, y, -0.05, 0.1, 0.11, 0.34, shirt, 0.11);
    box(out, 0.355, y, -0.05, 0.1, 0.11, 0.34, shirt, 0.11);
    box(out, 0, y, 0.58, 0.22, 0.22, 0.22, pal.skin, 0.22);
    box(out, 0, y + 0.03, 0.803, 0.17, 0.05, 0.004, pal.face, 0.06);
    box(out, 0, y + 0.19, 0.58, 0.225, 0.045, 0.225, pal.hair, 0.225);
    if (helm) box(out, 0, y + 0.1, 0.56, 0.24, 0.17, 0.235, helm, 0.235);
    if (boots) {
      box(out, -0.12, y, -1.0, 0.125, 0.125, 0.09, boots, 0.135);
      box(out, 0.12, y, -1.0, 0.125, 0.125, 0.09, boots, 0.135);
    }
    if (s.wings) {
      box(out, -0.8, y + 0.06, -0.15, 0.55, 0.025, 0.42, s.wings[0], 0.32);
      box(out, 0.8, y + 0.06, -0.15, 0.55, 0.025, 0.42, s.wings[1], 0.32);
    }
    return out;
  }

  const drop = s.sneak ? 0.2 : 0;
  const lean = s.sneak ? 0.1 : 0;
  // Legs.
  box(out, -0.12, 0.35, sw, 0.11, 0.35, 0.11, pants, 0.12);
  box(out, 0.12, 0.35, sw2, 0.11, 0.35, 0.11, pants, 0.12);
  if (boots) {
    box(out, -0.12, 0.09, sw, 0.125, 0.09, 0.125, boots, 0.135);
    box(out, 0.12, 0.09, sw2, 0.125, 0.09, 0.125, boots, 0.135);
  } else {
    box(out, -0.12, 0.05, sw, 0.115, 0.05, 0.115, pal.shoes, 0.125);
    box(out, 0.12, 0.05, sw2, 0.115, 0.05, 0.115, pal.shoes, 0.125);
  }
  // Torso (and its armour).
  box(out, 0, 1.04 - drop, lean * 0.5, 0.24, 0.34, 0.12, shirt, 0.13);
  if (chest) box(out, 0, 1.04 - drop, lean * 0.5, 0.26, 0.35, 0.14, chest, 0.15);
  // Arms: swing against the legs; the right one strikes, a raised shield takes the left, a drawn bow both.
  const lz = s.blocking ? 0.32 : -sw2 * 0.9 + draw * 0.35;
  const ly = s.blocking ? 0.12 : draw * 0.1;
  const lx = s.blocking ? -0.2 : -0.355;
  const rz = -sw * 0.9 + sp * 0.5 + draw * 0.35;
  const ry = sp * 0.2 + draw * 0.1;
  box(out, lx, 1.04 - drop + ly, lz + lean * 0.5, 0.1, 0.34, 0.1, shirt, 0.11);
  box(out, 0.355, 1.04 - drop + ry, rz + lean * 0.5, 0.1, 0.34, 0.1, shirt, 0.11);
  // Head.
  const hy = 1.6 - drop;
  box(out, 0, hy, lean, 0.22, 0.22, 0.22, pal.skin, 0.22);
  box(out, 0, hy + 0.02, lean + 0.222, 0.17, 0.05, 0.004, pal.face, 0.06);
  box(out, 0, hy + 0.18, lean - 0.01, 0.225, 0.045, 0.225, pal.hair, 0.225);
  if (helm) box(out, 0, hy + 0.08, lean - 0.02, 0.24, 0.16, 0.235, helm, 0.235);
  // Wings: folded on the back, or spread (the paper doll shows them open while you glide).
  if (s.wings) {
    const k = s.wingSpread;
    const x = 0.13 + 0.55 * k, hx = 0.1 + 0.45 * k, hy2 = 0.3 - 0.1 * k;
    box(out, -x, 1.12 - drop, -0.17 - 0.0 * k, hx, hy2, 0.035, s.wings[0], 0.1 + 0.2 * k);
    box(out, x, 1.12 - drop, -0.17, hx, hy2, 0.035, s.wings[1], 0.1 + 0.2 * k);
  }
  // What the right hand holds: a tool points forward and up, a block sits in the palm.
  if (s.held) {
    const hx = 0.355, hyy = 0.8 - drop + ry, hz = 0.12 + rz + lean * 0.5;
    if (s.held.kind === 'tool') out.push({ kind: 'capsule', at: [hx, hyy, hz, 0], to: [hx, hyy + 0.26, hz + 0.42, 0], r: 0.045, color: s.held.color });
    else if (s.held.kind === 'block') box(out, hx, hyy + 0.1, hz + 0.2, 0.11, 0.11, 0.11, s.held.color, 0.11);
    else box(out, hx, hyy + 0.1, hz + 0.2, 0.08, 0.1, 0.03, s.held.color, 0.08);
  }
  return out;
}
