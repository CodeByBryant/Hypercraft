// Player-facing settings (persisted in localStorage). URL parameters override them for tests
// and benchmarks: ?seed=..&rd=..&res=..&fov=..&test=1&workers=..

export interface Settings {
  seed: string;
  /** Render distance in chunks (window radius). */
  renderDistance: number;
  /** 'auto' or a fixed internal height in pixels. */
  resolution: 'auto' | number;
  fov: number;
  sensitivity: number;
  outline: number;
  pixelated: boolean;
  maxSteps: number;
  /** Stretch of the load metric along the hidden axis (bigger = thinner shell). */
  hiddenStretch: number;
  invertY: boolean;
  vignette: number;
  tint4D: boolean;
  /** Touch controls: auto-detect, always on, or off. */
  touch: 'auto' | 'on' | 'off';
}

export const DEFAULT_SETTINGS: Settings = {
  seed: 'hypercraft',
  renderDistance: 4,
  resolution: 'auto',
  fov: 75,
  sensitivity: 1,
  outline: 0.3,
  pixelated: false,
  maxSteps: 256,
  hiddenStretch: 2,
  invertY: false,
  vignette: 0.35,
  tint4D: true,
  touch: 'auto',
};

const KEY = 'hypercraft.settings.v1';

export function loadSettings(): Settings {
  let s: Settings = { ...DEFAULT_SETTINGS };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) s = { ...s, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    // storage unavailable: defaults
  }
  const q = new URLSearchParams(location.search);
  if (q.has('seed')) s.seed = q.get('seed')!;
  if (q.has('rd')) s.renderDistance = Math.max(2, Math.min(8, Number(q.get('rd'))));
  if (q.has('res')) s.resolution = q.get('res') === 'auto' ? 'auto' : Math.max(120, Number(q.get('res')));
  if (q.has('fov')) s.fov = Number(q.get('fov'));
  if (q.has('steps')) s.maxSteps = Number(q.get('steps'));
  return s;
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // ignore
  }
}
