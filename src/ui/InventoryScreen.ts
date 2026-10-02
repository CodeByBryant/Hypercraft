// Inventory, crafting table, chest and furnace screens (plain DOM). Minecraft-style slot
// handling: left click picks up / places / swaps / merges, right click splits or places one,
// shift-click quick-moves, clicking outside the panel throws the held stack. A recipe book
// (search + "craftable only") fills the crafting grid; creative mode adds an all-items tab.

import { IREG } from '../content/itemRegistry';
import { REG } from '../content/registry';
import type { Game, ScreenRequest } from '../game/Game';
import { CRAFTING, type CompiledRecipe } from '../game/items/Crafting';
import { HOTBAR_SIZE, MAIN_END, ARMOR_START, OFFHAND } from '../game/items/Inventory';
import { SlotContainer, canMerge, insertInto, withCount, type Container, type ItemStack } from '../game/items/ItemStack';
import type { BrewingData, FurnaceData } from '../game/items/BlockEntities';
import { BREW_TIME, potionEffect } from '../content/potions';
import { EFFECT_BY_NAME, roman } from '../content/effects';
import { countIn } from '../game/items/ItemStack';
import { levelProgress, price, repFactor, soldOut } from '../game/Trading';
import { LEVEL_NAMES } from '../content/trades';
import { anvil, grindstone, describeEnchant } from '../content/enchanting';
import { ENCHANT_BY_NAME } from '../content/enchantments';
import { isEnchanted } from '../game/items/ItemStack';
import { ARMOR_SLOTS } from '../content/armor';

/** Station block each screen belongs to (the screen closes if it is broken). */
const SCREEN_BLOCK: Record<string, string> = { crafting: 'crafting_table', chest: 'chest', enchanting: 'enchanting_table', anvil: 'anvil', grindstone: 'grindstone' };

type SlotKind = 'normal' | 'result' | 'output' | 'creative';

interface SlotRef {
  c: Container | null;
  i: number;
  kind: SlotKind;
  el: HTMLDivElement;
  /** Creative palette item. */
  item?: number;
}

function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', parent?: HTMLElement, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  parent?.appendChild(e);
  return e;
}

export class InventoryScreen {
  readonly root: HTMLDivElement;
  private readonly game: Game;
  private req: ScreenRequest | null = null;
  private slots: SlotRef[] = [];
  private cursor: ItemStack | null = null;
  private readonly cursorEl: HTMLDivElement;
  private readonly cursorIcon: HTMLDivElement;
  private readonly cursorCount: HTMLSpanElement;
  private readonly tip: HTMLDivElement;
  private grid: SlotContainer | null = null;
  private gridSize = 0;
  /** Station inputs (enchanting table, anvil, grindstone): returned to you on close. */
  private work: SlotContainer | null = null;
  /** Anvil: the name typed (null = unchanged). */
  private anvilName: string | null = null;
  private container: Container | null = null;
  private furnace: FurnaceData | null = null;
  private brewing: BrewingData | null = null;
  private flameEl: HTMLDivElement | null = null;
  private progressEl: HTMLDivElement | null = null;
  private tab: 'inventory' | 'creative' = 'inventory';
  private search = '';
  private craftableOnly = false;
  private creativeSearch = '';
  private refreshTimer = 0;
  private lastInvVersion = -1;
  /** Touch: taps act as shift-clicks (move whole stacks between inventory and container). */
  private quickMoveMode = false;
  /** Small screens: the recipe book is a toggle instead of always shown. */
  private bookOpen = false;
  onClose: (() => void) | null = null;

