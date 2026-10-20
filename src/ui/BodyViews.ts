// The player's body on the HUD (Phase 9.1): a first-person hand holding the selected item, and a
// small "paper doll" of yourself in a corner. Both are flat cut-outs driven by the game's body
// state (Game.doll): the same walk cycle, arm swing, armour colours and wings the third-person
// model uses.

import { IREG } from '../content/itemRegistry';
import type { Game } from '../game/Game';
import { dollParts, newDollState, SKIN, type DollState } from '../game/PlayerModel';
import type { MobPart } from '../content/types';

function div(cls: string, parent: HTMLElement): HTMLDivElement {
  const e = document.createElement('div');
  e.className = cls;
  parent.appendChild(e);
  return e;
}

/** The hand: an arm in a sleeve with the item in its grip, bobbing, swinging, eating, blocking. */
export class HandView {
  readonly root: HTMLDivElement;
  private readonly arm: HTMLDivElement;
  private readonly sleeve: HTMLDivElement;
  private readonly item: HTMLDivElement;
  private lastItem = -2;
  private lastSleeve = '';
  private t = 0;

  constructor(parent: HTMLElement, private readonly game: Game) {
    this.root = div('hand', parent);
    this.arm = div('hand-arm', this.root);
    div('hand-skin', this.arm);
    this.sleeve = div('hand-sleeve', this.arm);
    this.item = div('hand-item', this.root);
  }

