import { describe, expect, it } from 'vitest';
import { SimplexNoise } from '../../src/math/noise';
import { Rng, hash4, hashString } from '../../src/math/rng';
import { Frame4, makeTiltedFrame } from '../../src/math/frame';
import { det4, dot4 } from '../../src/math/vec4';
import { edgeRate, sliceBoxEdges, uniqueVertices } from '../../src/math/crossSection';

describe('rng / hashing', () => {
  it('is deterministic', () => {
    expect(hash4(1, 2, 3, 4, 99)).toBe(hash4(1, 2, 3, 4, 99));
    expect(hash4(1, 2, 3, 4, 99)).not.toBe(hash4(1, 2, 3, 5, 99));
    expect(hashString('hypercraft')).toBe(hashString('hypercraft'));
    const a = new Rng(7);
    const b = new Rng(7);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });
  it('is roughly uniform', () => {
    const r = new Rng(1234);
    const buckets = new Array(10).fill(0);
    for (let i = 0; i < 100000; i++) buckets[Math.floor(r.next() * 10)]++;
    for (const b of buckets) expect(Math.abs(b - 10000)).toBeLessThan(600);
  });
});

describe('simplex noise', () => {
  it('is deterministic per seed and differs across seeds', () => {
    const a = new SimplexNoise(42);
    const b = new SimplexNoise(42);
    const c = new SimplexNoise(43);
    let diff = 0;
    for (let i = 0; i < 200; i++) {
      const x = i * 0.37, y = i * 0.11, z = i * -0.23, w = i * 0.05;
      expect(a.n4(x, y, z, w)).toBe(b.n4(x, y, z, w));
      expect(a.n3(x, y, z)).toBe(b.n3(x, y, z));
      expect(a.n2(x, y)).toBe(b.n2(x, y));
      diff += Math.abs(a.n4(x, y, z, w) - c.n4(x, y, z, w));
    }
    expect(diff).toBeGreaterThan(1);
  });
  it('stays in range and is continuous', () => {
    const n = new SimplexNoise(5);
    const r = new Rng(9);
    let min = Infinity, max = -Infinity;
    for (let i = 0; i < 20000; i++) {
      const x = r.range(-100, 100), y = r.range(-100, 100), z = r.range(-100, 100), w = r.range(-100, 100);
      const v4 = n.n4(x, y, z, w);
      const v3 = n.n3(x, y, z);
      min = Math.min(min, v4, v3);
      max = Math.max(max, v4, v3);
      expect(Math.abs(n.n4(x + 1e-4, y, z, w) - v4)).toBeLessThan(0.01);
    }
    expect(min).toBeGreaterThan(-1.25);
    expect(max).toBeLessThan(1.25);
    expect(max - min).toBeGreaterThan(1.2);
  });
});

function expectOrthonormal(f: Frame4) {
  const vs = [f.right, f.up, f.fwd, f.hidden];
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      expect(dot4(vs[i]!, vs[j]!)).toBeCloseTo(i === j ? 1 : 0, 9);
    }
  }
  expect(det4(f.right, f.up, f.fwd, f.hidden)).toBeCloseTo(1, 9);
  expect(f.hidden[f.upAxis]).toBeCloseTo(0, 12);
}

describe('Frame4 (4D camera)', () => {
  it('starts axis aligned with hidden = +W', () => {
    const f = new Frame4();
    expect(Array.from(f.hidden)).toEqual([0, 0, 0, 1]);
    expect(Array.from(f.fwd)).toEqual([0, 0, 1, 0]);
    expect(Array.from(f.right)).toEqual([1, 0, 0, 0]);
    expectOrthonormal(f);
  });
  it('stays orthonormal and upright under random rotations', () => {
    const f = new Frame4();
    const r = new Rng(3);
    for (let i = 0; i < 2000; i++) {
      const k = r.int(5);
      const a = r.range(-0.5, 0.5);
      if (k === 0) f.yaw(a);
      else if (k === 1) f.addPitch(a);
      else if (k === 2) f.tiltFH(a);
      else if (k === 3) f.tiltRH(a);
      else f.rotateWorldPlane(r.int(2) ? 0 : 2, 3, a);
    }
    expectOrthonormal(f);
  });
  it('builds the R6 test views', () => {
    const s30 = Math.sin(Math.PI / 6), c30 = Math.cos(Math.PI / 6);
    const f = makeTiltedFrame({ xwDeg: 30 });
    expect(f.hidden[0]).toBeCloseTo(-s30, 12);
    expect(f.hidden[3]).toBeCloseTo(c30, 12);
    expect(f.right[0]).toBeCloseTo(c30, 12);
    expect(f.right[3]).toBeCloseTo(s30, 12);
    expectOrthonormal(f);
    const g = makeTiltedFrame({ xwDeg: 45, zwDeg: 45 });
    // Hidden axis now has x, z and w components -> hexagonal/triangular prisms.
    expect(Math.abs(g.hidden[0]!)).toBeGreaterThan(0.3);
    expect(Math.abs(g.hidden[2]!)).toBeGreaterThan(0.3);
    expect(Math.abs(g.hidden[3]!)).toBeGreaterThan(0.3);
    expectOrthonormal(g);
  });
  it('snaps back to the nearest axis-aligned frame', () => {
    const f = new Frame4();
    f.rotateWorldPlane(0, 3, 0.3);
    f.yaw(0.2);
    f.snapToAxes();
    expect(Math.abs(f.hidden[3]!)).toBe(1);
    expectOrthonormal(f);
    const g = new Frame4();
    g.tiltRH(0.4);
    let n = 0;
    while (!g.approachSnap(0.3) && n < 100) n++;
    expect(n).toBeLessThan(100);
    expect(g.hiddenAxisTilt()).toBeLessThan(1e-3);
  });
});

