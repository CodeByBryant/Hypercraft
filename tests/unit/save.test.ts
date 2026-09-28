import { describe, expect, it } from 'vitest';
import { B, REG, makeVoxel } from '../../src/content/registry';
import { buildRemap, compress, decompress, deserializeColumn, serializeColumn } from '../../src/save/codec';
import { seedFromText } from '../../src/save/WorldInfo';
import { makeColumn } from './helpers';

describe('seeds', () => {
  it('uses integers as-is and hashes text', () => {
    expect(seedFromText('12345')).toBe(12345);
    expect(seedFromText('-1')).toBe(4294967295);
    expect(seedFromText('hypercraft')).toBe(seedFromText('hypercraft'));
    expect(seedFromText('hypercraft')).not.toBe(seedFromText('Hypercraft'));
    expect(seedFromText('  7 ')).toBe(7);
  });
  it('picks a random seed for empty input', () => {
    const a = seedFromText('');
    const b = seedFromText('');
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a === b && a === seedFromText('')).toBe(false);
  });
});

describe('column save codec', () => {
  const fill = (x: number, y: number, z: number, w: number) =>
    y < 40 ? B.stone : y === 40 && x % 3 === 0 ? makeVoxel(B.stone_stairs, (z + w) % 6) : y === 41 && w % 2 === 0 ? B.glass : B.air;

  it('round-trips blocks, light, heightmap and extra data', async () => {
    const col = makeColumn(3, -2, 7, fill);
    col.extra = { chests: { '1,2,3,4': ['diamond'] } };
    const raw = serializeColumn(col);
    const packed = await compress(raw);
    const back = deserializeColumn(await decompress(packed), 3, -2, 7, null);
    expect(back.extra).toEqual(col.extra);
    expect(Array.from(back.heightmap)).toEqual(Array.from(col.heightmap));
    for (let cy = 0; cy < col.chunks.length; cy++) {
      const a = col.chunks[cy]!, b = back.chunks[cy]!;
      for (let i = 0; i < 65536; i += 7) {
        const x = i & 15, y = (i >> 4) & 15, z = (i >> 8) & 15, w = (i >> 12) & 15;
        if (a.getBlock(x, y, z, w) !== b.getBlock(x, y, z, w)) throw new Error('block mismatch');
        if (a.getLight(x, y, z, w) !== b.getLight(x, y, z, w)) throw new Error('light mismatch');
      }
    }
  });

  it('remaps block ids through the saved palette (content reordering)', () => {
    const names = REG.blocks.map((b) => b.name);
    // Pretend the save was written when glass and stone had swapped ids.
    const saved = names.slice();
    saved[B.glass] = 'stone';
    saved[B.stone] = 'glass';
    const remap = buildRemap(saved, names, (n) => REG.id(n))!;
    expect(remap).not.toBeNull();
    const col = makeColumn(0, 0, 0, fill);
    const back = deserializeColumn(serializeColumn(col), 0, 0, 0, remap);
    expect(back.chunks[0]!.getBlock(1, 5, 1, 1)).toBe(B.glass); // was "stone" in the saved palette order
    expect(buildRemap(names, names, (n) => REG.id(n))).toBeNull();
    // orientation meta survives the remap
    const meta = makeVoxel(B.stone_stairs, 3);
    expect(deserializeColumn(serializeColumn(makeColumn(0, 0, 0, () => meta)), 0, 0, 0, remap).chunks[0]!.getBlock(0, 0, 0, 0)).toBe(meta);
  });
});
