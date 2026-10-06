import { describe, expect, it } from 'vitest';
import { IREG, ItemRegistry } from '../../src/content/itemRegistry';
import { REG } from '../../src/content/registry';
import { ITEMS } from '../../src/content/items';
import { TIERS } from '../../src/content/tiers';
import { MINING } from '../../src/content/mining';
import { RECIPES } from '../../src/content/recipes';
import { CRAFTING, Crafting } from '../../src/game/items/Crafting';
import { breakInfo, canHarvest, rollDrops, wearFor } from '../../src/game/items/Mining';
import { Inventory } from '../../src/game/items/Inventory';
import { stackOf, loadStack, saveStack, insertInto, SlotContainer, type ItemStack } from '../../src/game/items/ItemStack';

const I = (n: string) => IREG.id(n);
const B = (n: string) => REG.id(n);
const grid = (_size: number, cells: (string | null)[]) => cells.map((c) => (c ? stackOf(c) : null)) as (ItemStack | null)[];

describe('item registry', () => {
  it('generates block items and tool items', () => {
    expect(IREG.itemBlock[I('stone')]).toBe(B('stone'));
    expect(IREG.blockItem[B('stone')]).toBe(I('stone'));
    expect(IREG.has('water')).toBe(false);
    expect(IREG.maxStack[I('iron_pickaxe')]).toBe(1);
    expect(IREG.maxStack[I('stone')]).toBe(64);
    expect(IREG.durability[I('iron_pickaxe')]).toBe(250);
    expect(IREG.tier(I('hyperite_sword'))?.level).toBe(3);
    expect(IREG.fuel[I('coal')]).toBe(80);
    expect(IREG.fuel[I('birch_log')]).toBe(15); // from the block's "log" tag
    expect(IREG.matches(I('spruce_planks'), '#planks')).toBe(true);
    expect(IREG.matches(I('charcoal'), '#coal')).toBe(true);
  });

  it('reports bad content', () => {
    expect(() => new ItemRegistry(REG, [...ITEMS, { name: 'x', tool: { kind: 'axe', tier: 'mythril' }, icon: { shape: 'axe', colors: ['#fff'] } }], TIERS, MINING)).toThrow(/unknown tier "mythril"/);
    expect(() => new ItemRegistry(REG, ITEMS, TIERS, { ...MINING, nope: { tool: 'axe' } })).toThrow(/unknown block "nope"/);
    expect(() => new Crafting(IREG, [...RECIPES, { type: 'shapeless', ingredients: ['#unobtainium'], result: 'stick' }])).toThrow(/matches no item/);
  });
});

describe('crafting', () => {
  it('matches shaped recipes anywhere in the grid, mirrored too', () => {
    // A stick column in the right column of a 3x3 grid.
    const g = grid(3, [null, null, 'planks', null, null, 'birch_planks', null, null, null]);
    expect(IREG.name(CRAFTING.match(g, 3)!.result)).toBe('stick');
    // Axe and its mirror image.
    const axe = grid(3, ['cobblestone', 'cobblestone', null, 'cobblestone', 'stick', null, null, 'stick', null]);
    expect(IREG.name(CRAFTING.match(axe, 3)!.result)).toBe('stone_axe');
    const mirrored = grid(3, [null, 'cobblestone', 'cobblestone', null, 'stick', 'cobblestone', null, 'stick', null]);
    expect(IREG.name(CRAFTING.match(mirrored, 3)!.result)).toBe('stone_axe');
    // 2x2 crafting table in the inventory grid.
    const table = grid(2, ['planks', 'spruce_planks', 'cherry_planks', 'acacia_planks']);
    expect(IREG.name(CRAFTING.match(table, 2)!.result)).toBe('crafting_table');
    // Wrong layout.
    expect(CRAFTING.match(grid(3, ['planks', null, null, null, 'planks', null, null, null, null]), 3)).toBeNull();
  });

  it('matches shapeless recipes in any order, with tags', () => {
    const g = grid(3, [null, 'flint', null, null, null, null, 'iron_ingot', null, null]);
    expect(IREG.name(CRAFTING.match(g, 3)!.result)).toBe('flint_and_steel');
    const logs = grid(2, [null, null, null, 'spruce_log']);
    const r = CRAFTING.match(logs, 2)!;
    expect(IREG.name(r.result)).toBe('spruce_planks');
    expect(r.count).toBe(4);
    // Extra item breaks the match.
    expect(CRAFTING.match(grid(2, ['spruce_log', 'stick', null, null]), 2)).toBeNull();
  });

  it('crafts every tool tier and every recipe result exists', () => {
    for (const t of TIERS) expect(CRAFTING.recipesFor(I(`${t.name}_pickaxe`)).length).toBe(1);
    expect(CRAFTING.recipes.length).toBeGreaterThan(70);
  });

  it('smelts by furnace kind and knows fuels', () => {
    expect(IREG.name(CRAFTING.smelt(I('raw_iron'), 'furnace')!.result)).toBe('iron_ingot');
    expect(CRAFTING.smelt(I('raw_iron'), 'blast_furnace')).not.toBeNull();
    expect(CRAFTING.smelt(I('sand'), 'blast_furnace')).toBeNull();
    expect(IREG.name(CRAFTING.smelt(I('red_sand'), 'furnace')!.result)).toBe('glass');
    expect(IREG.name(CRAFTING.smelt(I('cherry_log'), 'furnace')!.result)).toBe('charcoal');
    expect(CRAFTING.fuel(I('lava_bucket'))).toBe(1000);
    expect(CRAFTING.fuel(I('stone'))).toBe(0);
  });
});

