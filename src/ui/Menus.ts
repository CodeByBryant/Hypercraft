// DOM menus: title, world list, create world (seeds), settings, pause.

import type { Settings } from '../game/Settings';
import { saveSettings } from '../game/Settings';
import { SEED_IDEAS, newWorldId, randomSeedText, seedFromText, SAVE_VERSION, type Difficulty, type SavedGameMode, type WorldInfo } from '../save/WorldInfo';
import type { WorldStore } from '../save/WorldStore';

type Child = Node | string | null | undefined | false;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string | boolean | ((e: Event) => void)> = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (typeof v === 'function') e.addEventListener(k.replace(/^on/, ''), v as EventListener);
    else if (typeof v === 'boolean') {
      if (v) e.setAttribute(k, '');
    } else if (k === 'class') e.className = v;
    else e.setAttribute(k, v);
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) e.append(c);
  return e;
}

function timeAgo(t: number): string {
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(t).toLocaleDateString();
}

export interface TitleDeps {
  store: WorldStore | null;
  settings: Settings;
  play(id: string): void;
  onSettings(s: Settings): void;
}

export class Menus {
  readonly root: HTMLDivElement;
  private card!: HTMLDivElement;

  constructor(parent: HTMLElement) {
    this.root = h('div', { class: 'menu-screen' });
    parent.appendChild(this.root);
  }

  private show(...children: Child[]): HTMLDivElement {
    this.root.innerHTML = '';
    this.root.style.display = 'flex';
    this.card = h('div', { class: 'menu-card' }, ...children);
    this.root.appendChild(this.card);
    return this.card;
  }

  hide(): void {
    this.root.style.display = 'none';
    this.root.innerHTML = '';
  }

  // ---------------------------------------------------------------- title

  title(d: TitleDeps): void {
    this.show(
      h('h1', { class: 'logo' }, 'HYPERCRAFT'),
      h('p', { class: 'sub' }, 'A 4D voxel sandbox — you see one 3D slice of a four-dimensional world.'),
      h('div', { class: 'col' },
        h('button', { class: 'primary', onclick: () => this.worlds(d) }, 'Singleplayer'),
        h('button', { onclick: () => this.settings(d.settings, d.onSettings, () => this.title(d)) }, 'Settings'),
        h('button', { onclick: () => this.help(() => this.title(d)) }, 'How to play'),
        h('button', { disabled: true, title: 'Coming in Phase 13' }, 'Multiplayer'),
      ),
      d.store ? null : h('p', { class: 'warn' }, 'Saving is unavailable in this browser (no IndexedDB); worlds will not persist.'),
    );
  }

  help(back: () => void): void {
    this.show(
      h('h2', {}, 'How to play'),
      h('div', { class: 'help' },
        h('p', {}, 'The world has four spatial axes: X, Y (up), Z and W. Your screen shows a 3D cross-section. The axis you cannot see is the hidden axis h; the compass bottom-right shows it.'),
        h('p', {}, h('b', {}, 'WASD'), ' move · ', h('b', {}, 'Arrow keys / mouse'), ' look · ', h('b', {}, 'Q / E'), ' move kata / ana (along h) · ', h('b', {}, 'Space'), ' jump (double-tap: fly in creative)'),
        h('p', {}, h('b', {}, 'Z / X'), ' and ', h('b', {}, 'F / V'), ' rotate the slice through the 4th dimension · ', h('b', {}, 'Alt + mouse'), ' free slice rotation · ', h('b', {}, 'C'), ' snap back to an axis-aligned slice'),
        h('p', {}, h('b', {}, 'Left click'), ' mine (hold in survival) / attack · ', h('b', {}, 'Right click'), ' place, use, open crafting tables, chests and furnaces (Mac: two-finger click, or Ctrl/Cmd + click) · ', h('b', {}, 'Tab / I'), ' inventory and recipe book · ', h('b', {}, 'B'), ' drop item'),
        h('p', {}, 'Survival worlds start with an empty inventory: mine blocks (they drop as items you pick up), craft planks and a crafting table, then tools.'),
        h('p', {}, 'Mobs are 4D too: a mob beside your slice is invisible. Hostiles that are kata or ana of you make that screen edge pulse violet, show up as red dots on the radar, and are named above the hotbar. Swords hit hardest; a full-strength swing while falling is a critical hit. Hold right click to draw a bow.'),
        h('p', {}, 'Tilted slices cut cubes into prisms. Press ', h('b', {}, 'P'), ' to see every cross-section edge coloured by axis, ', h('b', {}, 'F3'), ' for debug info.'),
        h('p', {}, h('b', {}, 'Touch:'), ' left thumb = move stick (push to the rim to sprint) · right side: drag = look, tap = hit the mob or use / place on the block you tapped, hold = mine under your finger · Hit / Use buttons act at the crosshair (hold Use to draw a bow) · tap the hotbar to switch items · two-finger twist / drag = rotate the slice · ✕ closes the inventory, crafting and chest screens (Quick move = tap moves whole stacks, hold a slot = split).'),
      ),
      h('button', { onclick: back }, 'Back'),
    );
  }

