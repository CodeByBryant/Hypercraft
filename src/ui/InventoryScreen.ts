// Inventory, crafting table, chest and furnace screens (plain DOM). Minecraft-style slot
// handling: left click picks up / places / swaps / merges, right click splits or places one,
// shift-click quick-moves, clicking outside the panel throws the held stack. A recipe book
// (search + "craftable only") fills the crafting grid; creative mode adds an all-items tab.

import { IREG } from '../content/itemRegistry';
import { REG } from '../content/registry';
import type { Game, ScreenRequest } from '../game/Game';
import { CRAFTING, type CompiledRecipe } from '../game/items/Crafting';
import { HOTBAR_SIZE, MAIN_END, ARMOR_START, OFFHAND } from '../game/items/Inventory';
import { SlotContainer, canMerge, insertInto, type Container, type ItemStack } from '../game/items/ItemStack';
import type { FurnaceData } from '../game/items/BlockEntities';

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
  private container: Container | null = null;
  private furnace: FurnaceData | null = null;
  private flameEl: HTMLDivElement | null = null;
  private progressEl: HTMLDivElement | null = null;
  private tab: 'inventory' | 'creative' = 'inventory';
  private search = '';
  private craftableOnly = false;
  private creativeSearch = '';
  private refreshTimer = 0;
  private lastInvVersion = -1;
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
      const out = { ...this.cursor, count: n };
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

  open(req: ScreenRequest): void {
    this.req = req;
    this.tab = 'inventory';
    this.grid = null;
    this.gridSize = 0;
    this.container = null;
    this.furnace = null;
    if (req.kind === 'inventory') {
      this.gridSize = 2;
      this.grid = new SlotContainer(4);
    } else if (req.kind === 'crafting') {
      this.gridSize = 3;
      this.grid = new SlotContainer(9);
    } else {
      const [x, y, z, w] = req.pos;
      this.container = this.game.blockEntities.container(x, y, z, w);
      if (req.kind === 'furnace') this.furnace = this.game.blockEntities.get(x, y, z, w) as FurnaceData;
    }
    this.root.classList.add('open');
    this.render();
  }

  close(): void {
    if (!this.req) return;
    const g = this.game;
    // Return the crafting grid and the cursor to the inventory (throw what does not fit).
    if (this.grid) {
      for (let i = 0; i < this.grid.size; i++) {
        const s = this.grid.get(i);
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
    if (r.kind !== 'inventory') {
      const [x, y, z, w] = r.pos;
      const id = this.game.world.getBlock(x, y, z, w) & 0xfff;
      const name = REG.blocks[id]?.name ?? '';
      const ok = r.kind === 'crafting' ? name === 'crafting_table' : r.kind === 'chest' ? name === 'chest' : this.game.blockEntities.furnaceKind(id) !== null;
      const e = this.game.eye();
      const far = Math.hypot(x + 0.5 - e[0]!, y + 0.5 - e[1]!, z + 0.5 - e[2]!, w + 0.5 - e[3]!) > 9;
      if (!ok || far) {
        this.close();
        return;
      }
    }
    this.refreshTimer -= dt;
    if (this.game.inv.version !== this.lastInvVersion || (this.furnace && this.refreshTimer <= 0)) {
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
    if (this.grid) this.renderBook(panel, focusSearch);
    const main = h('div', 'inv-main', panel);
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
    else this.renderFurnace(main, req.furnace);
    h('div', 'inv-title', main, 'INVENTORY');
    const mainGrid = h('div', 'inv-grid', main);
    mainGrid.style.gridTemplateColumns = 'repeat(9, auto)';
    for (let i = HOTBAR_SIZE; i < MAIN_END; i++) this.slot(mainGrid, g.inv, i);
    const hot = h('div', 'inv-grid', main);
    hot.style.gridTemplateColumns = 'repeat(9, auto)';
    hot.style.marginTop = '8px';
    for (let i = 0; i < HOTBAR_SIZE; i++) this.slot(hot, g.inv, i);
    h('div', 'inv-hint', main, 'Click: take/place · Right-click: split/one · Shift-click: quick move · 1–9: to hotbar · click outside: throw');
    const bl = this.root.querySelector('.book-list');
    if (bl) bl.scrollTop = scrollBook;
    const cl = this.root.querySelector('.creative-list');
    if (cl) cl.scrollTop = scrollCreative;
    this.renderCursor();
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
      el.addEventListener('click', () => this.fillRecipe(r));
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
      this.click(ref, e.button === 2, e.shiftKey);
    });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('pointerenter', () => {
      this.hover = ref;
      const s = ref.kind === 'creative' ? (ref.item !== undefined && ref.item >= 0 ? { id: ref.item, count: 1, damage: 0 } : null) : ref.kind === 'result' ? this.resultStack() : ref.c?.get(ref.i);
      if (s) {
        const max = IREG.durability[s.id]!;
        this.showTip(`${IREG.displayName(s.id)}${max > 0 ? `  (${max - s.damage}/${max})` : ''}`);
      }
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
    const m = this.grid ? CRAFTING.match(this.gridStacks(), this.gridSize) : null;
    return m ? { id: m.result, count: m.count, damage: 0 } : null;
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
      }
      this.render();
      return;
    }
    const hand = this.cursor;
    if (!hand) {
      if (cur) {
        if (right) {
          const take = Math.ceil(cur.count / 2);
          this.cursor = { id: cur.id, count: take, damage: cur.damage };
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
        c.set(ref.i, { id: hand.id, count: 1, damage: hand.damage });
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
    let res = this.resultStack();
    if (!res) return;
    if (shift) {
      // Craft as many as possible straight into the inventory.
      for (let n = 0; n < 64 && res; n++) {
        const copy = { ...res };
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
    const moving = { ...st };
    if (fromPlayer) {
      if (this.container && this.req?.kind === 'furnace') {
        const fuel = CRAFTING.fuel(st.id) > 0;
        const smeltable = CRAFTING.smelt(st.id, this.req.furnace) !== null;
        if (smeltable) insertInto(this.container, moving, 0, 1);
        else if (fuel) insertInto(this.container, moving, 1, 2);
      } else if (this.container) insertInto(this.container, moving);
      else if (ref.i < HOTBAR_SIZE) insertInto(g.inv, moving, HOTBAR_SIZE, MAIN_END);
      else insertInto(g.inv, moving, 0, HOTBAR_SIZE);
    } else {
      insertInto(g.inv, moving, 0, MAIN_END);
    }
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
        grid.set(cell, cur ? { ...cur, count: cur.count + 1 } : { id: s.id, count: 1, damage: s.damage });
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
