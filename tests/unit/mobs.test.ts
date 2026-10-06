import { describe, expect, it } from 'vitest';
import { B, REG } from '../../src/content/registry';
import { IREG } from '../../src/content/itemRegistry';
import { MOB_REG, MAX_MOB_PARTS } from '../../src/content/mobRegistry';
import { MOBS } from '../../src/content/mobs';
import { ANIMALS } from '../../src/content/animals';
import { MobManager, MOB_TEXELS, PART_BASE, PART_TEXELS, type MobHost } from '../../src/game/mobs/MobManager';
import { Frame4 } from '../../src/math/frame';
import type { World } from '../../src/world/World';
import type { ItemStack } from '../../src/game/items/ItemStack';

// A flat test world: stone below y = 10, air above.
const flat = {
  getBlock: (_x: number, y: number) => (y < 10 ? B.stone : B.air),
  skyHeight: () => 10,
  getLight: () => 0xf0,
} as unknown as World;

function host(drops: ItemStack[] = []): MobHost {
  return {
    world: flat,
    playerPos: new Float64Array([0, 10, 0, 0]),
    playerHidden: new Float64Array([0, 0, 0, 1]),
    playerTargetable: false,
    playerInWater: false,
    daylight: 1,
    difficulty: 2,
    dropItem: (_x, _y, _z, _w, st) => void drops.push(st),
    hurtPlayer: () => undefined,
    explode: () => undefined,
    shoot: () => undefined,
  };
}