  // ---------------------------------------------------------------- worlds

  async worlds(d: TitleDeps): Promise<void> {
    const list = h('div', { class: 'world-list' }, h('p', { class: 'dim' }, 'Loading…'));
    const fileInput = h('input', { type: 'file', accept: '.hcworld,application/octet-stream', style: 'display:none' }) as HTMLInputElement;
    this.show(
      h('h2', {}, 'Worlds'),
      list,
      h('div', { class: 'row' },
        h('button', { class: 'primary', onclick: () => this.create(d) }, 'Create new world'),
        h('button', { disabled: !d.store, onclick: () => fileInput.click() }, 'Import…'),
        h('button', { onclick: () => this.title(d) }, 'Back'),
      ),
      fileInput,
    );
    fileInput.addEventListener('change', async () => {
      const f = fileInput.files?.[0];
      if (!f || !d.store) return;
      try {
        await d.store.importWorld(f, newWorldId());
        void this.worlds(d);
      } catch (err) {
        alert(`Import failed: ${String(err)}`);
      }
    });
    const worlds = d.store ? await d.store.listWorlds() : [];
    list.innerHTML = '';
    if (!worlds.length) list.append(h('p', { class: 'dim' }, 'No worlds yet. Create one!'));
    for (const w of worlds) {
      list.append(
        h('div', { class: 'world' },
          h('div', { class: 'world-main', onclick: () => d.play(w.id) },
            h('div', { class: 'world-name' }, w.name),
            h('div', { class: 'world-meta' }, `Seed ${w.seedText || w.seed} · ${w.mode}${w.hardcore ? ' · hardcore' : ''} · ${w.difficulty} · ${timeAgo(w.lastPlayed)}`),
          ),
          h('button', { class: 'small primary', onclick: () => d.play(w.id) }, 'Play'),
          h('button', {
            class: 'small',
            onclick: async () => {
              const blob = await d.store!.exportWorld(w.id);
              const a = h('a', { href: URL.createObjectURL(blob), download: `${w.name.replace(/[^\w-]+/g, '_')}.hcworld` });
              a.click();
              setTimeout(() => URL.revokeObjectURL(a.href), 5000);
            },
          }, 'Export'),
          h('button', {
            class: 'small danger',
            onclick: async () => {
              if (!confirm(`Delete "${w.name}" forever?`)) return;
              await d.store!.deleteWorld(w.id);
              void this.worlds(d);
            },
          }, 'Delete'),
        ),
      );
    }
  }

