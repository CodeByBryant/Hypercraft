import { describe, expect, it } from 'vitest';
import { REG } from '../../src/content/registry';
import { STRUCTURES } from '../../src/content/structures';
import { LOOT } from '../../src/content/lootRegistry';
import { MOB_REG } from '../../src/content/mobRegistry';
import { EmberGenerator } from '../../src/world/gen/EmberGen';
import { createGenerator } from '../../src/world/gen/generators';
import { COLUMN_LAYER } from '../../src/world/constants';
import type { ColumnSample } from '../../src/world/gen/SurfaceGen';

const realm = REG.realm('ember');
const sample = (): ColumnSample => ({ height: 0, biome: 0, grass: [0, 0, 0] });

function column(g: EmberGenerator, cx: number, cz: number, cw: number) {
  const blocks = new Uint16Array(COLUMN_LAYER * g.height);
  const surface = new Uint8Array(COLUMN_LAYER * 4);
  const extra: Record<string, unknown> = {};
  g.generate(cx, cz, cw, blocks, surface, extra);
  return { blocks, surface, extra };
}

describe('Ember Depths (Phase 6)', () => {
  it('is a realm with its own generator, a lava sea and an 8:1 portal scale', () => {
    expect(realm.coordinateScale).toBe(8);
    expect(realm.seaFluid).toBe('lava');
    expect(realm.ceilingBlock).toBe('bedrock');
    expect(createGenerator(1, realm)).toBeInstanceOf(EmberGenerator);
  });

  it('has at least eight biomes, each with unique blocks and plants, all reachable', () => {
    const ember = REG.biomes.filter((b) => b.realm === 'ember');
    expect(ember.length).toBeGreaterThanOrEqual(8);
    for (const n of ['cinder_plains', 'basalt_prisms', 'sulfur_fungal_forest', 'magma_sea', 'ash_wastes', 'soul_glass_canyons'])
      expect(ember.map((b) => b.name)).toContain(n);
    const g = new EmberGenerator(2024, realm);
    const s = sample();
    const seen = new Set<string>();
    for (let x = -4000; x <= 4000; x += 113) for (let w = -4000; w <= 4000; w += 113) seen.add(REG.biomes[g.sample(x, 77, w, s).biome]!.name);
    expect(ember.map((b) => b.name).filter((n) => !seen.has(n))).toEqual([]);
    // Surface biomes never appear here, and Ember biomes never on the Surface.
    for (const n of seen) expect(REG.biomes[REG.biomeIndex(n)]!.realm).toBe('ember');
  });

  it('generates deterministically: bedrock floor and roof, cinder, lava at the sea, emberglass light', () => {
    const a = column(new EmberGenerator(99, realm), 3, -2, 5);
    const b = column(new EmberGenerator(99, realm), 3, -2, 5);
    expect(Buffer.from(a.blocks.buffer).equals(Buffer.from(b.blocks.buffer))).toBe(true);
    const H = realm.heightChunks * 16;
    const id = (n: string) => REG.id(n);
    const counts = new Map<number, number>();
    for (let i = 0; i < a.blocks.length; i++) counts.set(a.blocks[i]! & 0xfff, (counts.get(a.blocks[i]! & 0xfff) ?? 0) + 1);
    for (let i = 0; i < COLUMN_LAYER; i++) {
      expect(a.blocks[i]).toBe(id('bedrock'));
      expect(a.blocks[i + (H - 1) * COLUMN_LAYER]).toBe(id('bedrock'));
    }
    // Nothing above the sea is lava from the fill, and the open cavern below the sea is lava.
    let lavaAbove = 0, airBelow = 0;
    for (let y = 1; y < H - 1; y++)
      for (let i = 0; i < COLUMN_LAYER; i++) {
        const v = a.blocks[i + y * COLUMN_LAYER]!;
        if (y > realm.seaLevel && v === id('lava')) lavaAbove++;
        if (y <= realm.seaLevel && y > 5 && v === 0) airBelow++;
      }
    expect(airBelow).toBe(0);
    expect(lavaAbove).toBeLessThan(40); // only structure moats / basins
    expect((counts.get(id('cinder')) ?? 0) + (counts.get(id('bedrock')) ?? 0)).toBeGreaterThan(1000);
  });

  it('places emberglass, ores and biome features across many columns', () => {
    const g = new EmberGenerator(7, realm);
    const found = new Set<string>();
    for (let k = 0; k < 10; k++) {
      const { blocks } = column(g, k * 5 - 20, (k * 3) % 7 - 3, 10 - k * 4);
      for (let i = 0; i < blocks.length; i++) found.add(REG.blocks[blocks[i]! & 0xfff]!.name);
    }
    for (const n of ['emberglass', 'ember_quartz_ore', 'gilded_cinder']) expect(found, n).toContain(n);
  });

  it('builds basalt prisms whose column tops change along W (only whole in one slice orientation)', () => {
    const g = new EmberGenerator(5, realm);
    const s = sample();
    // Find a prism cell, then compare the floor along x (same hexagon cell) vs along w.
    let at: number[] | null = null;
    for (let x = -3000; x <= 3000 && !at; x += 37)
      for (let w = -3000; w <= 3000 && !at; w += 41) if (REG.biomes[g.sample(x, 11, w, s).biome]!.name === 'basalt_prisms') at = [x, 11, w];
    expect(at).not.toBeNull();
    let changesW = 0;
    const [x, z, w] = at!;
    for (let k = 0; k < 40; k++) {
      const h0 = g.sample(x!, z!, w! + k, s).height;
      const h1 = g.sample(x!, z!, w! + k + 1, s).height;
      if (h0 !== h1) changesW++;
    }
    expect(changesW).toBeGreaterThan(8);
  });

  it('defines Ember structures with builders, valid loot and mobs, inside their radius', () => {
    const g = new EmberGenerator(4242, realm);
    const sg = g.structures;
    const defs = STRUCTURES.filter((d) => d.realm === 'ember');
    expect(defs.map((d) => d.name).sort()).toEqual(['basalt_ziggurat', 'citadel', 'ember_ruined_portal', 'forge', 'magma_bridge', 'regent_caldera']);
    const found: string[] = [];
    for (const def of defs) {
      const st = sg.placer.nearest([def.name], 0, 0, 0, 3000);
      if (!st) continue;
      found.push(def.name);
      const plan = sg.plan(st);
      const r = def.radius + 3;
      expect(plan.min[0]!, def.name).toBeGreaterThanOrEqual(st.x - r);
      expect(plan.max[0]!, def.name).toBeLessThanOrEqual(st.x + r);
      expect(plan.min[3]!, def.name).toBeGreaterThanOrEqual(st.w - r - 3);
      expect(plan.max[3]!, def.name).toBeLessThanOrEqual(st.w + r + 3);
      for (const m of plan.markers) {
        if (m.kind === 'chest') expect(LOOT.has(m.loot!), `${def.name}: ${m.loot}`).toBe(true);
        else expect(MOB_REG.has(m.mob!), `${def.name}: ${m.mob}`).toBe(true);
      }
    }
    expect(found).toContain('citadel');
    expect(found).toContain('regent_caldera');
    // The caldera holds the Magma Regent.
    const cal = sg.plan(sg.placer.nearest(['regent_caldera'], 0, 0, 0, 3000)!);
    expect(cal.markers.some((m) => m.kind === 'npc' && m.mob === 'magma_regent')).toBe(true);
  });

  it('lays out citadels so their floors only connect through W', () => {
    const g = new EmberGenerator(4242, realm);
    const st = g.structures.placer.nearest(['citadel'], 0, 0, 0, 3000)!;
    const plan = g.structures.plan(st);
    // The three wings are spread along world W; the x and z extent stays small.
    expect(plan.max[3]! - plan.min[3]!).toBeGreaterThanOrEqual(20);
    expect(plan.max[0]! - plan.min[0]!).toBeLessThanOrEqual(14);
    expect(plan.max[2]! - plan.min[2]!).toBeLessThanOrEqual(18);
  });

  it('has the Ember mobs, including the Magma Regent boss', () => {
    for (const n of ['cinder_hound', 'magma_drake', 'lava_slime', 'soul_wisp', 'ember_brute', 'citadel_guard', 'slag_golem', 'magma_regent']) expect(MOB_REG.has(n), n).toBe(true);
    const regent = MOB_REG.get('magma_regent').def;
    expect(regent.boss).toBe(true);
    expect(regent.health).toBeGreaterThanOrEqual(200);
  });
});

describe('Magma Regent (Phase 6 boss)', () => {
  it('summons lava pillars in a line along world W through the player, plus the slice axis when enraged', async () => {
    const { pillarLine } = await import('../../src/game/Boss');
    const p = [10.5, 50, -4.2, 7.9];
    const right = [0, 0, 1, 0]; // the slice's right axis (here world z)
    const line = pillarLine(p, right, 1);
    expect(line.length).toBe(7);
    // Same x and z, w spaced 3 apart through the player's w: one pillar is where you stand.
    expect(new Set(line.map((q) => `${q[0]},${q[1]}`)).size).toBe(1);
    expect(line.map((q) => q[2])).toEqual([-2, 1, 4, 7, 10, 13, 16]);
    const cross = pillarLine(p, right, 2);
    expect(cross.length).toBe(11);
    // The extra pillars are in the player's slice (same w), spread along the right axis.
    expect(cross.slice(7).every((q) => q[2] === 7)).toBe(true);
  });
});
