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
  skyHeight(x: number, z: number, w: number): number;
  setTime(t: number): void;
  setWeather(w: string): void;
  setResolution(h: number | 'auto'): void;
  setWire(on: boolean): void;
  setDebug(on: boolean): void;
  state(): Record<string, unknown> & { pos: number[]; eye: number[]; hidden: number[]; fwd: number[]; columns: number };
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
  spawnMob(name: string, x: number, y: number, z: number, w: number, scale?: number): number;
  spawnMobAhead(name: string, dist: number, side?: number, hidden?: number, worldAligned?: boolean): number;
  placeMobAhead(id: number, dist: number, side?: number, hidden?: number): boolean;
  mobs(): { id: number; name: string; health: number; pos: number[]; mode: string; awake: boolean }[];
  freezeMobs(on: boolean): void;
  clearMobs(): void;
  setMobSpawning(on: boolean): void;
  packedMobs(): number;
  targetMob(): { id: number; name: string } | null;
  attack(): Promise<void>;
  bow(ms: number): Promise<void>;
  arrows(): { pos: number[]; stuck: boolean; byPlayer: boolean }[];
  vitals(): { health: number; air: number; dead: boolean; cause: string };
  hurt(amount: number, cause?: string): boolean;
  setHealth(hp: number): void;
  respawn(): void;
  explode(x: number, y: number, z: number, w: number, r: number): void;
  threat(): { glow: number[]; text: string };
  setDifficulty(d: 'peaceful' | 'easy' | 'normal' | 'hard'): void;
  // Phase 5
  itemId(name: string): number;
  travel(x: number, y: number, z: number, w: number): void;
  setBlock(x: number, y: number, z: number, w: number, name: string): boolean;
  time(): { ticks: number; timeOfDay: number; day: number; weather: string };
  locate(names: string[], maxDist?: number): { name: string; x: number; y: number; z: number; w: number } | null;
  structureNames(): string[];
  villagers(): { id: number; name: string; pos: number[]; profession: string | null; level: number; offers: { cost: [string, number][]; result: [string, number]; uses: number; maxUses: number }[] }[];
  talk(id: number): boolean;
  trade(id: number, i: number): boolean;
  spawnerCount(): number;
  atlas(): { item: string; target: { name: string; x: number; y: number; z: number; w: number } | null } | null;
  readout(): string;
  useBed(x: number, y: number, z: number, w: number): boolean;
  bed(): [number, number, number, number] | null;
  sleeping(): { t: number; skipped: boolean } | null;
  wake(): void;
  rayDist(max?: number): number;
  harvestAt(x: number, y: number, z: number, w: number): boolean;
  // Phase 6
  findBiome(name: string, maxDist?: number): number[] | null;
  realm(): string;
  buildPortalFrame(x: number, y: number, z: number, w: number, axis: number, block?: string, thin?: number): { axis: number; thin?: number; min: number[]; max: number[] };
  lightPortal(x: number, y: number, z: number, w: number): boolean;
  portals(): { realm: string; axis: number; thin?: number; min: number[]; max: number[] }[];
  portalTime(): number;
  traveling(): string | null;
  nightVision(): boolean;
  startFire(x: number, y: number, z: number, w: number): boolean;
  fires(): number;
  fireTicks(n: number): void;
  burning(): number;
  mobBurning(id: number): number;
  boss(): { id: number; name: string; health: number; max: number; phase: number; mode: string; pillars: { x: number; y: number; z: number; w: number; erupt: number }[]; warning: string } | null;
  spawnBoss(name: string, x: number, y: number, z: number, w: number): number;
  hurtMob(id: number, amount: number): boolean;
  // Phase 7
  survival(): { food: number; saturation: number; xp: number; level: number; armor: number; absorption: number; effects: [string, number, number][]; using: { item: string; t: number } | null };
  setFood(food: number, saturation?: number): void;
  applyEffect(name: string, seconds: number, amp?: number): boolean;
  addXp(n: number): void;
  wear(slot: number, name: string | null): void;
  giveTagged(name: string, tag: Record<string, unknown>, count?: number): number;
  holdUse(ms: number): Promise<void>;
  lineSegments(): number;
  wearTagged(slot: number, name: string, tag: Record<string, unknown>): void;
  enchantAt(pos: number[], name: string, azurite: number, i: number): { ok: boolean; ench: [string, number][]; level: number };
  shelves(pos: number[]): number;
  openScreen(kind: 'enchanting' | 'anvil' | 'grindstone', pos: [number, number, number, number]): void;
  keyBlocksFound(): number;
  farmTicks(x: number, y: number, z: number, w: number, n: number): string;
  growSapling(x: number, y: number, z: number, w: number): boolean;
  useOn(x: number, y: number, z: number, w: number): void;
  farmCount(): number;
  hydrated(x: number, y: number, z: number, w: number): boolean;
  visionMobs(): number;
  orbs(): number;
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