  create(d: TitleDeps): void {
    const name = h('input', { type: 'text', value: 'New World', maxlength: '40' }) as HTMLInputElement;
    const seed = h('input', { type: 'text', placeholder: 'empty = random', maxlength: '64' }) as HTMLInputElement;
    const mode = h('select', {},
      h('option', { value: 'survival' }, 'Survival'),
      h('option', { value: 'creative' }, 'Creative'),
      h('option', { value: 'adventure' }, 'Adventure'),
      h('option', { value: 'spectator' }, 'Spectator'),
    ) as HTMLSelectElement;
    const diff = h('select', {},
      h('option', { value: 'peaceful' }, 'Peaceful'),
      h('option', { value: 'easy' }, 'Easy'),
      h('option', { value: 'normal', selected: true }, 'Normal'),
      h('option', { value: 'hard' }, 'Hard'),
    ) as HTMLSelectElement;
    const hardcore = h('input', { type: 'checkbox' }) as HTMLInputElement;
    const cheats = h('input', { type: 'checkbox', checked: true }) as HTMLInputElement;
    const preview = h('span', { class: 'dim' });
    const updatePreview = () => {
      const t = seed.value.trim();
      preview.textContent = t ? `→ seed number ${seedFromText(t)}` : '→ a random seed will be picked';
    };
    seed.addEventListener('input', updatePreview);
    updatePreview();
    const ideas = h('div', { class: 'chips' },
      ...SEED_IDEAS.map((i) =>
        h('button', {
          class: 'chip',
          title: i.note,
          onclick: () => {
            seed.value = i.seed;
            updatePreview();
          },
        }, i.seed),
      ),
    );
    this.show(
      h('h2', {}, 'Create world'),
      h('label', {}, 'World name', name),
      h('label', {}, 'Seed',
        h('div', { class: 'row tight' },
          seed,
          h('button', {
            class: 'small',
            title: 'Random seed',
            onclick: () => {
              seed.value = randomSeedText();
              updatePreview();
            },
          }, '🎲 Random'),
        ),
        preview,
      ),
      h('div', { class: 'label' }, 'Seed ideas', ideas),
      h('div', { class: 'row' }, h('label', {}, 'Game mode', mode), h('label', {}, 'Difficulty', diff)),
      h('div', { class: 'row' }, h('label', { class: 'check' }, hardcore, 'Hardcore (one life)'), h('label', { class: 'check' }, cheats, 'Allow cheats (G/T/Y keys)')),
      h('div', { class: 'row' },
        h('button', {
          class: 'primary',
          onclick: async () => {
            const text = seed.value.trim() || randomSeedText();
            const info: WorldInfo = {
              id: newWorldId(),
              name: name.value.trim() || 'New World',
              seedText: text,
              seed: seedFromText(text),
              mode: (hardcore.checked ? 'survival' : mode.value) as SavedGameMode,
              difficulty: (hardcore.checked ? 'hard' : diff.value) as Difficulty,
              hardcore: hardcore.checked,
              cheats: cheats.checked && !hardcore.checked,
              created: Date.now(),
              lastPlayed: Date.now(),
              version: SAVE_VERSION,
              palette: [],
            };
            if (d.store) await d.store.putWorld(info);
            else sessionStorage.setItem('hypercraft.ephemeral', JSON.stringify(info));
            d.play(info.id);
          },
        }, 'Create world'),
        h('button', { onclick: () => void this.worlds(d) }, 'Cancel'),
      ),
    );
  }

  // ---------------------------------------------------------------- settings

