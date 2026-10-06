import { describe, expect, it } from 'vitest';
import { B, REG } from '../../src/content/registry';
import { IREG } from '../../src/content/itemRegistry';
import { MOB_REG } from '../../src/content/mobRegistry';
import { ARENA_R, BEAM_HEIGHT, DIRS, PYLONS, PYLON_CRYSTALS, SUMMON_R, VOID_TOP, inArena, spireXZW } from '../../src/content/void';
import { VoidGenerator } from '../../src/world/gen/VoidGen';
import { COLUMN_LAYER } from '../../src/world/constants';
import { MobManager, type MobHost, type Mob } from '../../src/game/mobs/MobManager';
import { LANCE_BURN, LANCE_WARNING, PYLON_HEAL, SHIFT_TIME, SOVEREIGN, THRONE_GATE, VoidBoss, phaseFor, type VoidBossHost } from '../../src/game/VoidBoss';
import type { World } from '../../src/world/World';
import type { ItemStack } from '../../src/game/items/ItemStack';

const id = (n: string) => REG.id(n);

/** A sparse world: stone up to the arena floor (y = VOID_TOP), air above, with what the test puts in. */
function makeWorld() {
  const cells = new Map<string, number>();
  const k = (x: number, y: number, z: number, w: number) => `${x},${y},${z},${w}`;
  const world = {
    getBlock: (x: number, y: number, z: number, w: number) => cells.get(k(x, y, z, w)) ?? (y <= VOID_TOP ? B.stone : B.air),
    setBlock: (x: number, y: number, z: number, w: number, v: number) => {
      cells.set(k(x, y, z, w), v);
      return true;
    },
    skyHeight: () => VOID_TOP + 1,
    getLight: () => 0,
  } as unknown as World;
  return { world, cells, k };
}

/** The arena as the generator builds it: pylons (a base and crystals) around the throne, dormant spires. */
function buildArena(w: ReturnType<typeof makeWorld>) {
  for (const [px, pz, pw] of PYLONS) {
    w.world.setBlock(px, VOID_TOP + 1, pz, pw, id('sovereign_stone'));
    for (let c = 0; c < PYLON_CRYSTALS; c++) w.world.setBlock(px, VOID_TOP + 2 + c, pz, pw, id('pylon_crystal'));
  }
  for (let s = 0; s < 6; s++) {
    const [sx, sz, sw] = spireXZW(s);
    w.world.setBlock(sx, VOID_TOP + 1, sz, sw, id('voidstone'));
  }
}

interface Spy {
  messages: string[];
  shots: number;
  drops: ItemStack[];
  blind: number;
  glows: number;
}

function setup(player = [-12, VOID_TOP + 1, 0, 0.5]) {
  const w = makeWorld();
  buildArena(w);
  const mm = new MobManager(w.world);
  mm.enabled = false;
  const spy: Spy = { messages: [], shots: 0, drops: [], blind: 0, glows: 0 };
  const playerPos = new Float64Array(player);
  const hidden = new Float64Array([0, 0, 0, 1]);
  const right = new Float64Array([1, 0, 0, 0]);
  const mobHost: MobHost = {
    world: w.world,
    playerPos,
    playerHidden: hidden,
    playerEye: Float64Array.from([player[0]!, player[1]! + 1.6, player[2]!, player[3]!]),
    playerFwd: new Float64Array([0, 0, 1, 0]),
    playerTargetable: true,
    playerInWater: false,
    daylight: 0,
    difficulty: 2,
    dropItem: () => undefined,
    hurtPlayer: () => undefined,
    explode: () => undefined,
    shoot: () => void spy.shots++,
    puff: () => undefined,
  };
  const host: VoidBossHost = {
    world: w.world,
    mobs: mm,
    playerPos,
    playerRight: right,
    playerHidden: hidden,
    playerTargetable: () => true,
    difficulty: () => 2,
    shoot: () => void spy.shots++,
    glow: () => void spy.glows++,
    message: (t) => void spy.messages.push(t),
    dropItem: (_x, _y, _z, _w, st) => void spy.drops.push(st),
    blind: () => void spy.blind++,
  };
  const boss = new VoidBoss(host);
  /** Advance the mobs (and the boss director with them) by `seconds` of play. */
  const run = (seconds: number) => {
    for (let t = 0; t < seconds; t += 0.1) {
      mm.update(0.1, mobHost, () => null, null);
      boss.update(0.1);
    }
  };
  /** Wake it and bring it into the fight. */
  const wake = (): Mob => {
    run(1);
    const m = boss.find()!;
    expect(m).toBeTruthy();
    return m;
  };
  return { w, mm, spy, playerPos, mobHost, boss, run, wake };
}

