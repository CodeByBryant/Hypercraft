// Keyboard/mouse input with rebindable actions (bindings are data; a rebinding UI comes in
// the UX phase). Tracks held actions, per-frame "pressed" edges and mouse deltas.

export const ACTIONS = [
  'forward',
  'back',
  'left',
  'right',
  'lookLeft',
  'lookRight',
  'lookUp',
  'lookDown',
  'kata',
  'ana',
  'jump',
  'sneak',
  'sprint',
  'tiltForwardPlus',
  'tiltForwardMinus',
  'tiltRightPlus',
  'tiltRightMinus',
  'snapSlice',
  'rotateSliceMouse',
  'debug',
  'wireframe',
  'gameMode',
  'pause',
  'timeSkip',
  'weather',
  'hotbar1',
  'hotbar2',
  'hotbar3',
  'hotbar4',
  'hotbar5',
  'hotbar6',
  'hotbar7',
  'hotbar8',
  'hotbar9',
  'resolution',
  'inventory',
  'drop',
] as const;
export type Action = (typeof ACTIONS)[number];

export const DEFAULT_BINDINGS: Record<Action, string[]> = {
  forward: ['KeyW'],
  back: ['KeyS'],
  left: ['KeyA'],
  right: ['KeyD'],
  lookLeft: ['ArrowLeft'],
  lookRight: ['ArrowRight'],
  lookUp: ['ArrowUp'],
  lookDown: ['ArrowDown'],
  kata: ['KeyQ'],
  ana: ['KeyE'],
  jump: ['Space'],
  sneak: ['ShiftLeft', 'ShiftRight'],
  sprint: ['ControlLeft', 'KeyR'],
  tiltForwardPlus: ['KeyV'],
  tiltForwardMinus: ['KeyF'],
  tiltRightPlus: ['KeyX'],
  tiltRightMinus: ['KeyZ'],
  snapSlice: ['KeyC'],
  rotateSliceMouse: ['AltLeft', 'AltRight'],
  debug: ['F3', 'Backquote'],
  wireframe: ['KeyP'],
  gameMode: ['KeyG'],
  pause: ['Escape'],
  timeSkip: ['KeyT'],
  weather: ['KeyY'],
  hotbar1: ['Digit1'],
  hotbar2: ['Digit2'],
  hotbar3: ['Digit3'],
  hotbar4: ['Digit4'],
  hotbar5: ['Digit5'],
  hotbar6: ['Digit6'],
  hotbar7: ['Digit7'],
  hotbar8: ['Digit8'],
  hotbar9: ['Digit9'],
  resolution: ['KeyO'],
  inventory: ['Tab', 'KeyI'],
  drop: ['KeyB'],
};

export class Input {
  private readonly keys = new Set<string>();
  private readonly pressedKeys = new Set<string>();
  private readonly codeToActions = new Map<string, Action[]>();
  bindings: Record<Action, string[]>;
  mouseDX = 0;
  mouseDY = 0;
  wheel = 0;
  buttons = 0;
  pressedButtons = 0;
  locked = false;
  /** When false (menus open), gameplay input is ignored. */
  enabled = true;
  private lastJumpPress = -1e9;
  doubleJump = false;
  private readonly canvas: HTMLElement;