describe('mob registry', () => {
  it('compiles every mob with bounded parts, drops and a covering radius', () => {
    expect(MOB_REG.mobs.length).toBe(MOBS.length + ANIMALS.length);
    expect(MOBS.length).toBeGreaterThanOrEqual(24);
    for (const cm of MOB_REG.mobs) {
      const d = cm.def;
      expect(d.parts.length).toBeGreaterThan(0);
      expect(d.parts.length).toBeLessThanOrEqual(MAX_MOB_PARTS);
      for (const p of d.parts) {
        const ext = p.kind === 'box' ? Math.hypot(...p.size!) : p.r!;
        expect(Math.hypot(...p.at) + ext).toBeLessThanOrEqual(cm.radius);
      }
      for (const dr of cm.drops) expect(IREG.name(dr.item)).not.toMatch(/^#/);
    }
  });

  it('spawns something in most surface biomes, and hostiles somewhere at night', () => {
    const land = REG.biomes.filter((b) => b.mobs);
    expect(land.length).toBeGreaterThan(15);
    const nightHostiles = new Set(land.flatMap((b) => (b.mobs!.night ?? []).map((s) => s.mob)).filter((m) => MOB_REG.get(m).def.hostile));
    expect(nightHostiles.size).toBeGreaterThanOrEqual(4);
  });
});

describe('mob manager', () => {
  const eye = new Float64Array([0.5, 11.6, 0.5, 0.5]);
  const cam = new Frame4(1); // forward +Z, right +X, hidden +W
  cam.update();

  it('packs mobs crossing the view hyperplane relative to the window origin, culls the rest', () => {
    const mm = new MobManager(flat);
    mm.spawn('kata_sheep', 0.5, 10, 4.5, 0.5);
    mm.spawn('kata_sheep', 0.5, 10, 4.5, 6.5); // far along W: not in the slice
    const origin = [-32, 0, -32, -32];
    const n = mm.pack(eye, cam, 64, origin);
    expect(n).toBe(1);
    const g = mm.gpuData;
    expect(g[0]).toBeCloseTo(32.5);
    expect(g[2]).toBeCloseTo(36.5);
    expect(g[3]).toBeCloseTo(32.5);
    const parts = MOB_REG.get('kata_sheep').def.parts.length;
    expect(g[17]).toBe(0); // first part index
    expect(g[18]).toBe(parts);
    // The first part record sits after the mob records.
    const o = PART_BASE * 4;
    expect([0, 1, 2]).toContain(g[o]);
    expect(PART_BASE).toBe(48 * MOB_TEXELS);
    expect(PART_TEXELS).toBe(4);
  });

  it('picks the nearest mob along a ray, in its own rotated frame', () => {
    const mm = new MobManager(flat);
    const near = mm.spawn('shambler', 0.5, 10, 3.5, 0.5)!;
    mm.spawn('shambler', 0.5, 10, 6.5, 0.5);
    const out = { mob: null as unknown as ReturnType<typeof mm.spawn> };
    const dir = [0, 0, 1, 0];
    const t = mm.pick([0.5, 11.2, 0.5, 0.5], dir, 10, out as { mob: never });
    expect(out.mob).toBe(near);
    expect(t).toBeGreaterThan(2.4);
    expect(t).toBeLessThan(3.5);
    // Rotating the mob to face along W changes which part is hit, not whether it is hit.
    near.face(0, 0, 1);
    expect(mm.pick([0.5, 11.2, 0.5, 0.5], dir, 10, out as { mob: never })).toBeLessThan(3.5);
    // A ray passing beside it misses.
    expect(mm.pick([3.5, 11.2, 0.5, 0.5], dir, 10, out as { mob: never })).toBe(Infinity);
  });

  it('keeps a stalker thin along the hidden axis it is given', () => {
    const mm = new MobManager(flat);
    const m = mm.spawn('ana_stalker', 0, 10, 0, 0)!;
    const H = [0.6, 0, 0, 0.8];
    m.face(0, 1, 0, H);
    const dot = m.H[0]! * H[0]! + m.H[3]! * H[3]!;
    expect(Math.abs(dot)).toBeCloseTo(1, 5);
    // Frame stays orthonormal.
    const d = (a: Float64Array, b: Float64Array) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]! + a[3]! * b[3]!;
    expect(d(m.R, m.F)).toBeCloseTo(0, 6);
    expect(d(m.R, m.H)).toBeCloseTo(0, 6);
    expect(d(m.F, m.H)).toBeCloseTo(0, 6);
    expect(d(m.R, m.R)).toBeCloseTo(1, 6);
  });

  it('only hurts a Phase Golem while its cross-section is in your slice', () => {
    const mm = new MobManager(flat);
    const g = mm.spawn('phase_golem', 0.5, 10, 4, 2)!;
    const hp = g.health;
    expect(mm.damage(g, 5, [0.5, 10, 0, 0.5], eye, cam.hidden)).toBe(false);
    expect(g.health).toBe(hp);
    g.pos[3] = 0.5;
    expect(mm.damage(g, 5, [0.5, 10, 0, 0.5], eye, cam.hidden)).toBe(true);
    expect(g.health).toBe(hp - 5);
  });

  it('knocks mobs back horizontally and grants brief invulnerability', () => {
    const mm = new MobManager(flat);
    const m = mm.spawn('kata_sheep', 0, 10, 2, 0)!;
    expect(mm.damage(m, 1, [0, 10, 0, 0])).toBe(true);
    expect(m.vel[2]).toBeGreaterThan(0);
    expect(m.vel[1]).toBeGreaterThan(0);
    expect(mm.damage(m, 1, [0, 10, 0, 0])).toBe(false); // still flashing red
    expect(m.mode).toBe('flee');
  });

  it('drops loot on death and splits slimes', () => {
    const drops: ItemStack[] = [];
    const h = host(drops);
    const mm = new MobManager(flat);
    mm.enabled = false;
    const cow = mm.spawn('ana_cow', 0.5, 10, 3, 0.5)!;
    cow.health = 0;
    mm.update(0.016, h, () => null, null);
    expect(mm.list.includes(cow)).toBe(false);
    expect(drops.some((s) => IREG.name(s.id) === 'raw_beef' || IREG.name(s.id) === 'leather')).toBe(true);
    const slime = mm.spawn('kata_slime', 0.5, 10, 3, 0.5, 1)!;
    slime.health = 0;
    mm.update(0.016, h, () => null, null);
    const kids = mm.list.filter((m) => m.def.name === 'kata_slime');
    expect(kids.length).toBe(MOB_REG.get('kata_slime').def.splits);
    for (const k of kids) expect(k.scale).toBeCloseTo(0.5);
  });

  it('falls onto the ground and stays out of blocks', () => {
    const mm = new MobManager(flat);
    mm.enabled = false;
    const m = mm.spawn('ana_cow', 0.5, 14, 0.5, 0.5)!;
    for (let i = 0; i < 120; i++) mm.update(1 / 30, host(), () => null, null);
    expect(m.pos[1]).toBeGreaterThanOrEqual(10 - 1e-6);
    expect(m.pos[1]).toBeLessThan(10.05);
    expect(m.onGround).toBe(true);
  });

  it('web weavers spin cobwebs between themselves and the player, along any 4D direction', () => {
    const placed = new Map<string, number>();
    const world = {
      getBlock: (x: number, y: number, z: number, w: number) => placed.get(`${x},${y},${z},${w}`) ?? (y < 10 ? B.stone : B.air),
      setBlock: (x: number, y: number, z: number, w: number, v: number) => void placed.set(`${x},${y},${z},${w}`, v),
      skyHeight: () => 10,
      getLight: () => 0xf0,
    } as unknown as World;
    const mm = new MobManager(world);
    mm.enabled = false;
    const h = { ...host(), world, playerTargetable: true };
    // The weaver sits 5 blocks ana (+W) of the player: its web lands off the player's slice.
    const m = mm.spawn('web_weaver', 0.5, 10, 0.5, 5.5)!;
    for (let t = 0; t < 6; t += 0.1) {
      m.pos[0] = 0.5;
      m.pos[2] = 0.5;
      m.pos[3] = 5.5; // hold it in place
      mm.update(0.1, h, () => null, null);
    }
    const cobweb = REG.id('cobweb');
    const webs = [...placed.entries()].filter(([, v]) => v === cobweb).map(([k]) => k.split(',').map(Number));
    expect(webs.length).toBeGreaterThan(0);
    for (const [x, , z, w] of webs) {
      expect(x).toBe(0);
      expect(z).toBe(0);
      expect(w).toBe(1); // 1.5 blocks toward the weaver, along W
    }
  });

  it('passive mobs near your slice drift into it and flee inside it', () => {
    const mm = new MobManager(flat);
    mm.enabled = false;
    const h = host(); // player at (0, 10, 0, 0), hidden axis +W
    const sheep = mm.spawn('kata_sheep', 3.5, 10, 2.5, 3.2)!;
    for (let i = 0; i < 300; i++) mm.update(1 / 30, h, () => null, null);
    expect(Math.abs(sheep.pos[3]!)).toBeLessThan(0.6); // settled into the w = 0 slice
    // Hit it: it runs away but stays in the slice.
    mm.damage(sheep, 1, [sheep.pos[0]! - 1, 10, sheep.pos[2]!, sheep.pos[3]!]);
    const w0 = sheep.pos[3]!;
    for (let i = 0; i < 90; i++) mm.update(1 / 30, h, () => null, null);
    expect(Math.hypot(sheep.pos[0]! - 3.5, sheep.pos[2]! - 2.5)).toBeGreaterThan(2);
    expect(Math.abs(sheep.pos[3]! - w0)).toBeLessThan(0.6);
  });

  it('aim assist catches a near miss on a visible mob, never one off the slice', () => {
    const mm = new MobManager(flat);
    mm.spawn('kata_sheep', 0.5, 10, 4, 0.5);
    const out = { mob: null as unknown as ReturnType<typeof mm.spawn> };
    const o = [0.5 + 0.9, 11, 0.5, 0.5]; // 0.9 to the side of the body centre (width 0.45)
    const d = [0, 0, 1, 0];
    const hidden = [0, 0, 0, 1];
    expect(mm.pick(o, d, 8, out as { mob: never })).toBe(Infinity);
    expect(mm.pickAssist(o, d, 8, 0.5, hidden, out as { mob: never })).toBeLessThan(4);
    const far = new MobManager(flat);
    far.spawn('kata_sheep', 0.5, 10, 4, 2.5); // two blocks off the slice: invisible
    expect(far.pickAssist([0.5, 11, 0.5, 0.5], d, 8, 0.5, hidden, out as { mob: never })).toBe(Infinity);
  });
});