describe('Void Sovereign: pure rules', () => {
  it('has three phases by health: above 66%, above 33%, below', () => {
    expect(phaseFor(600, 600)).toBe(1);
    expect(phaseFor(397, 600)).toBe(1);
    expect(phaseFor(395, 600)).toBe(2);
    expect(phaseFor(199, 600)).toBe(2);
    expect(phaseFor(197, 600)).toBe(3);
    expect(phaseFor(1, 600)).toBe(3);
  });

  it('puts eight pylons inside the arena: four in the throne slice, four kata/ana of it', () => {
    expect(PYLONS).toHaveLength(8);
    expect(new Set(PYLONS.map((p) => p.join())).size).toBe(8);
    expect(PYLONS.filter((p) => p[2] === 0)).toHaveLength(4);
    expect(PYLONS.filter((p) => p[2] > 0)).toHaveLength(2);
    expect(PYLONS.filter((p) => p[2] < 0)).toHaveLength(2);
    for (const [x, z, w] of PYLONS) {
      expect(Math.hypot(x, z, w)).toBeLessThan(ARENA_R);
      expect(inArena(x, VOID_TOP + 2, z, w)).toBe(true);
    }
  });

  it('keeps the arrival platform and the spires out of the wake radius, and the arena rule wider than it', () => {
    expect(Math.hypot(-26.5, -29.5, 0.5)).toBeGreaterThan(SUMMON_R + 3);
    for (let k = 0; k < 6; k++) {
      const [x, z, w] = spireXZW(k);
      expect(Math.hypot(x, z, w)).toBeGreaterThan(SUMMON_R + 3);
    }
    expect(inArena(30, VOID_TOP, 0, 0)).toBe(true);
    expect(inArena(40, VOID_TOP, 0, 0)).toBe(false);
    expect(inArena(0, VOID_TOP, 0, 33)).toBe(true); // along W too: no tunnelling in from kata/ana
    expect(inArena(0, VOID_TOP, 0, 36)).toBe(false);
  });

  it('is built into the world: the generator stands every pylon on a Sovereign stone base', () => {
    const g = new VoidGenerator(2025, REG.realm('void'));
    const col = (cx: number, cz: number, cw: number) => {
      const b = new Uint16Array(COLUMN_LAYER * g.height);
      g.generate(cx, cz, cw, b, new Uint8Array(COLUMN_LAYER * 4), {});
      return b;
    };
    const cache = new Map<string, Uint16Array>();
    const at = (x: number, y: number, z: number, w: number) => {
      const key = `${x >> 4},${z >> 4},${w >> 4}`;
      let c = cache.get(key);
      if (!c) cache.set(key, (c = col(x >> 4, z >> 4, w >> 4)));
      return c[(x & 15) + ((z & 15) << 4) + ((w & 15) << 8) + y * COLUMN_LAYER]! & 0xfff;
    };
    for (const [x, z, w] of PYLONS) {
      expect(at(x, VOID_TOP + 1, z, w), `${x},${z},${w}`).toBe(id('sovereign_stone'));
      for (let k = 0; k < PYLON_CRYSTALS; k++) expect(at(x, VOID_TOP + 2 + k, z, w)).toBe(id('pylon_crystal'));
      expect(at(x, VOID_TOP + 2 + PYLON_CRYSTALS, z, w)).toBe(0);
    }
  });
});

