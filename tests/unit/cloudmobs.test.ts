import { describe, expect, it } from 'vitest';
import { B, REG } from '../../src/content/registry';
import { IREG } from '../../src/content/itemRegistry';
import { MOB_REG, MAX_MOB_PARTS } from '../../src/content/mobRegistry';
import { CLOUD_MOBS, CLOUD_SPAWNS } from '../../src/content/cloudMobs';
import { CLOUD_BIOMES } from '../../src/content/cloud';
import { ARMOR_MATERIALS } from '../../src/content/armor';
import { RECIPES } from '../../src/content/recipes';
import { MobManager, type MobHost } from '../../src/game/mobs/MobManager';
import type { World } from '../../src/world/World';

function flatWorld(): World {
  return { getBlock: (_x: number, y: number) => (y < 10 ? B.stone : B.air), skyHeight: () => 10, getLight: () => 0 } as unknown as World;
}

function host(world: World, over: Partial<MobHost> = {}) {
  const spy = { shots: [] as { item: number; beam: boolean | undefined }[], hits: [] as number[], shoves: [] as number[] };
  const h: MobHost = {
    world,
    playerPos: new Float64Array([0.5, 10, 0.5, 0.5]),
    playerHidden: new Float64Array([0, 0, 0, 1]),
    playerEye: new Float64Array([0.5, 11.6, 0.5, 0.5]),
    playerFwd: new Float64Array([0, 0, 1, 0]),
    playerTargetable: true,
    playerInWater: false,
    daylight: 1,
    difficulty: 2,
    dropItem: () => undefined,
    hurtPlayer: (a) => void spy.hits.push(a),
    explode: () => undefined,
    shoot: (_f, _v, _d, item, _b, beam) => void spy.shots.push({ item, beam }),
    shovePlayer: (d) => void spy.shoves.push(d),
    puff: () => undefined,
    ...over,
  };
  return { h, spy };
}

const run = (mm: MobManager, h: MobHost, seconds: number) => {
  for (let t = 0; t < seconds; t += 1 / 30) mm.update(1 / 30, h, () => null, null);
};

describe('Cloud mobs (Phase 9.7): definitions', () => {
  it('has the Kite, the Hawk, the Sprite, the Whale and the Sovereign, flying, with bounded parts and drops that exist', () => {
    expect(CLOUD_MOBS.map((m) => m.name)).toEqual(['storm_kite', 'thunder_hawk', 'wind_sprite', 'cloud_whale', 'storm_sovereign']);
    for (const m of CLOUD_MOBS) {
      const cm = MOB_REG.get(m.name);
      expect(cm.def.floats, m.name).toBe(true);
      expect(cm.def.parts.length).toBeLessThanOrEqual(MAX_MOB_PARTS);
      expect(cm.drops.length).toBeGreaterThan(0);
    }
    expect(MOB_REG.get('cloud_whale').def.hostile).toBe(false);
    expect(MOB_REG.get('thunder_hawk').def.ai).toBe('diver');
    expect(MOB_REG.get('wind_sprite').def.ai).toBe('sprite');
    expect(MOB_REG.get('storm_kite').def.projectile?.item).toBe('static_bolt');
  });

  it('live in every Cloud biome (day and night tables of real mobs); the whales drift over the meadows and the sea', () => {
    for (const b of CLOUD_BIOMES) {
      const t = CLOUD_SPAWNS[b.name];
      expect(t, b.name).toBeDefined();
      expect(b.mobs?.day, b.name).toEqual(t!.day);
      expect(b.mobs?.night, b.name).toEqual(t!.night);
      for (const s of [...t!.day, ...t!.night]) expect(MOB_REG.has(s.mob), s.mob).toBe(true);
    }
    expect(CLOUD_SPAWNS.cirrus_meadow!.day.some((s) => s.mob === 'cloud_whale')).toBe(true);
    expect(CLOUD_SPAWNS.nimbus_sea!.day.some((s) => s.mob === 'cloud_whale')).toBe(true);
    expect(CLOUD_SPAWNS.storm_reef!.night.some((s) => s.mob === 'thunder_hawk')).toBe(true);
  });
});

describe('Cloud mobs: behaviour', () => {
  it('Storm Kites hang off and spit static bolts', () => {
    const world = flatWorld();
    const mm = new MobManager(world);
    mm.enabled = false;
    const { h, spy } = host(world);
    mm.spawn('storm_kite', 9.5, 14, 0.5, 0.5);
    run(mm, h, 8);
    expect(spy.shots.length).toBeGreaterThan(0);
    expect(spy.shots.every((s) => s.item === IREG.id('static_bolt'))).toBe(true);
  });

  it('Thunder Hawks circle, then dive and land a hard hit', () => {
    const world = flatWorld();
    const mm = new MobManager(world);
    mm.enabled = false;
    const { h, spy } = host(world);
    const m = mm.spawn('thunder_hawk', 9.5, 18, 0.5, 0.5)!;
    let dived = false;
    for (let t = 0; t < 14; t += 1 / 30) {
      mm.update(1 / 30, h, () => null, null);
      if (m.mode === 'strike') dived = true;
    }
    expect(dived).toBe(true);
    expect(spy.hits.length).toBeGreaterThan(0);
    expect(spy.hits.some((a) => a >= 7)).toBe(true);
  });

  it('Wind Sprites blow a gust that shoves you along W, every few seconds', () => {
    const world = flatWorld();
    const mm = new MobManager(world);
    mm.enabled = false;
    const { h, spy } = host(world);
    mm.spawn('wind_sprite', 6.5, 12, 0.5, 0.5);
    run(mm, h, 14);
    expect(spy.shoves.length).toBeGreaterThanOrEqual(2);
    for (const d of spy.shoves) expect(Math.abs(d)).toBeGreaterThanOrEqual(3);
  });

  it('Cloud Whales never attack, and drift about', () => {
    const world = flatWorld();
    const mm = new MobManager(world);
    mm.enabled = false;
    const { h, spy } = host(world);
    const m = mm.spawn('cloud_whale', 4.5, 16, 0.5, 0.5)!;
    const x0 = m.pos[0]!, z0 = m.pos[2]!;
    run(mm, h, 20);
    expect(spy.hits).toEqual([]);
    expect(Math.hypot(m.pos[0]! - x0, m.pos[2]! - z0)).toBeGreaterThan(0.5);
  });
});

describe('Cloud armour', () => {
  it('is a craftable set of cloud silk (woven from cotton) whose full set is the "cloud" bonus', () => {
    const m = ARMOR_MATERIALS.find((x) => x.name === 'cloud')!;
    expect(m.set).toBe('cloud');
    expect(m.material).toBe('cloud_silk');
    for (const n of ['cloud_helmet', 'cloud_chestplate', 'cloud_leggings', 'cloud_boots']) expect(IREG.has(n), n).toBe(true);
    expect(RECIPES.some((r) => r.result === 'cloud_silk')).toBe(true);
    expect(REG.has('cirrus_cotton')).toBe(true);
  });
});