  constructor(parent: HTMLElement, game: Game) {
    this.game = game;
    this.root = h('div', 'inv-screen', parent);
    this.cursorEl = h('div', 'inv-cursor', document.body);
    this.cursorIcon = h('div', 'icon', this.cursorEl);
    this.cursorCount = h('span', 'count', this.cursorEl);
    this.cursorEl.style.display = 'none';
    this.tip = h('div', 'inv-tip', document.body);
    window.addEventListener('pointermove', (e) => {
      this.cursorEl.style.left = `${e.clientX - 16}px`;
      this.cursorEl.style.top = `${e.clientY - 16}px`;
      this.tip.style.left = `${e.clientX + 14}px`;
      this.tip.style.top = `${e.clientY + 10}px`;
    });
    // Clicking the dim background (outside the panels) throws the held stack.
    this.root.addEventListener('pointerdown', (e) => {
      if (e.target !== this.root || !this.cursor) return;
      const n = e.button === 2 ? 1 : this.cursor.count;
      const out = withCount(this.cursor, n);
      this.cursor.count -= n;
      if (this.cursor.count <= 0) this.cursor = null;
      this.game.throwStack(out);
      this.render();
    });
    this.root.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', (e) => {
      if (!this.isOpen) return;
      if (e.code === 'Escape' || e.code === 'Tab' || e.code === 'KeyI') {
        e.preventDefault();
        this.close();
      } else if (/^Digit[1-9]$/.test(e.code) && this.hover) {
        this.swapWithHotbar(this.hover, Number(e.code.slice(5)) - 1);
      }
    });
  }

  get isOpen(): boolean {
    return this.req !== null;
  }

  private hover: SlotRef | null = null;

  /** When the screen opened: a tap that opened it must not also press something in it. */
  private openedAt = 0;

  private justOpened(): boolean {
    // Only touch has this problem (a tap's synthetic click); mouse clicks act at once.
    return this.game.touchMode && performance.now() - this.openedAt < 350;
  }

  open(req: ScreenRequest): void {
    this.req = req;
    this.openedAt = performance.now();
    this.tab = 'inventory';
    this.grid = null;
    this.gridSize = 0;
    this.container = null;
    this.furnace = null;
    this.brewing = null;
    this.work = null;
    this.anvilName = null;
    if (req.kind === 'inventory') {
      this.gridSize = 2;
      this.grid = new SlotContainer(4);
    } else if (req.kind === 'crafting') {
      this.gridSize = 3;
      this.grid = new SlotContainer(9);
    } else if (req.kind === 'enchanting' || req.kind === 'anvil' || req.kind === 'grindstone') {
      this.work = new WorkSlots(2, req.kind === 'enchanting' ? (i, st) => (i === 1 ? IREG.name(st.id) === 'azurite' : true) : null);
    } else if (req.kind !== 'trade') {
      const [x, y, z, w] = req.pos;
      this.container = this.game.blockEntities.container(x, y, z, w);
      if (req.kind === 'furnace') this.furnace = this.game.blockEntities.get(x, y, z, w) as FurnaceData;
      if (req.kind === 'brewing') this.brewing = this.game.blockEntities.get(x, y, z, w) as BrewingData;
    }
    this.root.classList.add('open');
    this.render();
  }

  close(): void {
    if (!this.req) return;
    const g = this.game;
    // Return the crafting grid and the cursor to the inventory (throw what does not fit).
    for (const c of [this.grid, this.work]) {
      if (!c) continue;
      for (let i = 0; i < c.size; i++) {
        const s = c.get(i);
        if (s && g.inv.add(s) > 0) g.throwStack(s);
      }
    }
    if (this.cursor && g.inv.add(this.cursor) > 0) g.throwStack(this.cursor);
    this.cursor = null;
    this.req = null;
    this.root.classList.remove('open');
    this.root.innerHTML = '';
    this.cursorEl.style.display = 'none';
    this.tip.style.display = 'none';
    this.onClose?.();
  }

  /** Per frame while open: close if the block went away, refresh furnace progress. */
  update(dt: number): void {
    if (!this.req) return;
    const r = this.req;
    if (r.kind === 'trade') {
      // The villager walked off (or died): close.
      const v = this.game.villager(r.mob);
      const e = this.game.eye();
      if (!v || Math.hypot(v.mob.pos[0]! - e[0]!, v.mob.pos[1]! + 1 - e[1]!, v.mob.pos[2]! - e[2]!, v.mob.pos[3]! - e[3]!) > 7) {
        this.close();
        return;
      }
    } else if (r.kind !== 'inventory') {
      const [x, y, z, w] = r.pos;
      const id = this.game.world.getBlock(x, y, z, w) & 0xfff;
      const name = REG.blocks[id]?.name ?? '';
      const ok = SCREEN_BLOCK[r.kind] ? name === SCREEN_BLOCK[r.kind] : r.kind === 'brewing' ? name === 'brewing_stand' : this.game.blockEntities.furnaceKind(id) !== null;
      const e = this.game.eye();
      const far = Math.hypot(x + 0.5 - e[0]!, y + 0.5 - e[1]!, z + 0.5 - e[2]!, w + 0.5 - e[3]!) > 9;
      if (!ok || far) {
        this.close();
        return;
      }
    }
    this.refreshTimer -= dt;
    if (this.game.inv.version !== this.lastInvVersion || ((this.furnace || this.brewing) && this.refreshTimer <= 0)) {
      this.refreshTimer = 0.15;
      this.render();
    }
  }

  // ---------------------------------------------------------------- rendering

  private render(): void {
    const g = this.game;
    this.lastInvVersion = g.inv.version;
    const req = this.req;
    if (!req) return;
    const scrollBook = this.root.querySelector('.book-list')?.scrollTop ?? 0;
    const scrollCreative = this.root.querySelector('.creative-list')?.scrollTop ?? 0;
    const focusSearch = document.activeElement?.classList.contains('book-search') ?? false;
    const focusCreative = document.activeElement?.classList.contains('creative-search') ?? false;
    this.root.innerHTML = '';
    this.slots = [];
    const panel = h('div', 'inv-panel', this.root);
    const small = window.innerWidth < 900 || window.innerHeight < 560;
    if (this.grid && (!small || this.bookOpen)) this.renderBook(panel, focusSearch);
    const main = h('div', 'inv-main', panel);
    // Header: close (every screen), recipe book toggle (small screens), quick move (touch).
    const bar = h('div', 'inv-bar', main);
    if (this.grid && small) {
      const b = h('button', `inv-tool${this.bookOpen ? ' on' : ''}`, bar, '📖 Recipes');
      b.addEventListener('click', () => {
        if (this.justOpened()) return;
        this.bookOpen = !this.bookOpen;
        this.render();
      });
    }
    if (g.touchMode) {
      const b = h('button', `inv-tool${this.quickMoveMode ? ' on' : ''}`, bar, '⇄ Quick move');
      b.title = 'Taps move whole stacks between your inventory and the other side';
      b.addEventListener('click', () => {
        if (this.justOpened()) return;
        this.quickMoveMode = !this.quickMoveMode;
        this.render();
      });
    }
    const close = h('button', 'inv-close', bar, '✕');
    close.title = 'Close (Esc)';
    close.addEventListener('click', () => {
      if (!this.justOpened()) this.close();
    });
    const creative = g.player.mode === 'creative' && req.kind === 'inventory';
    if (creative) {
      const tabs = h('div', 'inv-tabs', main);
      for (const t of ['inventory', 'creative'] as const) {
        const b = h('button', this.tab === t ? 'on' : '', tabs, t === 'inventory' ? 'Inventory' : 'All items');
        b.addEventListener('click', () => {
          this.tab = t;
          this.render();
        });
      }
    }
    if (creative && this.tab === 'creative') this.renderCreative(main, focusCreative);
    else if (req.kind === 'inventory') this.renderPlayerTop(main);
    else if (req.kind === 'crafting') this.renderCraftingGrid(main, 'Crafting Table');
    else if (req.kind === 'chest') this.renderChest(main);
    else if (req.kind === 'trade') this.renderTrade(main, req.mob);
    else if (req.kind === 'enchanting') this.renderEnchanting(main, req.pos);
    else if (req.kind === 'anvil') this.renderAnvil(main);
    else if (req.kind === 'grindstone') this.renderGrindstone(main);
    else if (req.kind === 'brewing') this.renderBrewing(main);
    else this.renderFurnace(main, req.furnace);
    h('div', 'inv-title', main, 'INVENTORY');
    const mainGrid = h('div', 'inv-grid', main);
    mainGrid.style.gridTemplateColumns = 'repeat(9, auto)';
    for (let i = HOTBAR_SIZE; i < MAIN_END; i++) this.slot(mainGrid, g.inv, i);
    const hot = h('div', 'inv-grid inv-hotbar', main);
    hot.style.gridTemplateColumns = 'repeat(9, auto)';
    hot.style.marginTop = '8px';
    for (let i = 0; i < HOTBAR_SIZE; i++) this.slot(hot, g.inv, i);
    h(
      'div',
      'inv-hint',
      main,
      g.touchMode
        ? 'Tap: take/place · Hold: split / place one · ⇄ Quick move: taps move stacks · tap outside: throw'
        : 'Click: take/place · Right-click: split/one · Shift-click: quick move · 1–9: to hotbar · click outside: throw',
    );
    const bl = this.root.querySelector('.book-list');
    if (bl) bl.scrollTop = scrollBook;
    const cl = this.root.querySelector('.creative-list');
    if (cl) cl.scrollTop = scrollCreative;
    this.renderCursor();
    this.fit(panel);
  }

  /** Scale the panel down so it always fits the screen (phones in landscape). */
  private fit(panel: HTMLElement): void {
    panel.style.transform = '';
    const r = panel.getBoundingClientRect();
    const k = Math.min(1, (window.innerWidth - 12) / Math.max(1, r.width), (window.innerHeight - 12) / Math.max(1, r.height));
    if (k < 0.995) panel.style.transform = `scale(${k.toFixed(3)})`;
  }

  private renderPlayerTop(main: HTMLElement): void {
    const g = this.game;
    const row = h('div', 'inv-row', main);
    const armor = h('div', 'inv-grid', row);
    armor.style.gridTemplateColumns = 'auto';
    for (let i = ARMOR_START; i < ARMOR_START + 4; i++) this.slot(armor, g.inv, i);
    const off = h('div', '', row);
    h('div', 'inv-title', off, 'OFF-HAND');
    this.slot(off, g.inv, OFFHAND);
    this.renderCraftingGrid(row, 'Crafting');
  }

  private renderCraftingGrid(parent: HTMLElement, title: string): void {
    const box = h('div', '', parent);
    h('div', 'inv-title', box, title.toUpperCase());
    const row = h('div', 'inv-row', box);
    const grid = h('div', 'inv-grid', row);
    grid.style.gridTemplateColumns = `repeat(${this.gridSize}, auto)`;
    for (let i = 0; i < this.gridSize * this.gridSize; i++) this.slot(grid, this.grid, i);
    h('div', 'inv-arrow', row, '⇒');
    const match = CRAFTING.match(this.gridStacks(), this.gridSize);
    const res = this.slot(row, null, 0, 'result');
    if (match) this.paint(res.el, { id: match.result, count: match.count, damage: 0 });
  }

  /**
   * Trading: the villager's offers (cost → result). Prices already include reputation and
   * demand; the original price is struck through when it differs. Tap / click an offer to
   * trade once (you need the cost in your inventory).
   */
  private renderTrade(main: HTMLElement, id: number): void {
    const g = this.game;
    const v = g.villager(id);
    if (!v) return;
    const d = v.data;
    const merchant = d.profession === 'merchant';
    h('div', 'inv-title', main, merchant ? v.mob.def.displayName.toUpperCase() : `${v.mob.def.displayName.toUpperCase()} · ${LEVEL_NAMES[d.level]!.toUpperCase()}`);
    if (!merchant) {
      const bar = h('div', 'trade-level', main);
      const fill = h('div', '', bar);
      fill.style.width = `${Math.round(levelProgress(d) * 100)}%`;
    }
    const k = repFactor(d.rep);
    const mood = h('div', 'trade-rep', main, d.rep === 0 ? 'Standing: neutral' : `Standing: ${d.rep > 0 ? '+' : ''}${d.rep} (prices ${k < 1 ? '−' : '+'}${Math.round(Math.abs(1 - k) * 100)}%)`);
    mood.classList.toggle('bad', d.rep < 0);
    const list = h('div', 'trade-list', main);
    d.offers.forEach((o, i) => {
      const out = soldOut(o);
      const prices = o.cost.map((_, c) => price(o, c, d.rep));
      const can = !out && (g.player.mode === 'creative' || o.cost.every(([n], c) => countIn(g.inv, IREG.id(n)) >= prices[c]!));
      const row = h('div', `trade-offer${out ? ' out' : can ? ' can' : ''}`, list);
      row.dataset.offer = String(i);
      o.cost.forEach(([n, base], c) => {
        const cell = h('div', 'trade-stack', row);
        const icon = h('div', 'icon', cell);
        g.icons.apply(icon, IREG.id(n), 32);
        const p = prices[c]!;
        if (p !== base) h('span', 'was', cell, String(base));
        h('span', 'count', cell, String(p));
        cell.title = IREG.displayName(IREG.id(n));
      });
      h('div', 'inv-arrow', row, out ? '✕' : '⇒');
      const res = h('div', 'trade-stack', row);
      g.icons.apply(h('div', 'icon', res), IREG.id(o.result[0]), 32);
      if (o.result[1] > 1) h('span', 'count', res, String(o.result[1]));
      const rs: ItemStack = { id: IREG.id(o.result[0]), count: o.result[1], damage: 0 };
      if (o.tag) {
        rs.tag = o.tag;
        res.classList.add('glint');
      }
      res.title = stackTip(rs);
      h('div', 'trade-uses', row, out ? 'Sold out' : `${o.maxUses - o.uses} left`);
      row.addEventListener('click', () => {
        if (this.justOpened()) return;
        if (g.trade(id, i)) this.render();
      });
    });
    h('div', 'inv-hint', main, merchant ? 'The merchant moves on after a day or so.' : 'Offers restock twice a day. Trading raises your standing (cheaper prices); hitting villagers lowers it.');
  }

  /** Enchanting table: item + azurite; three offers (level needed, a hint of what you get). */
  private renderEnchanting(main: HTMLElement, pos: [number, number, number, number]): void {
    const g = this.game;
    const shelves = g.shelvesAt(pos);
    h('div', 'inv-title', main, `ENCHANTING TABLE · ${shelves} BOOKSHELVES`);
    const row = h('div', 'inv-row', main);
    const col = h('div', '', row);
    col.style.display = 'flex';
    col.style.gap = '4px';
    const item = this.slot(col, this.work, 0);
    item.el.title = 'Item to enchant';
    const az = this.slot(col, this.work, 1);
    az.el.title = 'Azurite';
    if (!this.work!.get(1)) az.el.classList.add('hint-azurite');
    const list = h('div', 'ench-list', row);
    const offers = g.enchantOffersFor(this.work!.get(0), pos);
    const azCount = this.work!.get(1)?.count ?? 0;
    const creative = g.player.mode === 'creative';
    offers.forEach((o, i) => {
      const el = h('div', 'ench-offer', list);
      if (!o) {
        el.classList.add('empty');
        return;
      }
      const can = creative || (g.xp.level >= o.level && azCount >= o.cost);
      el.classList.toggle('can', can);
      h('span', 'ench-cost', el, `${'◆'.repeat(o.cost)}`);
      h('span', 'ench-hint', el, `${describeEnchant(o.ench[0]!)}${o.ench.length > 1 ? ' . . . ?' : ''}`);
      h('span', 'ench-level', el, String(o.level));
      el.title = `Needs level ${o.level}; costs ${o.cost} azurite and ${o.cost} level${o.cost > 1 ? 's' : ''}`;
      el.addEventListener('click', () => {
        if (this.justOpened() || !can) return;
        if (g.enchantWith(this.work!, i, pos)) this.render();
      });
    });
    h('div', 'inv-hint', main, `Your level: ${g.xp.level}. Bookshelves two blocks out (in x, z and w, with air between) give better offers, up to 15.`);
  }

  /** Anvil: combine, repair, rename. */
  private renderAnvil(main: HTMLElement): void {
    const g = this.game;
    h('div', 'inv-title', main, 'ANVIL');
    const name = h('input', 'anvil-name', main) as HTMLInputElement;
    const left = this.work!.get(0);
    name.placeholder = left ? IREG.displayName(left.id) : 'Name';
    name.value = this.anvilName ?? left?.tag?.name ?? '';
    name.maxLength = 40;
    name.addEventListener('input', () => {
      this.anvilName = name.value;
      this.renderAnvilResult();
    });
    name.addEventListener('keydown', (e) => e.stopPropagation());
    const row = h('div', 'inv-row', main);
    this.slot(row, this.work, 0);
    h('div', 'inv-arrow', row, '+');
    this.slot(row, this.work, 1);
    h('div', 'inv-arrow', row, '⇒');
    const res = this.slot(row, null, 0, 'result');
    res.el.classList.add('anvil-out');
    h('div', 'anvil-cost', main);
    this.renderAnvilResult();
    void g;
  }

  /** Refresh just the anvil's output and cost (typing a name must keep the input focused). */
  private renderAnvilResult(): void {
    const g = this.game;
    const res = this.root.querySelector('.anvil-out') as HTMLDivElement | null;
    const costEl = this.root.querySelector('.anvil-cost') as HTMLDivElement | null;
    if (!res || !costEl) return;
    res.querySelectorAll('.icon, .count, .dura').forEach((e) => e.remove());
    res.classList.remove('glint');
    const r = this.anvilJob();
    costEl.textContent = '';
    costEl.className = 'anvil-cost';
    if (!r) return;
    this.paint(res, r.out);
    const creative = g.player.mode === 'creative';
    if (!creative && r.cost >= 40) {
      costEl.textContent = 'Too Expensive!';
      costEl.classList.add('bad');
    } else {
      costEl.textContent = `Enchantment Cost: ${r.cost}`;
      if (!g.canPayLevels(r.cost)) costEl.classList.add('bad');
    }
  }

  private anvilJob(): ReturnType<typeof anvil> {
    const w = this.work;
    if (!w) return null;
    return anvil(w.get(0), w.get(1), this.anvilName);
  }

  /** Grindstone: strip enchantments (experience back), or merge two worn items. */
  private renderGrindstone(main: HTMLElement): void {
    h('div', 'inv-title', main, 'GRINDSTONE');
    const row = h('div', 'inv-row', main);
    const col = h('div', '', row);
    col.style.display = 'flex';
    col.style.flexDirection = 'column';
    col.style.gap = '4px';
    this.slot(col, this.work, 0);
    this.slot(col, this.work, 1);
    h('div', 'inv-arrow', row, '⇒');
    const res = this.slot(row, null, 0, 'result');
    const r = grindstone(this.work!.get(0), this.work!.get(1));
    if (r) this.paint(res.el, r.out);
    h('div', 'inv-hint', main, 'Removes enchantments (curses stay) and gives some experience back; two of the same item merge their durability.');
  }

  /** Brewing stand: ingredient on top, fuel on the left, three bottles below. */
  private renderBrewing(main: HTMLElement): void {
    h('div', 'inv-title', main, 'BREWING STAND');
    const box = h('div', 'brew-box', main);
    const top = h('div', 'inv-row', box);
    const fuel = this.slot(top, this.container, 4);
    fuel.el.title = 'Fuel: Cinder Powder';
    const ing = this.slot(top, this.container, 3);
    ing.el.title = 'Ingredient';
    const d = this.brewing;
    const prog = h('div', 'progress brew-progress', top);
    const fill = h('div', '', prog);
    fill.style.width = `${Math.round(d && d.brew > 0 ? (d.brew / BREW_TIME) * 100 : 0)}%`;
    const fuelBar = h('div', 'brew-fuel', box);
    const ff = h('div', '', fuelBar);
    ff.style.width = `${Math.round(((d?.fuel ?? 0) / 20) * 100)}%`;
    fuelBar.title = `${d?.fuel ?? 0} brews of fuel left`;
    const bottles = h('div', 'inv-row', box);
    for (let i = 0; i < 3; i++) this.slot(bottles, this.container, i).el.title = 'Bottle';
    h('div', 'inv-hint', main, 'Water bottle + Ember Wart = Awkward Potion; add an ingredient for an effect; Fluxite Dust makes it last, Emberglass Dust stronger, Sulfur a splash potion.');
  }

  private renderChest(main: HTMLElement): void {
    h('div', 'inv-title', main, 'CHEST');
    const grid = h('div', 'inv-grid', main);
    grid.style.gridTemplateColumns = 'repeat(9, auto)';
    for (let i = 0; i < 27; i++) this.slot(grid, this.container, i);
  }

  private renderFurnace(main: HTMLElement, kind: string): void {
    h('div', 'inv-title', main, kind.replace('_', ' ').toUpperCase());
    const row = h('div', 'inv-row', main);
    const col = h('div', '', row);
    col.style.display = 'flex';
    col.style.flexDirection = 'column';
    col.style.alignItems = 'center';
    col.style.gap = '4px';
    this.slot(col, this.container, 0);
    const flame = h('div', 'flame', col);
    this.flameEl = h('div', '', flame);
    this.slot(col, this.container, 1);
    const prog = h('div', 'progress', row);
    prog.style.width = '48px';
    this.progressEl = h('div', '', prog);
    this.slot(row, this.container, 2, 'output');
    const f = this.furnace;
    if (f) {
      this.flameEl.style.height = `${Math.round((f.burnMax > 0 ? Math.max(0, f.burn) / f.burnMax : 0) * 100)}%`;
      this.progressEl.style.width = `${Math.round((f.cookMax > 0 ? f.cook / f.cookMax : 0) * 100)}%`;
    }
  }

  private renderCreative(main: HTMLElement, focus: boolean): void {
    const bar = h('div', 'inv-row', main);
    const input = h('input', 'creative-search', bar) as HTMLInputElement;
    input.type = 'search';
    input.placeholder = 'Search items…';
    input.value = this.creativeSearch;
    input.addEventListener('input', () => {
      this.creativeSearch = input.value;
      this.render();
    });
    input.addEventListener('keydown', (e) => e.stopPropagation());
    const trash = this.slot(bar, null, 0, 'creative');
    trash.el.title = 'Drop an item here to delete it';
    trash.el.textContent = '🗑';
    trash.item = -1;
    const list = h('div', 'inv-grid creative-list', main);
    list.style.gridTemplateColumns = 'repeat(9, auto)';
    list.style.maxHeight = '176px';
    list.style.overflowY = 'auto';
    list.style.marginTop = '6px';
    const q = this.creativeSearch.trim().toLowerCase();
    for (let id = 0; id < IREG.count; id++) {
      if (q && !IREG.displayName(id).toLowerCase().includes(q) && !IREG.name(id).includes(q)) continue;
      const s = this.slot(list, null, 0, 'creative');
      s.item = id;
      this.paint(s.el, { id, count: 1, damage: 0 });
    }
    if (focus) input.focus();
  }

  private renderBook(panel: HTMLElement, focus: boolean): void {
    const book = h('div', 'inv-book', panel);
    h('div', 'inv-title', book, 'RECIPE BOOK');
    const input = h('input', 'book-search', book) as HTMLInputElement;
    input.type = 'search';
    input.placeholder = 'Search recipes…';
    input.value = this.search;
    input.addEventListener('input', () => {
      this.search = input.value;
      this.render();
    });
    input.addEventListener('keydown', (e) => e.stopPropagation());
    const lab = h('label', '', book);
    const cb = h('input', '', lab) as HTMLInputElement;
    cb.type = 'checkbox';
    cb.checked = this.craftableOnly;
    cb.addEventListener('change', () => {
      this.craftableOnly = cb.checked;
      this.render();
    });
    lab.append(' Craftable only');
    const list = h('div', 'book-list', book);
    const q = this.search.trim().toLowerCase();
    const seen = new Set<number>();
    for (const r of CRAFTING.recipes) {
      if (this.gridSize === 2 && !r.small) continue;
      if (seen.has(r.result) && !q) continue;
      if (q && !IREG.displayName(r.result).toLowerCase().includes(q)) continue;
      const can = this.canCraft(r);
      if (this.craftableOnly && !can) continue;
      seen.add(r.result);
      const el = h('div', `islot ${can ? 'craftable' : 'missing'}`, list);
      el.dataset.item = IREG.name(r.result);
      const icon = h('div', 'icon', el);
      this.game.icons.apply(icon, r.result, 32);
      if (r.count > 1) h('span', 'count', el, String(r.count));
      el.addEventListener('pointerenter', () => this.showTip(`${IREG.displayName(r.result)}${r.count > 1 ? ` ×${r.count}` : ''} — ${this.describe(r)}`));
      el.addEventListener('pointerleave', () => this.hideTip());
      el.addEventListener('click', () => {
        if (!this.justOpened()) this.fillRecipe(r);
      });
    }
    if (focus) input.focus();
  }

  private describe(r: CompiledRecipe): string {
    const ings = r.kind === 'shaped' ? r.cells.filter((c): c is string => c !== null) : r.ingredients;
    const counts = new Map<string, number>();
    for (const i of ings) counts.set(i, (counts.get(i) ?? 0) + 1);
    return [...counts].map(([k, n]) => `${n} ${k.startsWith('#') ? `any ${k.slice(1).replace('_', ' ')}` : IREG.displayName(IREG.id(k))}`).join(', ');
  }

  // ---------------------------------------------------------------- slots

  private slot(parent: HTMLElement, c: Container | null, i: number, kind: SlotKind = 'normal'): SlotRef {
    const el = h('div', `islot${kind === 'result' ? ' result' : ''}`, parent) as HTMLDivElement;
    el.dataset.slot = String(i);
    const ref: SlotRef = { c, i, kind, el };
    if (c && kind !== 'creative') {
      const s = c.get(i);
      if (s) this.paint(el, s);
      else if (c === this.game.inv && i >= ARMOR_START && i < OFFHAND) el.title = ['Helmet', 'Chestplate', 'Leggings', 'Boots'][i - ARMOR_START]!;
    }
    el.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      if (this.justOpened()) return;
      if (e.pointerType === 'touch') {
        // Touch: tap = click (on release), hold = right click. The release is watched on the
        // window: a refresh (furnace progress) may replace this element mid-tap.
        const id = e.pointerId;
        let held = false;
        const timer = window.setTimeout(() => {
          held = true;
          this.click(ref, true, false);
        }, 420);
        const done = (ev: PointerEvent) => {
          if (ev.pointerId !== id) return;
          window.removeEventListener('pointerup', done);
          window.removeEventListener('pointercancel', done);
          window.clearTimeout(timer);
          if (!held && ev.type === 'pointerup' && this.req) this.click(ref, false, this.quickMoveMode);
        };
        window.addEventListener('pointerup', done);
        window.addEventListener('pointercancel', done);
        return;
      }
      this.click(ref, e.button === 2, e.shiftKey);
    });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('pointerenter', () => {
      this.hover = ref;
      const s = ref.kind === 'creative' ? (ref.item !== undefined && ref.item >= 0 ? { id: ref.item, count: 1, damage: 0 } : null) : ref.kind === 'result' ? this.resultStack() : ref.c?.get(ref.i);
      if (s) this.showTip(stackTip(s));
    });
    el.addEventListener('pointerleave', () => {
      if (this.hover === ref) this.hover = null;
      this.hideTip();
    });
    this.slots.push(ref);
    return ref;
  }

  private paint(el: HTMLElement, s: ItemStack): void {
    const icon = h('div', 'icon', el);
    this.game.icons.apply(icon, s.id, 32);
    if (isEnchanted(s) || IREG.tags[s.id]!.has('glint')) el.classList.add('glint');
    if (s.count > 1) h('span', 'count', el, String(s.count));
    const max = IREG.durability[s.id]!;
    if (max > 0 && s.damage > 0) {
      const f = 1 - s.damage / max;
      const bar = h('div', 'dura', el);
      bar.style.width = `${Math.round(f * 30)}px`;
      bar.style.background = `hsl(${Math.round(f * 120)}, 90%, 50%)`;
    }
  }

  private renderCursor(): void {
    const c = this.cursor;
    this.cursorEl.style.display = c ? 'block' : 'none';
    if (!c) return;
    this.game.icons.apply(this.cursorIcon, c.id, 32);
    this.cursorCount.textContent = c.count > 1 ? String(c.count) : '';
  }

  private showTip(text: string): void {
    this.tip.textContent = text;
    this.tip.style.display = 'block';
  }

  private hideTip(): void {
    this.tip.style.display = 'none';
  }

  // ---------------------------------------------------------------- interaction

  private gridStacks(): (ItemStack | null)[] {
    const g = this.grid;
    if (!g) return [];
    const out: (ItemStack | null)[] = [];
    for (let i = 0; i < g.size; i++) out.push(g.get(i));
    return out;
  }

  private resultStack(): ItemStack | null {
    const k = this.req?.kind;
    if (k === 'anvil') return this.anvilJob()?.out ?? null;
    if (k === 'grindstone') return this.work ? (grindstone(this.work.get(0), this.work.get(1))?.out ?? null) : null;
    const m = this.grid ? CRAFTING.match(this.gridStacks(), this.gridSize) : null;
    return m ? { id: m.result, count: m.count, damage: 0 } : null;
  }

  /** Anvil and grindstone: take the output (paying levels / getting experience). */
  private takeStationResult(shift: boolean): void {
    const g = this.game;
    const w = this.work!;
    let out: ItemStack;
    if (this.req!.kind === 'anvil') {
      const r = this.anvilJob();
      if (!r || !g.payAnvil(r.cost)) return;
      out = r.out;
      w.set(0, null);
      const right = w.get(1);
      if (right && r.used > 0) {
        right.count -= r.used;
        w.set(1, right.count > 0 ? right : null);
      }
      this.anvilName = null;
    } else {
      const r = grindstone(w.get(0), w.get(1));
      if (!r) return;
      out = r.out;
      w.set(0, null);
      w.set(1, null);
      g.grindXp(r.xp);
    }
    if (shift || this.cursor) {
      if (g.inv.add(out) > 0) g.throwStack(out);
    } else this.cursor = out;
  }

  /** Consume one of each grid ingredient. */
  private consumeGrid(): void {
    const g = this.grid!;
    for (let i = 0; i < g.size; i++) {
      const s = g.get(i);
      if (!s) continue;
      s.count--;
      g.set(i, s.count > 0 ? s : null);
    }
  }

  private click(ref: SlotRef, right: boolean, shift: boolean): void {
    const g = this.game;
    if (ref.kind === 'creative') {
      if (ref.item === -1 || this.cursor) {
        this.cursor = null; // deleting / discarding the held stack
      } else if (ref.item !== undefined) {
        const st = { id: ref.item, count: shift ? IREG.maxStack[ref.item]! : right ? 1 : IREG.maxStack[ref.item]!, damage: 0 };
        if (shift) {
          g.inv.add(st);
        } else this.cursor = st;
      }
      this.render();
      return;
    }
    if (ref.kind === 'result') {
      this.takeResult(shift);
      this.render();
      return;
    }
    const c = ref.c!;
    const cur = c.get(ref.i);
    if (shift && cur) {
      this.quickMove(ref, cur);
      this.render();
      return;
    }
    if (ref.kind === 'output') {
      if (cur && (!this.cursor || (canMerge(this.cursor, cur) && this.cursor.count + cur.count <= IREG.maxStack[cur.id]!))) {
        if (this.cursor) this.cursor.count += cur.count;
        else this.cursor = cur;
        c.set(ref.i, null);
        c.taken?.(ref.i);
      }
      this.render();
      return;
    }
    const hand = this.cursor;
    if (!hand) {
      if (cur) {
        if (right) {
          const take = Math.ceil(cur.count / 2);
          this.cursor = withCount(cur, take);
          cur.count -= take;
          c.set(ref.i, cur.count > 0 ? cur : null);
        } else {
          this.cursor = cur;
          c.set(ref.i, null);
        }
      }
    } else if (c.accepts && !c.accepts(ref.i, hand)) {
      // not allowed here
    } else if (!cur) {
      if (right) {
        c.set(ref.i, withCount(hand, 1));
        hand.count--;
      } else {
        c.set(ref.i, hand);
        this.cursor = null;
      }
    } else if (canMerge(cur, hand)) {
      const max = IREG.maxStack[cur.id]!;
      const n = Math.min(right ? 1 : hand.count, max - cur.count);
      cur.count += n;
      hand.count -= n;
      c.set(ref.i, cur);
    } else {
      c.set(ref.i, hand);
      this.cursor = cur;
    }
    if (this.cursor && this.cursor.count <= 0) this.cursor = null;
    this.render();
  }

  private takeResult(shift: boolean): void {
    const g = this.game;
    if (this.req?.kind === 'anvil' || this.req?.kind === 'grindstone') {
      this.takeStationResult(shift);
      return;
    }
    let res = this.resultStack();
    if (!res) return;
    if (shift) {
      // Craft as many as possible straight into the inventory.
      for (let n = 0; n < 64 && res; n++) {
        const copy = withCount(res, res.count);
        if (g.inv.add(copy) > 0) {
          if (copy.count > 0) g.throwStack(copy);
          this.consumeGrid();
          break;
        }
        this.consumeGrid();
        res = this.resultStack();
      }
      return;
    }
    if (this.cursor) {
      if (!canMerge(this.cursor, res) || this.cursor.count + res.count > IREG.maxStack[res.id]!) return;
      this.cursor.count += res.count;
    } else this.cursor = res;
    this.consumeGrid();
  }

  private quickMove(ref: SlotRef, st: ItemStack): void {
    const g = this.game;
    const c = ref.c!;
    const fromPlayer = c === g.inv;
    const moving = withCount(st, st.count);
    if (fromPlayer) {
      if (this.container && this.req?.kind === 'brewing') {
        const n = IREG.name(st.id);
        if (IREG.tags[st.id]!.has('potion')) {
          for (let i = 0; i < 3 && moving.count > 0; i++)
            if (!this.container.get(i)) {
              this.container.set(i, withCount(moving, 1));
              moving.count--;
            }
        } else if (n === 'cinder_powder') insertInto(this.container, moving, 4, 5);
        else insertInto(this.container, moving, 3, 4);
      } else if (this.container && this.req?.kind === 'furnace') {
        const fuel = CRAFTING.fuel(st.id) > 0;
        const smeltable = CRAFTING.smelt(st.id, this.req.furnace) !== null;
        if (smeltable) insertInto(this.container, moving, 0, 1);
        else if (fuel) insertInto(this.container, moving, 1, 2);
      } else if (this.work) {
        if (this.req?.kind === 'enchanting' && IREG.name(st.id) === 'azurite') insertInto(this.work, moving, 1, 2);
        else if (!this.work.get(0)) {
          this.work.set(0, withCount(moving, this.req?.kind === 'enchanting' ? 1 : moving.count));
          moving.count -= this.req?.kind === 'enchanting' ? 1 : moving.count;
        } else if (this.req?.kind !== 'enchanting') insertInto(this.work, moving, 1, 2);
      } else if (this.container) insertInto(this.container, moving);
      else if (ref.i < MAIN_END && IREG.armorSlot[st.id]! >= 0 && insertIntoArmor(g.inv, moving, IREG.armorSlot[st.id]!)) {
        // Shift-click armour onto your body.
      } else if (ref.i < HOTBAR_SIZE) insertInto(g.inv, moving, HOTBAR_SIZE, MAIN_END);
      else insertInto(g.inv, moving, 0, HOTBAR_SIZE);
    } else {
      // Armour goes on when its slot is free.
      const as = IREG.armorSlot[st.id]!;
      if (fromPlayer || as < 0 || !insertIntoArmor(g.inv, moving, as)) insertInto(g.inv, moving, 0, MAIN_END);
    }
    if (ref.kind === 'output' && moving.count < st.count) c.taken?.(ref.i);
    c.set(ref.i, moving.count > 0 ? moving : null);
  }

  private swapWithHotbar(ref: SlotRef, hb: number): void {
    const g = this.game;
    if (!ref.c || ref.kind !== 'normal') return;
    const a = ref.c.get(ref.i);
    const b = g.inv.get(hb);
    if (a && ref.c.accepts && b && !ref.c.accepts(ref.i, b)) return;
    ref.c.set(ref.i, b);
    g.inv.set(hb, a);
    this.render();
  }

  /** Does the inventory (plus the grid) hold everything recipe `r` needs? */
  private canCraft(r: CompiledRecipe): boolean {
    const ings = r.kind === 'shaped' ? r.cells.filter((c): c is string => c !== null) : r.ingredients;
    const pool = new Map<number, number>();
    const add = (s: ItemStack | null) => {
      if (s) pool.set(s.id, (pool.get(s.id) ?? 0) + s.count);
    };
    for (let i = 0; i < MAIN_END; i++) add(this.game.inv.get(i));
    for (const s of this.gridStacks()) add(s);
    for (const ing of ings) {
      let found = -1;
      for (const [id, n] of pool) if (n > 0 && IREG.matches(id, ing)) found = id;
      if (found < 0) return false;
      pool.set(found, pool.get(found)! - 1);
    }
    return true;
  }

  /** Recipe book: move the ingredients for `r` from the inventory into the grid. */
  private fillRecipe(r: CompiledRecipe): void {
    const g = this.game;
    const grid = this.grid!;
    for (let i = 0; i < grid.size; i++) {
      const s = grid.get(i);
      if (s && g.inv.add(s) > 0) g.throwStack(s);
      grid.set(i, null);
    }
    if (!this.canCraft(r)) {
      this.render();
      return;
    }
    const n = this.gridSize;
    const place = (cell: number, ing: string) => {
      for (let i = 0; i < MAIN_END; i++) {
        const s = g.inv.get(i);
        if (!s || !IREG.matches(s.id, ing)) continue;
        const cur = grid.get(cell);
        if (cur && cur.id !== s.id) continue;
        s.count--;
        g.inv.set(i, s.count > 0 ? s : null);
        grid.set(cell, cur ? withCount(cur, cur.count + 1) : withCount(s, 1));
        return;
      }
    };
    if (r.kind === 'shaped') {
      for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) {
        const ing = r.cells[y * r.w + x];
        if (ing) place(y * n + x, ing);
      }
    } else r.ingredients.forEach((ing, k) => place(k, ing));
    this.render();
  }
}

