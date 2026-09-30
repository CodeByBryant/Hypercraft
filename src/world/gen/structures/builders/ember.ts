// Ember Depths structures (Phase 6): citadels whose floors only connect through W, forge
// shrines, basalt ziggurats, magma bridges over the lava sea, ruined portals, and the Regent's
// Caldera, the Magma Regent's arena.

import { A, Bf, C, ORIENTS, id, type Builder } from '../Builder';
import type { Start } from '../Placement';
import { IF_AIR, IF_SOFT, pillar } from './common';

/** A random pick of cinder bricks (plain, cracked, chiseled). */
function brick(b: Builder): number {
  const r = b.rng.next();
  return r < 0.72 ? id('cinder_bricks') : r < 0.9 ? id('cracked_cinder_bricks') : id('chiseled_cinder_bricks');
}

/**
 * Citadel: three towers ("wings") side by side along the local c axis, which is always world W
 * (the builder forces an orientation with c = W). Each wing has three floors and no stairs of
 * its own between them except one: wing +c climbs from floor 0 to 1, wing -c from 1 to 2. Every
 * floor links to its neighbour wings only through corridors running along W. So in an
 * axis-aligned slice the corridors are side doors that lead kata/ana: you climb the citadel by
 * walking through W. Treasure waits in the top of the middle wing, guards in the barracks.
 */
export function citadel(b: Builder, st: Start): void {
  // Force c = world W (16 of the 48 orientations).
  const withW = ORIENTS.filter((o) => o.axes[2] === 3);
  b.orient(withW[st.orient % withW.length]!);
  const WING = [-9, 0, 9];
  const FLOORS = [0, 6, 12];
  const top = 17;
  const vbricks = id('voidstone_bricks'), glow = id('emberglass'), soulGlass = id('soul_glass'), gold = id('gold_block');
  const g = b.ground(0, 0, 0) - b.originY;
  // Foundation under the whole footprint.
  b.foundation(-5, -5, -11, 5, 5, 11, g + 1, id('cinder_bricks'), 16);
  const y0 = g + 1;
  for (let wi = 0; wi < 3; wi++) {
    const cc = WING[wi]!;
    for (let c = cc - 2; c <= cc + 2; c++)
      for (let bb = -5; bb <= 5; bb++)
        for (let y = 0; y <= top; y++)
          for (let a = -5; a <= 5; a++) {
            const ea = a === -5 || a === 5, eb = bb === -5 || bb === 5, ec = c === cc - 2 || c === cc + 2;
            const edges = (ea ? 1 : 0) + (eb ? 1 : 0) + (ec ? 1 : 0);
            const floor = FLOORS.includes(y) || y === top;
            let v = 0;
            if (edges >= 2) v = id('chiseled_cinder_bricks');
            else if (edges === 1 || floor) v = brick(b);
            // Windows of soul glass on the a walls.
            if (edges === 1 && ea && (y % 6 === 3) && Math.abs(bb) <= 1 && !ec) v = soulGlass;
            b.set(a, y0 + y, bb, c, v);
          }
    // Battlements.
    for (let c = cc - 2; c <= cc + 2; c++)
      for (let bb = -5; bb <= 5; bb++)
        for (let a = -5; a <= 5; a++) {
          const rim = a === -5 || a === 5 || bb === -5 || bb === 5 || c === cc - 2 || c === cc + 2;
          if (rim && (a + bb + c) % 2 === 0) b.set(a, y0 + top + 1, bb, c, vbricks);
        }
    // Lamps on every floor.
    for (const fy of FLOORS) {
      b.set(-4, y0 + fy + 4, -4, cc, glow);
      b.set(4, y0 + fy + 4, 4, cc, glow);
    }
  }
  // The entrance: a gate in the -b wall of the middle wing, with a path of bricks outside.
  b.box(-1, y0 + 1, -5, 0, 1, y0 + 3, -5, 0, 0);
  for (let t = 6; t <= 9; t++) b.box(-1, y0, -t, 0, 1, y0, -t, 0, id('cinder_bricks'), IF_SOFT);
  // W corridors on every floor: 3x3 tunnels along c between the wings.
  for (const fy of FLOORS)
    for (const [c0, c1] of [
      [-7, -2],
      [2, 7],
    ] as [number, number][]) {
      for (let c = c0; c <= c1; c++)
        for (let bb = -2; bb <= 2; bb++)
          for (let y = fy; y <= fy + 4; y++)
            for (let a = -2; a <= 2; a++) {
              const shell = Math.abs(a) === 2 || Math.abs(bb) === 2 || y === fy || y === fy + 4;
              b.set(a, y0 + y, bb, c, shell ? brick(b) : 0);
            }
      // Doorways through the wing walls at both ends of the corridor.
      b.box(-1, y0 + fy + 1, -1, c0, 1, y0 + fy + 3, 1, c0, 0);
      b.box(-1, y0 + fy + 1, -1, c1, 1, y0 + fy + 3, 1, c1, 0);
    }
  // The only climbs: wing +c from floor 0 to 1, wing -c from floor 1 to 2 (staircases along a).
  const stairs = (cc: number, fy: number) => {
    for (let s = 0; s < 6; s++) {
      b.set(-4 + s, y0 + fy + 1 + s, 3, cc, id('cinder_bricks'));
      b.set(-4 + s, y0 + fy + 1 + s, 4, cc, id('cinder_bricks'));
      b.box(-4 + s, y0 + fy + 2 + s, 3, cc, -4 + s, y0 + fy + 4 + s, 4, cc, 0);
    }
    // The hole in the floor above.
    b.box(0, y0 + fy + 6, 3, cc, 2, y0 + fy + 6, 4, cc, 0);
  };
  stairs(9, 0);
  stairs(-9, 6);
  // Treasure: the top floor of the middle wing (reached from wing -c through W).
  b.chest(0, y0 + 13, 3, 0, 'citadel_treasure');
  b.chest(-3, y0 + 13, 3, 1, 'citadel_treasure');
  b.set(3, y0 + 13, 3, -1, gold);
  // Barracks: floor 1 of the +c wing; guards on the ground floor and in the barracks.
  b.chest(3, y0 + 7, -3, 9, 'citadel_barracks');
  b.chest(-3, y0 + 1, -3, -9, 'citadel_storage');
  b.spawner(3, y0 + 1, -3, 9, 'cinder_hound');
  for (const [a, fy, bb, c] of [
    [2, 0, 2, 0],
    [-2, 6, -2, 9],
    [2, 12, -2, -9],
  ] as [number, number, number, number][])
    b.npc(a, y0 + fy + 1, bb, c, 'citadel_guard', {});
  // A lava moat along the -b face (the side of the gate).
  for (let c = -11; c <= 11; c++)
    for (let a = -6; a <= 6; a++) {
      if (Math.abs(a) <= 1 && Math.abs(c) <= 1) continue;
      b.set(a, g, -7, c, id('lava'), IF_SOFT);
    }
}

