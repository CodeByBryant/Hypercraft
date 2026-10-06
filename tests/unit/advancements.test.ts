import { describe, expect, it } from 'vitest';
import { REG } from '../../src/content/registry';
import { IREG } from '../../src/content/itemRegistry';
import { MOB_REG } from '../../src/content/mobRegistry';
import { ADVANCEMENTS, ADV_BY_ID, ADV_CATEGORIES, EVENTS, STATS, type AdvancementDef } from '../../src/content/advancements';
import { Advancements } from '../../src/game/Advancements';
import { treeOrder } from '../../src/ui/AdvancementsScreen';

describe('advancement data', () => {
  it('has about fifty goals in eight categories, each with a root', () => {
    expect(ADV_CATEGORIES).toHaveLength(8);
    expect(ADVANCEMENTS.length).toBeGreaterThanOrEqual(45);
    for (const c of ADV_CATEGORIES) {
      const inCat = ADVANCEMENTS.filter((a) => a.category === c.id);
      expect(inCat.length, c.id).toBeGreaterThanOrEqual(5);
      expect(inCat.filter((a) => !a.parent).length, `${c.id} roots`).toBe(1);
      expect(IREG.has(c.icon), `${c.id} icon ${c.icon}`).toBe(true);
    }
  });

  it('has unique ids and titles, real parents (no cycles) and sensible text', () => {
    expect(new Set(ADVANCEMENTS.map((a) => a.id)).size).toBe(ADVANCEMENTS.length);
    expect(new Set(ADVANCEMENTS.map((a) => a.title)).size).toBe(ADVANCEMENTS.length);
    for (const a of ADVANCEMENTS) {
      expect(a.id.startsWith(`${a.category}/`), a.id).toBe(true);
      expect(a.title.length, a.id).toBeGreaterThan(2);
      expect(a.description.length, a.id).toBeGreaterThan(8);
      expect(a.xp, a.id).toBeGreaterThanOrEqual(0);
      // The chain of parents ends at a root within the same list, without looping.
      let cur: AdvancementDef | undefined = a;
      for (let hops = 0; cur?.parent; hops++) {
        expect(hops, `${a.id} loops`).toBeLessThan(20);
        cur = ADV_BY_ID.get(cur.parent);
        expect(cur, `${a.id}: parent ${a.parent} exists`).toBeDefined();
      }
    }
  });

  it('only names things that exist: icons, items, tags, blocks, mobs, realms, events and stats', () => {
    const tags = new Set<string>();
    for (let i = 0; i < IREG.count; i++) for (const t of IREG.tags[i]!) tags.add(t);
    const item = (n: string, who: string) => {
      if (n.startsWith('#')) expect(tags.has(n.slice(1)), `${who}: tag ${n}`).toBe(true);
      else expect(IREG.has(n), `${who}: item ${n}`).toBe(true);
    };
    for (const a of ADVANCEMENTS) {
      expect(IREG.has(a.icon), `${a.id}: icon ${a.icon}`).toBe(true);
      const c = a.criterion;
      if (c.type === 'have' || c.type === 'eat') for (const n of c.items) item(n, a.id);
      if (c.type === 'mine') for (const b of c.blocks) expect(REG.has(b), `${a.id}: block ${b}`).toBe(true);
      if (c.type === 'kill') for (const m of c.mobs) expect(m === '*hostile' || MOB_REG.has(m), `${a.id}: mob ${m}`).toBe(true);
      if (c.type === 'realm') expect(REG.realms.some((r) => r.name === c.realm), `${a.id}: realm`).toBe(true);
      if (c.type === 'event') expect(EVENTS as readonly string[], a.id).toContain(c.name);
      if (c.type === 'stat') {
        expect(STATS as readonly string[], a.id).toContain(c.stat);
        expect(c.value, a.id).toBeGreaterThan(0);
      }
      if (c.type === 'biome') expect(c.count, a.id).toBeGreaterThan(1);
    }
  });

  it('can all be reached by something the game reports', () => {
    // Every event name is used by some goal, and every stat too: nothing is reported for nobody.
    const used = new Set(ADVANCEMENTS.flatMap((a) => (a.criterion.type === 'event' ? [a.criterion.name] : [])));
    for (const e of EVENTS) expect(used.has(e), `event ${e}`).toBe(true);
    const stats = new Set(ADVANCEMENTS.flatMap((a) => (a.criterion.type === 'stat' ? [a.criterion.stat] : [])));
    for (const s of STATS) expect(stats.has(s), `stat ${s}`).toBe(true);
  });
});

