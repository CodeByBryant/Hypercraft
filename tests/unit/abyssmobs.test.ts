import { describe, expect, it } from 'vitest';
import { B, REG } from '../../src/content/registry';
import { IREG } from '../../src/content/itemRegistry';
import { MOB_REG, MAX_MOB_PARTS } from '../../src/content/mobRegistry';
import { ABYSS_MOBS, ABYSS_SPAWNS } from '../../src/content/abyssMobs';
import { ABYSS_BIOMES } from '../../src/content/abyss';
import { ARMOR_MATERIALS } from '../../src/content/armor';
import { TONES, titanParts } from '../../src/content/titanBody';
import { MobManager, type MobHost } from '../../src/game/mobs/MobManager';
import { Projectiles, type ProjectileHost } from '../../src/game/mobs/Projectiles';
import { Pulses, type PulseHost } from '../../src/game/mobs/Pulses';
import type { World } from '../../src/world/World';

function flatWorld(wall?: (x: number, y: number) => boolean): World {
  return { getBlock: (x: number, y: number) => (y < 10 || wall?.(x, y) ? B.stone : B.air), skyHeight: () => 10, getLight: () => 0 } as unknown as World;
}

function host(world: World, over: Partial<MobHost> = {}) {
  const spy = { shots: [] as { beam: boolean | undefined; item: number }[], pulses: [] as { tone: number; damage: number; owner: string }[], hits: [] as number[] };
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
    hurtPlayer: (a) => void spy.hits.push(a),
    explode: () => undefined,
    shoot: (_f, _v, _d, item, _b, beam) => void spy.shots.push({ beam, item }),
    pulse: (_f, tone, damage, owner) => void spy.pulses.push({ tone, damage, owner }),
    ...over,
  };
  return { h, spy };
}

const run = (mm: MobManager, h: MobHost, seconds: number) => {
  for (let t = 0; t < seconds; t += 1 / 30) mm.update(1 / 30, h, () => null, null);
};

describe('Abyss mobs (Phase 9.5): definitions', () => {
  it('has the Spider, the Golem, the Slime and the Titan, with bounded parts and drops that exist', () => {
    expect(ABYSS_MOBS.map((m) => m.name)).toEqual(['prism_spider', 'resonance_golem', 'geode_slime', 'resonance_titan']);
    for (const m of ABYSS_MOBS) {
      const cm = MOB_REG.get(m.name);
      expect(cm.def.parts.length).toBeLessThanOrEqual(MAX_MOB_PARTS);
      expect(cm.drops.length).toBeGreaterThan(0);
    }
    expect(MOB_REG.get('prism_spider').def.projectile?.beam).toBe(true);
    expect(MOB_REG.get('geode_slime').def.hardens).toBe(true);
    expect(MOB_REG.get('resonance_titan').def.boss).toBe(true);
  });

  it('live in every Abyss biome (hostile cavern tables), and the tables name real mobs', () => {
    for (const b of ABYSS_BIOMES) {
      const t = ABYSS_SPAWNS[b.name];
      expect(t, b.name).toBeDefined();
      expect(b.mobs?.day, b.name).toEqual(t);
      for (const s of t!) expect(MOB_REG.has(s.mob), s.mob).toBe(true);
    }
    // The golems sing in the Resonance Caverns, the spiders everywhere dark.
    expect(ABYSS_SPAWNS.resonance_caverns!.some((s) => s.mob === 'resonance_golem')).toBe(true);
  });

  it('the four tones name their forks, and the Titan body is bounded in every plate state', () => {
    expect(TONES.map((t) => t.name)).toEqual(['Low', 'Mid', 'High', 'Shrill']);
    for (let mask = 0; mask < 16; mask++) {
      const plates = [0, 1, 2, 3].map((k) => (mask >> k) % 2 === 1);
      for (const heart of [false, true]) expect(titanParts(plates, heart).length).toBeLessThanOrEqual(MAX_MOB_PARTS);
    }
    // A broken plate is a stump: smaller and not glowing.
    const whole = titanParts([true, true, true, true], false), broken = titanParts([false, true, true, true], false);
    expect(whole[8]!.glow).toBe(true);
    expect(broken[8]!.glow).toBeUndefined();
  });
});