/** Forge shrine: pillars around a 4D lava basin, a blast furnace, an iron anvil, a loot chest. */
export function forge(b: Builder): void {
  const g = b.ground(0, 0, 0) - b.originY;
  const y0 = g + 1;
  b.foundation(-4, -4, -4, 4, 4, 4, y0, id('cinder_bricks'), 10);
  b.box(-4, y0 - 1, -4, -4, 4, y0 - 1, 4, 4, id('cinder_bricks'));
  b.clearAbove(-4, -4, -4, 4, 4, 4, y0, 6);
  // Pillars at the 8 horizontal "corners" of the (a, b, c) cube, joined by a roof.
  for (const a of [-4, 4])
    for (const bb of [-4, 4])
      for (const c of [-4, 4]) pillar(b, a, y0, bb, c, y0 + 4, id('chiseled_cinder_bricks'));
  b.box(-4, y0 + 5, -4, -4, 4, y0 + 5, 4, 4, id('cinder_bricks'));
  b.box(-3, y0 + 5, -3, -3, 3, y0 + 5, 3, 3, 0);
  b.box(-2, y0 + 5, -2, -2, 2, y0 + 5, 2, 2, id('soul_glass'));
  // The basin (a 4D pool of lava) and the tools of the trade.
  b.box(-1, y0 - 1, -1, -1, 1, y0 - 1, 1, 1, id('lava'));
  b.set(3, y0, 0, 0, id('blast_furnace'));
  b.set(-3, y0, 0, 0, id('iron_block'));
  b.set(0, y0, 3, 0, id('smoker'));
  b.chest(0, y0, -3, 0, 'forge');
  b.set(0, y0 + 4, 0, 3, id('emberglass'));
  b.set(0, y0 + 4, 0, -3, id('emberglass'));
}

