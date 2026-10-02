// Touch controls for phones/tablets.
//
//  left side      floating joystick (move); pushing to the rim sprints
//  right side     drag = look
//                 tap = interact where you tapped: hit the mob there, or use / place on the
//                       block there (like Bedrock's "tap to interact")
//                 long-press = mine the block under your finger (keep holding; slide the
//                       finger to move to the next block)
//                 two fingers: twist = rotate the slice right<->hidden,
//                              drag up/down = rotate the slice forward<->hidden
//  buttons        Hit (hold: attack / mine at the crosshair), Use (hold: place, draw a bow),
//                 Jump, Sneak (toggle), Kata / Ana (hold), slice rotation, snap, pause,
//                 inventory, drop, fly (creative), F3, wireframe
//
// Everything is fed through Input (virtual keys and buttons, analog axes, look deltas, the aim
// point) so gameplay code does not care where input came from.

import type { Input } from './Input';

interface Pt {
  id: number;
  x: number;
  y: number;
  sx: number;
  sy: number;
  t: number;
  moved: boolean;
}

export interface TouchHooks {
  onPause(): void;
  onInventory?(): void;
  onToggleFly?(): void;
  onToggleNightVision?(): void;
}

/** What the HUD shows on the buttons (updated by the game every frame). */
export interface TouchState {
  creative: boolean;
  /** The crosshair is on a mob (the Hit button attacks). */
  onMob: boolean;
  /** Night vision is on (creative / spectator). */
  nightVision?: boolean;
}

export function isTouchDevice(): boolean {
  return (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches) || navigator.maxTouchPoints > 0;
}

const LONG_PRESS_MS = 350;
const TAP_MS = 320;
const MOVE_SLOP = 12;

export class TouchControls {
  readonly root: HTMLDivElement;
  private readonly input: Input;
  private joy: Pt | null = null;
  private readonly look = new Map<number, Pt>();
  private readonly base: HTMLDivElement;
  private readonly knob: HTMLDivElement;
  private longPress = 0;
  /** Pointer id of the finger that is mining (long-press), or -1. */
  private miner = -1;
  private twist = 0;
  private twoMidY = 0;
  private sneakOn = false;
  sensitivity = 1;
  private visible = false;
  private readonly hitBtn: HTMLButtonElement;
  private readonly flyBtn: HTMLButtonElement;
  private readonly nvBtn: HTMLButtonElement;
  private lastState = '';

  constructor(parent: HTMLElement, input: Input, hooks: TouchHooks) {
    this.input = input;
    const root = document.createElement('div');
    root.className = 'touch';
    parent.appendChild(root);
    this.root = root;
    const zoneL = this.div('touch-zone left', root);
    const zoneR = this.div('touch-zone right', root);
    // Where to put the thumb: a faint joystick ring while no finger is on it.
    this.div('joy-hint', root);
    this.base = this.div('joy-base', root);
    this.knob = this.div('joy-knob', this.base);
    this.base.style.display = 'none';

    zoneL.addEventListener('pointerdown', (e) => this.joyDown(e));
    zoneR.addEventListener('pointerdown', (e) => this.lookDown(e));
    window.addEventListener('pointermove', (e) => this.move(e), { passive: false });
    window.addEventListener('pointerup', (e) => this.up(e));
    window.addEventListener('pointercancel', (e) => this.up(e));

    // Right-thumb cluster: movement along the hidden axis and sneaking on top, combat in the
    // middle, a wide jump button at the bottom (easiest to reach).
    const cluster = this.div('touch-buttons', root);
    this.hold(cluster, '◀ Kata', 'KeyQ', 'kata');
    this.hold(cluster, 'Ana ▶', 'KeyE', 'ana');
    this.button(cluster, 'Sneak', 'sneak', () => {
      this.sneakOn = !this.sneakOn;
      input.setKey('ShiftLeft', this.sneakOn);
      return this.sneakOn;
    });
    this.hitBtn = this.holdMouse(cluster, '⛏ Hit', 0, 'hit');
    this.holdMouse(cluster, '✋ Use', 2, 'use');
    this.tapKey(cluster, 'Drop', 'KeyB', 'drop');
    this.hold(cluster, 'Jump', 'Space', 'big jump');
    const slice = this.div('touch-slice', root);
    this.hold(slice, '⟲', 'KeyZ', 'small');
    this.hold(slice, '⟳', 'KeyX', 'small');
    this.hold(slice, '⤒', 'KeyV', 'small');
    this.hold(slice, '⤓', 'KeyF', 'small');
    this.tapKey(slice, 'Snap', 'KeyC', 'small');
    const top = this.div('touch-top', root);
    // Buttons that open a screen act on the finished tap ('click'): acting on pointerdown
    // would let the tap's own click land on the screen that just opened.
    this.clickButton(top, '☰', 'pause', () => hooks.onPause());
    if (hooks.onInventory) this.clickButton(top, '🎒 Inv', 'inv', () => hooks.onInventory!());
    this.flyBtn = this.button(top, 'Fly', 'fly', () => {
      hooks.onToggleFly?.();
      return false;
    });
    // Night vision (creative and spectator): lights up caves and nights.
    this.nvBtn = this.button(top, '👁 NV', 'nv', () => {
      hooks.onToggleNightVision?.();
      return false;
    });
    this.tapKey(top, '⇄ Hand', 'KeyH', 'small');
    this.tapKey(top, 'F3', 'F3', 'small');
    this.tapKey(top, 'P', 'KeyP', 'small');
    this.setVisible(false);
  }