describe('mining', () => {
  it('needs the right tool tier for ores', () => {
    expect(canHarvest(B('stone'), -1)).toBe(false);
    expect(canHarvest(B('stone'), I('wood_pickaxe'))).toBe(true);
    expect(canHarvest(B('iron_ore'), I('wood_pickaxe'))).toBe(false);
    expect(canHarvest(B('iron_ore'), I('stone_pickaxe'))).toBe(true);
    expect(canHarvest(B('gold_ore'), I('copper_pickaxe'))).toBe(false);
    expect(canHarvest(B('gold_ore'), I('iron_pickaxe'))).toBe(true);
    expect(canHarvest(B('obsidian'), I('iron_pickaxe'))).toBe(false);
    expect(canHarvest(B('obsidian'), I('hyperite_pickaxe'))).toBe(true);
    expect(canHarvest(B('dirt'), -1)).toBe(true);
  });

  it('computes Minecraft-like break times', () => {
    expect(breakInfo(B('stone'), -1).seconds).toBeCloseTo(7.5, 1);
    expect(breakInfo(B('stone'), I('wood_pickaxe')).seconds).toBeCloseTo(1.15, 1);
    expect(breakInfo(B('stone'), I('iron_pickaxe')).seconds).toBeCloseTo(0.4, 1);
    expect(breakInfo(B('dirt'), -1).seconds).toBeCloseTo(0.75, 1);
    expect(breakInfo(B('tall_grass'), -1).seconds).toBe(0);
    expect(breakInfo(B('bedrock'), I('hyperite_pickaxe')).seconds).toBe(Infinity);
    // In the air mining is 5x slower.
    expect(breakInfo(B('dirt'), -1, false).seconds).toBeGreaterThan(breakInfo(B('dirt'), -1).seconds * 4);
  });

  it('rolls drops', () => {
    const r = () => 0;
    expect(rollDrops(B('stone'), I('wood_pickaxe'), r).map((s) => IREG.name(s.id))).toEqual(['cobblestone']);
    expect(rollDrops(B('stone'), -1, r)).toEqual([]);
    expect(rollDrops(B('grass'), -1, r).map((s) => IREG.name(s.id))).toEqual(['dirt']);
    expect(rollDrops(B('coal_ore'), I('wood_pickaxe'), r).map((s) => IREG.name(s.id))).toEqual(['coal']);
    // Tall grass by hand: wheat seeds now and then (Minecraft: 1 in 8), and plant fibre.
    expect(rollDrops(B('tall_grass'), -1, r).map((s) => IREG.name(s.id))).toEqual(['wheat_seeds', 'plant_fibre']);
    expect(rollDrops(B('tall_grass'), -1, () => 0.99)).toEqual([]);
    expect(rollDrops(B('tall_grass'), I('shears'), r).map((s) => IREG.name(s.id))).toEqual(['tall_grass']);
    expect(rollDrops(B('glass'), -1, r)).toEqual([]);
    const cu = rollDrops(B('copper_ore'), I('stone_pickaxe'), () => 0.99);
    expect(cu[0]!.count).toBe(4);
    expect(wearFor(B('stone'), I('iron_pickaxe'))).toBe(1);
    expect(wearFor(B('tall_grass'), I('iron_pickaxe'))).toBe(0);
    expect(wearFor(B('stone'), I('flint_and_steel'))).toBe(0);
  });
});

describe('inventory', () => {
  it('merges, fills the hotbar first, and reports leftovers', () => {
    const inv = new Inventory();
    const s = stackOf('dirt', 100);
    expect(inv.add(s)).toBe(0);
    expect(inv.get(0)!.count).toBe(64);
    expect(inv.get(1)!.count).toBe(36);
    inv.add(stackOf('dirt', 30));
    expect(inv.get(1)!.count).toBe(64);
    expect(inv.get(2)!.count).toBe(2);
    // Tools do not stack.
    inv.add(stackOf('iron_pickaxe'));
    inv.add(stackOf('iron_pickaxe'));
    expect(inv.get(3)!.count).toBe(1);
    expect(inv.get(4)!.count).toBe(1);
    // Full inventory leaves the rest.
    const full = new SlotContainer(2);
    expect(insertInto(full, stackOf('stone', 200))).toBe(72);
  });

  it('round-trips saves and drops unknown items', () => {
    const inv = new Inventory();
    inv.set(5, { id: I('iron_pickaxe'), count: 1, damage: 17 });
    inv.set(9, stackOf('torch', 12));
    const saved = inv.save();
    const b = new Inventory();
    b.load(JSON.parse(JSON.stringify(saved)));
    expect(b.get(5)).toEqual({ id: I('iron_pickaxe'), count: 1, damage: 17 });
    expect(b.get(9)!.count).toBe(12);
    expect(loadStack(['removed_item', 3])).toBeNull();
    expect(saveStack(null)).toBeNull();
  });
});
