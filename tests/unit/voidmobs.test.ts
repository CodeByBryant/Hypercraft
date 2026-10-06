import { describe, expect, it } from 'vitest';
import { B, REG } from '../../src/content/registry';
import { IREG } from '../../src/content/itemRegistry';
import { MOB_REG, MAX_MOB_PARTS } from '../../src/content/mobRegistry';
import { VOID_MOBS, VOID_SPAWNS } from '../../src/content/voidMobs';
import { GAZE_CONE, gazePins } from '../../src/game/mobs/gaze';
import { MobManager, type MobHost } from '../../src/game/mobs/MobManager';
import type { World } from '../../src/world/World';

// A flat island: stone below y = 10, air above. `wall` adds a stone slab between player and mob.
function flatWorld(wall = false): World {
  return {
    getBlock: (_x: number, y: number, z: number) => (y < 10 || (wall && z === 6 && y < 14) ? B.stone : B.air),
    skyHeight: () => 10,
    getLight: () => 0x00,
  } as unknown as World;
}

interface Spies {
  hits: number[];
  effects: [string, number, number][];
  shots: Float64Array[];
  puffs: number;
}

function host(world: World, over: Partial<MobHost> = {}): { h: MobHost; spy: Spies } {
  const spy: Spies = { hits: [], effects: [], shots: [], puffs: 0 };
  const h: MobHost = {
    world,
    playerPos: new Float64Array([0.5, 10, 0.5, 0.5]),
    playerHidden: new Float64Array([0, 0, 0, 1]),
    playerEye: new Float64Array([0.5, 11.6, 0.5, 0.5]),
    playerFwd: new Float64Array([0, 0, 1, 0]),
    playerTargetable: true,
    playerInWater: false,
    daylight: 0,
    difficulty: 2,
    dropItem: () => undefined,
    hurtPlayer: (amount) => void spy.hits.push(amount),
    explode: () => undefined,
    shoot: (_from, vel) => void spy.shots.push(Float64Array.from(vel)),
    inflict: (e, s, a) => void spy.effects.push([e, s, a]),
    puff: () => void spy.puffs++,
    ...over,
  };
  return { h, spy };
}

describe('gaze', () => {
  const eye = [0, 0, 0, 0];
  const fwd = [0, 0, 1, 0]; // looking along +z
  const hidden = [0, 0, 0, 1];

  it('pins a body in your slice, inside the view cone, and nothing else', () => {
    expect(gazePins(eye, fwd, hidden, [0, 0, 10, 0])).toBe(true);
    expect(gazePins(eye, fwd, hidden, [3, 0, 10, 0])).toBe(true); // 17 degrees off
    expect(gazePins(eye, fwd, hidden, [6, 0, 10, 0])).toBe(false); // 31 degrees off
    expect(gazePins(eye, fwd, hidden, [10, 0, 0, 0])).toBe(false); // 90 degrees off
    expect(gazePins(eye, fwd, hidden, [0, 0, -10, 0])).toBe(false); // behind you
    expect(Math.cos(GAZE_CONE)).toBeGreaterThan(0.85);
  });

  it('cannot see a body kata or ana of your slice, however you turn', () => {
    expect(gazePins(eye, fwd, hidden, [0, 0, 10, 0.5])).toBe(true); // within the slab
    expect(gazePins(eye, fwd, hidden, [0, 0, 10, 2])).toBe(false); // ana
    expect(gazePins(eye, fwd, hidden, [0, 0, 10, -2])).toBe(false); // kata
    // Tilt the slice: the hidden axis becomes x, and the body one block of x away is out of view.
    expect(gazePins(eye, fwd, [1, 0, 0, 0], [3, 0, 10, 0])).toBe(false);
  });

  it('sees anything right next to you', () => {
    expect(gazePins(eye, fwd, hidden, [0.2, 0, -0.3, 0])).toBe(true);
  });
});