function slice(origin: number[], normal: number[]) {
  const out = new Float64Array(8 * 64);
  const len = Math.hypot(...normal);
  const n = normal.map((v) => v / len);
  const count = sliceBoxEdges([0, 0, 0, 0], [1, 1, 1, 1], origin, n, out, 0, 64);
  return { count, verts: uniqueVertices(out, count), out, n };
}

function edgeLengths(out: Float64Array, count: number) {
  const ls: number[] = [];
  for (let s = 0; s < count; s++) {
    let d = 0;
    for (let i = 0; i < 4; i++) d += (out[s * 8 + i]! - out[s * 8 + 4 + i]!) ** 2;
    ls.push(Math.sqrt(d));
  }
  return ls.sort((a, b) => a - b);
}

describe('tesseract cross-sections (R1)', () => {
  it('axis-aligned slice gives a unit cube', () => {
    const { count, verts, out } = slice([0.3, 0.4, 0.5, 0.25], [0, 0, 0, 1]);
    expect(count).toBe(12);
    expect(verts.length).toBe(8);
    for (const v of verts) expect(v[3]).toBeCloseTo(0.25, 9);
    for (const l of edgeLengths(out, count)) expect(l).toBeCloseTo(1, 9);
  });
  it('slice exactly on a facet still gives the cube once', () => {
    const { count, verts } = slice([0.5, 0.5, 0.5, 1], [0, 0, 0, 1]);
    expect(count).toBe(12);
    expect(verts.length).toBe(8);
  });
  it('30° XW tilt gives a stretched box, not a cube', () => {
    const s = Math.sin(Math.PI / 6), c = Math.cos(Math.PI / 6);
    const { count, verts, out } = slice([0.5, 0.5, 0.5, 0.5], [-s, 0, 0, c]);
    expect(count).toBe(12);
    expect(verts.length).toBe(8);
    const ls = edgeLengths(out, count);
    expect(ls[ls.length - 1]).toBeCloseTo(1 / c, 6); // the tilted edges are 1/cos30 long
    expect(ls[0]).toBeCloseTo(1, 6);
  });
  it('compound tilt through the centre gives a hexagonal prism', () => {
    const { count, verts } = slice([0.5, 0.5, 0.5, 0.5], [1, 0, 1, 1]);
    expect(verts.length).toBe(12);
    expect(count).toBe(18);
  });
  it('compound tilt near a corner gives a triangular prism', () => {
    // plane x + z + w = 0.3
    const { count, verts } = slice([0.1, 0.5, 0.1, 0.1], [1, 0, 1, 1]);
    expect(verts.length).toBe(6);
    expect(count).toBe(9);
  });
  it('edge rates match the projected axis gradients', () => {
    const hw = [0, 0, 0, 1];
    expect(edgeRate(hw, 0, 3)).toBe(0); // hidden axis never produces an edge when aligned
    expect(edgeRate(hw, 0, 1)).toBeCloseTo(1, 12);
    const k = 1 / Math.sqrt(3);
    const h = [k, 0, k, k];
    expect(edgeRate(h, 1, 0)).toBeCloseTo(Math.sqrt(2 / 3), 9);
    // Numerical check: build the face tangent plane for facet axis 0 and measure |P_T e_j|.
    const hh = [0.3, 0, 0.5, Math.sqrt(1 - 0.34)];
    const i = 0;
    const a = hh;
    const bRaw = [1 - hh[0]! * hh[0]!, -hh[0]! * hh[1]!, -hh[0]! * hh[2]!, -hh[0]! * hh[3]!];
    const bl = Math.hypot(...bRaw);
    const b = bRaw.map((v) => v / bl);
    for (const j of [1, 2, 3]) {
      const e = [0, 0, 0, 0];
      e[j] = 1;
      const pa = a[j]!, pb = b[j]!;
      const expected = Math.sqrt(Math.max(0, 1 - pa * pa - pb * pb));
      expect(edgeRate(hh, i, j)).toBeCloseTo(expected, 9);
    }
  });
});