  setVisible(v: boolean): void {
    this.visible = v;
    this.root.style.display = v ? 'block' : 'none';
    document.body.classList.toggle('touch-active', v);
    if (!v) this.reset();
  }

  get isVisible(): boolean {
    return this.visible;
  }

  /** Per-frame state from the game: button labels and which buttons apply. */
  update(s: TouchState): void {
    const key = `${s.creative}|${s.onMob}|${s.nightVision}`;
    if (key === this.lastState) return;
    this.lastState = key;
    this.hitBtn.textContent = s.onMob ? '⚔ Hit' : '⛏ Hit';
    this.hitBtn.classList.toggle('target', s.onMob);
    this.flyBtn.style.display = s.creative ? '' : 'none';
    this.nvBtn.style.display = s.creative ? '' : 'none';
    this.nvBtn.classList.toggle('on', s.nightVision === true);
  }

  private div(cls: string, parent: HTMLElement): HTMLDivElement {
    const d = document.createElement('div');
    d.className = cls;
    parent.appendChild(d);
    return d;
  }

  private mkButton(parent: HTMLElement, label: string, cls: string): HTMLButtonElement {
    const b = document.createElement('button');
    b.className = `tbtn ${cls}`;
    b.textContent = label;
    b.addEventListener('contextmenu', (e) => e.preventDefault());
    parent.appendChild(b);
    return b;
  }

