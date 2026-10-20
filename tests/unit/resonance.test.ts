import { describe, expect, it } from 'vitest';
import { B, REG } from '../../src/content/registry';
import { IREG } from '../../src/content/itemRegistry';
import { MOB_REG } from '../../src/content/mobRegistry';
import { RECIPES } from '../../src/content/recipes';
import { LOOT_TABLES } from '../../src/content/loot';
import { TONES } from '../../src/content/titanBody';
import { COLUMN_LAYER } from '../../src/world/constants';
import { AbyssGenerator } from '../../src/world/gen/AbyssGen';
import { MobManager, type MobHost, type Mob } from '../../src/game/mobs/MobManager';
import { Pulses, type PulseHost } from '../../src/game/mobs/Pulses';
import { CALL_EVERY, EXPOSED_TIME, GUARD, GUARD_STEP, PLATE_HITS, ResonanceBoss, TITAN, TITAN_ARENA_R, type ResonanceHost } from '../../src/game/ResonanceBoss';
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
  return { world, cells };
}

function setup(player = [-6.5, 10, 0.5, 0.5]) {
  const w = makeWorld();
  w.world.setBlock(0, 10, 0, 0, REG.id('cathedral_bell'));
  const mm = new MobManager(w.world);
  mm.enabled = false;
  const pulses = new Pulses();
  const spy = { messages: [] as string[], hurts: [] as { amount: number; cause: string }[], playerHits: [] as number[] };
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
    daylight: 0,
    get difficulty() {
      return diff;
    },
    dropItem: () => undefined,
    hurtPlayer: (a) => void spy.playerHits.push(a),
    explode: () => undefined,
    shoot: () => undefined,
    puff: () => undefined,
  } as MobHost;
  const pulseHost: PulseHost = { world: w.world, playerPos, playerHeight: 1.8, hurt: (amount, _f, owner) => void spy.hurts.push({ amount, cause: owner }) };
  const host: ResonanceHost = {
    world: w.world,
    mobs: mm,
    pulses,
    playerPos,
    playerRight: right,
    playerHidden: hidden,
    playerTargetable: () => true,
    difficulty: () => diff,
    glow: () => undefined,
    message: (t) => void spy.messages.push(t),
    dropItem: () => undefined,
    hurt: (amount, _a, cause) => void spy.hurts.push({ amount, cause }),
  };
  const boss = new ResonanceBoss(host);
  const run = (seconds: number) => {
    for (let t = 0; t < seconds - 1e-9; t += 0.1) {
      mm.update(0.1, mobHost, () => null, null);
      pulses.update(0.1, pulseHost);
      boss.update(0.1);
    }
  };
  const wake = (): Mob => {
    expect(boss.summon(0, 10, 0, 0)).toBe(true);
    run(0.2);
    return boss.find()!;
  };
  /** Answer the first call on the way with its own tone. */
  const answer = (): number => {
    const call = boss.calls[0]!;
    const tone = call.tone;
    boss.forkRung(tone, pulses.cancel(tone, playerPos));
    return tone;
  };
  /** Run until a call is on its way, then answer it at once. False if none came in `limit` seconds. */
  const answerNext = (limit = 30): boolean => {
    for (let t = 0; t < limit; t += 0.1) {
      if (boss.calls.length > 0) {
        answer();
        run(0.1); // the cancelled call is dropped at the next update
        return true;
      }
      run(0.1);
    }
    return false;
  };
  /** Run until the Titan has a call on its way. */
  const untilCall = (limit = 14) => {
    for (let t = 0; t < limit && boss.calls.length === 0; t += 0.1) run(0.1);
    expect(boss.calls.length).toBeGreaterThan(0);
  };
  return { w, mm, pulses, spy, playerPos, boss, run, wake, answer, answerNext, untilCall, setDiff: (d: number) => void (diff = d) };
}

