// DOM HUD: crosshair, hotbar, hidden-axis compass + radar (R2 fairness), F3 debug overlay,
// toasts, loading and pause screens. Updated at a throttled rate; hidden panels cost nothing.

import { REG, hexToRgb, voxelId, FLUID_LAVA, FLUID_WATER } from '../content/registry';
import { TICKS_PER_DAY } from '../env/Environment';
import type { Game } from '../game/Game';
import { IREG } from '../content/itemRegistry';
import { HOTBAR_SIZE, OFFHAND } from '../game/items/Inventory';
import { TRIM_MATERIALS } from '../content/smithing';
import { VOID_VOXEL } from '../world/constants';
import { MAX_AIR, MAX_HEALTH } from '../game/Vitals';
import { MAX_FOOD } from '../game/Survival';
import { EFFECT_BY_NAME, roman } from '../content/effects';
import { bowPower } from '../game/combat';
import { ATLAS_RANGE } from '../game/Game';
import { STRUCTURES } from '../content/structures';

const STRUCT_NAMES = new Map(STRUCTURES.map((s) => [s.name, s.displayName]));

// 9x8 pixel heart and bubble masks (1 = outline, 2 = fill, 3 = highlight).
const HEART = ['011000110', '122101221', '123212221', '122222221', '012222210', '001222100', '000121000', '000010000'];
const BUBBLE = ['001111100', '013322210', '132222221', '132222221', '122222221', '122222221', '012222210', '001111100'];
// Phase 7: armour (a chestplate) and hunger (a drumstick).
const ARMOR = ['011101110', '133212331', '122222221', '012222210', '012222210', '012222210', '012222210', '011111110'];
const FOOD = ['000001110', '000013321', '000122231', '001222221', '012222210', '122221100', '121110000', '010000000'];
const ICON_W = 9;
const ICON_GAP = 1;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent: HTMLElement, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  parent.appendChild(e);
  return e;
}

const AXIS = ['X', 'Y', 'Z', 'W'];
const AXIS_COLORS = ['#ff5a4e', '#57e05f', '#4d86ff', '#ff5cf0'];

function fmt(v: number, d = 2): string {
  return (v >= 0 ? ' ' : '') + v.toFixed(d);
}


export class Hud {
  readonly root: HTMLElement;
  private readonly game: Game;
  private readonly debug: HTMLPreElement;
  private readonly hotbar: HTMLDivElement;
  private readonly slots: HTMLDivElement[] = [];
  private readonly slotIcons: HTMLDivElement[] = [];
  private readonly slotCounts: HTMLSpanElement[] = [];
  private readonly slotBars: HTMLDivElement[] = [];
  private readonly slotTrims: HTMLDivElement[] = [];
  /** The off-hand slot, left of the hotbar (shown when something is in it). */
  private offSlot!: HTMLDivElement;
  /** Raised shield marker under the crosshair. */
  private readonly shieldFx: HTMLDivElement;
  private readonly readout: HTMLDivElement;
  private readonly toast: HTMLDivElement;
  private readonly sleepBox: HTMLDivElement;
  private readonly portalFx: HTMLDivElement;
  private readonly burnFx: HTMLDivElement;
  private readonly bossBar: HTMLDivElement;
  private readonly bossName: HTMLDivElement;
  private readonly bossFill: HTMLDivElement;
  private readonly bossWarn: HTMLDivElement;
  private readonly sleepLeave: HTMLButtonElement;
  private readonly loading: HTMLDivElement;
  private readonly loadingText: HTMLDivElement;
  private readonly radar: HTMLCanvasElement;
  private readonly radarCtx: CanvasRenderingContext2D;
  private readonly radarImg: ImageData;
  private readonly compass: HTMLDivElement;
  private readonly bars: HTMLDivElement[] = [];
  private readonly compassText: HTMLDivElement;
  private readonly mode: HTMLDivElement;
  private readonly crosshair: HTMLDivElement;
  private readonly bowBar: HTMLDivElement;
  private readonly bowFill: HTMLDivElement;
  private readonly vitalsBox: HTMLDivElement;
  private readonly hearts: HTMLCanvasElement;
  private readonly bubbles: HTMLCanvasElement;
  private readonly armorRow: HTMLCanvasElement;
  private readonly goldRow: HTMLCanvasElement;
  private readonly foodRow: HTMLCanvasElement;
  private readonly xpBar: HTMLDivElement;
  private readonly xpFill: HTMLDivElement;
  private readonly xpLevel: HTMLDivElement;
  private readonly effectsBox: HTMLDivElement;
  private readonly mobName: HTMLDivElement;
  private lastArmor = -1;
  private lastGold = -1;
  private lastFood = '';
  private lastXp = '';
  private lastEffects = '';
  private readonly threat: HTMLDivElement;
  private readonly hitL: HTMLDivElement;
  private readonly hitR: HTMLDivElement;
  private lastHealth = -1;
  private lastAir = -1;
  private toastTimer = 0;
  private slowTimer = 0;
  private lastHotbar = -1;
  private lastHotbarVersion = -1;
  /** Base colour per block id (radar), precomputed so the radar does not allocate. */
  private readonly rgb = new Float32Array(REG.count * 3);