describe('Prism Spider: light beams', () => {
  it('shoots beams from a distance (flagged, so Prism armour can turn them back)', () => {
    const world = flatWorld();
    const mm = new MobManager(world);
    mm.enabled = false;
    const { h, spy } = host(world);
    mm.spawn('prism_spider', 8.5, 10, 0.5, 0.5);
    run(mm, h, 6);
    expect(spy.shots.length).toBeGreaterThan(0);
    expect(spy.shots.every((s) => s.beam === true && s.item === IREG.id('prism_shard'))).toBe(true);
  });

  it('a beam that hits a player is reported with its velocity (and an arrow is not)', () => {
    const calls: { cause: string; beam: Float64Array | undefined }[] = [];
    const ph: ProjectileHost = {
      playerPos: new Float64Array([0.5, 10, 0.5, 0.5]),
      playerHeight: 1.8,
      hurtPlayer: (_a, _f, cause, beam) => void calls.push({ cause, beam }),
      collect: () => false,
      eye: new Float64Array([0.5, 11.6, 0.5, 0.5]),
      hidden: new Float64Array([0, 0, 0, 1]),
    };
    const mm = new MobManager(flatWorld());
    const pr = new Projectiles();
    pr.spawn([4.5, 11, 0.5, 0.5], [-20, 0, 0, 0], 4, IREG.id('prism_shard'), false, { beam: true, gravity: 0 });
    pr.spawn([4.5, 11, 0.5, 0.5], [-20, 0, 0, 0], 4, IREG.id('arrow'), false, { gravity: 0 });
    for (let i = 0; i < 30; i++) pr.update(1 / 30, flatWorld(), mm, ph);
    expect(calls.map((c) => c.cause).sort()).toEqual(['Arrow', 'Prism beam']);
    const beam = calls.find((c) => c.cause === 'Prism beam')!;
    expect(beam.beam![0]).toBeLessThan(0);
    expect(calls.find((c) => c.cause === 'Arrow')!.beam).toBeUndefined();
  });
});

describe('Resonance Golem: sound pulses', () => {
  it('sings a pulse of one of four tones every few seconds once it sees you', () => {
    const world = flatWorld();
    const mm = new MobManager(world);
    mm.enabled = false;
    const { h, spy } = host(world);
    mm.spawn('resonance_golem', 9.5, 10, 0.5, 0.5);
    run(mm, h, 14);
    expect(spy.pulses.length).toBeGreaterThanOrEqual(2);
    for (const p of spy.pulses) {
      expect(p.tone).toBeGreaterThanOrEqual(0);
      expect(p.tone).toBeLessThanOrEqual(3);
      expect(p.owner).toBe('resonance_golem');
      expect(p.damage).toBeGreaterThan(0);
    }
  });

  it('does not sing when it cannot see you', () => {
    const world = flatWorld();
    const mm = new MobManager(world);
    mm.enabled = false;
    const { h, spy } = host(world, { playerTargetable: false });
    mm.spawn('resonance_golem', 9.5, 10, 0.5, 0.5);
    run(mm, h, 10);
    expect(spy.pulses).toEqual([]);
  });
});

