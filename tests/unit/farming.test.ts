import { describe, expect, it } from 'vitest';
import { CROPS, PLANTS, SAPLINGS, LEAF_SAPLING, BUSHES } from '../../src/content/farming';
import { REG } from '../../src/content/registry';
import { IREG } from '../../src/content/itemRegistry';
import { rollDrops } from '../../src/game/items/Mining';
import { CRAFTING } from '../../src/game/items/Crafting';
import { SurfaceGenerator } from '../../src/world/gen/SurfaceGen';
import { STRUCTURES } from '../../src/content/structures';
import { COLUMN_LAYER } from '../../src/world/constants';

describe('farming (Phase 7)', () => {
  it('registers every crop stage, seed and sapling', () => {
    for (const c of CROPS) {
      for (let k = 0; k < c.stages; k++) expect(REG.has(`${c.name}_${k}`)).toBe(true);
      expect(IREG.has(c.seed)).toBe(true);
      expect(PLANTS[c.seed]!.block).toBe(`${c.name}_0`);
    }
    for (const b of BUSHES) expect(REG.has(b.young) && REG.has(b.mature) && IREG.has(b.berry)).toBe(true);
    expect(Object.keys(SAPLINGS).length).toBeGreaterThanOrEqual(15);
    for (const s of Object.keys(SAPLINGS)) expect(IREG.blockItem[REG.id(s)]).toBeGreaterThanOrEqual(0);
    expect(LEAF_SAPLING['leaves']).toBe('oak_sapling');
  });

  it('drops produce from mature crops and seeds from young ones', () => {
    const names = (b: string) => rollDrops(REG.id(b), -1, () => 0.3).map((s) => IREG.name(s.id));
    expect(names('wheat_7')).toContain('wheat');
    expect(names('wheat_3')).toEqual(['wheat_seeds']);
    expect(names('carrots_3')).toEqual(['carrot']);
    expect(rollDrops(REG.id('carrots_3'), -1, () => 0.99)[0]!.count).toBe(5);
    expect(names('melon')).toEqual(['melon_slice']);
    // Leaves can drop saplings (5%).
    let saplings = 0;
    for (let k = 0; k < 2000; k++) if (rollDrops(REG.id('leaves'), -1, Math.random).some((s) => IREG.name(s.id) === 'oak_sapling')) saplings++;
    expect(saplings).toBeGreaterThan(40);
    expect(CRAFTING.recipes.some((r) => IREG.name(r.result) === 'bone_meal')).toBe(true);
  });

  it('grows village crops on farmland and tells the simulation about them', () => {
    const gen = new SurfaceGenerator(4242, REG.realm('surface'));
    const villages = STRUCTURES.filter((s) => s.builder === 'village').map((s) => s.name);
    const v = gen.nearestStructure(villages, 0, 0, 0, 3000)!;
    let crops = 0, tracked = 0;
    for (let dw = -1; dw <= 1; dw++)
      for (let dz = -1; dz <= 1; dz++)
        for (let dx = -1; dx <= 1; dx++) {
          const blocks = new Uint16Array(COLUMN_LAYER * gen.height);
          const extra: Record<string, unknown> = {};
          gen.generate(Math.floor(v.x / 16) + dx, Math.floor(v.z / 16) + dz, Math.floor(v.w / 16) + dw, blocks, new Uint8Array(COLUMN_LAYER * 4), extra);
          for (const b of blocks) if (REG.blocks[b & 0xfff]!.tags?.includes('crop')) crops++;
          tracked += (extra.grow as number[] | undefined)?.length ?? 0;
        }
    expect(crops).toBeGreaterThan(10);
    expect(tracked).toBeGreaterThanOrEqual(crops); // crops and their farmland
  });

  it('grows a tree from a sapling with the terrain generator', () => {
    const gen = new SurfaceGenerator(1, REG.realm('surface'));
    const blocks = new Uint16Array(COLUMN_LAYER * gen.height);
    gen.growTreeAt(blocks, 8, 110, 8, 8, 'oak', 100, 200, 300);
    const log = REG.id('log'), leaves = REG.id('leaves');
    let logs = 0, leaf = 0;
    for (const b of blocks) {
      if (b === log) logs++;
      if (b === leaves) leaf++;
    }
    expect(logs).toBeGreaterThanOrEqual(4);
    expect(leaf).toBeGreaterThan(30);
  });
});