  settings(s: Settings, onChange: (s: Settings) => void, back: () => void): void {
    const row = (label: string, input: HTMLElement, value?: HTMLElement) => h('label', { class: 'setting' }, h('span', {}, label), input, value ?? null);
    const range = (key: keyof Settings, min: number, max: number, step: number, fmt: (v: number) => string) => {
      const out = h('span', { class: 'val' }, fmt(s[key] as number));
      const inp = h('input', { type: 'range', min: String(min), max: String(max), step: String(step), value: String(s[key]) }) as HTMLInputElement;
      inp.addEventListener('input', () => {
        (s as unknown as Record<string, number>)[key] = Number(inp.value);
        out.textContent = fmt(Number(inp.value));
        saveSettings(s);
        onChange(s);
      });
      return row(labelOf(key), inp, out);
    };
    const toggle = (key: keyof Settings) => {
      const inp = h('input', { type: 'checkbox', checked: Boolean(s[key]) }) as HTMLInputElement;
      inp.addEventListener('change', () => {
        (s as unknown as Record<string, boolean>)[key] = inp.checked;
        saveSettings(s);
        onChange(s);
      });
      return row(labelOf(key), inp);
    };
    const select = (key: keyof Settings, options: [string, string][]) => {
      const sel = h('select', {}, ...options.map(([v, l]) => h('option', { value: v, selected: String(s[key]) === v }, l))) as HTMLSelectElement;
      sel.addEventListener('change', () => {
        const v = sel.value;
        (s as unknown as Record<string, unknown>)[key] = /^\d+$/.test(v) ? Number(v) : v;
        saveSettings(s);
        onChange(s);
      });
      return row(labelOf(key), sel);
    };
    this.show(
      h('h2', {}, 'Settings'),
      h('div', { class: 'settings' },
        range('fov', 50, 110, 1, (v) => `${v}°`),
        range('sensitivity', 0.2, 3, 0.05, (v) => v.toFixed(2)),
        range('renderDistance', 2, 8, 1, (v) => `${v} chunks`),
        select('resolution', [['auto', 'Auto (adaptive)'], ['270', '270p'], ['360', '360p'], ['480', '480p'], ['540', '540p'], ['720', '720p'], ['1080', '1080p']]),
        range('outline', 0, 1, 0.05, (v) => v.toFixed(2)),
        range('vignette', 0, 1, 0.05, (v) => v.toFixed(2)),
        toggle('pixelated'),
        toggle('invertY'),
        select('particles', [['all', 'All'], ['reduced', 'Reduced'], ['off', 'Off']]),
        select('touch', [['auto', 'Auto'], ['on', 'On'], ['off', 'Off']]),
      ),
      h('button', { class: 'primary', onclick: back }, 'Done'),
    );
  }

  // ---------------------------------------------------------------- pause

  /** Death screen: the cause, then respawn (or spectate, in hardcore) or quit. */
  death(opts: { cause: string; hardcore: boolean; respawn(): void; quit(): void }): void {
    this.show(
      h('h2', { class: 'death-title' }, opts.hardcore ? 'Game over!' : 'You died!'),
      h('p', { class: 'dim' }, opts.cause),
      opts.hardcore ? h('p', { class: 'dim' }, 'Hardcore: this world continues in spectator mode.') : null,
      h('div', { class: 'col' },
        h('button', { class: 'primary', onclick: opts.respawn }, opts.hardcore ? 'Spectate world' : 'Respawn'),
        h('button', { onclick: opts.quit }, 'Save & quit to title'),
      ),
    );
    this.card.classList.add('death');
  }

  pause(opts: { worldName: string; seedText: string; resume(): void; settings(): void; quit(): void; saveStatus(): string }): void {
    const status = h('p', { class: 'dim' }, opts.saveStatus());
    this.show(
      h('h2', {}, 'Paused'),
      h('p', { class: 'dim' }, `${opts.worldName} · seed ${opts.seedText}`),
      h('div', { class: 'col' },
        h('button', { class: 'primary', onclick: opts.resume }, 'Resume'),
        h('button', { onclick: opts.settings }, 'Settings'),
        h('button', { onclick: () => this.help(() => this.pause(opts)) }, 'How to play'),
        h('button', { onclick: opts.quit }, 'Save & quit to title'),
      ),
      status,
    );
  }
}

const LABELS: Partial<Record<keyof Settings, string>> = {
  fov: 'Field of view',
  sensitivity: 'Look sensitivity',
  renderDistance: 'Render distance',
  resolution: 'Internal resolution',
  outline: 'Block outlines',
  vignette: 'Vignette',
  pixelated: 'Pixelated upscaling',
  invertY: 'Invert mouse Y',
  touch: 'Touch controls',
  particles: 'Particles',
};

function labelOf(k: keyof Settings): string {
  return LABELS[k] ?? String(k);
}