  constructor(parent: HTMLElement, game: Game) {
    this.game = game;
    this.root = el('div', 'hud', parent);
    this.crosshair = el('div', 'crosshair', this.root);
    this.bowBar = el('div', 'bowbar', this.root);
    this.bowFill = el('div', 'bowfill', this.bowBar);
    this.hitL = el('div', 'hit-side left', this.root);
    this.hitR = el('div', 'hit-side right', this.root);
    this.debug = el('pre', 'debug', this.root);
    this.debug.style.display = 'none';
    this.threat = el('div', 'threat', this.root);
    this.vitalsBox = el('div', 'vitals', this.root);
    // Left column: golden hearts, armour, hearts; right column: air, hunger (Minecraft's layout).
    const left = el('div', 'vcol', this.vitalsBox);
    const right = el('div', 'vcol right', this.vitalsBox);
    this.goldRow = el('canvas', 'gold', left);
    this.armorRow = el('canvas', 'armor', left);
    this.hearts = el('canvas', 'hearts', left);
    this.bubbles = el('canvas', 'bubbles', right);
    this.foodRow = el('canvas', 'food', right);
    for (const c of [this.hearts, this.bubbles, this.armorRow, this.goldRow, this.foodRow]) {
      c.width = 10 * (ICON_W + ICON_GAP) - ICON_GAP;
      c.height = 8;
    }
    // Experience bar and level, above the hotbar.
    this.xpBar = el('div', 'xpbar', this.root);
    this.xpFill = el('div', 'fill', this.xpBar);
    this.xpLevel = el('div', 'xplevel', this.root);
    // Active effects (top right).
    this.effectsBox = el('div', 'effects', this.root);
    // A named animal under the crosshair shows its name.
    this.mobName = el('div', 'mob-name', this.root);
    this.hotbar = el('div', 'hotbar', this.root);
    this.shieldFx = el('div', 'shield-fx', this.root);
    this.readout = el('div', 'readout', this.root);
    this.toast = el('div', 'toast', this.root);
    // Boss fights: a health bar at the top, and the R2 warning for telegraphed attacks.
    this.bossBar = el('div', 'boss-bar', this.root);
    this.bossName = el('div', 'name', this.bossBar);
    const track = el('div', 'track', this.bossBar);
    this.bossFill = el('div', 'fill', track);
    this.bossWarn = el('div', 'boss-warning', this.root);
    // Standing in a portal: the view swirls violet as the trip approaches.
    this.portalFx = el('div', 'portal-fx', this.root);
    // On fire: flames lick up from the bottom of the screen.
    this.burnFx = el('div', 'burn-fx', this.root);
    // Sleeping in a bed: the screen fades to night-blue; you can get up before the night passes.
    this.sleepBox = el('div', 'sleep', this.root);
    el('div', 'sleep-text', this.sleepBox, 'Z z z');
    this.sleepLeave = el('button', 'sleep-leave', this.sleepBox, 'Leave bed');
    this.sleepLeave.addEventListener('click', (e) => {
      e.stopPropagation();
      this.game.wake();
    });
    this.mode = el('div', 'mode', this.root);

    // Hidden-axis compass + radar (bottom right).
    this.compass = el('div', 'compass', this.root);
    el('div', 'compass-title', this.compass, 'HIDDEN AXIS h');
    const barBox = el('div', 'bars', this.compass);
    for (let i = 0; i < 4; i++) {
      if (i === 1) continue;
      const row = el('div', 'bar-row', barBox);
      el('span', 'bar-label', row, AXIS[i]);
      const track = el('div', 'bar-track', row);
      const fill = el('div', 'bar-fill', track);
      fill.style.background = AXIS_COLORS[i]!;
      this.bars[i] = fill;
    }
    this.compassText = el('div', 'compass-text', this.compass);
    this.radar = el('canvas', 'radar', this.compass);
    this.radar.width = 25;
    this.radar.height = 25;
    this.radarCtx = this.radar.getContext('2d')!;
    this.radarImg = this.radarCtx.createImageData(25, 25);
    const legend = el('div', 'radar-legend', this.compass);
    legend.innerHTML = '<span>&#8593; ana (+h)</span><span>&#8594; right</span>';

    this.loading = el('div', 'loading', this.root);
    el('div', 'loading-title', this.loading, 'HYPERCRAFT');
    this.loadingText = el('div', 'loading-text', this.loading, 'Generating 4D terrain…');

    for (let id = 0; id < REG.count; id++) {
      const t = REG.textures[REG.texSide[id]!];
      const c = t ? hexToRgb(t.colors[0]!) : [0.5, 0.5, 0.5];
      this.rgb[id * 3] = c[0]!;
      this.rgb[id * 3 + 1] = c[1]!;
      this.rgb[id * 3 + 2] = c[2]!;
    }
    this.buildHotbar();
    this.renderHotbar();
  }

  showMessage(text: string): void {
    this.toast.textContent = text;
    this.toast.style.opacity = '1';
    this.toastTimer = 2.2;
  }

