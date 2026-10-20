// The Resonance Titan's body (Phase 9.5). A pure function of its plates, so the fight
// (src/game/ResonanceBoss.ts) can rebuild it every frame: each of the four crystal plates glows in its
// tone's colour while it stands and is a dull stump once shattered; when every plate is gone the heart
// in its chest shows. At most 16 parts.

import type { Hex, MobPart } from './types';

/** The four tones of the Abyss: what golems and the Titan sing, and what the Tuning Forks answer. */
export interface Tone {
  name: string;
  color: Hex;
  /** The Tuning Fork that sounds it. */
  fork: string;
}

export const TONES: Tone[] = [
  { name: 'Low', color: '#ff6a5a', fork: 'low_fork' },
  { name: 'Mid', color: '#ffd24a', fork: 'mid_fork' },
  { name: 'High', color: '#5affd8', fork: 'high_fork' },
  { name: 'Shrill', color: '#c88aff', fork: 'shrill_fork' },
];

const box = (at: [number, number, number, number], size: [number, number, number, number], color: Hex, glow = false): MobPart => {
  const p: MobPart = { kind: 'box', at, size, color };
  if (glow) p.glow = true;
  return p;
};
const ball = (at: [number, number, number, number], r: number, color: Hex, glow = false): MobPart => {
  const p: MobPart = { kind: 'ball', at, r, color };
  if (glow) p.glow = true;
  return p;
};
const capsule = (at: [number, number, number, number], to: [number, number, number, number], r: number, color: Hex): MobPart => ({ kind: 'capsule', at, to, r, color });

/** `plates[k]` is true while tone k's plate stands; `bob` sways the head; `heart` shows the exposed heart. */
export function titanParts(plates: readonly boolean[], heart: boolean, bob = 0, out: MobPart[] = []): MobPart[] {
  out.length = 0;
  out.push(
    box([0, 2.5, 0, 0], [0.95, 1.05, 0.62, 0.62], '#2e3e6c'),
    box([0, 4.15 + bob, 0.05, 0], [0.5, 0.45, 0.45, 0.45], '#4a6aa8'),
    ball([0.2, 4.2 + bob, 0.46, 0], 0.08, '#ffffff', true),
    ball([-0.2, 4.2 + bob, 0.46, 0], 0.08, '#ffffff', true),
    capsule([1.15, 3.3, 0, 0], [1.5, 1.5, 0.35, 0], 0.3, '#3a5290'),
    capsule([-1.15, 3.3, 0, 0], [-1.5, 1.5, 0.35, 0], 0.3, '#3a5290'),
    box([0.45, 0.8, 0, 0], [0.32, 0.8, 0.34, 0.34], '#2a3a68'),
    box([-0.45, 0.8, 0, 0], [0.32, 0.8, 0.34, 0.34], '#2a3a68'),
  );
  // The plates: chest (Low), right shoulder (Mid), left shoulder (High), and one on the ana side of the
  // back (Shrill), seen only when your slice turns into W.
  const spots: [number, number, number, number][] = [[0, 2.7, 0.72, 0], [1.15, 3.75, 0, 0], [-1.15, 3.75, 0, 0], [0, 2.7, 0, 0.72]];
  const sizes: [number, number, number, number][] = [[0.6, 0.55, 0.1, 0.5], [0.4, 0.4, 0.4, 0.4], [0.4, 0.4, 0.4, 0.4], [0.5, 0.55, 0.5, 0.1]];
  for (let k = 0; k < 4; k++) {
    const up = plates[k] !== false;
    const s = sizes[k]!;
    out.push(up ? box(spots[k]!, s, TONES[k]!.color, true) : box([spots[k]![0], spots[k]![1] - 0.1, spots[k]![2], spots[k]![3]], [s[0] * 0.4, s[1] * 0.3, s[2] * 0.4, s[3] * 0.4], '#3a3a52'));
  }
  if (heart) out.push(ball([0, 2.7, 0.5, 0], 0.42, '#ffffff', true));
  return out;
}

export const TITAN_PARTS: MobPart[] = titanParts([true, true, true, true], false);