describe('Resonance Titan (Phase 9.5): definition and the Cathedral', () => {
  it('is a persistent boss with the titan AI and a heart among its drops; the four forks are craftable', () => {
    const cm = MOB_REG.get(TITAN);
    expect(cm.def.boss).toBe(true);
    expect(cm.def.persistent).toBe(true);
    expect(cm.def.ai).toBe('titan');
    expect(cm.drops.some((d) => IREG.name(d.item) === 'resonance_heart')).toBe(true);
    for (const t of TONES) {
      expect(IREG.def(IREG.id(t.fork)).use).toBe('tuning_fork');
      expect(RECIPES.some((r) => r.result === t.fork), t.fork).toBe(true);
    }
    expect(PLATE_HITS[1]).toBeLessThanOrEqual(PLATE_HITS[2]);
    expect(CALL_EVERY[1]).toBeGreaterThan(CALL_EVERY[3]);
  });

  const gen = new AbyssGenerator(4242, REG.realm('abyss'));
  it('the Cathedral stands in the Abyss: a Bell, four chests of Prism armour, three spawners', () => {
    const st = gen.structures.placer.nearest(['crystal_cathedral'], 0, 0, 0, 3000);
    expect(st).not.toBeNull();
    const plan = gen.structures.plan(st!);
    expect(plan.markers.filter((m) => m.kind === 'chest').map((m) => m.loot)).toEqual(['crystal_cathedral', 'crystal_cathedral', 'crystal_cathedral', 'crystal_cathedral']);
    expect(plan.markers.filter((m) => m.kind === 'spawner').map((m) => m.mob).sort()).toEqual(['geode_slime', 'prism_spider', 'prism_spider']);
    // Exactly one Bell in the generated blocks (wherever its orientation put it).
    let bells = 0;
    const c0 = [Math.floor(plan.min[0]! / 16), Math.floor(plan.min[2]! / 16), Math.floor(plan.min[3]! / 16)];
    const c1 = [Math.floor(plan.max[0]! / 16), Math.floor(plan.max[2]! / 16), Math.floor(plan.max[3]! / 16)];
    const bell = REG.id('cathedral_bell');
    for (let cw = c0[2]!; cw <= c1[2]!; cw++)
      for (let cz = c0[1]!; cz <= c1[1]!; cz++)
        for (let cx = c0[0]!; cx <= c1[0]!; cx++) {
          const blocks = new Uint16Array(COLUMN_LAYER * gen.height);
          gen.generate(cx, cz, cw, blocks, new Uint8Array(COLUMN_LAYER * 4), {});
          for (let i = 0; i < blocks.length; i++) if ((blocks[i]! & 0xfff) === bell) bells++;
        }
    expect(bells).toBe(1);
    const items = new Set(LOOT_TABLES.crystal_cathedral!.pools.flatMap((p) => p.entries.map((e) => e.item)));
    for (const n of ['prism_helmet', 'prism_chestplate', 'prism_leggings', 'prism_boots', 'low_fork', 'shrill_fork']) expect(items.has(n), n).toBe(true);
  });

  it('is hosted by Abyss land biomes only', () => {
    for (const b of REG.biomes) expect((b.structures ?? []).includes('crystal_cathedral'), b.name).toBe(b.realm === 'abyss' && b.kind === 'land');
  });
});

describe('Resonance Titan: waking', () => {
  it('wakes at the Bell in armour (guard), once; refuses in peaceful and when defeated', () => {
    const t = setup();
    t.setDiff(0);
    expect(t.boss.summon(0, 10, 0, 0)).toBe(false);
    t.setDiff(2);
    const m = t.wake();
    expect(m.def.name).toBe(TITAN);
    expect(Array.from(m.home!)).toEqual([0.5, 10, 0.5, 0.5]);
    expect(m.guard).toBeCloseTo(GUARD, 5);
    expect(t.boss.summon(0, 10, 0, 0)).toBe(false);
    t.boss.onDefeat(m);
    t.mm.list.length = 0;
    expect(t.boss.summon(0, 10, 0, 0)).toBe(false);
    expect(t.boss.save()).toEqual({ defeated: true });
  });

  it('remembers a defeat across a save', () => {
    const a = setup().boss;
    a.defeated = true;
    const b = setup().boss;
    b.load(a.save());
    expect(b.defeated).toBe(true);
    b.load(undefined);
    expect(b.defeated).toBe(false);
  });

  it('its armour soaks up nine tenths of every blow', () => {
    const t = setup();
    const m = t.wake();
    const before = m.health;
    t.mm.damage(m, 10, null);
    expect(before - m.health).toBeCloseTo(10 * (1 - GUARD), 5);
  });

  it('wears its plates: the body is rebuilt each frame, and a shattered plate goes dark', () => {
    const t = setup();
    const m = t.wake();
    expect(m.dyn).not.toBeNull();
    expect(m.dyn!.length).toBeLessThanOrEqual(16);
    expect(m.dyn!.filter((p) => p.glow).length).toBeGreaterThanOrEqual(6); // eyes (2) + four plates
    t.boss.plates[0] = false;
    t.run(0.2);
    expect(m.dyn!.filter((p) => p.glow).length).toBe(5);
  });
});

