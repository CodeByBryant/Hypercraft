// Touch controls for phones/tablets.
//
//  left half      floating joystick (move); pushing to the rim sprints
//  right half     drag = look; tap = place / use; long-press = break (hold)
//                 two fingers: twist = rotate the slice right<->hidden,
//                              drag up/down = rotate the slice forward<->hidden
//  buttons        jump, sneak (toggle), kata / ana (hold), slice rotation (hold), snap,
//                 fly (creative), inventory, pause, debug, wireframe
//
// Everything is fed through Input (virtual keys, analog axes, look deltas) so gameplay code
// does not care where input came from.

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
}

export function isTouchDevice(): boolean {
  return (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches) || navigator.maxTouchPoints > 0;
}

export class TouchControls {
  readonly root: HTMLDivElement;
  private readonly input: Input;
  private joy: Pt | null = null;
  private readonly look = new Map<number, Pt>();
  private readonly base: HTMLDivElement;
  private readonly knob: HTMLDivElement;
  private longPress = 0;
  private breaking = false;
  private twist = 0;
  private twoMidY = 0;
  private sneakOn = false;
  sensitivity = 1;
  private visible = false;

  constructor(parent: HTMLElement, input: Input, hooks: TouchHooks) {
    this.input = input;
    const root = document.createElement('div');
    root.className = 'touch';
    parent.appendChild(root);
    this.root = root;
    const zoneL = this.div('touch-zone left', root);
    const zoneR = this.div('touch-zone right', root);
    this.base = this.div('joy-base', root);
    this.knob = this.div('joy-knob', this.base);
    this.base.style.display = 'none';

    zoneL.addEventListener('pointerdown', (e) => this.joyDown(e));
    zoneR.addEventListener('pointerdown', (e) => this.lookDown(e));
    window.addEventListener('pointermove', (e) => this.move(e), { passive: false });
    window.addEventListener('pointerup', (e) => this.up(e));
    window.addEventListener('pointercancel', (e) => this.up(e));

    const cluster = this.div('touch-buttons', root);
    this.hold(cluster, 'Jump', 'Space', 'big jump');
    this.button(cluster, 'Sneak', 'sneak', () => {
      this.sneakOn = !this.sneakOn;
      input.setKey('ShiftLeft', this.sneakOn);
      return this.sneakOn;
    });
    this.hold(cluster, '◀ Kata', 'KeyQ', 'kata');
    this.hold(cluster, 'Ana ▶', 'KeyE', 'ana');
    this.holdMouse(cluster, 'Break', 0, 'break');
    this.button(cluster, 'Place', 'place', () => {
      input.setButton(2, true);
      setTimeout(() => input.setButton(2, false), 60);
      return false;
    });
    const slice = this.div('touch-slice', root);
    this.hold(slice, '⟲', 'KeyZ', 'small');
    this.hold(slice, '⟳', 'KeyX', 'small');
    this.hold(slice, '⤒', 'KeyV', 'small');
    this.hold(slice, '⤓', 'KeyF', 'small');
    this.tapKey(slice, 'Snap', 'KeyC', 'small');
    const top = this.div('touch-top', root);
    this.button(top, '☰', 'pause', () => {
      hooks.onPause();
      return false;
    });
    if (hooks.onInventory) {
      this.button(top, 'Inv', 'inv', () => {
        hooks.onInventory!();
        return false;
      });
    }
    this.button(top, 'Fly', 'fly', () => {
      hooks.onToggleFly?.();
      return false;
    });
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
  private hold(parent: HTMLElement, label: string, code: string, cls: string): void {
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
  }

  private holdMouse(parent: HTMLElement, label: string, button: number, cls: string): void {
    const b = this.mkButton(parent, label, cls);
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      b.setPointerCapture(e.pointerId);
      b.classList.add('on');
      this.input.setButton(button, true);
    });
    const release = () => {
      b.classList.remove('on');
      this.input.setButton(button, false);
    };
    b.addEventListener('pointerup', release);
    b.addEventListener('pointercancel', release);
  }

  private tapKey(parent: HTMLElement, label: string, code: string, cls: string): void {
    const b = this.mkButton(parent, label, cls);
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.input.setKey(code, true);
      setTimeout(() => this.input.setKey(code, false), 50);
    });
  }

  /** Button with custom behaviour; `fn` returns the toggled state for styling. */
  private button(parent: HTMLElement, label: string, cls: string, fn: () => boolean): void {
    const b = this.mkButton(parent, label, cls);
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      b.classList.toggle('on', fn());
    });
  }

  private joyDown(e: PointerEvent): void {
    if (this.joy) return;
    e.preventDefault();
    this.joy = { id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), moved: false };
    this.base.style.display = 'block';
    this.base.style.left = `${e.clientX - 60}px`;
    this.base.style.top = `${e.clientY - 60}px`;
    this.knob.style.transform = 'translate(0px, 0px)';
  }

  private lookDown(e: PointerEvent): void {
    e.preventDefault();
    const p: Pt = { id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), moved: false };
    this.look.set(e.pointerId, p);
    if (this.look.size === 1) {
      // Long-press to break.
      const id = e.pointerId;
      window.clearTimeout(this.longPress);
      this.longPress = window.setTimeout(() => {
        const q = this.look.get(id);
        if (q && !q.moved && this.look.size === 1) {
          this.breaking = true;
          this.input.setButton(0, true);
        }
      }, 380);
    } else if (this.look.size === 2) {
      window.clearTimeout(this.longPress);
      this.stopBreaking();
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
    if (Math.hypot(p.x - p.sx, p.y - p.sy) > 12) p.moved = true;
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
      this.input.analogForward = 0;
      this.input.analogStrafe = 0;
      this.input.setKey('ControlLeft', false);
      return;
    }
    const p = this.look.get(e.pointerId);
    if (!p) return;
    this.look.delete(e.pointerId);
    window.clearTimeout(this.longPress);
    if (this.breaking) {
      this.stopBreaking();
      return;
    }
    // Quick tap without moving: place / use.
    if (!p.moved && performance.now() - p.t < 300 && this.look.size === 0) {
      this.input.setButton(2, true);
      setTimeout(() => this.input.setButton(2, false), 60);
    }
  }

  private stopBreaking(): void {
    if (this.breaking) {
      this.breaking = false;
      this.input.setButton(0, false);
    }
  }

  private reset(): void {
    this.joy = null;
    this.look.clear();
    this.stopBreaking();
    this.input.analogForward = 0;
    this.input.analogStrafe = 0;
  }
}