describe('Void Sovereign: waking, healing and phases', () => {
  it('wakes on its throne when you come near, once, and not when you are far', () => {
    const far = setup([-30, VOID_TOP + 1, -30, 0.5]);
    far.run(2);
    expect(far.boss.find()).toBeNull();
    const near = setup();
    near.run(1);
    const m = near.boss.find()!;
    expect(m.def.name).toBe(SOVEREIGN);
    expect(m.home![0]).toBeCloseTo(0.5);
    expect(near.spy.messages.some((t) => t.includes('wakes'))).toBe(true);
    near.run(2);
    expect(near.mm.list.filter((x) => x.def.name === SOVEREIGN)).toHaveLength(1);
    expect(MOB_REG.get(SOVEREIGN).def.health).toBe(600);
    expect(MOB_REG.get(SOVEREIGN).def.boss).toBe(true);
  });

  it('never wakes on peaceful, and never again once defeated', () => {
    const s = setup();
    (s.boss as unknown as { host: VoidBossHost }).host.difficulty = () => 0;
    s.run(2);
    expect(s.boss.find()).toBeNull();
    const d = setup();
    d.boss.load({ defeated: true });
    d.run(2);
    expect(d.boss.find()).toBeNull();
    expect(d.boss.save()).toEqual({ defeated: true });
  });

  it('heals while pylons stand, and stops when they are broken', () => {
    const s = setup();
    const m = s.wake();
    m.health = 300;
    s.run(5);
    expect(s.boss.standing).toBe(8);
    expect(m.health).toBeGreaterThan(300 + 8 * PYLON_HEAL * 4);
    // Break them all (as the player does, one block at a time).
    for (const [x, z, w] of PYLONS) s.w.world.setBlock(x, VOID_TOP + 2, z, w, 0), s.w.world.setBlock(x, VOID_TOP + 3, z, w, 0), s.w.world.setBlock(x, VOID_TOP + 4, z, w, 0);
    s.run(1);
    expect(s.boss.standing).toBe(0);
    expect(s.spy.messages.some((t) => t.includes('last pylon'))).toBe(true);
    const hp = m.health;
    s.run(5);
    expect(m.health).toBeLessThanOrEqual(hp + 0.001);
  });

  it('announces its phases as its health falls and never goes back', () => {
    const s = setup();
    const m = s.wake();
    m.health = 380;
    s.run(0.5);
    expect(m.phase).toBe(2);
    m.health = 150;
    s.run(0.5);
    expect(m.phase).toBe(3);
    m.health = 500;
    s.run(0.5);
    expect(m.phase).toBe(3);
    expect(s.spy.messages.some((t) => t.includes('tears loose'))).toBe(true);
    expect(s.spy.messages.some((t) => t.includes('drinks the dark'))).toBe(true);
  });

  it('goes home and heals when you leave its arena', () => {
    const s = setup();
    const m = s.wake();
    m.health = 200;
    s.playerPos[0] = 80;
    s.run(4);
    expect(m.mode).toBe('idle');
    expect(m.health).toBeGreaterThan(220);
  });
});

