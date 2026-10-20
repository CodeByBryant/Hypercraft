import { describe, expect, it } from 'vitest';
import { B, REG } from '../../src/content/registry';
import { IREG } from '../../src/content/itemRegistry';
import { MOB_REG, MAX_MOB_PARTS } from '../../src/content/mobRegistry';
import { MIRROR_MOBS, MIRROR_SPAWNS } from '../../src/content/mirrorMobs';
import { MobManager, type MobHost } from '../../src/game/mobs/MobManager';
import { Projectiles, type ProjectileHost } from '../../src/game/mobs/Projectiles';
import type { World } from '../../src/world/World';

function flatWorld(): World {
  return { getBlock: (_x: number, y: number) => (y < 10 ? B.stone : B.air), skyHeight: () => 10, getLight: () => 0 } as unknown as World;
}

function host(world: World, over: Partial<MobHost> = {}) {
  const hits: number[] = [];
  const effects: string[] = [];
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
    hurtPlayer: (a) => void hits.push(a),
    explode: () => undefined,
    shoot: () => undefined,
    inflict: (e) => void effects.push(e),
    ...over,
  };
  return { h, hits, effects };
}

const run = (mm: MobManager, h: MobHost, seconds: number) => {
  for (let t = 0; t < seconds; t += 1 / 30) mm.update(1 / 30, h, () => null, null);
};

describe('Mirror Realm mobs (Phase 9.3): definitions', () => {
  it('has the Shambler, the Stalker, the Wraith and the Twin, with bounded parts and drops that exist', () => {
    expect(MIRROR_MOBS.map((m) => m.name)).toEqual(['reflection_shambler', 'mirror_stalker', 'silver_wraith', 'mirror_twin']);
    for (const m of MIRROR_MOBS) {
      const cm = MOB_REG.get(m.name);
      expect(cm.def.parts.length).toBeLessThanOrEqual(MAX_MOB_PARTS);
      expect(cm.drops.length).toBeGreaterThan(0);
      for (const p of m.parts) {
        const ext = p.kind === 'box' ? Math.hypot(...p.size!) : p.r!;
        expect(Math.hypot(...p.at) + ext).toBeLessThanOrEqual(cm.radius);
        if (p.to) expect(Math.hypot(...p.to) + ext).toBeLessThanOrEqual(cm.radius);
      }
    }
    expect(MOB_REG.get('reflection_shambler').def.reflects).toBe(true);
    expect(MOB_REG.get('mirror_stalker').def.ai).toBe('mirror');
    expect(MOB_REG.get('silver_wraith').def.undead).toBe(true);
    expect(MOB_REG.get('silver_wraith').def.inflicts?.effect).toBe('weakness');
  });

  it('spawn in every Mirror biome (hostile, at night), and only there', () => {
    const mirror = REG.biomes.filter((b) => b.realm === 'mirror');
    for (const b of mirror) {
      expect(MIRROR_SPAWNS[b.name]!.length, b.name).toBeGreaterThan(0);
      expect((b.mobs?.night ?? []).length, b.name).toBeGreaterThan(0);
    }
    const names = new Set(mirror.flatMap((b) => (b.mobs?.night ?? []).map((s) => s.mob)));
    expect([...names].sort()).toEqual(['mirror_stalker', 'reflection_shambler', 'silver_wraith']);
    for (const b of REG.biomes.filter((x) => x.realm !== 'mirror')) for (const s of b.mobs?.night ?? []) expect(MIRROR_MOBS.some((m) => m.name === s.mob)).toBe(false);
  });

  it('mirror armour is a full-set bonus and its pieces are loot of the palace', () => {
    expect(IREG.armor[IREG.id('mirror_chestplate')]?.set).toBe('mirror');
    const palace = REG.biomes.find((b) => b.name === 'silver_plains')!;
    expect(palace.structures).toContain('mirror_palace');
  });
});

describe('Mirror Stalker', () => {
  it('stays at your reflection in a mirror that creeps toward you: it copies a sideways step and doubles a step toward the glass', () => {
    const world = flatWorld();
    const mm = new MobManager(world);
    mm.enabled = false;
    const { h } = host(world);
    const m = mm.spawn('mirror_stalker', 0.5, 10, 14.5, 0.5)!;
    run(mm, h, 1.5);
    const mirrorPos = (zNow: number, d: number) => zNow + 2 * d;
    // The glass stood halfway (7) and has crept toward you: the reflection is 2 d away.
    let d = 0;
    for (const k of [0, 2, 3]) d += (m.mirA[k]! - h.playerPos[k]!) * m.mirN[k]!;
    expect(d).toBeGreaterThan(4);
    expect(d).toBeLessThan(7);
    expect(Math.abs(m.pos[2]! - mirrorPos(h.playerPos[2]!, d))).toBeLessThan(1.2);

    // A step sideways is copied.
    const x0 = m.pos[0]!;
    h.playerPos[0] = h.playerPos[0]! + 4;
    run(mm, h, 1.2);
    expect(m.pos[0]! - x0).toBeGreaterThan(2.5);

    // A step toward the glass brings the reflection twice as far.
    const z0 = m.pos[2]!;
    h.playerPos[2] = h.playerPos[2]! + 3;
    run(mm, h, 1);
    expect(z0 - m.pos[2]!).toBeGreaterThan(4.5); // 3 for the step, 3 more for the mirror, minus what has not caught up
  });

  it('closes in even when you stand still, and strikes when the glass reaches you', () => {
    const world = flatWorld();
    const mm = new MobManager(world);
    mm.enabled = false;
    const { h, hits } = host(world);
    const m = mm.spawn('mirror_stalker', 0.5, 10, 12.5, 0.5)!;
    run(mm, h, 2);
    const d1 = Math.hypot(m.pos[0]! - 0.5, m.pos[2]! - 0.5);
    run(mm, h, 3);
    const d2 = Math.hypot(m.pos[0]! - 0.5, m.pos[2]! - 0.5);
    expect(d2).toBeLessThan(d1);
    run(mm, h, 12);
    expect(hits.length).toBeGreaterThan(0);
  });
});

describe('Reflection Shambler', () => {
  it('throws your arrows back at you', () => {
    const world = flatWorld();
    const mm = new MobManager(world);
    mm.enabled = false;
    const m = mm.spawn('reflection_shambler', 0.5, 10, 6.5, 0.5)!;
    const projectiles = new Projectiles();
    const hits: number[] = [];
    const ph: ProjectileHost = {
      playerPos: new Float64Array([0.5, 10, 0.5, 0.5]),
      playerHeight: 1.8,
      hurtPlayer: (a) => void hits.push(a),
      collect: () => false,
      eye: new Float64Array([0.5, 11.6, 0.5, 0.5]),
      hidden: new Float64Array([0, 0, 0, 1]),
    };
    projectiles.spawn([0.5, 11, 1, 0.5], [0, 0, 20, 0], 6, IREG.id('arrow'), true);
    for (let i = 0; i < 120 && hits.length === 0; i++) projectiles.update(1 / 60, world, mm, ph);
    expect(m.health).toBe(m.def.health); // not a scratch
    expect(hits.length).toBe(1);
    expect(hits[0]).toBeGreaterThan(1);
  });
});