/** Basalt ziggurat: a stepped 4D pyramid with a lava cross on top and a chamber inside. */
export function ziggurat(b: Builder): void {
  const g = b.ground(0, 0, 0) - b.originY;
  const y0 = g;
  const R = 8;
  b.foundation(-R, -R, -R, R, R, R, y0, id('prism_basalt'), 12);
  for (let k = 0; k < 5; k++) {
    const r = R - k * 2;
    const blk = k % 2 === 0 ? id('columnar_basalt') : id('prism_basalt');
    b.box(-r, y0 + k * 2, -r, -r, r, y0 + k * 2 + 1, r, r, blk);
  }
  // Inner chamber, a door, and loot.
  b.box(-3, y0 + 1, -3, -3, 3, y0 + 4, 3, 3, 0);
  b.box(0, y0 + 1, -R, 0, 0, y0 + 2, -4, 0, 0);
  b.chest(0, y0 + 1, 2, 0, 'ziggurat');
  b.chest(0, y0 + 1, 0, 2, 'ziggurat');
  b.spawner(-2, y0 + 1, 0, -2, 'slag_golem');
  b.set(2, y0 + 4, 2, 0, id('emberglass'));
  // The top: a lava cross along a, b and c.
  const ty = y0 + 9;
  for (let s = -1; s <= 1; s++) {
    b.set(s, ty, 0, 0, id('lava'));
    b.set(0, ty, s, 0, id('lava'));
    b.set(0, ty, 0, s, id('lava'));
  }
  b.set(0, ty + 1, 0, 0, id('emberglass'));
}

/** Magma bridge: a long causeway over the lava sea, with a branch along c (kata/ana). */
export function magmaBridge(b: Builder): void {
  const y = 0; // the start is one above the lava
  const deck = id('cinder_bricks'), rail = id('chiseled_cinder_bricks'), glow = id('emberglass');
  const len = b.int(14, 22);
  const lenC = b.int(8, 14);
  const run = (axis: number, sign: number, n: number) => {
    for (let t = 0; t <= n; t++)
      for (let s = -1; s <= 1; s++) {
        const p = [0, 0, 0];
        p[axis] = t * sign;
        const side = axis === A ? Bf : A;
        p[side] = s;
        b.set(p[0]!, y, p[1]!, p[2]!, deck);
        for (let h = 1; h <= 3; h++) b.set(p[0]!, y + h, p[1]!, p[2]!, 0, IF_AIR);
        if (Math.abs(s) === 1 && t % 2 === 0) b.set(p[0]!, y + 1, p[1]!, p[2]!, rail);
        if (s === 0 && t > 0 && t % 8 === 0) {
          // A pier down into the lava, and a lamp post.
          for (let d = 1; d <= 20; d++) b.set(p[0]!, y - d, p[1]!, p[2]!, rail, IF_SOFT);
          const q = [...p];
          q[side] = 1;
          pillar(b, q[0]!, y + 1, q[1]!, q[2]!, y + 3, rail);
          b.set(q[0]!, y + 4, q[1]!, q[2]!, glow);
        }
      }
  };
  run(A, 1, len);
  run(A, -1, len);
  run(C, 1, lenC);
  run(C, -1, lenC);
  // The junction: a small platform with a chest.
  b.box(-2, y, -2, -2, 2, y, 2, 2, deck);
  b.chest(1, y + 1, 1, 0, 'magma_bridge');
}