/** Move `s` into its (empty) armour slot; true if it went on. */
function insertIntoArmor(inv: Container, s: ItemStack, slot: number): boolean {
  const i = ARMOR_START + slot;
  if (inv.get(i)) return false;
  inv.set(i, withCount(s, s.count));
  s.count = 0;
  return true;
}

/** Tooltip text for a stack: name (custom names quoted), enchantments, trim, durability. */
export function stackTip(s: ItemStack): string {
  const lines: string[] = [];
  const base = IREG.displayName(s.id);
  lines.push(s.tag?.name ? `“${s.tag.name}” (${base})` : base);
  for (const [n, l] of s.tag?.ench ?? []) {
    const e = ENCHANT_BY_NAME.get(n);
    lines.push(`  ${describeEnchant([n, l])}${e?.curse ? ' ☠' : ''}`);
  }
  if (s.tag?.trim) lines.push(`  Trim: ${s.tag.trim[0].replace(/_/g, ' ')} (${IREG.has(s.tag.trim[1]) ? IREG.displayName(IREG.id(s.tag.trim[1])) : s.tag.trim[1]})`);
  const a = IREG.armor[s.id];
  if (a && a.points > 0) lines.push(`  +${a.points} armour${a.toughness ? `, +${a.toughness} toughness` : ''} (${ARMOR_SLOTS.indexOf(a.slot) >= 0 ? a.slot : ''})`);
  const f = IREG.food[s.id];
  if (f && f.nutrition > 0) lines.push(`  Food ${f.nutrition}, saturation ${f.saturation}`);
  const pe = potionEffect(IREG.name(s.id));
  if (pe) {
    const def = EFFECT_BY_NAME.get(pe[0]);
    const t = Math.round(pe[1]);
    lines.push(`  ${def?.displayName ?? pe[0]}${pe[2] > 0 ? ' ' + roman(pe[2] + 1) : ''}${def?.instant ? '' : ` (${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')})`}`);
  }
  const max = IREG.durability[s.id]!;
  if (max > 0) lines.push(`  Durability ${max - s.damage}/${max}`);
  return lines.join('\n');
}

/** Station input slots with an optional filter (the enchanting table's azurite slot). */
class WorkSlots extends SlotContainer {
  constructor(
    size: number,
    private readonly filter: ((i: number, s: ItemStack) => boolean) | null,
  ) {
    super(size);
  }

  accepts(i: number, s: ItemStack): boolean {
    return this.filter ? this.filter(i, s) : true;
  }
}