  /** Button that holds a virtual key while pressed. */
  private hold(parent: HTMLElement, label: string, code: string, cls: string): HTMLButtonElement {
    const b = this.mkButton(parent, label, cls);
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      b.setPointerCapture(e.pointerId);
      b.classList.add('on');
      this.input.setKey(code, true);
    });
    const release = () => {
      b.classList.remove('on');
      this.input.setKey(code, false);
    };
    b.addEventListener('pointerup', release);
    b.addEventListener('pointercancel', release);
    return b;
  }

  /** Button that holds a virtual mouse button while pressed (at the crosshair). */
  private holdMouse(parent: HTMLElement, label: string, button: number, cls: string): HTMLButtonElement {
    const b = this.mkButton(parent, label, cls);
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      b.setPointerCapture(e.pointerId);
      b.classList.add('on');
      this.input.clearAim();
      this.input.setButton(button, true);
    });
    const release = () => {
      b.classList.remove('on');
      this.input.setButton(button, false);
    };
    b.addEventListener('pointerup', release);
    b.addEventListener('pointercancel', release);
    return b;
  }

  private tapKey(parent: HTMLElement, label: string, code: string, cls: string): HTMLButtonElement {
    const b = this.mkButton(parent, label, cls);
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.input.setKey(code, true);
      setTimeout(() => this.input.setKey(code, false), 50);
    });
    return b;
  }

  /** Button that fires once the tap is complete. */
  private clickButton(parent: HTMLElement, label: string, cls: string, fn: () => void): HTMLButtonElement {
    const b = this.mkButton(parent, label, cls);
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
    b.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      fn();
    });
    return b;
  }

  /** Button with custom behaviour; `fn` returns the toggled state for styling. */
  private button(parent: HTMLElement, label: string, cls: string, fn: () => boolean): HTMLButtonElement {
    const b = this.mkButton(parent, label, cls);
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      b.classList.toggle('on', fn());
    });
    return b;
  }

  /** Screen point -> normalised device coordinates of the game view. */
  private ndc(x: number, y: number): [number, number] {
    const r = this.root.getBoundingClientRect();
    return [((x - r.left) / Math.max(1, r.width)) * 2 - 1, 1 - ((y - r.top) / Math.max(1, r.height)) * 2];
  }

  private joyDown(e: PointerEvent): void {
    if (this.joy) return;
    e.preventDefault();
    this.joy = { id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), moved: false };
    this.base.style.display = 'block';
    this.root.classList.add('moving');
    this.base.style.left = `${e.clientX - 60}px`;
    this.base.style.top = `${e.clientY - 60}px`;
    this.knob.style.transform = 'translate(0px, 0px)';
  }

  private lookDown(e: PointerEvent): void {
    e.preventDefault();
    const p: Pt = { id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), moved: false };
    this.look.set(e.pointerId, p);
    if (this.look.size === 1) {
      // Long-press: mine the block under the finger.
      const id = e.pointerId;
      window.clearTimeout(this.longPress);
      this.longPress = window.setTimeout(() => {
        const q = this.look.get(id);
        if (q && !q.moved && this.look.size === 1) {
          this.miner = id;
          const [x, y] = this.ndc(q.x, q.y);
          this.input.setAim(x, y);
          this.input.setButton(0, true);
        }
      }, LONG_PRESS_MS);
    } else if (this.look.size === 2) {
      window.clearTimeout(this.longPress);
      this.stopMining();
      const [a, b] = [...this.look.values()];
      this.twist = Math.atan2(b!.y - a!.y, b!.x - a!.x);
      this.twoMidY = (a!.y + b!.y) / 2;
    }
  }

  private move(e: PointerEvent): void {
    const s = 0.0055 * this.sensitivity;
    if (this.joy && e.pointerId === this.joy.id) {
      e.preventDefault();
      const dx = e.clientX - this.joy.sx;
      const dy = e.clientY - this.joy.sy;
      const r = Math.hypot(dx, dy);
      const max = 60;
      const k = r > max ? max / r : 1;
      this.knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
      const nx = (dx * k) / max;
      const ny = (dy * k) / max;
      this.input.analogStrafe = Math.abs(nx) < 0.12 ? 0 : nx;
      this.input.analogForward = Math.abs(ny) < 0.12 ? 0 : -ny;
      this.input.setKey('ControlLeft', r > max * 1.35 && ny < -0.5);
      return;
    }
    const p = this.look.get(e.pointerId);
    if (!p) return;
    e.preventDefault();
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    if (Math.hypot(p.x - p.sx, p.y - p.sy) > MOVE_SLOP) p.moved = true;
    if (e.pointerId === this.miner) {
      // Mining: sliding the finger moves the aim to the next block (the view stays put).
      const [x, y] = this.ndc(p.x, p.y);
      this.input.setAim(x, y);
      return;
    }
    if (this.look.size === 1) {
      this.input.lookYaw += dx * s;
      this.input.lookPitch -= dy * s;
    } else if (this.look.size === 2) {
      const [a, b] = [...this.look.values()];
      const ang = Math.atan2(b!.y - a!.y, b!.x - a!.x);
      let da = ang - this.twist;
      if (da > Math.PI) da -= Math.PI * 2;
      if (da < -Math.PI) da += Math.PI * 2;
      this.twist = ang;
      this.input.sliceRH += da;
      const my = (a!.y + b!.y) / 2;
      this.input.sliceFH += (this.twoMidY - my) * 0.006;
      this.twoMidY = my;
    }
  }

  private up(e: PointerEvent): void {
    if (this.joy && e.pointerId === this.joy.id) {
      this.joy = null;
      this.base.style.display = 'none';
      this.root.classList.remove('moving');
      this.input.analogForward = 0;
      this.input.analogStrafe = 0;
      this.input.setKey('ControlLeft', false);
      return;
    }
    const p = this.look.get(e.pointerId);
    if (!p) return;
    this.look.delete(e.pointerId);
    window.clearTimeout(this.longPress);
    if (e.pointerId === this.miner) {
      this.stopMining();
      return;
    }
    // Quick tap without moving: interact at the tapped point.
    if (!p.moved && performance.now() - p.t < TAP_MS && this.look.size === 0) {
      const [x, y] = this.ndc(p.x, p.y);
      this.input.tapAt(x, y);
    }
  }

  private stopMining(): void {
    if (this.miner >= 0) {
      this.miner = -1;
      this.input.setButton(0, false);
      this.input.clearAim();
    }
  }

  private reset(): void {
    this.joy = null;
    this.look.clear();
    this.stopMining();
    this.input.analogForward = 0;
    this.input.analogStrafe = 0;
    this.base.style.display = 'none';
  }
}