  setVisible(v: boolean): void {
    this.root.style.display = v ? 'block' : 'none';
  }

  private buildHotbar(): void {
    const g = this.game;
    // Slot HOTBAR_SIZE in these arrays is the off hand.
    for (let i = 0; i <= HOTBAR_SIZE; i++) {
      const off = i === HOTBAR_SIZE;
      const s = el('div', off ? 'slot offhand' : 'slot', this.hotbar);
      if (off) this.hotbar.prepend(s);
      const icon = el('div', 'icon', s);
      if (!off) el('span', 'key', s, String(i + 1));
      const count = el('span', 'count', s);
      const bar = el('div', 'dura', s);
      const trim = el('div', 'trim', s);
      s.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        if (off) g.swapHands();
        else g.hotbarIndex = i;
      });
      if (off) {
        s.title = 'Off hand (H: swap)';
        this.offSlot = s;
      }
      this.slots.push(s);
      this.slotIcons.push(icon);
      this.slotCounts.push(count);
      this.slotBars.push(bar);
      this.slotTrims.push(trim);
    }
  }

  private renderHotbar(): void {
    const g = this.game;
    const icons = g.icons;
    for (let i = 0; i <= HOTBAR_SIZE; i++) {
      const st = g.inv.get(i === HOTBAR_SIZE ? OFFHAND : i);
      const icon = this.slotIcons[i]!;
      this.slots[i]!.classList.toggle('glint', !!st && (!!st.tag?.ench?.length || IREG.tags[st.id]!.has('glint')));
      const trim = this.slotTrims[i]!;
      trim.style.display = st?.tag?.trim ? 'block' : 'none';
      if (st?.tag?.trim) trim.style.borderColor = TRIM_MATERIALS[st.tag.trim[1]] ?? '#ffffff';
      if (st) {
        icons.apply(icon, st.id, 32);
        icon.style.display = 'block';
        this.slots[i]!.title = st.tag?.name ?? IREG.displayName(st.id);
        this.slotCounts[i]!.textContent = st.count > 1 ? String(st.count) : '';
        const max = IREG.durability[st.id]!;
        const bar = this.slotBars[i]!;
        if (max > 0 && st.damage > 0) {
          const f = 1 - st.damage / max;
          bar.style.display = 'block';
          bar.style.width = `${Math.round(f * 30)}px`;
          bar.style.background = `hsl(${Math.round(f * 120)}, 90%, 50%)`;
        } else bar.style.display = 'none';
      } else {
        icon.style.display = 'none';
        this.slots[i]!.title = '';
        this.slotCounts[i]!.textContent = '';
        this.slotBars[i]!.style.display = 'none';
      }
    }
    this.offSlot.style.display = g.inv.get(OFFHAND) ? '' : 'none';
    this.lastHotbarVersion = g.inv.version;
  }

  update(dt: number): void {
    const g = this.game;
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.toast.style.opacity = '0';
    }
    if (g.inv.version !== this.lastHotbarVersion) this.renderHotbar();
    if (this.shieldFx.classList.contains('on') !== g.blocking) this.shieldFx.classList.toggle('on', g.blocking);
    if (g.hotbarIndex !== this.lastHotbar) {
      this.slots.forEach((s, i) => s.classList.toggle('active', i === g.hotbarIndex));
      this.lastHotbar = g.hotbarIndex;
      const st = g.held;
      if (st) this.showMessage(IREG.displayName(st.id));
    }
    const busy = !g.loaded || g.traveling !== null;
    this.loading.style.display = busy ? 'flex' : 'none';
    if (g.traveling) this.loadingText.textContent = `Entering ${g.traveling}…`;
    else if (!g.loaded) this.loadingText.textContent = g.arrival ? `Arriving in ${g.world.realm.displayName}… ${g.world.columns.size} columns` : `Generating 4D terrain… ${g.world.columns.size} columns`;
    const boss = g.bosses.boss;
    this.bossBar.style.display = boss ? 'block' : 'none';
    if (boss) {
      const text = `${boss.def.displayName.toUpperCase()}${boss.phase === 2 ? ' · ENRAGED' : ''}`;
      if (this.bossName.textContent !== text) this.bossName.textContent = text;
      this.bossFill.style.width = `${Math.max(0, Math.round((boss.health / boss.def.health) * 1000) / 10)}%`;
      this.bossBar.classList.toggle('enraged', boss.phase === 2);
    }
    const warn = g.bosses.warning;
    if (this.bossWarn.textContent !== warn) {
      this.bossWarn.textContent = warn;
      this.bossWarn.style.display = warn ? 'block' : 'none';
    }
    const swirl = Math.min(1, g.portalTime / (g.player.mode === 'creative' || g.player.mode === 'spectator' ? 1 : 4));
    this.portalFx.style.opacity = swirl > 0 ? (0.25 + 0.6 * swirl).toFixed(3) : '0';
    const burning = g.burning > 0;
    if (this.burnFx.classList.contains('on') !== burning) this.burnFx.classList.toggle('on', burning);
    // Per-frame combat feedback.
    const onMob = g.targetMob !== null;
    if (this.crosshair.classList.contains('mob') !== onMob) this.crosshair.classList.toggle('mob', onMob);
    const label = g.targetMob ? (g.targetMob.customName || (g.targetMob.baby > 0 ? `Baby ${g.targetMob.def.displayName}` : '')) : '';
    if (this.mobName.textContent !== label) {
      this.mobName.textContent = label;
      this.mobName.style.display = label ? 'block' : 'none';
    }
    if (g.bowDraw > 0) {
      this.bowBar.style.display = 'block';
      const pw = bowPower(g.bowDraw);
      this.bowFill.style.width = `${Math.round(pw * 100)}%`;
      this.bowFill.style.background = pw >= 1 ? '#fff27a' : '#e8e8e8';
    } else if (g.using) {
      // Eating / drinking progress.
      this.bowBar.style.display = 'block';
      this.bowFill.style.width = `${Math.round(Math.min(1, g.using.t / g.using.need) * 100)}%`;
      this.bowFill.style.background = '#ffc86a';
    } else if (this.bowBar.style.display !== 'none') this.bowBar.style.display = 'none';
    const v = g.vitals;
    this.hitL.style.opacity = v.lastHitSide < 0 ? String(v.flash) : '0';
    this.hitR.style.opacity = v.lastHitSide > 0 ? String(v.flash) : '0';
    const fade = g.sleepFade;
    if (fade > 0 || this.sleepBox.style.display === 'flex') {
      this.sleepBox.style.display = fade > 0 ? 'flex' : 'none';
      this.sleepBox.style.opacity = fade.toFixed(3);
      this.sleepLeave.style.visibility = g.sleeping && !g.sleeping.skipped ? 'visible' : 'hidden';
    }
    this.slowTimer -= dt;
    if (this.slowTimer > 0) return;
    this.slowTimer = 0.1;
    this.updateVitals();
    this.updateThreat();
    this.updateCompass();
    this.updateRadar();
    const p = g.player;
    this.mode.textContent = `${p.mode.toUpperCase()}${p.flying ? ' · FLYING' : ''}${g.nightVisionOn ? ' · NIGHT VISION' : ''}${g.params.wire ? ' · WIREFRAME' : ''}`;
    this.updateReadout();
    this.debug.style.display = g.showDebug ? 'block' : 'none';
    if (g.showDebug) this.debug.textContent = this.debugText();
  }

  /** Hearts, armour, hunger, air, experience and effects (survival / adventure). */
  private updateVitals(): void {
    const g = this.game;
    const m = g.player.mode;
    const show = m === 'survival' || m === 'adventure';
    this.vitalsBox.style.display = show ? 'flex' : 'none';
    this.xpBar.style.display = show ? 'block' : 'none';
    this.xpLevel.style.display = show && g.xp.level > 0 ? 'block' : 'none';
    this.updateEffects();
    if (!show) return;
    const v = g.vitals;
    const hp = Math.ceil(v.health);
    const tone = g.effects.has('wither') ? 2 : g.effects.has('poison') ? 1 : 0;
    if (hp * 4 + tone !== this.lastHealth) {
      this.lastHealth = hp * 4 + tone;
      const pal: [string, string, string] = tone === 2 ? ['#060606', '#2a2420', '#5a504a'] : tone === 1 ? ['#061a06', '#6aa83a', '#b8e88a'] : ['#1a0606', '#e0202a', '#ff9a9a'];
      this.paintRow(this.hearts, HEART, hp, MAX_HEALTH / 10, pal, ['#1a0606', '#3a1a1a', '#4a2a2a']);
      this.hearts.classList.toggle('low', hp <= 4);
    }
    const gold = Math.ceil(v.absorption);
    if (gold !== this.lastGold) {
      this.lastGold = gold;
      this.goldRow.style.display = gold > 0 ? 'block' : 'none';
      if (gold > 0) this.paintRow(this.goldRow, HEART, Math.min(20, gold), 2, ['#2a1a00', '#f0c020', '#fff2a0'], null);
    }
    const [armor] = g.armorTotals();
    if (armor !== this.lastArmor) {
      this.lastArmor = armor;
      this.armorRow.style.visibility = armor > 0 ? 'visible' : 'hidden';
      if (armor > 0) this.paintRow(this.armorRow, ARMOR, Math.min(20, armor), 2, ['#1a1a1a', '#c8ccd4', '#ffffff'], ['#1a1a1a', '#2e2e32', '#3a3a3e']);
    }
    const hungry = g.effects.has('hunger');
    const fk = `${g.hunger.food}|${hungry}`;
    if (fk !== this.lastFood) {
      this.lastFood = fk;
      const pal: [string, string, string] = hungry ? ['#0a1a06', '#7a9a3a', '#b8d86a'] : ['#2a1206', '#c8783a', '#f4c890'];
      this.paintRow(this.foodRow, FOOD, g.hunger.food, MAX_FOOD / 10, pal, ['#1a0a06', '#3a2418', '#4a3020']);
      this.foodRow.classList.toggle('low', g.hunger.food <= 6);
    }
    const lvl = g.xp.level;
    const xk = `${lvl}|${Math.round(g.xp.progress * 200)}`;
    if (xk !== this.lastXp) {
      this.lastXp = xk;
      this.xpFill.style.width = `${(g.xp.progress * 100).toFixed(1)}%`;
      this.xpLevel.textContent = String(lvl);
    }
    const air = v.air >= MAX_AIR ? -1 : Math.ceil((v.air / MAX_AIR) * 10);
    if (air !== this.lastAir) {
      this.lastAir = air;
      this.bubbles.style.visibility = air < 0 ? 'hidden' : 'visible';
      if (air >= 0) this.paintRow(this.bubbles, BUBBLE, air * 2, 2, ['#10305a', '#5aa8ff', '#e8f4ff'], null);
    }
  }

  /** Active status effects with their level and time left. */
  private updateEffects(): void {
    const g = this.game;
    const list = [...g.effects.map.values()];
    const key = list.map((e) => `${e.name}${e.amp}:${Math.ceil(e.time)}`).join(',');
    if (key === this.lastEffects) return;
    this.lastEffects = key;
    this.effectsBox.innerHTML = '';
    for (const e of list) {
      const def = EFFECT_BY_NAME.get(e.name);
      if (!def) continue;
      const row = el('div', `effect${def.good ? '' : ' bad'}${e.time < 10 ? ' ending' : ''}`, this.effectsBox);
      const badge = el('span', 'badge', row, def.glyph);
      badge.style.background = def.color;
      const t = Math.ceil(e.time);
      el('span', 'name', row, `${def.displayName}${e.amp > 0 ? ' ' + roman(e.amp + 1) : ''}`);
      el('span', 'time', row, t >= 3600 ? '**:**' : `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`);
      row.title = def.description;
    }
  }

  /**
   * Paint 10 icons from a mask; `value / per` icons are full (halves allowed). Empty icons use
   * the `empty` palette (with the full outline), or are skipped when it is null.
   */
  private paintRow(c: HTMLCanvasElement, mask: string[], value: number, per: number, full: string[], empty: string[] | null): void {
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, c.width, c.height);
    const halves = Math.round((value / per) * 2);
    for (let i = 0; i < 10; i++) {
      const x0 = i * (ICON_W + ICON_GAP);
      for (let y = 0; y < mask.length; y++) {
        const row = mask[y]!;
        for (let x = 0; x < ICON_W; x++) {
          const k = row.charCodeAt(x) - 48;
          if (k === 0) continue;
          // Filled if this icon (or its left half) is covered by the value.
          const filled = halves >= i * 2 + 2 || (halves === i * 2 + 1 && x < ICON_W / 2);
          if (!filled && !empty) continue;
          const pal = filled ? full : empty!;
          ctx.fillStyle = k === 1 ? full[0]! : pal[k === 2 ? 1 : 2]!;
          ctx.fillRect(x0 + x, y, 1, 1);
        }
      }
    }
  }

  /** R2: name the nearest hostile mob that is out of your slice, and which way it is. */
  private updateThreat(): void {
    const g = this.game;
    const m = g.player.mode;
    let text = '';
    if (m === 'survival' || m === 'adventure') {
      const e = g.eye(), H = g.player.cam.H;
      for (const mob of g.threats) {
        let dh = 0, d2 = 0;
        for (let k = 0; k < 4; k++) {
          const dk = mob.pos[k]! - e[k]!;
          dh += dk * H[k]!;
          d2 += dk * dk;
        }
        const dist = Math.sqrt(d2);
        if (dist > 12) break;
        if (Math.abs(dh) < 0.25) continue;
        const side = dh > 0 ? 'ana' : 'kata';
        const off = Math.abs(dh) < 0.5 ? `slightly ${side}` : `${Math.abs(dh).toFixed(0)} m ${side}`;
        text = `⚠ ${mob.def.displayName} · ${dist.toFixed(0)} m away, ${off}`;
        break;
      }
    }
    if (this.threat.textContent !== text) {
      this.threat.textContent = text;
      this.threat.style.display = text ? 'block' : 'none';
    }
  }

  /** Held compass / clock readouts. */
  private updateReadout(): void {
    const g = this.game;
    const st = g.held;
    const kind = st ? IREG.def(st.id).readout : undefined;
    if (!kind) {
      this.readout.style.display = 'none';
      return;
    }
    this.readout.style.display = 'block';
    if (kind === 'clock' && !g.world.realm.dayCycle) {
      this.readout.textContent = '🕐 The hands spin: there are no days here';
      return;
    }
    if (kind === 'compass' && g.world.realm.name !== 'surface') {
      this.readout.textContent = '🧭 The needle spins wildly';
      return;
    }
    if (kind === 'clock') {
      const tod = g.env.timeOfDay;
      const hours = Math.floor(((tod / TICKS_PER_DAY) * 24 + 6) % 24);
      const mins = Math.floor((((tod / TICKS_PER_DAY) * 24 + 6) % 1) * 60);
      this.readout.textContent = `${g.env.sky.daylight > 0.3 ? '☀' : '☾'} ${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}  day ${g.env.day}`;
      return;
    }
    // Hypercompass: spawn (or your bed) direction within the slice, plus the kata/ana offset.
    // Atlases point the same way at the nearest structure they mark.
    let label = g.bed ? 'Bed' : 'Spawn';
    let sp: ArrayLike<number> = g.bed ? [g.bed[0] + 0.5, 0, g.bed[2] + 0.5, g.bed[3] + 0.5] : g.spawn;
    if (kind === 'atlas') {
      const a = g.atlas;
      if (!a || a.item !== st!.id) {
        this.readout.textContent = '🗺 Reading the atlas…';
        return;
      }
      if (!a.target) {
        this.readout.textContent = `🗺 Nothing marked within ${ATLAS_RANGE} m`;
        return;
      }
      label = `🗺 ${STRUCT_NAMES.get(a.target.name) ?? a.target.name}`;
      sp = [a.target.x + 0.5, 0, a.target.z + 0.5, a.target.w + 0.5];
    }
    const e = g.eye(), cam = g.player.cam;
    const d = [sp[0]! - e[0]!, 0, sp[2]! - e[2]!, sp[3]! - e[3]!];
    let f = 0, r = 0, h = 0, dist = 0;
    for (let i = 0; i < 4; i++) {
      f += d[i]! * cam.F[i]!;
      r += d[i]! * cam.R[i]!;
      h += d[i]! * cam.H[i]!;
      dist += d[i]! * d[i]!;
    }
    const ang = Math.round((Math.atan2(r, f) * 180) / Math.PI);
    const arrows = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'];
    const arrow = arrows[((Math.round(ang / 45) % 8) + 8) % 8]!;
    this.readout.textContent = `${label} ${arrow} ${Math.round(Math.sqrt(dist))} m  (${Math.abs(h) < 0.5 ? 'in this slice' : `${Math.round(Math.abs(h))} m ${h > 0 ? 'ana' : 'kata'}`})`;
  }

  private updateCompass(): void {
    const h = this.game.player.cam.hidden;
    for (let i = 0; i < 4; i++) {
      const b = this.bars[i];
      if (!b) continue;
      const v = h[i]!;
      b.style.width = `${Math.abs(v) * 50}%`;
      b.style.left = v >= 0 ? '50%' : `${50 - Math.abs(v) * 50}%`;
    }
    const tilt = (this.game.player.cam.hiddenAxisTilt() * 180) / Math.PI;
    let dom = 0;
    for (let i = 1; i < 4; i++) if (Math.abs(h[i]!) > Math.abs(h[dom]!)) dom = i;
    const sgn = h[dom]! >= 0 ? '+' : '−';
    const w = this.game.eye()[3]!;
    this.compassText.textContent = tilt < 0.5 ? `h = ${sgn}${AXIS[dom]} (aligned) · w ${w.toFixed(1)}` : `h ≈ ${sgn}${AXIS[dom]}, tilt ${tilt.toFixed(1)}° · w ${w.toFixed(1)}`;
  }

  /**
   * 25x25 view of the plane spanned by R (right, horizontal) and H (ana, vertical) through
   * the player's body: shows what is kata/ana of you, which the 3D slice cannot.
   */
  private updateRadar(): void {
    const g = this.game;
    const p = g.player;
    const R = p.cam.R, H = p.cam.H;
    const d = this.radarImg.data;
    const up = p.up;
    const pos = p.pos;
    for (let j = 0; j < 25; j++) {
      for (let i = 0; i < 25; i++) {
        const a = i - 12, b = 12 - j;
        let solid = 0;
        let lava = false, water = false, web = false;
        let r = 0, gg = 0, bb = 0;
        const x = pos[0]! + R[0]! * a + H[0]! * b;
        const z = pos[2]! + R[2]! * a + H[2]! * b;
        const w = pos[3]! + R[3]! * a + H[3]! * b;
        const fx = Math.floor(x), fz = Math.floor(z), fw = Math.floor(w);
        const y0 = Math.floor(pos[up]! + 0.3);
        // Body height (feet, head): walls.
        for (let hgt = 0; hgt < 2; hgt++) {
          const v = g.world.getBlock(fx, y0 + hgt, fz, fw);
          if (v === VOID_VOXEL) continue;
          const id = voxelId(v);
          if (REG.fluid[id] === FLUID_LAVA) lava = true;
          else if (REG.fluid[id] === FLUID_WATER) water = true;
          else if (REG.slow[id]! < 1) web = true;
          else if (REG.solid[id]) {
            solid++;
            r += this.rgb[id * 3]!;
            gg += this.rgb[id * 3 + 1]!;
            bb += this.rgb[id * 3 + 2]!;
          }
        }
        // Floor under a passable cell: hazards and drops you would walk into along ±h.
        let floor = 0; // 0 drop, 1 ground, 2 lava, 3 water
        if (solid === 0 && !lava && !water) {
          const v = g.world.getBlock(fx, y0 - 1, fz, fw);
          const id = voxelId(v);
          if (v === VOID_VOXEL) floor = 1;
          else if (REG.fluid[id] === FLUID_LAVA) floor = 2;
          else if (REG.fluid[id] === FLUID_WATER) floor = 3;
          else if (REG.solid[id]) floor = 1;
        }
        const o = (j * 25 + i) * 4;
        if (lava || floor === 2) {
          d[o] = 255;
          d[o + 1] = lava ? 90 : 120;
          d[o + 2] = 20;
          d[o + 3] = 255;
        } else if (web && solid === 0) {
          // Cobwebs (slow you down): pale grey-violet.
          d[o] = 225;
          d[o + 1] = 220;
          d[o + 2] = 240;
          d[o + 3] = 220;
        } else if (solid > 0) {
          const k = solid === 2 ? 255 : 170;
          d[o] = Math.min(255, (r / solid) * k);
          d[o + 1] = Math.min(255, (gg / solid) * k);
          d[o + 2] = Math.min(255, (bb / solid) * k);
          d[o + 3] = solid === 2 ? 235 : 150;
        } else if (water || floor === 3) {
          d[o] = 50;
          d[o + 1] = 110;
          d[o + 2] = 230;
          d[o + 3] = water ? 220 : 170;
        } else if (floor === 1) {
          d[o] = 40;
          d[o + 1] = 48;
          d[o + 2] = 62;
          d[o + 3] = 150;
        } else {
          // Drop-off: nothing to stand on.
          d[o] = 0;
          d[o + 1] = 0;
          d[o + 2] = 0;
          d[o + 3] = 235;
        }
        if (i === 12 && j === 12) {
          d[o] = 255;
          d[o + 1] = 255;
          d[o + 2] = 255;
          d[o + 3] = 255;
        }
        // The visible slice is the horizontal line through the centre.
        if (j === 12 && i !== 12) d[o + 3] = Math.max(d[o + 3]!, 200);
      }
    }
    // Mobs near the (right, ana) plane: red = hostile, green = passive. A dot off the centre
    // line is kata/ana of you, out of sight.
    const F = p.cam.F;
    for (const m of g.mobs.list) {
      let a = 0, b = 0, f = 0;
      for (let k = 0; k < 4; k++) {
        if (k === up) continue;
        const dk = m.pos[k]! - pos[k]!;
        a += dk * R[k]!;
        b += dk * H[k]!;
        f += dk * F[k]!;
      }
      if (Math.abs(f) > 8 || Math.abs(a) > 12.5 || Math.abs(b) > 12.5 || Math.abs(m.pos[up]! - pos[up]!) > 6) continue;
      const i = 12 + Math.round(a), j = 12 - Math.round(b);
      if (i === 12 && j === 12) continue;
      const o = (j * 25 + i) * 4;
      const k = 1 - Math.abs(f) / 10;
      if (m.def.hostile) {
        d[o] = 255;
        d[o + 1] = Math.round(40 * k);
        d[o + 2] = Math.round(90 * k);
      } else {
        d[o] = Math.round(120 * k);
        d[o + 1] = 255;
        d[o + 2] = Math.round(120 * k);
      }
      d[o + 3] = 255;
    }
    // Boss telegraphs (R2): pending lava pillars blink orange where they will erupt, even the
    // ones kata/ana of your slice; erupted ones show solid.
    const blink = Math.floor(performance.now() / 150) % 2 === 0;
    for (const pl of g.bosses.pillars) {
      const a = (pl.x + 0.5 - pos[0]!) * R[0]! + (pl.z + 0.5 - pos[2]!) * R[2]! + (pl.w + 0.5 - pos[3]!) * R[3]!;
      const b = (pl.x + 0.5 - pos[0]!) * H[0]! + (pl.z + 0.5 - pos[2]!) * H[2]! + (pl.w + 0.5 - pos[3]!) * H[3]!;
      if (Math.abs(a) > 12.5 || Math.abs(b) > 12.5) continue;
      if (pl.erupt > 0 && !blink) continue;
      const o = ((12 - Math.round(b)) * 25 + 12 + Math.round(a)) * 4;
      d[o] = 255;
      d[o + 1] = pl.erupt > 0 ? 170 : 90;
      d[o + 2] = 20;
      d[o + 3] = 255;
    }
    this.radarCtx.putImageData(this.radarImg, 0, 0);
  }

  private debugText(): string {
    const g = this.game;
    const p = g.player;
    const e = g.eye();
    const cam = p.cam;
    const rs = g.renderer.stats;
    const gs = g.renderer.gpu.stats;
    const ws = g.pool.stats;
    const light = g.eyeLight();
    const cbi = g.generator.caveBiomeAt?.(Math.floor(e[0]!), Math.floor(e[1]!), Math.floor(e[2]!), Math.floor(e[3]!)) ?? -1;
    // Enclosed realms have 3D biomes: show the one at your height.
    const bi = g.env.enclosed && cbi >= 0 ? cbi : g.world.biomeAt(Math.floor(e[0]!), Math.floor(e[2]!), Math.floor(e[3]!));
    const biome = bi >= 0 ? REG.biomes[bi]!.displayName : '—';
    const cave = !g.env.enclosed && cbi >= 0 && g.world.skyHeight(Math.floor(e[0]!), Math.floor(e[2]!), Math.floor(e[3]!)) > e[1]! + 4 ? `  cave ${REG.biomes[cbi]!.displayName}` : '';
    const tod = g.env.timeOfDay;
    const hours = Math.floor(((tod / TICKS_PER_DAY) * 24 + 6) % 24);
    const mins = Math.floor((((tod / TICKS_PER_DAY) * 24 + 6) % 1) * 60);
    let chunks = 0;
    for (const c of g.world.columns.values()) chunks += c.chunks.length;
    const v4 = (v: Float64Array) => `(${fmt(v[0]!)},${fmt(v[1]!)},${fmt(v[2]!)},${fmt(v[3]!)})`;
    const lines = [
      `HYPERCRAFT · seed ${g.info.seedText} · ${g.world.realm.displayName}`,
      `fps ${g.fps.toFixed(0)}  frame ${g.frameMs.toFixed(1)} ms  cpu ${g.cpuMs.toFixed(1)} ms  gpu ${g.renderer.hasGpuTimer ? rs.gpuMs.toFixed(2) + ' ms' : 'n/a'}`,
      `internal ${rs.internalW}x${rs.internalH} (${g.scaler.mode === 'auto' ? 'auto' : 'fixed'})  canvas ${g.canvas.width}x${g.canvas.height}`,
      `ray steps avg ${rs.avgSteps.toFixed(1)}  max ${rs.maxSteps}  (cap ${g.settings.maxSteps})`,
      ``,
      `xyzw ${e[0]!.toFixed(2)} ${e[1]!.toFixed(2)} ${e[2]!.toFixed(2)} ${e[3]!.toFixed(2)}  (eye)`,
      `chunk ${Math.floor(e[0]! / 16)} ${Math.floor(e[1]! / 16)} ${Math.floor(e[2]! / 16)} ${Math.floor(e[3]! / 16)}  vel ${v4(p.vel)}`,
      `hidden h ${v4(cam.hidden)}  tilt ${((cam.hiddenAxisTilt() * 180) / Math.PI).toFixed(1)}°`,
      `fwd    f ${v4(cam.fwd)}`,
      `right  r ${v4(cam.right)}`,
      `biome ${biome}${cave}  particles ${g.particles.visible}/${g.particles.alive}  light sky ${light >> 4} block ${light & 15}  ${p.onGround ? 'ground' : 'air'}${p.inWater ? ' water' : ''}${p.onClimbable ? ' climb' : ''}`,
      ``,
      `columns ${g.world.columns.size} (chunks ${chunks})  pending ${g.streamer.pendingCount}  backlog ${g.streamer.backlog}  window ${g.world.N}³`,
      `workers ${g.pool.size}: gen ${ws.genMs.toFixed(1)} ms  light ${ws.lightMs.toFixed(1)} ms  pack ${ws.packMs.toFixed(1)} ms  done ${ws.done}`,
      `gpu pools: block ${(gs.blockGroups * 8 / 1000).toFixed(1)}k bricks  light ${(gs.lightGroups * 8 / 1000).toFixed(1)}k  ${(gs.poolBytes / 1048576).toFixed(0)} MB  regrows ${gs.regrows}`,
      `uploads ${gs.uploadsThisFrame} (${(gs.bytesThisFrame / 1024).toFixed(0)} KB, ${g.uploadMsFrame.toFixed(1)} ms)  queued ${gs.queued}  cpu mem ${(g.world.memoryBytes() / 1048576).toFixed(0)} MB`,
      `light queue ${g.light.pending()} (${g.lightMsFrame.toFixed(1)} ms)  fluids ${g.fluids.stats.pendingWater}/${g.fluids.stats.pendingLava}`,
      `time ${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}  day ${g.env.day}  moon ${g.env.moonPhase}/8  weather ${g.env.weather} ${(g.env.intensity * 100).toFixed(0)}%`,
    ];
    let hostile = 0;
    for (const m of g.mobs.list) if (m.def.hostile) hostile++;
    lines.push(`mobs ${g.mobs.list.length} (${hostile} hostile)  in slice ${g.mobs.packed}  arrows ${g.projectiles.list.length}  health ${g.vitals.health.toFixed(1)}  air ${g.vitals.air.toFixed(1)}`);
    let villagers = 0;
    for (const m of g.mobs.list) if (m.def.ai === 'villager') villagers++;
    const bed = g.bed ? `bed ${g.bed.join(' ')}` : 'no bed';
    lines.push(`villagers ${villagers}  spawners ${g.blockEntities.spawnerCount}  ${bed}${g.sleeping ? '  asleep' : ''}`);
    if (g.targetMob) {
      const m = g.targetMob;
      lines.push(`target mob ${m.def.displayName} #${m.id}  hp ${m.health.toFixed(1)}/${m.def.health}  ai ${m.def.ai}/${m.mode}`);
    } else if (g.hasTarget) {
      const t = g.target;
      lines.push(`target ${REG.name(t.voxel)} @ ${t.x} ${t.y} ${t.z} ${t.w}  facet ${t.sign > 0 ? '+' : '-'}${AXIS[t.axis]}  dist ${t.t.toFixed(2)}`);
    }
    return lines.join('\n');
  }
}