describe('Pulses: expanding 4D shells', () => {
  const player = () => new Float64Array([10.5, 10, 0.5, 0.5]);
  function ph(world: World, hits: number[]): PulseHost {
    return { world, playerPos: player(), playerHeight: 1.8, hurt: (a) => void hits.push(a) };
  }
  const step = (p: Pulses, h: PulseHost, seconds: number) => {
    for (let t = 0; t < seconds - 1e-9; t += 0.05) p.update(0.05, h);
  };

  it('grows, hurts once as it passes you, and fades at its reach', () => {
    const hits: number[] = [];
    const h = ph(flatWorld(), hits);
    const p = new Pulses();
    const s = p.spawn([0.5, 10.9, 0.5, 0.5], 1, 6, 'resonance_golem');
    step(p, h, 0.5);
    expect(s.r).toBeCloseTo(0.5 + 8 * 0.5, 1);
    expect(hits).toEqual([]);
    step(p, h, 1.2);
    expect(hits).toEqual([6]);
    step(p, h, 1);
    expect(hits).toEqual([6]);
    expect(s.spent).toBe(true);
    step(p, h, 4);
    expect(p.list).toHaveLength(0);
  });

  it('is stopped by stone between you and its source, but not by thin air', () => {
    const hits: number[] = [];
    const wall = flatWorld((x, y) => x >= 4 && x <= 6 && y >= 10 && y < 16);
    const p = new Pulses();
    p.spawn([0.5, 10.9, 0.5, 0.5], 0, 6, 'resonance_golem');
    step(p, ph(wall, hits), 3);
    expect(hits).toEqual([]);
    const q = new Pulses();
    q.spawn([0.5, 10.9, 0.5, 0.5], 0, 6, 'resonance_golem');
    step(q, ph(flatWorld(), hits), 3);
    expect(hits).toEqual([6]);
  });

  it('is cancelled by the matching tone while it is still on its way, and only by that tone', () => {
    const p = new Pulses();
    const h = ph(flatWorld(), []);
    p.spawn([0.5, 10.9, 0.5, 0.5], 2, 6, 'resonance_golem');
    p.spawn([0.5, 10.9, 0.5, 0.5], 3, 6, 'resonance_golem');
    step(p, h, 0.3);
    expect(p.incoming(player())).toHaveLength(2);
    expect(p.cancel(0, player())).toHaveLength(0);
    const gone = p.cancel(2, player());
    expect(gone).toHaveLength(1);
    expect(gone[0]!.tone).toBe(2);
    expect(p.list.map((x) => x.tone)).toEqual([3]);
    // Too late: once the shell has passed you it cannot be cancelled (and cannot hurt again).
    step(p, h, 2);
    expect(p.cancel(3, player())).toHaveLength(0);
  });

  it('draws in 4D: a source off your slice still reaches you through the hidden axis', () => {
    const hits: number[] = [];
    const h = ph(flatWorld(), hits);
    const p = new Pulses();
    // 9 blocks away along w only.
    p.spawn([10.5, 10.9, 0.5, 9.5], 0, 5, 'resonance_golem');
    step(p, h, 1.5);
    expect(hits).toEqual([5]);
  });
});

describe('Geode Slime: the shell hardens after a hit', () => {
  it('takes full damage first, a quarter for a moment after, then full again', () => {
    const world = flatWorld();
    const mm = new MobManager(world);
    mm.enabled = false;
    const { h } = host(world, { playerTargetable: false });
    const m = mm.spawn('geode_slime', 20.5, 10, 20.5, 0.5)!;
    m.scale = 1;
    const start = m.health;
    expect(mm.damage(m, 4, null)).toBe(true);
    expect(start - m.health).toBeCloseTo(4, 5);
    expect(m.shielded).toBe(true);
    expect(m.tint).not.toBeNull();
    // Past the hit's own invulnerability but inside the hardened window.
    run(mm, h, 0.6);
    const h1 = m.health;
    mm.damage(m, 4, null);
    expect(h1 - m.health).toBeCloseTo(1, 5);
    run(mm, h, 2);
    expect(m.shielded).toBe(false);
    expect(m.tint).toBeNull();
    const h2 = m.health;
    m.hurt = 0;
    mm.damage(m, 4, null);
    expect(h2 - m.health).toBeCloseTo(4, 5);
  });
});

describe('Prism armour', () => {
  it('is a craftable set from prism ingots whose full set is the "prism" bonus', () => {
    const m = ARMOR_MATERIALS.find((x) => x.name === 'prism')!;
    expect(m.set).toBe('prism');
    expect(m.material).toBe('prism_ingot');
    for (const n of ['prism_helmet', 'prism_chestplate', 'prism_leggings', 'prism_boots']) expect(IREG.has(n), n).toBe(true);
    expect(m.toughness).toBeGreaterThanOrEqual(3);
    expect(REG.has('prism_block')).toBe(true);
  });
});