  constructor(canvas: HTMLElement, bindings: Record<Action, string[]> = DEFAULT_BINDINGS) {
    this.canvas = canvas;
    this.bindings = bindings;
    this.rebuild();
    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.buttons = 0;
    });
    canvas.addEventListener('mousedown', (e) => {
      this.buttons |= 1 << e.button;
      this.pressedButtons |= 1 << e.button;
      e.preventDefault();
    });
    window.addEventListener('mouseup', (e) => {
      this.buttons &= ~(1 << e.button);
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('mousemove', (e) => {
      if (!this.locked && !this.freeMouse) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
    window.addEventListener(
      'wheel',
      (e) => {
        this.wheel += Math.sign(e.deltaY);
      },
      { passive: true },
    );
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
    });
  }

  /** Test mode: accept mouse movement without pointer lock. */
  freeMouse = false;
  /** Analog movement from touch/gamepad (-1..1), added to the keyboard axes. */
  analogForward = 0;
  analogStrafe = 0;
  /** Look deltas from touch/gamepad, in radians this frame (added to mouse look). */
  lookYaw = 0;
  lookPitch = 0;
  /** Slice-rotation deltas from gestures, in radians this frame. */
  sliceRH = 0;
  sliceFH = 0;

  rebuild(): void {
    this.codeToActions.clear();
    for (const a of ACTIONS) {
      for (const code of this.bindings[a]) {
        const list = this.codeToActions.get(code) ?? [];
        list.push(a);
        this.codeToActions.set(code, list);
      }
    }
  }

  private onKey(e: KeyboardEvent, down: boolean): void {
    const code = e.code;
    const acts = this.codeToActions.get(code);
    if (acts) {
      // Keep the browser from handling game keys (F3 = find, Space = scroll, Alt = menu...).
      if (code !== 'Escape' || this.locked) e.preventDefault();
    }
    if (down) {
      if (!this.keys.has(code)) {
        this.pressedKeys.add(code);
        if (acts?.includes('jump')) {
          const now = performance.now();
          if (now - this.lastJumpPress < 300) this.doubleJump = true;
          this.lastJumpPress = now;
        }
      }
      this.keys.add(code);
    } else {
      this.keys.delete(code);
    }
  }

  requestLock(): void {
    const c = this.canvas as HTMLCanvasElement;
    try {
      const r = c.requestPointerLock() as unknown as Promise<void> | undefined;
      if (r && typeof r.catch === 'function') r.catch(() => undefined);
    } catch {
      // not allowed (e.g. headless); test mode uses freeMouse
    }
  }

  held(a: Action): boolean {
    const codes = this.bindings[a];
    for (let i = 0; i < codes.length; i++) if (this.keys.has(codes[i]!)) return true;
    return false;
  }

  pressed(a: Action): boolean {
    const codes = this.bindings[a];
    for (let i = 0; i < codes.length; i++) if (this.pressedKeys.has(codes[i]!)) return true;
    return false;
  }

  buttonPressed(b: number): boolean {
    return (this.pressedButtons & (1 << b)) !== 0;
  }

  buttonHeld(b: number): boolean {
    return (this.buttons & (1 << b)) !== 0;
  }

  /** Call once at the end of every frame. */
  /** Forget key/button press edges (after a UI screen consumed them). */
  clearPressed(): void {
    this.pressedKeys.clear();
    this.pressedButtons = 0;
  }

  endFrame(): void {
    this.pressedKeys.clear();
    this.pressedButtons = 0;
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
    this.doubleJump = false;
    this.lookYaw = 0;
    this.lookPitch = 0;
    this.sliceRH = 0;
    this.sliceFH = 0;
  }

  /** Programmatic mouse buttons (touch controls): 0 = break, 2 = place, 1 = pick. */
  setButton(b: number, down: boolean): void {
    if (down) {
      if ((this.buttons & (1 << b)) === 0) this.pressedButtons |= 1 << b;
      this.buttons |= 1 << b;
    } else this.buttons &= ~(1 << b);
  }

  /** Programmatic single press of an action's first bound key. */
  tap(a: Action): void {
    const code = this.bindings[a][0];
    if (code) this.pressedKeys.add(code);
  }

  /** Programmatic key control (tests, touch controls later). */
  setKey(code: string, down: boolean): void {
    if (down) {
      if (!this.keys.has(code)) {
        this.pressedKeys.add(code);
        const acts = this.codeToActions.get(code);
        if (acts?.includes('jump')) {
          const now = performance.now();
          if (now - this.lastJumpPress < 300) this.doubleJump = true;
          this.lastJumpPress = now;
        }
      }
      this.keys.add(code);
    } else this.keys.delete(code);
  }
}
