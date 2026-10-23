import { describe, expect, it } from 'vitest';
import { B, REG } from '../../src/content/registry';
import { IREG } from '../../src/content/itemRegistry';
import { MOB_REG } from '../../src/content/mobRegistry';
import { RECIPES } from '../../src/content/recipes';
import { LOOT_TABLES } from '../../src/content/loot';
import { COLUMN_LAYER } from '../../src/world/constants';
import { CloudGenerator } from '../../src/world/gen/CloudGen';
import { MobManager, type MobHost, type Mob } from '../../src/game/mobs/MobManager';
import { BOLT_EVERY, CHARGE_EVERY, CHARGE_TIME, GALE_SPEED, GALE_TIME, GALE_WARN, SOVEREIGN, STORM_ARENA_R, StormBoss, type StormHost } from '../../src/game/StormBoss';
import type { World } from '../../src/world/World';

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
    realm: { gravity: 13 },
  } as unknown as World;
  return { world, cells };
}

function setup(player = [-8.5, 10, 0.5, 0.5]) {
  const w = makeWorld();
  w.world.setBlock(0, 9, 0, 0, REG.id('storm_beacon'));
  const mm = new MobManager(w.world);
  mm.enabled = false;
  const spy = { messages: [] as string[], gales: [] as { dir: number; seconds: number }[] };
  const playerPos = new Float64Array(player);
  const hidden = new Float64Array([0, 0, 0, 1]);
  const right = new Float64Array([1, 0, 0, 0]);
  let diff = 2;
  const mobHost: MobHost = {
    world: w.world,
    playerPos,
    playerHidden: hidden,
    playerEye: Float64Array.from([player[0]!, player[1]! + 1.6, player[2]!, player[3]!]),
    playerFwd: new Float64Array([0, 0, 1, 0]),
    playerTargetable: true,
    playerInWater: false,
    daylight: 1,
    get difficulty() {
      return diff;
    },
    dropItem: () => undefined,
    hurtPlayer: () => undefined,
    explode: () => undefined,
    shoot: () => undefined,
    puff: () => undefined,
    shovePlayer: () => undefined,
  } as MobHost;
  const host: StormHost = {
    world: w.world,
    mobs: mm,
    playerPos,
    playerRight: right,
    playerHidden: hidden,
    playerTargetable: () => true,
    difficulty: () => diff,
    glow: () => undefined,
    message: (t) => void spy.messages.push(t),
    dropItem: () => undefined,
    gale: (dir, seconds) => void spy.gales.push({ dir, seconds }),
  };
  const boss = new StormBoss(host);
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
  return { w, mm, spy, playerPos, boss, run, wake, setDiff: (d: number) => void (diff = d) };
}

describe('Storm Sovereign (Phase 9.7): definition and the Citadel', () => {
  it('is a floating persistent boss with the tempest AI and a heart among its drops; the horn is craftable', () => {
    const cm = MOB_REG.get(SOVEREIGN);
    expect(cm.def.boss).toBe(true);
    expect(cm.def.persistent).toBe(true);
    expect(cm.def.floats).toBe(true);
    expect(cm.def.ai).toBe('tempest');
    expect(cm.drops.some((d) => IREG.name(d.item) === 'storm_heart')).toBe(true);
    expect(IREG.def(IREG.id('storm_horn')).use).toBe('storm_horn');
    const r = RECIPES.find((x) => x.result === 'storm_horn')!;
    expect(JSON.stringify(r)).toContain('storm_feather');
    expect(JSON.stringify(r)).toContain('gale_dust');
    expect(BOLT_EVERY[1]).toBeGreaterThan(BOLT_EVERY[3]);
    expect(GALE_SPEED).toBeGreaterThan(REG.realm('cloud').wind!);
  });

  const gen = new CloudGenerator(4242, REG.realm('cloud'));
  it('the Citadel stands on an island: a Beacon on the roof, four chests of Cloud armour, two spawners', () => {
    const st = gen.structures.placer.nearest(['cloud_citadel'], 0, 0, 0, 4000);
    expect(st).not.toBeNull();
    const plan = gen.structures.plan(st!);
    expect(plan.markers.filter((m) => m.kind === 'chest').map((m) => m.loot)).toEqual(['cloud_citadel', 'cloud_citadel', 'cloud_citadel', 'cloud_citadel']);
    expect(plan.markers.filter((m) => m.kind === 'spawner').map((m) => m.mob).sort()).toEqual(['storm_kite', 'wind_sprite']);
    let beacons = 0;
    const beacon = REG.id('storm_beacon');
    for (let cw = Math.floor(plan.min[3]! / 16); cw <= Math.floor(plan.max[3]! / 16); cw++)
      for (let cz = Math.floor(plan.min[2]! / 16); cz <= Math.floor(plan.max[2]! / 16); cz++)
        for (let cx = Math.floor(plan.min[0]! / 16); cx <= Math.floor(plan.max[0]! / 16); cx++) {
          const blocks = new Uint16Array(COLUMN_LAYER * gen.height);
          gen.generate(cx, cz, cw, blocks, new Uint8Array(COLUMN_LAYER * 4), {});
          for (let i = 0; i < blocks.length; i++) if ((blocks[i]! & 0xfff) === beacon) beacons++;
        }
    expect(beacons).toBe(1);
    const items = new Set(LOOT_TABLES.cloud_citadel!.pools.flatMap((p) => p.entries.map((e) => e.item)));
    for (const n of ['cloud_helmet', 'cloud_chestplate', 'cloud_leggings', 'cloud_boots', 'wind_glider']) expect(items.has(n), n).toBe(true);
  });

  it('is hosted by Cloud island biomes only', () => {
    for (const b of REG.biomes) expect((b.structures ?? []).includes('cloud_citadel'), b.name).toBe(b.realm === 'cloud' && b.kind === 'land');
  });
});

