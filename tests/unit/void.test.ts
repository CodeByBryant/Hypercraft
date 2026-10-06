import { describe, expect, it } from 'vitest';
import { REG } from '../../src/content/registry';
import { IREG } from '../../src/content/itemRegistry';
import { STRUCTURES } from '../../src/content/structures';
import { LOOT } from '../../src/content/lootRegistry';
import { VoidGenerator, type Island } from '../../src/world/gen/VoidGen';
import { SurfaceGenerator, type ColumnSample } from '../../src/world/gen/SurfaceGen';
import { createGenerator, type WorldGenerator } from '../../src/world/gen/generators';
import { COLUMN_LAYER } from '../../src/world/constants';
import { GATE, fillFrame, gateFaces, gateProgress, gateReady, type GateWorld } from '../../src/game/VoidGate';
import { ARENA_R, ARRIVAL_GATE, ARRIVAL_POS, BEAM_HEIGHT, CENTRAL_R, DIRS, ISLAND_GAP, LANDING_R, LANDING_TOP, VOID_TOP, gatewayAt, landingXZW, spireXZW } from '../../src/content/void';

const realm = REG.realm('void');
const sample = (): ColumnSample => ({ height: 0, biome: 0, grass: [0, 0, 0] });
const id = (n: string) => REG.id(n);

/** Blocks of any generator, generated a column at a time and cached. */
function world(g: WorldGenerator) {
  const cols = new Map<string, Uint16Array>();
  const col = (cx: number, cz: number, cw: number) => {
    const key = `${cx},${cz},${cw}`;
    let c = cols.get(key);
    if (!c) {
      c = new Uint16Array(COLUMN_LAYER * g.height);
      g.generate(cx, cz, cw, c, new Uint8Array(COLUMN_LAYER * 4), {});
      cols.set(key, c);
    }
    return c;
  };
  return (x: number, y: number, z: number, w: number): number => {
    const c = col(x >> 4, z >> 4, w >> 4);
    return c[(x & 15) + ((z & 15) << 4) + ((w & 15) << 8) + y * COLUMN_LAYER]! & 0xfff;
  };
}

describe('Hollow Void (Phase 8): the realm', () => {
  it('is a realm with its own generator, no day, no sea and an open black sky', () => {
    expect(realm.generator).toBe('void');
    expect(realm.dayCycle).toBe(false);
    expect(realm.voidSky).toBe(true);
    expect(realm.ceilingBlock).toBeNull();
    expect(realm.bedsExplode).toBe(true);
    expect(createGenerator(1, realm)).toBeInstanceOf(VoidGenerator);
  });

  it('has six biomes with their own blocks and plants, all of them reachable on islands', () => {
    const void_ = REG.biomes.filter((b) => b.realm === 'void');
    expect(void_.map((b) => b.name).sort()).toEqual(['glimmer_meadows', 'hollow_plateau', 'shattered_reach', 'starlight_crags', 'void_spires', 'whisper_gardens']);
    const g = new VoidGenerator(1337, realm);
    const seen = new Set<string>();
    const out: Island[] = [];
    for (const isl of g.islandsIn(-3000, -3000, -3000, 3000, 3000, 3000, out)) seen.add(void_[isl.biome]!.name);
    expect(void_.map((b) => b.name).filter((n) => !seen.has(n))).toEqual([]);
  });

  it('defines the access items: a Void Eye made of phase dust and hypercinder, and its use', () => {
    expect(IREG.def(IREG.id('void_eye')).use).toBe('void_eye');
    expect(REG.has('void_gate') && REG.has('void_gate_frame') && REG.has('void_gate_frame_eye')).toBe(true);
    expect(REG.hardness[id('void_gate_frame')]).toBeLessThan(0);
    expect(REG.solid[id('void_gate')]).toBe(0);
  });
});

