import { describe, expect, it } from 'vitest';
import { IREG } from '../../src/content/itemRegistry';
import { REG } from '../../src/content/registry';
import { createGenerator } from '../../src/world/gen/generators';
import { COLUMN_LAYER } from '../../src/world/constants';
import { CRAFTING } from '../../src/game/items/Crafting';
import { rollDrops } from '../../src/game/items/Mining';
import { stackOf, type ItemStack } from '../../src/game/items/ItemStack';
import { BREWING } from '../../src/content/potions';
import { ARROWS } from '../../src/content/ores';
import { groupOf } from '../../src/content/itemGroups';

const grid = (cells: (string | null)[]) => cells.map((c) => (c ? stackOf(c) : null)) as (ItemStack | null)[];
const made = (cells: (string | null)[]) => {
  const m = CRAFTING.match(grid(cells), 3);
  return m ? [IREG.name(m.result), m.count] : null;
};
const seq = (seed: number) => {
  let s = seed;
  return () => ((s = (s * 1103515245 + 12345) >>> 0) / 4294967296);
};

describe('ores (playtest: more ores, more uses)', () => {
  it('generates plenty of ore, the new ones included', () => {
    const realm = REG.realm('surface');
    const g = createGenerator(4242, realm);
    const H = realm.heightChunks * 16;
    const isOre = new Uint8Array(4096);
    REG.blocks.forEach((b, i) => {
      if ((b.tags ?? []).includes('ore')) isOre[i] = 1;
    });
    const counts = new Map<string, number>();
    let solid = 0;
    for (let k = 0; k < 6; k++) {
      const b = new Uint16Array(COLUMN_LAYER * H);
      g.generate(k * 5, -k * 3, k * 2, b, new Uint8Array(COLUMN_LAYER * 4));
      for (let i = 0; i < b.length; i++) {
        const id = b[i]! & 0xfff;
        if (REG.opaque[id]) solid++;
        if (isOre[id]) {
          const n = REG.blocks[id]!.name.replace(/^deep_/, '');
          counts.set(n, (counts.get(n) ?? 0) + 1);
        }
      }
    }
    let total = 0;
    for (const c of counts.values()) total += c;
    // About 7% of the rock is ore (was under 2%); coal and iron over 1% each.
    expect(total / solid).toBeGreaterThan(0.045);
    expect((counts.get('coal_ore') ?? 0) / solid).toBeGreaterThan(0.012);
    expect((counts.get('iron_ore') ?? 0) / solid).toBeGreaterThan(0.01);
    for (const n of ['silver_ore', 'sulfur_ore', 'lumenite_ore', 'tesserite_ore', 'hyperite_ore', 'gold_ore', 'azurite_ore', 'fluxite_ore']) expect(counts.get(n) ?? 0, n).toBeGreaterThan(20);
  });

  it('new ores drop what they should, with the right tool', () => {
    const id = (n: string) => IREG.id(n);
    const b = (n: string) => REG.id(n);
    const sulfur = rollDrops(b('sulfur_ore'), id('wood_pickaxe'), seq(1));
    expect(IREG.name(sulfur[0]!.id)).toBe('sulfur');
    expect(sulfur[0]!.count).toBeGreaterThanOrEqual(2);
    expect(IREG.name(rollDrops(b('deep_lumenite_ore'), id('stone_pickaxe'), seq(2))[0]!.id)).toBe('lumen_dust');
    expect(IREG.name(rollDrops(b('silver_ore'), id('stone_pickaxe'), seq(3))[0]!.id)).toBe('raw_silver');
    // Tesserite needs an iron pickaxe.
    expect(rollDrops(b('tesserite_ore'), id('stone_pickaxe'), seq(4))).toEqual([]);
    expect(IREG.name(rollDrops(b('tesserite_ore'), id('iron_pickaxe'), seq(5))[0]!.id)).toBe('tesserite_shard');
    // The lumen block breaks into dust, like glowstone.
    expect(IREG.name(rollDrops(b('lumen'), -1, seq(6))[0]!.id)).toBe('lumen_dust');
    // New ores glow (lumenite, tesserite) and sort into Natural Blocks; TNT is functional.
    expect(REG.emission[b('lumenite_ore')]).toBeGreaterThan(0);
    expect(groupOf(id('silver_ore'))).toBe('natural');
    expect(groupOf(id('tnt'))).toBe('functional');
    expect(IREG.has('tnt_lit')).toBe(false);
  });

  it('every new ore has uses', () => {
    expect(made(['sulfur', 'sand', 'sulfur', 'sand', 'sulfur', 'sand', 'sulfur', 'sand', 'sulfur'])).toEqual(['tnt', 1]);
    expect(made(['arrow', 'arrow', 'arrow', 'arrow', 'silver_ingot', 'arrow', 'arrow', 'arrow', 'arrow'])).toEqual(['silver_arrow', 8]);
    expect(made([null, 'lumen_dust', null, 'lumen_dust', 'arrow', 'lumen_dust', null, 'lumen_dust', null])).toEqual(['spectral_arrow', 2]);
    expect(made(['glass', 'glass', 'glass', 'glass', 'silver_ingot', 'glass', 'glass', 'glass', 'glass'])).toEqual(['mirror_glass', 8]);
    expect(made(['tesserite_shard', null, null, null, null, null, null, null, null])).toEqual(['phase_dust', 2]);
    expect(made(['lumen_dust', 'lumen_dust', null, 'lumen_dust', 'lumen_dust', null, null, null, null])).toEqual(['lumen', 1]);
    // Lumen dust enhances potions like emberglass dust.
    expect(BREWING.get('potion_strength|lumen_dust')).toBe('potion_strength_strong');
    // Arrow kinds.
    expect(ARROWS.silver_arrow!.undead).toBe(2);
    expect(ARROWS.spectral_arrow!.glow).toBeGreaterThan(0);
    expect(IREG.tags[IREG.id('spectral_arrow')]!.has('arrow')).toBe(true);
  });
});
