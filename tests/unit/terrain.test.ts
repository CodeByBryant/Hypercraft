import { describe, expect, it } from 'vitest';
import { REG } from '../../src/content/registry';
import { Climate, type BiomePick, type ClimateSample } from '../../src/world/gen/surface/Climate';
import { SurfaceGenerator } from '../../src/world/gen/SurfaceGen';
import { COLUMN_LAYER } from '../../src/world/constants';

const realm = REG.realm('surface');

describe('livable terrain (0.7.1 playtest: biomes too small, no cave entrances, few lakes and rivers)', () => {
  it('biomes are regions, not patches: walking a straight line stays in one for a good while', () => {
    // Before the pass the mean stretch of one biome (land) along a line was ~38 blocks.
    let total = 0, n = 0;
    for (const seed of [11, 4242, 777]) {
      const c = new Climate(seed, REG.biomes, realm.seaLevel, realm.heightChunks * 16);
      const s = {} as ClimateSample, p = { grass: [0, 0, 0] } as unknown as BiomePick;
      for (const axis of [0, 2, 3]) {
        let len = 0, prev = -1;
        for (let i = 0; i < 1500; i++) {
          const q = 3000 + i * 4;
          c.sample(axis === 0 ? q : 3000, axis === 2 ? q : 3000, axis === 3 ? q : 3000, s);
          c.pick(s, p);
          if (p.ocean) {
            prev = -1;
            continue;
          }
          if (p.biome !== prev) {
            if (prev >= 0) {
              total += len;
              n++;
            }
            len = 0;
            prev = p.biome;
          }
          len += 4;
        }
      }
    }
    expect(total / n).toBeGreaterThan(85);
  });

  it('rivers vary in width (creeks to wide rivers) and lakes are common', () => {
    const g = new SurfaceGenerator(31337, realm);
    const widths: number[] = [];
    const sm = { height: 0, biome: 0, grass: [0, 0, 0] } as { height: number; ocean?: boolean; river?: boolean };
    for (let line = 0; line < 30; line++) {
      let run = 0;
      for (let x = -2500; x < 2500; x++) {
        g.sample(x + 5000, line * 97 + 5000, line * 13, sm as never);
        if (sm.river && !sm.ocean) run++;
        else if (run) {
          widths.push(run);
          run = 0;
        }
      }
    }
    widths.sort((a, b) => a - b);
    const q = (f: number) => widths[Math.floor(f * (widths.length - 1))]!;
    expect(widths.length).toBeGreaterThan(300);
    expect(q(0.1)).toBeLessThanOrEqual(3);
    expect(q(0.9)).toBeGreaterThanOrEqual(14);
    // Lakes: a good number of 4D cells hold one, longer along W than across.
    const sp = g.spawnPoint();
    const S = SurfaceGenerator.LAKE_CELL;
    let lakes = 0, big = 0;
    for (let a = -4; a < 4; a++)
      for (let b = -4; b < 4; b++)
        for (let d = -1; d < 1; d++) {
          const l = g.lakeAt(a + Math.floor(sp[0]! / S), b + Math.floor(sp[2]! / S), d + Math.floor(sp[3]! / S));
          if (l) {
            lakes++;
            if (l.r >= 14) big++;
          }
        }
    expect(lakes).toBeGreaterThan(14);
    expect(big).toBeGreaterThan(0);
  });

  it('caves open to the surface: mouths in hillsides and fields near the spawn', () => {
    // For several worlds: the land columns around the spawn have cells whose terrain top is a cave.
    let worlds = 0;
    for (const seed of [31337, 99, 2024]) {
      const g = new SurfaceGenerator(seed, realm);
      const H = realm.heightChunks * 16;
      const sp = g.spawnPoint();
      const bx = Math.floor(sp[0]! / 16), bz = Math.floor(sp[2]! / 16), bw = Math.floor(sp[3]! / 16);
      let mouths = 0;
      for (let cx = -3; cx <= 3; cx++)
        for (let cz = -3; cz <= 3; cz++) {
          const blocks = new Uint16Array(COLUMN_LAYER * H);
          g.generate(cx + bx, cz + bz, bw, blocks, new Uint8Array(COLUMN_LAYER * 4));
          const heights = (g as unknown as { sHeights: Int16Array }).sHeights;
          for (let w = 0; w < 16; w++)
            for (let z = 0; z < 16; z++)
              for (let x = 0; x < 16; x++) {
                const i = x + (z << 4) + (w << 8);
                let y = H - 2;
                while (y > 4 && (blocks[i + y * COLUMN_LAYER] === 0 || REG.render[blocks[i + y * COLUMN_LAYER]!] === 2)) y--;
                if (heights[i]! > g.sea + 1 && !REG.fluid[blocks[i + y * COLUMN_LAYER]!] && y < heights[i]! - 3) mouths++;
              }
        }
      if (mouths > 150) worlds++;
    }
    expect(worlds).toBeGreaterThanOrEqual(2);
  }, 120_000);

  it('waterfalls: a spring in a cliff face and a falling column of water down to its foot', () => {
    let falls = 0, checked = 0;
    for (const seed of [31337, 99, 2024, 4242]) {
      const g = new SurfaceGenerator(seed, realm);
      const H = realm.heightChunks * 16;
      const sp = g.spawnPoint();
      for (let k = 0; k < 40 && falls < 3; k++) {
        const cx = Math.floor(sp[0]! / 16) + ((k * 7) % 11) * 5 - 25, cz = Math.floor(sp[2]! / 16) + ((k * 5) % 13) * 5 - 30, cw = Math.floor(sp[3]! / 16);
        const blocks = new Uint16Array(COLUMN_LAYER * H);
        g.generate(cx, cz, cw, blocks, new Uint8Array(COLUMN_LAYER * 4));
        checked++;
        for (let i = 0; i < COLUMN_LAYER; i++)
          for (let y = 8; y < H - 2; y++) {
            const v = blocks[i + y * COLUMN_LAYER]!;
            if ((v & 0xfff) !== REG.id('water') || v >>> 12 !== 8) continue;
            // The top of a fall: falling water with air or a source beside it at the top.
            if ((blocks[i + (y + 1) * COLUMN_LAYER]! >>> 12) === 8 || (blocks[i + (y + 1) * COLUMN_LAYER]! & 0xfff) === REG.id('water')) continue;
            let n = 0;
            while ((blocks[i + (y - n) * COLUMN_LAYER]! & 0xfff) === REG.id('water') && blocks[i + (y - n) * COLUMN_LAYER]! >>> 12 === 8) n++;
            if (n >= 5) falls++;
          }
      }
    }
    expect(falls, `checked ${checked} columns`).toBeGreaterThan(0);
  }, 180_000);
});