describe('Hollow Void: the generator', () => {
  const g = new VoidGenerator(2025, realm);
  const at = world(g);

  it('is deterministic', () => {
    const a = new Uint16Array(COLUMN_LAYER * g.height), b = new Uint16Array(COLUMN_LAYER * g.height);
    const g2 = new VoidGenerator(2025, realm);
    g.generate(2, -3, 4, a, new Uint8Array(COLUMN_LAYER * 4));
    g2.generate(2, -3, 4, b, new Uint8Array(COLUMN_LAYER * 4));
    expect(Buffer.from(a.buffer).equals(Buffer.from(b.buffer))).toBe(true);
  });

  it('builds the central island: a flat top at the Void height, the arena ring and throne', () => {
    // Away from the arena the top is the plateau turf; an arena ring and the throne are Sovereign stone.
    expect(at(-10, VOID_TOP, 40, 0)).toBe(id('void_turf'));
    expect(REG.solid[at(-10, VOID_TOP + 1, 40, 0)]).toBe(0);
    expect(at(0, VOID_TOP, 0, 0)).toBe(id('sovereign_stone'));
    expect(at(ARENA_R - 1, VOID_TOP, 0, 0)).toBe(id('sovereign_stone'));
    // Under the top there is rock, and nothing at all below the island's underside.
    expect(at(-10, VOID_TOP - 3, 40, 0)).toBe(id('void_rock'));
    expect(at(-10, 2, 40, 0)).toBe(0);
    // Past the island's radius there is nothing: the central island is a disc in every slice.
    expect(at(CENTRAL_R + 30, VOID_TOP, 0, 0)).toBe(0);
    expect(at(0, VOID_TOP, 0, CENTRAL_R + 30)).toBe(0);
  });

  it('shows the island in every slice that crosses it and fades it away kata/ana', () => {
    // Land cells of a coarse grid in the slices w = 0, 40 and 100: the disc shrinks, then is gone.
    const land = (w: number) => {
      let n = 0;
      for (let x = -80; x <= 80; x += 8) for (let z = -80; z <= 80; z += 8) if (!g.sample(x, z, w, sample()).ocean) n++;
      return n;
    };
    const [a, b, c] = [land(0), land(40), land(100)];
    expect(a).toBeGreaterThan(b);
    expect(b).toBeGreaterThan(0);
    expect(c).toBe(0);
  });

  it('puts the arrival platform, the return gate and its six eyes where the spawn is', () => {
    const [ax, ay, az, aw] = ARRIVAL_GATE;
    expect(at(ax, ay, az, aw)).toBe(id('void_gate'));
    for (const d of DIRS) expect(at(ax + d[0], ay, az + d[1], aw + d[2])).toBe(id('void_gate_frame_eye'));
    const sp = g.spawnPoint();
    expect(sp).toEqual([ARRIVAL_POS[0], ARRIVAL_POS[1], ARRIVAL_POS[2], ARRIVAL_POS[3]]);
    const [x, y, z, w] = sp.map(Math.floor) as [number, number, number, number];
    expect(at(x, y - 1, z, w)).toBe(id('voidstone_bricks'));
    expect(at(x, y, z, w)).toBe(0);
    expect(at(x, y + 1, z, w)).toBe(0);
  });

  it('stands six dormant spires on the central island and six active ones on the landings', () => {
    for (let k = 0; k < 6; k++) {
      const [x, z, w] = spireXZW(k);
      expect(at(x, VOID_TOP, z, w)).toBe(id('voidstone_bricks'));
      expect(at(x, VOID_TOP + 1, z, w)).toBe(id('voidstone'));
      expect(at(x, VOID_TOP + 3, z, w)).toBe(0);
      const [lx, lz, lw] = landingXZW(k);
      expect(at(lx, LANDING_TOP, lz, lw)).toBe(id('voidstone_bricks'));
      expect(at(lx, LANDING_TOP + 1, lz, lw)).toBe(id('gateway_beam'));
      expect(at(lx, LANDING_TOP + 1 + BEAM_HEIGHT, lz, lw)).toBe(id('gateway_beam'));
    }
  });

  it('keeps the gap between the central island and the first outer islands', () => {
    const out: Island[] = [];
    for (const isl of g.islandsIn(-1500, -1500, -1500, 1500, 1500, 1500, out)) {
      if (isl.kind === 0) expect(Math.hypot(isl.cx, isl.cz, isl.cw)).toBeGreaterThanOrEqual(ISLAND_GAP);
    }
    // Landings are 1024 out along each axis, and big enough to land on.
    for (let k = 0; k < 6; k++) {
      const [x, z, w] = landingXZW(k);
      expect(Math.hypot(x, z, w)).toBeCloseTo(1024, 0);
      expect(g.sample(x + 5, z + 5, w, sample()).ocean).toBe(false);
      expect(LANDING_R).toBeGreaterThanOrEqual(24);
    }
  });

  it('samples exactly what it generates: the top of every column, and void where there is none', () => {
    const s = sample();
    let land = 0, empty = 0;
    for (const [cx, cz, cw] of [
      [0, 0, 0],
      [-2, 1, 0],
      [3, 3, -1],
      [20, 5, 5],
      [-60, 0, 2],
    ] as [number, number, number][]) {
      for (let w = 0; w < 16; w += 3)
        for (let z = 0; z < 16; z += 3)
          for (let x = 0; x < 16; x += 3) {
            const X = cx * 16 + x, Z = cz * 16 + z, W = cw * 16 + w;
            g.sample(X, Z, W, s);
            if (s.ocean) {
              empty++;
              for (let y = 1; y < 100; y += 7) expect(at(X, y, Z, W)).toBe(0);
              continue;
            }
            land++;
            // The sampled top is solid; the cell above is not.
            expect(REG.solid[at(X, s.height, Z, W)]).toBe(1);
            expect(REG.solid[at(X, s.height + 1, Z, W)]).toBe(0);
          }
    }
    expect(land).toBeGreaterThan(20);
    expect(empty).toBeGreaterThan(20);
  });

  it('generates a column in a few milliseconds', () => {
    const blocks = new Uint16Array(COLUMN_LAYER * g.height), surface = new Uint8Array(COLUMN_LAYER * 4);
    const t0 = performance.now();
    let n = 0;
    for (let cx = -3; cx <= 3; cx++)
      for (let cz = -3; cz <= 3; cz++) {
        g.generate(cx, cz, 0, blocks, surface, {});
        n++;
      }
    expect((performance.now() - t0) / n).toBeLessThan(60);
  });
});

