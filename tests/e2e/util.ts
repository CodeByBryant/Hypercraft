import type { Page } from '@playwright/test';

export interface Hc {
  ready(t?: number): Promise<void>;
  idle(t?: number): Promise<void>;
  manual(on?: boolean): void;
  frames(n?: number): Promise<void>;
  renderNow(): number;
  benchRender(n?: number): number;
  raySteps(): { avg: number; max: number; p95: number };
  setView(v: { yaw?: number; pitch?: number; xw?: number; zw?: number }): void;
  teleport(x: number, y: number, z: number, w: number): void;
  setFlying(on: boolean): void;
  setMode(m: string): void;
  key(code: string, down: boolean): void;
  breakTarget(): boolean;
  placeTarget(name: string): boolean;
  target(): null | { x: number; y: number; z: number; w: number; axis: number; sign: number; name: string };
  blockAt(x: number, y: number, z: number, w: number): string;
  setTime(t: number): void;
  setWeather(w: string): void;
  setResolution(h: number | 'auto'): void;
  setWire(on: boolean): void;
  setDebug(on: boolean): void;
  state(): Record<string, unknown> & { pos: number[]; eye: number[]; hidden: number[]; columns: number };
  give(name: string, count?: number): number;
  inventory(): [number, string, number, number][];
  clearInventory(): void;
  select(i: number): void;
  mine(timeoutMs?: number): Promise<number>;
  dropped(): [string, number, ...number[]][];
  use(): void;
  screenOpen(): boolean;
  closeScreen(): void;
  openInventory(): void;
  blockEntity(x: number, y: number, z: number, w: number): unknown;
  beSet(x: number, y: number, z: number, w: number, slot: number, name: string | null, count?: number): boolean;
  beGet(x: number, y: number, z: number, w: number, slot: number): [string, number] | null;
  tickWorld(seconds: number): void;
}

declare global {
  interface Window {
    __hc: Hc;
  }
}

/** Open the game in test mode and wait until the spawn area is streamed, lit and uploaded. */
export async function boot(page: Page, query: string, errors: string[]): Promise<void> {
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  await page.goto(`/?test=1&${query}`);
  await page.waitForFunction(() => window.__hc !== undefined, null, { timeout: 30_000 });
  await page.evaluate(() => window.__hc.manual(true));
  await page.evaluate(() => window.__hc.ready(120_000));
  await page.evaluate(() => window.__hc.idle(240_000));
}