describe('Storm Sovereign: waking', () => {
  it('wakes above the Beacon, once; refuses in peaceful and once defeated', () => {
    const t = setup();
    t.setDiff(0);
    expect(t.boss.summon(0, 10, 0, 0)).toBe(false);
    t.setDiff(2);
    const m = t.wake();
    expect(m.def.name).toBe(SOVEREIGN);
    expect(Array.from(m.home!)).toEqual([0.5, 10, 0.5, 0.5]);
    expect(m.pos[1]!).toBeGreaterThan(12);
    expect(t.boss.summon(0, 10, 0, 0)).toBe(false);
    t.boss.onDefeat(m);
    t.mm.list.length = 0;
    expect(t.boss.summon(0, 10, 0, 0)).toBe(false);
    expect(t.boss.save()).toEqual({ defeated: true });
    const b = setup().boss;
    b.load({ defeated: true });
    expect(b.defeated).toBe(true);
    b.load(undefined);
    expect(b.defeated).toBe(false);
  });
});

describe('Storm Sovereign: bolts, gales, phases', () => {
  it('calls a bolt where you stand: announced first, then a column of lightning, then gone', () => {
    const t = setup();
    t.wake();
    t.run(4.3); // the first bolt comes after four seconds
    expect(t.boss.lances.length).toBeGreaterThan(0);
    expect(t.boss.warning).toContain('Lightning');
    expect(t.boss.marks().some((mk) => mk.kind === 'lance' && mk.pending)).toBe(true);
    const l = t.boss.lances[0]!;
    expect(l.x).toBe(Math.floor(t.playerPos[0]!));
    t.run(1.1);
    expect(l.cells.length).toBeGreaterThan(0);
    expect(t.w.world.getBlock(l.x, l.y, l.z, l.w)).toBe(REG.id('lightning_bolt'));
    t.run(1.2);
    expect(t.w.world.getBlock(l.x, l.y, l.z, l.w)).not.toBe(REG.id('lightning_bolt'));
  });

  it('warns of a gale along W, then blows it (kata or ana, for a few seconds)', () => {
    const t = setup();
    t.wake();
    t.run(9.1);
    expect(t.boss.galeIn).toBeGreaterThan(0);
    expect(t.boss.warning).toMatch(/GALE (ANA|KATA)/);
    expect(t.spy.gales).toHaveLength(0);
    t.run(GALE_WARN + 0.2);
    expect(t.spy.gales).toHaveLength(1);
    expect(Math.abs(t.spy.gales[0]!.dir)).toBe(1);
    expect(t.spy.gales[0]!.seconds).toBe(GALE_TIME);
  });

  it('phase II brings hawks and sprites and a second bolt; phase III charges (a quarter damage) between volleys', () => {
    const t = setup();
    const m = t.wake();
    m.health = m.def.health * 0.6;
    t.run(0.3);
    expect(m.phase).toBe(2);
    expect(t.mm.list.filter((x) => x.def.name === 'thunder_hawk')).toHaveLength(2);
    expect(t.mm.list.filter((x) => x.def.name === 'wind_sprite')).toHaveLength(2);
    m.health = m.def.health * 0.2;
    t.run(0.3);
    expect(m.phase).toBe(3);
    t.run(CHARGE_EVERY + 0.5);
    expect(t.boss.charge).toBeGreaterThan(0);
    expect(m.shielded).toBe(true);
    m.hurt = 0;
    const before = m.health;
    t.mm.damage(m, 8, null);
    expect(before - m.health).toBeCloseTo(2, 5);
    expect(t.boss.warning).toContain('charging');
    t.run(CHARGE_TIME + 0.5);
    expect(m.shielded).toBe(false);
  });

  it('protects the Citadel while it lives, and only then; goes home and heals when you leave', () => {
    const t = setup();
    expect(t.boss.protects(3, 10, 3, 3)).toBe(false);
    const m = t.wake();
    expect(t.boss.protects(3, 10, 3, 3)).toBe(true);
    expect(t.boss.protects(STORM_ARENA_R + 3, 10, 0, 0)).toBe(false);
    m.health = 100;
    t.playerPos[0] = 70;
    t.run(3);
    expect(m.health).toBeGreaterThan(100);
    expect(m.mode).toBe('idle');
    t.boss.onDefeat(m);
    expect(t.boss.protects(3, 10, 3, 3)).toBe(false);
    expect(t.boss.lances).toHaveLength(0);
  });
});