describe('Hollow Void: the gateways', () => {
  it('sends each central spire to the landing on its axis, and each landing back', () => {
    for (let k = 0; k < 6; k++) {
      const [x, z, w] = spireXZW(k);
      const out = gatewayAt(x, VOID_TOP + 2, z, w);
      expect(out?.kind).toBe('out');
      const [lx, lz, lw] = landingXZW(k);
      // You arrive beside the landing's beam, never inside it (that would send you straight back).
      expect(gatewayAt(Math.floor(out!.to[0]!), Math.floor(out!.to[1]!), Math.floor(out!.to[2]!), Math.floor(out!.to[3]!))).toBeNull();
      expect(Math.hypot(out!.to[0]! - lx - 0.5, out!.to[2]! - lz - 0.5, out!.to[3]! - lw - 0.5)).toBeLessThan(5);
      expect(Math.hypot(out!.to[0]! - lx - 0.5, out!.to[2]! - lz - 0.5, out!.to[3]! - lw - 0.5)).toBeGreaterThan(2);
      const back = gatewayAt(lx, LANDING_TOP + 2, lz, lw);
      expect(back?.kind).toBe('back');
      expect(gatewayAt(Math.floor(back!.to[0]!), Math.floor(back!.to[1]!), Math.floor(back!.to[2]!), Math.floor(back!.to[3]!))).toBeNull();
      expect(Math.hypot(back!.to[0]! - x - 0.5, back!.to[2]! - z - 0.5, back!.to[3]! - w - 0.5)).toBeLessThan(5);
    }
    expect(gatewayAt(3, VOID_TOP + 2, 3, 3)).toBeNull();
  });
});

