import { describe, expect, it } from 'vitest';
import { IREG } from '../../src/content/itemRegistry';
import { ALL_TEXTURES, DOOR_OPEN, REG, makeVoxel } from '../../src/content/registry';
import { CRAFTING } from '../../src/game/items/Crafting';
import { rollDrops } from '../../src/game/items/Mining';
import { stackOf, type ItemStack } from '../../src/game/items/ItemStack';
import { STRIP, WOOD_SETS, WOODS } from '../../src/content/woods';
import { DOOR_OTHER, DOOR_PART, STRIP_ID, doorPartner, toggledDoor } from '../../src/game/WoodBlocks';
import { groupOf } from '../../src/content/itemGroups';

const made = (cells: (string | null)[], size = 3) => {
  const m = CRAFTING.match(cells.map((c) => (c ? stackOf(c) : null)) as (ItemStack | null)[], size);
  return m ? [IREG.name(m.result), m.count] : null;
};
const seq = (seed: number) => {
  let s = seed;
  return () => ((s = (s * 1103515245 + 12345) >>> 0) / 4294967296);
};

describe('wood families (playtest: every tree makes its own wood)', () => {
  it('every log saws into planks, and every wood has the whole set', () => {
    const sources = new Set(WOODS.flatMap((w) => w.logs));
    for (const b of REG.blocks) {
      const t = b.tags ?? [];
      if (!t.includes('log') || t.includes('stripped') || b.name === 'nest_twigs') continue;
      expect(sources.has(b.name), `${b.name} is no wood's log`).toBe(true);
    }
    for (const w of WOODS) {
      const set = WOOD_SETS.get(w.name)!;
      for (const n of [set.planks, set.slab, set.stairs, set.fence, set.door, set.doorTop]) expect(REG.has(n), n).toBe(true);
      expect(REG.blocks[REG.id(set.planks)]!.tags).toContain('planks');
      for (const l of w.logs) expect(made([l], 2), l).toEqual([set.planks, l === 'bamboo_block' ? 2 : 4]);
      if (!w.noStrip) {
        expect(set.stripped && REG.has(set.stripped)).toBeTruthy();
        for (const l of w.logs) expect(STRIP[l]).toBe(set.stripped);
        expect(made([set.stripped], 2)).toEqual([set.planks, 4]);
      }
      const p = set.planks;
      expect(made([p, p, p, null, null, null, null, null, null])).toEqual([set.slab, 6]);
      expect(made([p, null, null, p, p, null, p, p, p])).toEqual([set.stairs, 4]);
      expect(made([p, 'stick', p, p, 'stick', p, null, null, null])).toEqual([set.fence, 3]);
      expect(made([p, p, null, p, p, null, p, p, null])).toEqual([set.door, 3]);
      // Shared plank recipes still take any planks.
      expect(made([p, p, p, p], 2)).toEqual(['crafting_table', 1]);
      // Building blocks in the creative inventory; no item for the upper door half.
      for (const n of [set.slab, set.stairs, set.door]) expect(groupOf(IREG.id(n)), n).toBe('building');
      expect(IREG.has(set.doorTop)).toBe(false);
    }
    // Stone and crystal "trunks" are not wood.
    for (const n of ['quartz_pillar', 'petrified_log', 'bone_pillar', 'spire_obsidian', 'ember_crystal']) expect(REG.blocks[REG.id(n)]!.tags).not.toContain('log');
  });

  it('ember woods do not burn, surface woods do', () => {
    expect(REG.ignite[REG.id('crimson_planks')]).toBe(0);
    expect(REG.ignite[REG.id('crimson_door')]).toBe(0);
    expect(REG.ignite[REG.id('jungle_planks')]).toBeGreaterThan(0);
    expect(REG.ignite[REG.id('jungle_stairs')]).toBeGreaterThan(0);
  });

  it('axes strip logs (keeping the orientation) and mine all wood', () => {
    const log = REG.id('jungle_log');
    expect(STRIP_ID[log]).toBe(REG.id('stripped_jungle_log'));
    expect(STRIP_ID[REG.id('scorched_log')]).toBe(REG.id('stripped_charred_log'));
    expect(STRIP_ID[REG.id('bamboo_block')]).toBe(-1);
    const axe = IREG.id('iron_axe');
    for (const n of ['jungle_planks', 'stripped_jungle_log', 'jungle_slab', 'jungle_door', 'redwood_log', 'kapok_log']) expect(IREG.mineTool[REG.id(n)], n).toBe(IREG.toolKind[axe]);
  });

  it('every leafy block drops sticks or saplings, never itself without shears', () => {
    const rnd = seq(7);
    for (const n of ['jungle_leaves', 'redwood_needles', 'gum_leaves', 'kapok_leaves', 'pine_needles', 'wisteria_leaves']) {
      const id = REG.id(n);
      expect(IREG.shearsDrop[id], n).toBe(1);
      for (let k = 0; k < 200; k++) for (const d of rollDrops(id, -1, rnd)) expect(IREG.itemBlock[d.id], n).not.toBe(id);
    }
  });

  it('doors: two halves, 12 shape variants, open swings the panel aside', () => {
    const door = REG.id('spruce_door'), top = REG.id('spruce_door_top');
    expect(DOOR_PART[door]).toBe(1);
    expect(DOOR_PART[top]).toBe(2);
    expect(DOOR_OTHER[door]).toBe(top);
    expect(DOOR_OTHER[top]).toBe(door);
    // Facing +X closed: thin in x; open: thin in z.
    const closed = REG.shapes[REG.shapeIndex(makeVoxel(door, 0))]!;
    const open = REG.shapes[REG.shapeIndex(makeVoxel(door, DOOR_OPEN))]!;
    expect(closed.boxes[4]! - closed.boxes[0]!).toBeLessThan(0.25);
    expect(closed.boxes[6]! - closed.boxes[2]!).toBe(1);
    expect(open.boxes[4]! - open.boxes[0]!).toBe(1);
    expect(open.boxes[6]! - open.boxes[2]!).toBeLessThan(0.25);
    // Facing +W closed: thin in w.
    const cw = REG.shapes[REG.shapeIndex(makeVoxel(door, 4))]!;
    expect(cw.boxes[7]! - cw.boxes[3]!).toBeLessThan(0.25);
    expect(toggledDoor(makeVoxel(door, 3))).toBe(makeVoxel(door, 3 + DOOR_OPEN));
    expect(toggledDoor(makeVoxel(door, 3 + DOOR_OPEN))).toBe(makeVoxel(door, 3));
    // The partner of a lower half is the upper half above it (and back).
    const cells = new Map<string, number>([['0,5,0,0', makeVoxel(door, 2)], ['0,6,0,0', makeVoxel(top, 2)]]);
    const world = { getBlock: (x: number, y: number, z: number, w: number) => cells.get(`${x},${y},${z},${w}`) ?? 0 };
    expect(doorPartner(world, 0, 5, 0, 0, makeVoxel(door, 2))).toEqual([0, 6, 0, 0]);
    expect(doorPartner(world, 0, 6, 0, 0, makeVoxel(top, 2))).toEqual([0, 5, 0, 0]);
    // Breaking the upper half drops the door.
    expect(rollDrops(top, -1, seq(1)).map((d) => IREG.name(d.id))).toEqual(['spruce_door']);
  });

  it('stays inside the GPU texture budget', () => {
    // 10-bit texture indices in the block info table (see registry.gpuBlockInfo).
    expect(ALL_TEXTURES.length).toBeLessThanOrEqual(1024);
  });
});