/** Ruined portal (Ember): a broken 4D frame of voidstone and obsidian, with gold and loot. */
export function emberRuinedPortal(b: Builder): void {
  const g = b.ground(0, 0, 0) - b.originY;
  const frame = [id('voidstone'), id('obsidian')];
  for (let c = -3; c <= 3; c++)
    for (let bb = -3; bb <= 3; bb++)
      for (let a = -3; a <= 3; a++) {
        if (a * a + bb * bb + c * c > 10 || !b.chance(0.55)) continue;
        const gy = b.ground(a, bb, c) - b.originY;
        b.set(a, gy, bb, c, b.chance(0.35) ? id('magma_block') : id('cinder_bricks'));
      }
  // Frame faces of a 3D box in (a, y, c): interior 2 x 3 x 2, some blocks missing.
  for (let c = -2; c <= 1; c++)
    for (let y = 0; y <= 4; y++)
      for (let a = -2; a <= 1; a++) {
        const fa = a === -2 || a === 1, fy = y === 0 || y === 4, fc = c === -2 || c === 1;
        const faces = (fa ? 1 : 0) + (fy ? 1 : 0) + (fc ? 1 : 0);
        if (faces !== 1 || !b.chance(0.7)) continue;
        b.set(a, g + 1 + y, 0, c, b.chance(0.1) ? id('gold_block') : frame[b.int(0, 1)]!);
      }
  b.set(2, g + 1, 2, 1, id('phase_crystal'));
  b.chest(2, g + 1, -2, 0, 'ember_ruined_portal');
}

/**
 * The Regent's Caldera: a round arena floating on the lava sea (a 4D disc), ringed by a low
 * wall and eight glowing basalt pillars, with causeways out along a and c, and the Magma
 * Regent's throne in the middle. The Regent itself spawns once (an NPC marker).
 */
export function regentCaldera(b: Builder): void {
  const y = 0;
  const R = 11;
  const deck = id('scorched_stone'), wall = id('voidstone_bricks');
  for (let c = -R; c <= R; c++)
    for (let bb = -R; bb <= R; bb++)
      for (let a = -R; a <= R; a++) {
        const d = Math.sqrt(a * a + bb * bb + c * c);
        if (d > R + 0.5) continue;
        b.set(a, y, bb, c, d > R - 1 ? wall : (a + bb + c) % 5 === 0 ? id('magma_block') : deck);
        if (d > R - 0.5) b.set(a, y + 1, bb, c, wall);
        else for (let h = 1; h <= 8; h++) b.set(a, y + h, bb, c, 0, IF_AIR);
      }
  // Support pillars into the lava.
  for (const [a, bb, c] of [
    [6, 0, 0],
    [-6, 0, 0],
    [0, 6, 0],
    [0, -6, 0],
    [0, 0, 6],
    [0, 0, -6],
  ] as [number, number, number][])
    for (let d = 1; d <= 24; d++) b.set(a, y - d, bb, c, id('glowing_basalt'), IF_SOFT);
  // Eight pillars around the arena (at 45-degree points of the a/c plane and on the b axis).
  for (const [a, bb, c] of [
    [8, 0, 0],
    [-8, 0, 0],
    [0, 0, 8],
    [0, 0, -8],
    [6, 0, 6],
    [-6, 0, -6],
    [0, 8, 0],
    [0, -8, 0],
  ] as [number, number, number][]) {
    pillar(b, a, y + 1, bb, c, y + 6, id('glowing_basalt'));
    b.set(a, y + 7, bb, c, id('emberglass'));
  }
  // The throne.
  b.box(-1, y + 1, 3, -1, 1, y + 1, 4, 1, wall);
  b.box(-1, y + 2, 4, -1, 1, y + 4, 4, 1, wall);
  b.set(0, y + 5, 4, 0, id('emberglass'));
  // Causeways out (3 wide, 10 long) along +-a and +-c.
  for (const [axis, sign] of [
    [A, 1],
    [A, -1],
    [C, 1],
    [C, -1],
  ] as [number, number][])
    for (let t = R; t <= R + 10; t++)
      for (let s = -1; s <= 1; s++) {
        const p = [0, 0, 0];
        p[axis] = t * sign;
        p[Bf] = s;
        b.set(p[0]!, y, p[1]!, p[2]!, deck);
        if (t === R) for (let h = 1; h <= 3; h++) b.set(p[0]!, y + h, p[1]!, p[2]!, 0);
      }
  b.chest(0, y + 1, -3, 0, 'regent_caldera');
  b.npc(0, y + 2, 0, 0, 'magma_regent', { boss: true });
}
