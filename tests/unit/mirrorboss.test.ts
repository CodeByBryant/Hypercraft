import { describe, expect, it } from 'vitest';
import { B, REG } from '../../src/content/registry';
import { MOB_REG } from '../../src/content/mobRegistry';
import { IREG } from '../../src/content/itemRegistry';
import { MobManager, type MobHost, type Mob } from '../../src/game/mobs/MobManager';
import { COPY_DELAY, MIRROR_ARENA_R, MirrorBoss, TWIN, type MirrorBossHost } from '../../src/game/MirrorBoss';
import { DOLL_RADIUS, newDollState } from '../../src/game/PlayerModel';
import type { World } from '../../src/world/World';

/** Stone up to y = 9 (the floor top is 10), air above, plus what the test puts in. */
function makeWorld() {
  const cells = new Map<string, number>();
  const k = (x: number, y: number, z: number, w: number) => `${x},${y},${z},${w}`;
  const world = {
    getBlock: (x: number, y: number, z: number, w: number) => cells.get(k(x, y, z, w)) ?? (y < 10 ? B.stone : B.air),
    setBlock: (x: number, y: number, z: number, w: number, v: number) => {
      cells.set(k(x, y, z, w), v);
      return true;
    },
    skyHeight: () => 10,
    getLight: () => 0,
  } as unknown as World;
  return { world, cells, k };
}

function setup(player = [-5.5, 10, 0.5, 0.5]) {
  const w = makeWorld();
  w.world.setBlock(0, 10, 0, 0, REG.id('mirror_altar'));
  const mm = new MobManager(w.world);
  mm.enabled = false;
  const spy = { messages: [] as string[], shots: 0, hurts: [] as number[], melee: [] as number[], glows: 0 };
  const playerPos = new Float64Array(player);
  const hidden = new Float64Array([0, 0, 0, 1]);
  const right = new Float64Array([1, 0, 0, 0]);
  const doll = newDollState();
  let diff = 2;
  const mobHost: MobHost = {
    world: w.world,
    playerPos,
    playerHidden: hidden,
    playerEye: Float64Array.from([player[0]!, player[1]! + 1.6, player[2]!, player[3]!]),
    playerFwd: new Float64Array([0, 0, 1, 0]),
    playerTargetable: true,
    playerInWater: false,
    daylight: 0,
    get difficulty() {
      return diff;
    },
    dropItem: () => undefined,
    hurtPlayer: (a) => void spy.melee.push(a),
    explode: () => undefined,
    shoot: () => undefined,
    puff: () => undefined,
  } as MobHost;
  const host: MirrorBossHost = {
    world: w.world,
    mobs: mm,
    playerPos,
    playerRight: right,
    playerHidden: hidden,
    playerTargetable: () => true,
    difficulty: () => diff,
    shoot: () => void spy.shots++,
    glow: () => void spy.glows++,
    message: (t) => void spy.messages.push(t),
    dropItem: () => undefined,
    doll: () => doll,
    hurt: (a) => void spy.hurts.push(a),
  };
  const boss = new MirrorBoss(host);
  const run = (seconds: number) => {
    for (let t = 0; t < seconds - 1e-9; t += 0.1) {
      mm.update(0.1, mobHost, () => null, null);
      boss.update(0.1);
    }
  };
  const wake = (): Mob => {
    expect(boss.summon(0, 10, 0, 0)).toBe(true);
    run(0.2);
    return boss.find()!;
  };
  return { w, mm, spy, playerPos, boss, run, wake, doll, setDiff: (d: number) => void (diff = d) };
}

describe('Mirror Twin (Phase 9.3): definition', () => {
  it('is a persistent boss with the twin AI, a core among its drops, and a body that stays inside its radius', () => {
    const cm = MOB_REG.get(TWIN);
    expect(cm.def.boss).toBe(true);
    expect(cm.def.persistent).toBe(true);
    expect(cm.def.ai).toBe('twin');
    expect(cm.drops.some((d) => IREG.name(d.item) === 'twin_core')).toBe(true);
    expect(cm.radius).toBeLessThan(DOLL_RADIUS + 1);
    expect(COPY_DELAY[1]).toBeGreaterThan(COPY_DELAY[2]);
    expect(COPY_DELAY[2]).toBeGreaterThan(COPY_DELAY[3]);
  });
});

describe('Mirror Twin: waking', () => {
  it('appears opposite you across the altar and keeps the altar as its home', () => {
    const t = setup();
    const m = t.wake();
    expect(m.def.name).toBe(TWIN);
    expect(Array.from(m.home!)).toEqual([0.5, 10, 0.5, 0.5]);
    expect(m.pos[0]!).toBeGreaterThan(3);
    expect(t.spy.messages.join(' ')).toContain('Mirror Twin');
  });

  it('wakes once; refuses in peaceful and once defeated', () => {
    const t = setup();
    t.setDiff(0);
    expect(t.boss.summon(0, 10, 0, 0)).toBe(false);
    t.setDiff(2);
    expect(t.boss.summon(0, 10, 0, 0)).toBe(true);
    expect(t.boss.summon(0, 10, 0, 0)).toBe(false);
    const m = t.boss.find()!;
    t.boss.onDefeat(m);
    t.mm.list.length = 0;
    expect(t.boss.summon(0, 10, 0, 0)).toBe(false);
    expect(t.boss.defeated).toBe(true);
  });

  it('remembers a defeat across a save', () => {
    const a = setup().boss;
    expect(a.save()).toEqual({ defeated: false });
    a.defeated = true;
    const b = setup().boss;
    b.load(a.save());
    expect(b.defeated).toBe(true);
    b.load(undefined);
    expect(b.defeated).toBe(false);
  });
});