describe('Resonance Titan: calls and answers', () => {
  it('sings a pulse of one of its standing plates\' tones, and the HUD says which fork to ring', () => {
    const t = setup();
    t.wake();
    t.untilCall();
    const call = t.boss.calls[0]!;
    expect(call.pulse.owner).toBe(TITAN);
    expect(call.pulse.tone).toBe(call.tone);
    expect(t.boss.warning).toContain(TONES[call.tone]!.name.toUpperCase());
    expect(t.boss.warning).toContain('matching fork');
  });

  it('an answer in the same tone cancels the pulse and cracks the plate; enough answers shatter it and thin the armour', () => {
    const t = setup();
    const m = t.wake();
    t.untilCall();
    const tone = t.answer();
    expect(t.pulses.list.filter((p) => p.owner === TITAN && p.tone === tone && !p.spent)).toHaveLength(0);
    expect(t.boss.cracks[tone]).toBe(1);
    expect(t.boss.plates[tone]).toBe(true);
    // Keep answering whatever it sings until some plate has taken PLATE_HITS[1] cracks (at most 5 answers).
    for (let n = 0; n < 8 && t.boss.broken === 0; n++) expect(t.answerNext()).toBe(true);
    expect(t.boss.broken).toBeGreaterThanOrEqual(1);
    t.run(0.2);
    expect(m.guard).toBeCloseTo(GUARD - GUARD_STEP * t.boss.broken, 5);
  });

  it('the wrong fork hurts and names the right one; no fork at all lets the pulse hit', () => {
    const t = setup();
    t.wake();
    t.untilCall();
    const tone = t.boss.calls[0]!.tone;
    const wrong = (tone + 1) % 4;
    t.boss.forkRung(wrong, t.pulses.cancel(wrong, t.playerPos));
    expect(t.spy.hurts.some((h) => h.cause === 'Dissonance')).toBe(true);
    expect(t.spy.messages.join(' ')).toContain('Off key');
    const before = t.spy.hurts.length;
    // Left alone the shell reaches you.
    t.run(8);
    expect(t.spy.hurts.length).toBeGreaterThan(before);
    expect(t.spy.hurts.some((h) => h.cause === TITAN && h.amount > 0)).toBe(true);
  });

  it('all four plates gone: the heart is exposed for a while (no calls, every blow lands), then the plates re-form', () => {
    const t = setup();
    const m = t.wake();
    // Break them by answering until exposed (4 plates, 2 cracks each: at most 8 answers).
    for (let n = 0; n < 14 && t.boss.exposed <= 0; n++) expect(t.answerNext()).toBe(true);
    expect(t.boss.exposed).toBeGreaterThan(0);
    expect(t.boss.warning).toContain('HEART EXPOSED');
    t.run(0.2);
    expect(m.guard).toBe(0);
    const before = m.health;
    t.mm.damage(m, 10, null);
    expect(before - m.health).toBeCloseTo(10, 5);
    t.run(EXPOSED_TIME + 0.5);
    expect(t.boss.exposed).toBe(0);
    expect(t.boss.plates.every(Boolean)).toBe(true);
    expect(m.guard).toBeCloseTo(GUARD, 5);
  });
});

describe('Resonance Titan: phases and the arena', () => {
  it('phase II sings in pairs and sends slimes; phase III adds announced crystal spikes', () => {
    const t = setup();
    const m = t.wake();
    m.health = m.def.health * 0.6;
    t.run(0.3);
    expect(m.phase).toBe(2);
    expect(t.mm.list.filter((x) => x.def.name === 'geode_slime')).toHaveLength(2);
    expect(t.boss.lances).toHaveLength(0);
    m.health = m.def.health * 0.2;
    t.run(0.3);
    expect(m.phase).toBe(3);
    t.run(7.5);
    expect(t.boss.lances.length).toBeGreaterThan(0);
    expect(t.boss.warning).toContain('Crystal spikes');
    expect(t.boss.marks().some((mk) => mk.kind === 'lance')).toBe(true);
  });

  it('protects the cathedral while the Titan lives, and only then', () => {
    const t = setup();
    expect(t.boss.protects(3, 10, 3, 3)).toBe(false);
    const m = t.wake();
    expect(t.boss.protects(3, 10, 3, 3)).toBe(true);
    expect(t.boss.protects(TITAN_ARENA_R + 3, 10, 0, 0)).toBe(false);
    t.boss.onDefeat(m);
    expect(t.boss.protects(3, 10, 3, 3)).toBe(false);
  });

  it('goes home and heals when you leave, and stops singing', () => {
    const t = setup();
    const m = t.wake();
    m.health = 100;
    t.playerPos[0] = 70;
    t.run(3);
    expect(m.health).toBeGreaterThan(100);
    expect(m.mode).toBe('idle');
    expect(t.boss.calls).toHaveLength(0);
  });
});