describe('Void Sovereign: phase shift, lances and light', () => {
  /** Into the fight, phase 2, with the directors' timers all due. */
  function fight(phase = 2) {
    const s = setup();
    const m = s.wake();
    // Break the pylons so healing does not hide the numbers.
    for (const [x, z, w] of PYLONS) for (let c = 0; c < PYLON_CRYSTALS; c++) s.w.world.setBlock(x, VOID_TOP + 2 + c, z, w, 0);
    m.phase = phase;
    m.health = phase === 2 ? 350 : 150;
    s.run(0.5);
    return { ...s, m };
  }

  it('steps off your slice, is untouchable there, sends swarms, then returns into your slice', () => {
    const s = fight(2);
    s.boss.update(30); // every timer comes due: bolts, a shift, lances
    expect(s.m.shift).toBeGreaterThan(0);
    const H = s.mobHost.playerHidden;
    let dh = 0;
    for (let k = 0; k < 4; k++) dh += (s.m.pos[k]! - s.playerPos[k]!) * H[k]!;
    expect(Math.abs(dh)).toBeGreaterThan(5); // out of your slice (and out of sight)
    expect(s.mm.list.filter((x) => x.def.name === 'whisper_swarm').length).toBeGreaterThanOrEqual(2);
    expect(s.spy.messages.some((t) => t.includes('slips'))).toBe(true);
    // Untouchable while shifted.
    const hp = s.m.health;
    expect(s.mm.damage(s.m, 80, [0, VOID_TOP, 0, 0], null, undefined, true)).toBe(false);
    expect(s.m.health).toBe(hp);
    expect(s.boss.warning).toMatch(/kata|ana/);
    // The shift ends: it is back in your slice, hittable, a few blocks away.
    s.run(SHIFT_TIME + 0.5);
    expect(s.m.shift).toBeLessThanOrEqual(0);
    dh = 0;
    for (let k = 0; k < 4; k++) dh += (s.m.pos[k]! - s.playerPos[k]!) * H[k]!;
    expect(Math.abs(dh)).toBeLessThan(2);
    expect(s.mm.damage(s.m, 5, [0, VOID_TOP, 0, 0], null, undefined, true)).toBe(true);
  });

  it('calls lances down along W through you: announced, then they strike, then they go', () => {
    const s = fight(2);
    // Only the lances are due: the announcement shows before anything strikes.
    Object.assign((s.boss as unknown as { t: Record<string, number> }).t, { lance: 0, shift: 99, bolt: 99, drain: 99 });
    s.boss.update(0.1);
    expect(s.boss.lances.length).toBeGreaterThanOrEqual(7);
    // One of them is in your own slice (it can hit you); the rest are kata/ana of it along W.
    const inSlice = s.boss.lances.filter((l) => l.w === Math.floor(s.playerPos[3]!));
    expect(inSlice.length).toBeGreaterThanOrEqual(1);
    expect(new Set(s.boss.lances.map((l) => l.w)).size).toBeGreaterThanOrEqual(7);
    expect(s.boss.marks().filter((m) => m.kind === 'lance' && m.pending).length).toBeGreaterThanOrEqual(7);
    expect(s.boss.warning).toContain('Void lances');
    const l = s.boss.lances[0]!;
    expect(s.w.world.getBlock(l.x, l.y, l.z, l.w)).not.toBe(id('void_lance'));
    s.boss.update(LANCE_WARNING + 0.2);
    expect(s.w.world.getBlock(l.x, l.y, l.z, l.w) & 0xfff).toBe(id('void_lance'));
    expect(REG.damage[id('void_lance')]).toBeGreaterThan(0);
    s.boss.update(LANCE_BURN + 0.2);
    expect(s.w.world.getBlock(l.x, l.y, l.z, l.w) & 0xfff).toBe(0);
  });

  it('adds lances across your slice in phase III', () => {
    const s2 = fight(2);
    s2.boss.update(30);
    const s3 = fight(3);
    s3.boss.update(30);
    const at = (s: typeof s3) => new Set(s.boss.lances.map((l) => l.x)).size;
    expect(at(s3)).toBeGreaterThan(at(s2));
  });

  it('drains the light in phase III: torches and lanterns near you go out as items, and you are blinded', () => {
    const s = fight(3);
    const torch = id('torch'), lantern = id('lantern');
    const [px, py, pz, pw] = [Math.floor(s.playerPos[0]!), Math.floor(s.playerPos[1]!), Math.floor(s.playerPos[2]!), Math.floor(s.playerPos[3]!)];
    s.w.world.setBlock(px + 3, py, pz, pw, torch);
    s.w.world.setBlock(px, py + 2, pz + 4, pw + 5, lantern);
    s.w.world.setBlock(px + 20, py, pz, pw, torch); // too far
    expect(s.boss.drain()).toBe(2);
    expect(s.w.world.getBlock(px + 3, py, pz, pw)).toBe(0);
    expect(s.w.world.getBlock(px, py + 2, pz + 4, pw + 5)).toBe(0);
    expect(s.w.world.getBlock(px + 20, py, pz, pw) & 0xfff).toBe(torch);
    expect(s.spy.drops.map((d) => IREG.name(d.id)).sort()).toEqual(['lantern', 'torch']);
    expect(s.spy.blind).toBe(1);
    // It does so on its own in phase III.
    s.boss.update(30);
    expect(s.spy.blind).toBeGreaterThanOrEqual(2);
  });
});