describe('Stronghold (the way into the Void)', () => {
  const surface = new SurfaceGenerator(31337, REG.realm('surface'));
  const def = STRUCTURES.find((s) => s.name === 'stronghold')!;

  it('is listed by every surface biome, land and sea, and has its loot tables', () => {
    expect(def.placement).toBe('underground');
    for (const b of REG.biomes.filter((b) => b.realm === 'surface' && b.kind !== 'underground')) expect(b.structures).toContain('stronghold');
    for (const t of ['stronghold', 'stronghold_library', 'stronghold_armory']) expect(LOOT.has(t)).toBe(true);
  });

  it('is found nearby and holds a gate cell with six frames around it, sunk into the floor', () => {
    const st = surface.nearestStructure(['stronghold'], 0, 0, 0, 1500);
    expect(st).not.toBeNull();
    expect(Math.hypot(st!.x, st!.z, st!.w)).toBeLessThan(700);
    const at = world(surface);
    const [x, y, z, w] = [st!.x, st!.y, st!.z, st!.w];
    const frame = id('void_gate_frame'), eye = id('void_gate_frame_eye');
    // The six horizontal faces of the gate cell are frames (some already holding an eye).
    for (const d of DIRS) {
      const v = at(x + d[0], y, z + d[1], w + d[2]);
      expect(v === frame || v === eye).toBe(true);
    }
    const cell = at(x, y, z, w);
    expect(cell === 0 || cell === id('void_gate')).toBe(true);
    expect(at(x, y - 1, z, w)).toBe(id('chiseled_stone_bricks'));
    expect(at(x, y + 1, z, w)).toBe(0);
  });
});

describe('Void Gate (frames and eyes)', () => {
  /** A sparse world: empty air, with the six frames around the cell (5, 10, -3, 2). */
  function gateWorld(): { w: GateWorld; cell: [number, number, number, number] } {
    const m = new Map<string, number>();
    const key = (x: number, y: number, z: number, w: number) => `${x},${y},${z},${w}`;
    const w: GateWorld = {
      getBlock: (x, y, z, ww) => m.get(key(x, y, z, ww)) ?? 0,
      setBlock: (x, y, z, ww, v) => void m.set(key(x, y, z, ww), v),
    };
    const cell: [number, number, number, number] = [5, 10, -3, 2];
    for (const f of gateFaces(...cell)) w.setBlock(f[0], f[1], f[2], f[3], GATE.frame);
    return { w, cell };
  }

  it('has six faces: +-x, +-z and +-w, two of them kata/ana of a slice at fixed w', () => {
    const faces = gateFaces(0, 0, 0, 0);
    expect(faces).toHaveLength(6);
    expect(faces.filter((f) => f[3] !== 0)).toHaveLength(2);
    expect(faces.filter((f) => f[1] !== 0)).toHaveLength(0);
  });

  it('lights the cell only when the sixth eye goes in', () => {
    const { w, cell } = gateWorld();
    const faces = gateFaces(...cell);
    for (let i = 0; i < 5; i++) {
      expect(fillFrame(w, faces[i]![0], faces[i]![1], faces[i]![2], faces[i]![3])).toEqual([]);
      expect(gateProgress(w, ...cell)).toEqual({ eyes: i + 1, frames: 5 - i });
      expect(gateReady(w, ...cell)).toBe(false);
    }
    const lit = fillFrame(w, faces[5]![0], faces[5]![1], faces[5]![2], faces[5]![3]);
    expect(lit).toEqual([cell]);
    expect(w.getBlock(...cell)).toBe(GATE.gate);
  });

  it('refuses a block that is not an empty frame, and an eye twice', () => {
    const { w, cell } = gateWorld();
    expect(fillFrame(w, 100, 10, 100, 100)).toBeNull();
    const f = gateFaces(...cell)[0]!;
    expect(fillFrame(w, f[0], f[1], f[2], f[3])).toEqual([]);
    expect(fillFrame(w, f[0], f[1], f[2], f[3])).toBeNull();
  });

  it('does not light a cell that is not air', () => {
    const { w, cell } = gateWorld();
    w.setBlock(...cell, REG.id('stone'));
    for (const f of gateFaces(...cell)) fillFrame(w, f[0], f[1], f[2], f[3]);
    expect(w.getBlock(...cell)).toBe(REG.id('stone'));
  });
});
