// The advancements screen (key L): a tab per category, each a tree of goals with icon, title,
// description and a tick when done; locked goals (parent not done yet) are dimmed. Plain DOM,
// like the inventory screens: the world keeps running behind it and player input stops.

import { IREG } from '../content/itemRegistry';
import { ADVANCEMENTS, ADV_BY_ID, ADV_CATEGORIES, type AdvCategory, type AdvancementDef } from '../content/advancements';
import type { Game } from '../game/Game';

function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', parent?: HTMLElement, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  parent?.appendChild(e);
  return e;
}

/** Goals of a category in tree order (a parent before its children, children by list order), with their depth. */
export function treeOrder(category: AdvCategory, defs: AdvancementDef[] = ADVANCEMENTS): { a: AdvancementDef; depth: number }[] {
  const inCat = defs.filter((a) => a.category === category);
  const kids = new Map<string, AdvancementDef[]>();
  for (const a of inCat) if (a.parent) (kids.get(a.parent) ?? kids.set(a.parent, []).get(a.parent)!).push(a);
  const out: { a: AdvancementDef; depth: number }[] = [];
  const walk = (a: AdvancementDef, depth: number) => {
    out.push({ a, depth });
    for (const c of kids.get(a.id) ?? []) walk(c, depth + 1);
  };
  for (const a of inCat) if (!a.parent || !ADV_BY_ID.has(a.parent)) walk(a, 0);
  return out;
}

export class AdvancementsScreen {
  readonly root: HTMLDivElement;
  private readonly tabs: HTMLDivElement;
  private readonly list: HTMLDivElement;
  private readonly title: HTMLDivElement;
  private tab: AdvCategory = 'surface';
  /** Called when the screen closes (main.ts gives input back). */
  onClose: (() => void) | null = null;
  private open_ = false;

  constructor(parent: HTMLElement, private readonly game: Game) {
    this.root = h('div', 'adv-screen', parent);
    const panel = h('div', 'adv-panel', this.root);
    const head = h('div', 'adv-head', panel);
    this.title = h('div', 'adv-title', head);
    const close = h('button', 'adv-close', head, '×');
    close.addEventListener('click', () => this.close());
    this.tabs = h('div', 'adv-tabs', panel);
    this.list = h('div', 'adv-list', panel);
    this.root.addEventListener('pointerdown', (e) => {
      if (e.target === this.root) this.close();
    });
    window.addEventListener('keydown', (e) => {
      if (!this.open_) return;
      if (e.code === 'Escape' || e.code === 'KeyL') {
        e.preventDefault();
        this.close();
      }
    });
  }

  get isOpen(): boolean {
    return this.open_;
  }

  open(): void {
    this.open_ = true;
    this.root.classList.add('open');
    this.render();
  }

  close(): void {
    if (!this.open_) return;
    this.open_ = false;
    this.root.classList.remove('open');
    this.onClose?.();
  }

  /** Switch tab (tests and the touch UI). */
  select(category: AdvCategory): void {
    this.tab = category;
    if (this.open_) this.render();
  }

  private render(): void {
    const adv = this.game.adv;
    const all = adv.progress();
    this.title.textContent = `Advancements · ${all.done} / ${all.total}`;
    this.tabs.replaceChildren();
    for (const c of ADV_CATEGORIES) {
      const pr = adv.progress(c.id);
      const b = h('button', `adv-tab${c.id === this.tab ? ' on' : ''}${pr.done === pr.total ? ' full' : ''}`, this.tabs);
      const ic = h('div', 'adv-tab-icon', b);
      if (IREG.has(c.icon)) this.game.icons.apply(ic, IREG.id(c.icon), 24);
      h('span', '', b, `${c.name} ${pr.done}/${pr.total}`);
      b.title = c.blurb;
      b.addEventListener('click', () => this.select(c.id));
    }
    this.list.replaceChildren();
    for (const { a, depth } of treeOrder(this.tab)) {
      const done = adv.has(a.id);
      const locked = !done && a.parent !== undefined && !adv.has(a.parent);
      const row = h('div', `adv-row${done ? ' done' : ''}${locked ? ' locked' : ''}`, this.list);
      row.style.marginLeft = `${depth * 22}px`;
      const icon = h('div', 'adv-icon', row);
      if (IREG.has(a.icon)) this.game.icons.apply(icon, IREG.id(a.icon), 32);
      const text = h('div', 'adv-text', row);
      h('div', 'adv-name', text, a.title);
      h('div', 'adv-desc', text, a.description);
      h('div', 'adv-mark', row, done ? '✓' : a.xp > 0 ? `${a.xp} xp` : '');
    }
  }
}
