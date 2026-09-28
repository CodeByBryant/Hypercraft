import { describe, expect, it } from 'vitest';
import { Particles } from '../../src/env/Particles';
import { makeTiltedFrame } from '../../src/math/frame';
import type { BiomeDef } from '../../src/content/types';
import type { World } from '../../src/world/World';
import type { SpriteBatch } from '../../src/render/SpriteBatch';
import { REG } from '../../src/content/registry';

// Open air everywhere, full sky light, sky height 0.
const airWorld = { getBlock: () => 0, getLight: () => 0xf0, skyHeight: () => 0 } as unknown as World;

function capture() {
  const sprites: { x: number; y: number; z: number; r: number }[] = [];
  const out = { add: (x: number, y: number, z: number, r: number) => sprites.push({ x, y, z, r }) } as unknown as SpriteBatch;
  return { sprites, out };
}

const biome = (kind: 'dust' | 'snow' | 'firefly', rate = 200): BiomeDef => ({ ...REG.biomes[0]!, particles: [{ kind, color: '#ffffff', rate, night: kind === 'firefly' }] });

describe('ambient particles (4D slices of tiny 4-balls)', () => {
  it('spawns around the player and draws them as slice discs', () => {
    const p = new Particles();
    const cam = makeTiltedFrame({ xwDeg: 30, pitchDeg: -10 });
    const eye = Float64Array.from([100.5, 70, -40.5, 12.5]);
    const { sprites, out } = capture();
    for (let i = 0; i < 20; i++) p.update(1 / 60, airWorld, eye, cam, biome('dust'), 1, false, out);
    expect(p.alive).toBeGreaterThan(30);
    expect(sprites.length).toBeGreaterThan(0);
    // Every drawn disc is no larger than the particle (the slice of a ball never is).
    for (const s of sprites) expect(s.r).toBeLessThanOrEqual(0.035 * 1.2 + 1e-9);
  });

  it('particles that drift off the slice are not drawn', () => {
    const p = new Particles();
    const cam = makeTiltedFrame({});
    const eye = Float64Array.from([0.5, 70, 0.5, 0.5]);
    const { out } = capture();
    for (let i = 0; i < 30; i++) p.update(1 / 60, airWorld, eye, cam, biome('dust'), 1, false, out);
    const n = p.alive;
    expect(p.visible).toBeGreaterThan(0);
    // Step kata along the hidden axis by one block: every particle is now far off-slice.
    eye[3] = eye[3]! + 1;
    const c2 = capture();
    p.update(1 / 60, airWorld, eye, cam, null, 1, false, c2.out);
    expect(p.alive).toBe(n);
    expect(c2.sprites.length).toBe(0);
  });

  it('respects density, night-only kinds and open sky', () => {
    const cam = makeTiltedFrame({});
    const eye = Float64Array.from([0.5, 70, 0.5, 0.5]);
    const off = new Particles();
    off.density = 0;
    const { out } = capture();
    for (let i = 0; i < 30; i++) off.update(1 / 60, airWorld, eye, cam, biome('dust'), 1, false, out);
    expect(off.alive).toBe(0);
    const day = new Particles();
    for (let i = 0; i < 30; i++) day.update(1 / 60, airWorld, eye, cam, biome('firefly'), 1, false, out);
    expect(day.alive).toBe(0);
    const night = new Particles();
    for (let i = 0; i < 30; i++) night.update(1 / 60, airWorld, eye, cam, biome('firefly'), 0, false, out);
    expect(night.alive).toBeGreaterThan(0);
    // Snow needs open sky: under a roof (sky height 1000) nothing spawns.
    const roofed = { ...airWorld, skyHeight: () => 1000, getBlock: () => 0, getLight: () => 0 } as unknown as World;
    const snow = new Particles();
    for (let i = 0; i < 30; i++) snow.update(1 / 60, roofed, eye, cam, biome('snow'), 1, false, out);
    expect(snow.alive).toBe(0);
  });
});