describe('Void Sovereign: arena rules and defeat', () => {
  it('forbids breaking and building in the arena while it lives, except its pylons', () => {
    const s = setup();
    expect(s.boss.protects(5, VOID_TOP, 5, 0)).toBe(true);
    expect(s.boss.protects(0, VOID_TOP + 20, 0, 20)).toBe(true); // up and along W too
    expect(s.boss.protects(60, VOID_TOP, 0, 0)).toBe(false);
    expect(s.boss.protects(22, VOID_TOP + 2, 0, 0, id('pylon_crystal'))).toBe(false);
    s.boss.load({ defeated: true });
    expect(s.boss.protects(5, VOID_TOP, 5, 0)).toBe(false);
  });

  it('shatters a pylon when the player shoots it, and only then', () => {
    const s = setup();
    const [px, pz, pw] = PYLONS[0]!;
    const crystal = id('pylon_crystal');
    expect(s.boss.projectileHit(px, VOID_TOP + 3, pz, pw, crystal, false)).toBe(false); // a mob's shot does nothing
    expect(s.boss.projectileHit(px + 1, VOID_TOP + 3, pz, pw, crystal, true)).toBe(false); // not a pylon column
    expect(s.boss.projectileHit(px, VOID_TOP + 3, pz, pw, id('stone'), true)).toBe(false);
    expect(s.boss.countPylons()).toBe(8);
    expect(s.boss.projectileHit(px, VOID_TOP + 3, pz, pw, crystal, true)).toBe(true);
    expect(s.boss.countPylons()).toBe(7);
    for (let k = 0; k < PYLON_CRYSTALS; k++) expect(s.w.world.getBlock(px, VOID_TOP + 2 + k, pz, pw)).toBe(0);
    expect(s.w.world.getBlock(px, VOID_TOP + 1, pz, pw) & 0xfff).toBe(id('sovereign_stone')); // the base stays
  });

  it('shatters a whole pylon when any one of its crystals is broken', () => {
    const s = setup();
    const [px, pz, pw] = PYLONS[2]!;
    const crystal = id('pylon_crystal');
    // The game tells the boss about every block change: breaking the middle crystal takes the lot.
    s.w.world.setBlock(px, VOID_TOP + 3, pz, pw, 0);
    s.boss.blockChanged(px, VOID_TOP + 3, pz, pw, crystal, 0);
    for (let k = 0; k < PYLON_CRYSTALS; k++) expect(s.w.world.getBlock(px, VOID_TOP + 2 + k, pz, pw)).toBe(0);
    expect(s.boss.countPylons()).toBe(7);
    // Other blocks, other columns, and placing a crystal do nothing.
    s.boss.blockChanged(px + 1, VOID_TOP + 3, pz, pw, crystal, 0);
    s.boss.blockChanged(0, VOID_TOP, 0, 0, id('stone'), 0);
    expect(s.boss.countPylons()).toBe(7);
  });

  it('on defeat: an exit gate on the throne, the six spires awake, the pylons gone, and it is remembered', () => {
    const s = setup();
    const m = s.wake();
    m.health = 0;
    s.boss.onDefeat(m);
    expect(s.boss.defeated).toBe(true);
    const [gx, gy, gz, gw] = THRONE_GATE;
    expect(s.w.world.getBlock(gx, gy, gz, gw) & 0xfff).toBe(id('void_gate'));
    for (const d of DIRS) expect(s.w.world.getBlock(gx + d[0], gy, gz + d[1], gw + d[2]) & 0xfff).toBe(id('void_gate_frame_eye'));
    for (let k = 0; k < 6; k++) {
      const [sx, sz, sw] = spireXZW(k);
      for (let y = VOID_TOP + 1; y <= VOID_TOP + BEAM_HEIGHT; y++) expect(s.w.world.getBlock(sx, y, sz, sw) & 0xfff, `spire ${k} y${y}`).toBe(id('gateway_beam'));
    }
    expect(s.boss.countPylons()).toBe(0);
    expect(s.boss.save()).toEqual({ defeated: true });
    expect(s.spy.messages.some((t) => t.includes('falls'))).toBe(true);
    // A world that reloads it as defeated keeps the gate and spires (nothing wakes again).
    const again = setup();
    again.boss.load(s.boss.save());
    expect(again.w.world.getBlock(sxOf(0), VOID_TOP + 1, 0, 0) & 0xfff).toBe(id('voidstone')); // a regenerated, never-edited spire is dormant stone...
    again.run(2);
    expect(again.boss.find()).toBeNull();
    expect(again.w.world.getBlock(sxOf(0), VOID_TOP + 1, 0, 0) & 0xfff).toBe(id('gateway_beam')); // ...until the defeated world lights it
    expect(again.boss.countPylons()).toBe(0); // and clears the pylons it regenerated
  });
});

const sxOf = (k: number) => spireXZW(k)[0];