describe('advancement tracking', () => {
  const make = () => {
    const adv = new Advancements();
    const got: string[] = [];
    adv.onUnlock = (a) => void got.push(a.id);
    return { adv, got };
  };

  it('completes the root when the world starts, and each goal once', () => {
    const { adv, got } = make();
    adv.start();
    adv.start();
    expect(got).toEqual(['surface/root']);
    expect(adv.has('surface/root')).toBe(true);
  });

  it('counts what you hold, by name and by tag', () => {
    const { adv, got } = make();
    adv.have(new Map([['crafting_table', 1], ['#log', 3]]));
    expect(got).toContain('surface/timber');
    expect(got).toContain('surface/workbench');
    expect(got).not.toContain('surface/furnace');
    adv.have(new Map([['furnace', 1]]));
    expect(got).toContain('surface/furnace');
  });

  it('reports mining, kills (a named mob, or any hostile), food, realms and events', () => {
    const { adv, got } = make();
    adv.mined('stone');
    adv.killed('shambler', true);
    adv.killed('bone_archer', true);
    adv.killed('kata_sheep', false);
    adv.ate('golden_apple');
    adv.realm('ember');
    adv.realm('void');
    adv.event('sleep');
    adv.event('void_gate');
    expect(got).toEqual(expect.arrayContaining(['mining/root', 'combat/root', 'combat/archer', 'husbandry/golden', 'ember/root', 'void/enter', 'surface/bed', 'void/gate']));
    expect(got).not.toContain('combat/weaver');
  });

  it('counts distinct biomes, and stats that add up or keep their maximum', () => {
    const { adv, got } = make();
    for (let i = 0; i < 7; i++) adv.biome(`b${i}`);
    adv.biome('b0');
    expect(got).not.toContain('surface/explorer');
    adv.biome('b7');
    expect(got).toContain('surface/explorer');
    adv.maxStat('slice_tilt', 20);
    adv.maxStat('slice_tilt', 10); // a smaller tilt later does not lower the record
    expect(adv.stats.slice_tilt).toBe(20);
    expect(got).toContain('fourd/root');
    expect(got).not.toContain('fourd/perpendicular');
    adv.maxStat('slice_tilt', 85);
    expect(got).toContain('fourd/perpendicular');
    adv.addStat('glide', 60);
    adv.addStat('glide', 60);
    expect(got).toContain('void/flight');
    expect(got).not.toContain('void/far');
    adv.addStat('glide', 900);
    expect(got).toContain('void/far');
    adv.addStat('w_walk', -5);
    expect(adv.stats.w_walk).toBeUndefined();
  });

  it('saves and loads, drops what no longer exists, and does not announce what it restores', () => {
    const { adv } = make();
    adv.start();
    adv.mined('stone');
    adv.addStat('glide', 12);
    adv.biome('forest');
    const saved = JSON.parse(JSON.stringify(adv.save()));
    saved.done['gone/forever'] = 5;
    saved.stats.bogus = Infinity;
    const again = new Advancements();
    let announced = 0;
    again.onUnlock = () => void announced++;
    again.load(saved);
    expect(announced).toBe(0);
    expect([...again.done.keys()].sort()).toEqual(['mining/root', 'surface/root']);
    expect(again.stats.glide).toBe(12);
    expect(again.stats.bogus).toBeUndefined();
    expect(again.biomes.has('forest')).toBe(true);
    again.load(null);
    expect(again.done.size).toBe(0);
    expect(again.progress().total).toBe(ADVANCEMENTS.length);
  });

  it('reports progress per category', () => {
    const { adv } = make();
    adv.start();
    expect(adv.progress('surface').done).toBe(1);
    expect(adv.progress('void')).toEqual({ done: 0, total: ADVANCEMENTS.filter((a) => a.category === 'void').length });
  });
});

describe('advancement screen order', () => {
  it('lists every goal of a category once, parents before children, indented by depth', () => {
    for (const c of ADV_CATEGORIES) {
      const rows = treeOrder(c.id);
      expect(rows.map((r) => r.a.id).sort()).toEqual(ADVANCEMENTS.filter((a) => a.category === c.id).map((a) => a.id).sort());
      const seen = new Set<string>();
      for (const { a, depth } of rows) {
        if (a.parent) {
          expect(seen.has(a.parent), `${a.id} after its parent`).toBe(true);
          expect(depth).toBe(rows.find((r) => r.a.id === a.parent)!.depth + 1);
        } else expect(depth).toBe(0);
        seen.add(a.id);
      }
    }
  });
});
