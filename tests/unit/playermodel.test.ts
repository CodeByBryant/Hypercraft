import { describe, expect, it } from 'vitest';
import { DOLL_RADIUS, dollParts, newDollState, type DollState } from '../../src/game/PlayerModel';
import { MAX_MOB_PARTS } from '../../src/content/mobRegistry';
import type { MobPart } from '../../src/content/types';

function extent(p: MobPart): number {
  const ext = p.kind === 'box' ? Math.hypot(...p.size!) : p.r ?? 0;
  let m = Math.hypot(...p.at) + ext;
  if (p.to) m = Math.max(m, Math.hypot(...p.to) + ext);
  return m;
}

function full(): DollState {
  const s = newDollState();
  s.armor = ['#dcdcdc', '#dcdcdc', '#dcdcdc', '#dcdcdc'];
  s.wings = ['#7a5aff', '#2a1a68'];
  s.held = { color: '#aaaaaa', kind: 'tool' };
  s.moving = 1;
  s.walk = 1.3;
  return s;
}

describe('player model (Phase 9.1)', () => {
  it('fits the mob part budget and the bounding radius in every pose', () => {
    for (const glide of [false, true])
      for (const sneak of [false, true])
        for (const swing of [-1, 0.5])
          for (const blocking of [false, true])
            for (const kind of ['tool', 'block', 'item'] as const) {
              const s = full();
              Object.assign(s, { glide, sneak, swing, blocking, draw: blocking ? 0 : 1 });
              s.held = { color: '#aaaaaa', kind };
              s.wingSpread = glide ? 1 : 0;
              const parts = dollParts(s);
              expect(parts.length).toBeGreaterThan(5);
              expect(parts.length).toBeLessThanOrEqual(MAX_MOB_PARTS);
              for (const p of parts) {
                expect(extent(p)).toBeLessThan(DOLL_RADIUS);
                if (p.kind === 'box') for (const h of p.size!) expect(h).toBeGreaterThan(0);
              }
            }
  });

  it('shows what you wear and carry, and nothing you do not', () => {
    const bare = dollParts(newDollState()).length;
    const s = newDollState();
    s.armor = ['#dcdcdc', null, null, null];
    expect(dollParts(s).length).toBe(bare + 1);
    s.armor = ['#dcdcdc', '#dcdcdc', '#dcdcdc', '#dcdcdc'];
    expect(dollParts(s).length).toBe(bare + 2); // helmet and chestplate overlays; boots replace the shoes; leggings recolour
    s.wings = ['#7a5aff', '#2a1a68'];
    expect(dollParts(s).length).toBe(bare + 4);
    s.held = { color: '#fff', kind: 'tool' };
    expect(dollParts(s).some((p) => p.kind === 'capsule')).toBe(true);
  });

  it('swings the right arm forward and up, and walks the legs against each other', () => {
    const rest = dollParts(newDollState());
    const s = newDollState();
    s.swing = 0.5;
    const hit = dollParts(s);
    const arm = (parts: MobPart[]) => parts.find((p) => p.kind === 'box' && p.at[0] > 0.3 && p.size![1] > 0.3)!;
    expect(arm(hit).at[2]).toBeGreaterThan(arm(rest).at[2] + 0.3);
    expect(arm(hit).at[1]).toBeGreaterThan(arm(rest).at[1]);
    const w = newDollState();
    w.moving = 1;
    w.walk = Math.PI / 2;
    const legs = dollParts(w).filter((p) => p.kind === 'box' && p.size![1] === 0.35);
    expect(legs).toHaveLength(2);
    expect(legs[0]!.at[2]).toBeCloseTo(-legs[1]!.at[2], 6);
    expect(Math.abs(legs[0]!.at[2])).toBeGreaterThan(0.2);
  });

  it('lies prone along the heading when gliding, wings out to the sides', () => {
    const s = full();
    s.glide = true;
    const parts = dollParts(s);
    const heads = parts.filter((p) => p.kind === 'box' && p.color === '#e0ac82');
    expect(heads).toHaveLength(1);
    expect(heads[0]!.at[2]).toBeGreaterThan(0.4); // the head leads
    const wings = parts.filter((p) => p.color === '#7a5aff' || p.color === '#2a1a68');
    expect(wings).toHaveLength(2);
    for (const w of wings) expect(Math.abs(w.at[0])).toBeGreaterThan(0.6);
  });

  it('sneaking lowers the head', () => {
    const top = (s: DollState) => Math.max(...dollParts(s).filter((p) => p.kind === 'box').map((p) => p.at[1] + p.size![1]));
    const s = newDollState();
    const stand = top(s);
    s.sneak = true;
    expect(top(s)).toBeLessThan(stand - 0.15);
  });
});