describe('void mobs: definitions', () => {
  it('has the four island mobs and the Sovereign, with bounded parts and drops that exist', () => {
    expect(VOID_MOBS.map((m) => m.name)).toEqual(['void_walker', 'whisper_swarm', 'starlight_serpent', 'sky_sentinel', 'void_sovereign']);
    for (const m of VOID_MOBS) {
      const cm = MOB_REG.get(m.name);
      expect(cm.def.parts.length).toBeLessThanOrEqual(MAX_MOB_PARTS);
      for (const d of cm.drops) expect(IREG.name(d.item)).not.toMatch(/^#/);
      for (const p of m.parts) {
        const ext = p.kind === 'box' ? Math.hypot(...p.size!) : p.r!;
        expect(Math.hypot(...p.at) + ext).toBeLessThanOrEqual(cm.radius);
        if (p.to) expect(Math.hypot(...p.to) + ext).toBeLessThanOrEqual(cm.radius);
      }
    }
  });

  it('spawns the Walker, Swarm and Serpent on the islands; Sentinels only come with vaults', () => {
    const void_ = REG.biomes.filter((b) => b.realm === 'void');
    const names = new Set(void_.flatMap((b) => (b.mobs?.night ?? []).map((s) => s.mob)));
    expect([...names].sort()).toEqual(['starlight_serpent', 'void_walker', 'whisper_swarm']);
    for (const b of void_) expect(VOID_SPAWNS[b.name]!.length).toBeGreaterThan(0);
    expect(REG.realm('void').islandSpawns).toBe(true);
  });

  it('gives the Swarm a slowing sting and the Walker a hard hit', () => {
    expect(MOB_REG.get('whisper_swarm').def.inflicts).toEqual({ effect: 'slowness', seconds: 4, amp: 0 });
    expect(MOB_REG.get('void_walker').def.damage).toBeGreaterThanOrEqual(8);
  });
});

describe('Void Walker', () => {
  const run = (mm: MobManager, h: MobHost, seconds: number) => {
    for (let t = 0; t < seconds; t += 1 / 30) mm.update(1 / 30, h, () => null, null);
  };

  it('freezes while it is watched and advances the moment you look away', () => {
    const world = flatWorld();
    const mm = new MobManager(world);
    mm.enabled = false;
    const { h } = host(world); // looking +z
    const m = mm.spawn('void_walker', 0.5, 10, 14.5, 0.5)!;
    run(mm, h, 3);
    expect(m.pos[2]).toBeCloseTo(14.5, 1); // pinned: it has not moved
    h.playerFwd = new Float64Array([0, 0, -1, 0]); // look away
    run(mm, h, 1.5);
    expect(m.pos[2]!).toBeLessThan(11);
  });

  it('is not pinned by a gaze through a wall', () => {
    const world = flatWorld(true);
    const mm = new MobManager(world);
    mm.enabled = false;
    const { h } = host(world);
    const m = mm.spawn('void_walker', 0.5, 10, 14.5, 0.5)!;
    run(mm, h, 1);
    expect(Math.abs(m.pos[2]! - 14.5) + Math.abs(m.pos[0]! - 0.5)).toBeGreaterThan(0.3); // free to move
  });

  it('is not pinned while it stands kata or ana of your slice, even if you stare straight at it', () => {
    const world = flatWorld();
    const mm = new MobManager(world);
    mm.enabled = false;
    const { h } = host(world);
    const m = mm.spawn('void_walker', 0.5, 10, 12.5, 3.5)!; // 3 blocks ana: invisible
    run(mm, h, 1);
    expect(Math.hypot(m.pos[2]! - 12.5, m.pos[3]! - 3.5)).toBeGreaterThan(1);
  });

  it('strikes hard when you turn your back, and not while you watch', () => {
    const world = flatWorld();
    const mm = new MobManager(world);
    mm.enabled = false;
    const { h, spy } = host(world);
    mm.spawn('void_walker', 0.5, 10, 2.2, 0.5)!;
    run(mm, h, 3);
    expect(spy.hits).toEqual([]); // watched: frozen, no attack
    h.playerFwd = new Float64Array([0, 0, -1, 0]);
    run(mm, h, 3);
    expect(spy.hits.length).toBeGreaterThan(0);
    expect(spy.hits[0]).toBeGreaterThanOrEqual(8);
  });

  it('blinks to within 5-7 blocks of you when unwatched and still far off', () => {
    const world = flatWorld();
    const mm = new MobManager(world);
    mm.enabled = false;
    const { h, spy } = host(world, { playerFwd: new Float64Array([0, 0, -1, 0]) });
    const m = mm.spawn('void_walker', 0.5, 10, 28.5, 0.5)!;
    for (let t = 0; t < 6 && spy.puffs === 0; t += 1 / 30) mm.update(1 / 30, h, () => null, null);
    expect(spy.puffs).toBeGreaterThan(0); // it blinked (a puff where it left and where it arrived)
    mm.update(1 / 30, h, () => null, null);
    const d = Math.hypot(m.pos[0]! - 0.5, m.pos[2]! - 0.5, m.pos[3]! - 0.5);
    expect(d).toBeLessThan(8);
    expect(d).toBeGreaterThan(4);
  });
});

describe('Whisper Swarm, Starlight Serpent and Sky Vault Sentinel', () => {
  it('a swarm stings and slows you', () => {
    const world = flatWorld();
    const mm = new MobManager(world);
    mm.enabled = false;
    const { h, spy } = host(world);
    mm.spawn('whisper_swarm', 0.5, 10, 1.6, 0.5)!;
    for (let t = 0; t < 4; t += 1 / 30) mm.update(1 / 30, h, () => null, null);
    expect(spy.hits.length).toBeGreaterThan(0);
    expect(spy.effects[0]).toEqual(['slowness', 4, 0]);
  });

  it('a serpent keeps its distance and fires starlight', () => {
    const world = flatWorld();
    const mm = new MobManager(world);
    mm.enabled = false;
    const { h, spy } = host(world);
    const m = mm.spawn('starlight_serpent', 0.5, 12, 6.5, 0.5)!;
    for (let t = 0; t < 6; t += 1 / 30) mm.update(1 / 30, h, () => null, null);
    expect(spy.shots.length).toBeGreaterThan(0);
    expect(Math.hypot(m.pos[0]! - 0.5, m.pos[2]! - 0.5, m.pos[3]! - 0.5)).toBeGreaterThan(5);
  });

  it('a serpent body undulates: its parts move along x and w over time', () => {
    const world = flatWorld();
    const mm = new MobManager(world);
    const m = mm.spawn('starlight_serpent', 0.5, 12, 6.5, 0.5)!;
    const i = m.def.parts.findIndex((p) => p.anim === 'wave' && (p.to?.[2] ?? 0) < -2);
    const a = new Float64Array(4), b = new Float64Array(4);
    const seen: number[][] = [];
    for (let k = 0; k < 4; k++) {
      m.age = k * 0.7;
      mm.animate(m, i, a, b);
      seen.push([a[0]!, a[3]!]);
    }
    const xs = seen.map((s) => s[0]!), ws = seen.map((s) => s[1]!);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(0.15);
    expect(Math.max(...ws) - Math.min(...ws)).toBeGreaterThan(0.1);
  });

  it('a sentinel sleeps until a chest opens near it, then fans three shots and never moves', () => {
    const world = flatWorld();
    const mm = new MobManager(world);
    mm.enabled = false;
    const { h, spy } = host(world);
    const m = mm.spawn('sky_sentinel', 0.5, 10, 12.5, 0.5)!;
    expect(m.awake).toBe(false);
    for (let t = 0; t < 4; t += 1 / 30) mm.update(1 / 30, h, () => null, null);
    expect(spy.shots.length).toBe(0);
    expect(mm.wakeNear(0.5, 10, 20, 0.5, 5)).toBe(0); // too far from the chest
    expect(mm.wakeNear(0.5, 10, 14, 0.5, 5)).toBe(1);
    for (let t = 0; t < 1; t += 1 / 30) mm.update(1 / 30, h, () => null, null);
    expect(spy.shots.length).toBe(3);
    // The three shots fan out: their x components differ.
    const xs = spy.shots.map((s) => s[0]!);
    expect(new Set(xs.map((x) => x.toFixed(2))).size).toBe(3);
    expect(m.pos[2]).toBeCloseTo(12.5, 1);
    // A hit does not knock it back.
    mm.damage(m, 5, [0.5, 10, 6, 0.5]);
    for (let t = 0; t < 0.5; t += 1 / 30) mm.update(1 / 30, h, () => null, null);
    expect(m.pos[2]).toBeCloseTo(12.5, 1);
  });

  it('a sentinel wakes when you walk right up to it', () => {
    const world = flatWorld();
    const mm = new MobManager(world);
    mm.enabled = false;
    const { h } = host(world);
    const m = mm.spawn('sky_sentinel', 0.5, 10, 3.5, 0.5)!;
    for (let t = 0; t < 0.3; t += 1 / 30) mm.update(1 / 30, h, () => null, null);
    expect(m.awake).toBe(true);
  });
});