describe('Mirror Twin: the reflection', () => {
  it('walks to the point reflection of you through the altar', () => {
    const t = setup([-5.5, 10, 0.5, 0.5]);
    const m = t.wake();
    t.run(3);
    expect(Math.abs(m.pos[0]! - 6.5)).toBeLessThan(1.5);
    expect(Math.abs(m.pos[2]! - 0.5)).toBeLessThan(1.5);
    // You step along w: it steps the other way.
    t.playerPos[3] = 3.5;
    t.run(3);
    expect(m.pos[3]!).toBeLessThan(-1.5);
  });

  it('is rebuilt every frame in your colours, in silver', () => {
    const t = setup();
    t.doll.armor[0] = '#ff0000';
    t.doll.held = { color: '#00ff00', kind: 'tool' };
    const m = t.wake();
    expect(m.dyn).not.toBeNull();
    expect(m.dyn!.length).toBeGreaterThan(8);
    expect(m.dyn!.length).toBeLessThanOrEqual(16);
    expect(m.dyn!.some((p) => p.color === '#ff0000')).toBe(true);
    expect(m.dyn!.some((p) => p.color === '#00ff00')).toBe(true);
  });

  it('copies your swing late, and only hurts if you are within reach', () => {
    const near = setup([1.5, 10, 0.5, 0.5]);
    near.wake();
    near.boss.onPlayerAction('swing');
    near.run(0.4);
    expect(near.spy.hurts).toEqual([]);
    near.run(0.6);
    expect(near.spy.hurts).toHaveLength(1);

    const far = setup([-8.5, 10, 0.5, 0.5]);
    far.wake();
    far.run(2);
    far.boss.onPlayerAction('swing');
    far.run(1.2);
    expect(far.spy.hurts).toEqual([]);
  });

  it('copies your shot late', () => {
    const t = setup();
    t.wake();
    t.boss.onPlayerAction('shoot');
    t.run(0.4);
    expect(t.spy.shots).toBe(0);
    t.run(0.6);
    expect(t.spy.shots).toBe(1);
  });

  it('raises a shield when you do, which cuts your hits to a quarter', () => {
    const t = setup();
    const m = t.wake();
    const before = m.health;
    t.mm.damage(m, 8, null);
    expect(before - m.health).toBeCloseTo(8, 5);
    t.boss.onPlayerAction('block');
    t.run(1);
    expect(m.shielded).toBe(true);
    m.hurt = 0;
    const h2 = m.health;
    t.mm.damage(m, 8, null);
    expect(h2 - m.health).toBeCloseTo(2, 5);
    t.boss.onPlayerAction('unblock');
    t.run(1);
    expect(m.shielded).toBe(false);
  });
});

describe('Mirror Twin: phases', () => {
  it('phase II brings two Mirror Stalkers; phase III brings announced mirror beams that erupt and fade', () => {
    const t = setup();
    const m = t.wake();
    m.health = m.def.health * 0.6;
    t.run(0.3);
    expect(m.phase).toBe(2);
    expect(t.mm.list.filter((x) => x.def.name === 'mirror_stalker')).toHaveLength(2);
    expect(t.boss.lances).toHaveLength(0);
    m.health = m.def.health * 0.2;
    t.run(0.3);
    expect(m.phase).toBe(3);
    t.run(6.5);
    expect(t.boss.lances.length).toBeGreaterThan(0);
    expect(t.boss.warning).toContain('Mirror beams');
    expect(t.boss.marks().some((mk) => mk.kind === 'lance' && mk.pending)).toBe(true);
    const beam = REG.id('mirror_beam');
    t.run(2);
    const l = t.boss.lances[0]!;
    expect(l.cells.length).toBeGreaterThan(0);
    expect(t.w.world.getBlock(l.x, l.y, l.z, l.w)).toBe(beam);
    t.run(3);
    expect(t.w.world.getBlock(l.x, l.y, l.z, l.w)).not.toBe(beam);
  });

  it('never goes back a phase when it heals', () => {
    const t = setup();
    const m = t.wake();
    m.health = m.def.health * 0.2;
    t.run(0.3);
    m.health = m.def.health;
    t.run(0.3);
    expect(m.phase).toBe(3);
  });
});

describe('Mirror Twin: the arena', () => {
  it('protects the palace while the Twin lives, and only then', () => {
    const t = setup();
    expect(t.boss.protects(3, 10, 3, 3)).toBe(false);
    const m = t.wake();
    expect(t.boss.protects(3, 10, 3, 3)).toBe(true);
    expect(t.boss.protects(MIRROR_ARENA_R + 3, 10, 0, 0)).toBe(false);
    expect(t.boss.protects(3, 60, 3, 3)).toBe(false);
    t.boss.onDefeat(m);
    expect(t.boss.protects(3, 10, 3, 3)).toBe(false);
  });

  it('goes home and heals when you leave', () => {
    const t = setup();
    const m = t.wake();
    m.health = 100;
    t.playerPos[0] = 60;
    t.run(3);
    expect(m.health).toBeGreaterThan(100);
    expect(m.mode).toBe('idle');
  });

  it('a defeat clears the beams and the queued copies', () => {
    const t = setup();
    const m = t.wake();
    m.health = m.def.health * 0.2;
    t.run(7);
    expect(t.boss.lances.length).toBeGreaterThan(0);
    t.boss.onPlayerAction('swing');
    t.boss.onDefeat(m);
    expect(t.boss.lances).toHaveLength(0);
    expect(t.boss.warning).toBe('');
  });
});