  update(dt: number): void {
    const g = this.game;
    const show = g.showHand && g.camMode === 0 && g.loaded && g.player.mode !== 'spectator' && !g.sleeping && !g.vitals.dead;
    if (!show) {
      if (this.root.style.display !== 'none') this.root.style.display = 'none';
      return;
    }
    if (this.root.style.display === 'none') this.root.style.display = '';
    this.t += dt;
    const held = g.held;
    const id = held ? held.id : -1;
    if (id !== this.lastItem) {
      this.lastItem = id;
      if (held) {
        g.icons.apply(this.item, id, 128);
        this.item.style.display = 'block';
        const d = IREG.def(id);
        // Tools and weapons are drawn diagonally already; blocks and plain items are tilted into the grip.
        this.item.dataset.kind = d.tool || d.weapon ? 'tool' : 'item';
      } else this.item.style.display = 'none';
    }
    const sleeve = g.doll.armor[1] ?? '#3d8fbf';
    if (sleeve !== this.lastSleeve) {
      this.lastSleeve = sleeve;
      this.sleeve.style.background = sleeve;
    }

    // Pose: walk bob, swing, equip, and what the hand is busy with.
    const stride = g.walkStride, ph = g.walkPhase;
    let x = Math.sin(ph) * 9 * stride;
    let y = Math.abs(Math.cos(ph)) * 7 * stride + (g.player.sprinting ? 14 : 0);
    let rot = 0;
    const s = g.swingT / 0.3;
    if (s < 1) {
      const k = Math.sin(Math.PI * s);
      x -= 70 * k;
      y -= 44 * k;
      rot -= 42 * k;
    }
    y += g.equipT * 190;
    const hu = held ? IREG.def(held.id).use : undefined;
    if (g.using) {
      // Eating and drinking: the item comes up to the face and shakes.
      x -= 120;
      y -= 160;
      rot -= 32;
      x += Math.sin(this.t * 26) * 4;
    } else if (g.blocking) {
      x -= 190;
      y -= 70;
      rot -= 6;
    } else if (g.bowDraw > 0 && (hu === 'bow' || hu === 'crossbow')) {
      const d = Math.min(1, g.bowDraw);
      x -= 80 + 20 * d;
      y -= 40;
      x += Math.sin(this.t * 40) * 2.5 * d;
    }
    this.root.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) rotate(${rot.toFixed(1)}deg)`;
  }
}

function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * k), gg = Math.round(((n >> 8) & 255) * k), b = Math.round((n & 255) * k);
  return `rgb(${r},${gg},${b})`;
}

const DOLL_W = 112, DOLL_H = 104, DOLL_SCALE = 44;

/** The paper doll: you, front on, in the top-left corner (first person only). */
export class PaperDoll {
  readonly root: HTMLDivElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly pose: DollState = newDollState();
  private readonly parts: MobPart[] = [];
  private last = '';
  /** Set by the HUD: the F3 overlay owns this corner while it is open. */
  hidden = false;

  constructor(parent: HTMLElement, private readonly game: Game) {
    this.root = div('paper-doll', parent);
    this.canvas = document.createElement('canvas');
    this.canvas.width = DOLL_W;
    this.canvas.height = DOLL_H;
    this.root.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d')!;
  }

  update(): void {
    const g = this.game;
    const show = !this.hidden && g.camMode === 0 && g.loaded && g.paperDoll && g.player.mode !== 'spectator' && !g.vitals.dead;
    if (!show) {
      if (this.root.style.display !== 'none') this.root.style.display = 'none';
      return;
    }
    if (this.root.style.display === 'none') this.root.style.display = '';
    const s = g.doll;
    // Front on, standing; a glide shows as open wings.
    const p = this.pose;
    p.walk = s.walk;
    p.moving = s.moving;
    p.swing = s.swing;
    p.sneak = s.sneak;
    p.glide = false;
    p.wingSpread = s.glide ? 1 : 0;
    p.blocking = s.blocking;
    p.draw = s.draw;
    p.armor = s.armor;
    p.wings = s.wings;
    p.held = s.held;
    // Redraw only when the pose changed enough to see.
    const key = `${(p.walk * 6) | 0}|${(p.moving * 8) | 0}|${p.swing < 0 ? -1 : (p.swing * 6) | 0}|${p.sneak}|${p.wingSpread}|${p.blocking}|${(p.draw * 5) | 0}|${p.armor.join()}|${p.wings?.[0] ?? ''}|${p.held?.color ?? ''}${p.held?.kind ?? ''}`;
    if (key === this.last) return;
    this.last = key;
    this.draw();
  }

  private draw(): void {
    const ctx = this.ctx, S = DOLL_SCALE;
    ctx.clearRect(0, 0, DOLL_W, DOLL_H);
    dollParts(this.pose, this.parts);
    // Far parts first: the doll faces the viewer, so larger z is nearer.
    const order = this.parts.map((_, i) => i).sort((a, b) => this.parts[a]!.at[2] - this.parts[b]!.at[2]);
    const cx = DOLL_W / 2, base = DOLL_H - 6;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    for (const i of order) {
      const pt = this.parts[i]!;
      const sx = (v: number) => cx - v * S;
      const sy = (v: number) => base - v * S;
      if (pt.kind === 'box' && pt.size) {
        const x0 = sx(pt.at[0] + pt.size[0]), x1 = sx(pt.at[0] - pt.size[0]);
        const y0 = sy(pt.at[1] + pt.size[1]), y1 = sy(pt.at[1] - pt.size[1]);
        ctx.fillStyle = pt.color;
        ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
        ctx.strokeStyle = shade(pt.color === SKIN ? '#a07050' : pt.color, 0.55);
        ctx.lineWidth = 1;
        ctx.strokeRect(x0 + 0.5, y0 + 0.5, x1 - x0 - 1, y1 - y0 - 1);
      } else if (pt.kind === 'capsule' && pt.to) {
        ctx.strokeStyle = pt.color;
        ctx.lineWidth = Math.max(2, (pt.r ?? 0.05) * 2 * S);
        ctx.beginPath();
        ctx.moveTo(sx(pt.at[0]), sy(pt.at[1]));
        ctx.lineTo(sx(pt.to[0]), sy(pt.to[1]));
        ctx.stroke();
      }
    }
  }
}
