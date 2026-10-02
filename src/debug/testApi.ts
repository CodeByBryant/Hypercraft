// Hooks for Playwright tests and benchmarks (window.__hc). Exposed in every build: they only
// drive the same public game methods a player uses, which keeps smoke tests honest.

import { makeTiltedFrame } from '../math/frame';
import { REG } from '../content/registry';
import { makeRayHit, raycast } from '../world/raycast';
import type { Game } from '../game/Game';
import type { WeatherKind } from '../content/types';
import { IREG } from '../content/itemRegistry';
import { SlotContainer } from '../game/items/ItemStack';
import type { InventoryScreen } from '../ui/InventoryScreen';
import { STRUCTURES } from '../content/structures';
import { frameCells, framedAxes, interiorCells, type PortalBox } from '../game/Portals';

export interface ViewSpec {
  yaw?: number;
  pitch?: number;
  xw?: number;
  zw?: number;
}

export function installTestApi(game: Game, screen?: InventoryScreen): void {
  const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
  let frozenMobs = false;
  /** A point `dist` ahead / `side` right / `hidden` ana of the player, standing on the ground. */
  const aheadOnGround = (dist: number, side: number, hidden: number): number[] => {
    const p = game.player;
    const F = p.cam.F, R = p.cam.R, H = p.cam.H;
    const q = [0, 0, 0, 0].map((_, k) => p.pos[k]! + F[k]! * dist + R[k]! * side + H[k]! * hidden);
    const x = Math.floor(q[0]!), z = Math.floor(q[2]!), w = Math.floor(q[3]!);
    // The first floor at or below the player's level (+3), so tree canopies do not count.
    let y = Math.floor(p.pos[1]!) + 3;
    for (; y > 1; y--) {
      const below = game.world.getBlock(x, y - 1, z, w) & 0xfff;
      const at = game.world.getBlock(x, y, z, w) & 0xfff;
      if (REG.solid[below] && !REG.solid[at]) break;
    }
    q[1] = y > 1 ? y : game.world.skyHeight(x, z, w);
    return q;
  };
  // Frozen mobs: skip their update (the game calls update every frame).
  const update = game.mobs.update.bind(game.mobs);
  game.mobs.update = (...args: Parameters<typeof update>) => {
    if (!frozenMobs) update(...args);
  };
  const px = new Uint8Array(4);
  /** gl.finish() does not block on Chrome's GPU process; a 1-pixel read does. */
  const sync = () => {
    const gl = game.renderer.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  };
  const api = {
    game,
    /** Resolves when the spawn column is loaded and physics is running. */
    async ready(timeoutMs = 60000): Promise<void> {
      const t0 = performance.now();
      while (!game.loaded) {
        if (performance.now() - t0 > timeoutMs) throw new Error('timeout waiting for spawn');
        await nextFrame();
      }
    },
    /** Resolves when streaming, lighting and uploads have all settled. */
    async idle(timeoutMs = 120000): Promise<void> {
      const t0 = performance.now();
      let calm = 0;
      while (calm < 5) {
        const busy =
          game.streamer.pendingCount > 0 ||
          game.light.pending() > 0 ||
          game.renderer.gpu.stats.queued > 0 ||
          game.world.dirtyChunks.length > 0;
        calm = busy ? 0 : calm + 1;
        if (performance.now() - t0 > timeoutMs) throw new Error('timeout waiting for idle');
        await nextFrame();
      }
    },
    frames: async (n = 1) => {
      for (let i = 0; i < n; i++) await nextFrame();
    },
    /** Switch to on-demand rendering (software GL in CI renders ~1 frame/s). */
    manual(on = true): void {
      game.renderMode = on ? 'manual' : 'continuous';
    },
    /** Render one frame now and wait for the GPU to finish it; returns ms. */
    renderNow(): number {
      sync();
      const t0 = performance.now();
      game.renderImmediate();
      sync();
      return performance.now() - t0;
    },
    /** Median ms per synchronous render over `n` renders (GPU included via gl.finish). */
    benchRender(n = 5): number {
      const times: number[] = [];
      game.renderImmediate();
      sync();
      for (let i = 0; i < n; i++) {
        const t0 = performance.now();
        game.renderImmediate();
        sync();
        times.push(performance.now() - t0);
      }
      times.sort((a, b) => a - b);
      return times[Math.floor(times.length / 2)]!;
    },
    /** Show buried bricks collapsed (default) or as stored; re-uploads the world at once. */
    setBrickCollapse(on: boolean): void {
      const gpu = game.renderer.gpu;
      gpu.setCollapse(on);
      for (let i = 0; i < 1000 && game.world.dirtyChunks.length > 0; i++) gpu.sync(1e9);
    },
    /** Render now and return the frame's pixels (RGBA, canvas size); `t` pins the animation clock. */
    capture(t?: number): { w: number; h: number; data: number[] } {
      if (t !== undefined) game.env.sky.time = t;
      game.renderImmediate();
      sync();
      const c = game.canvas;
      const cv = document.createElement('canvas');
      cv.width = c.width;
      cv.height = c.height;
      const ctx = cv.getContext('2d')!;
      ctx.drawImage(c, 0, 0);
      return { w: c.width, h: c.height, data: Array.from(ctx.getImageData(0, 0, c.width, c.height).data) };
    },
    /** Average / max ray steps per pixel of the last render (synchronous readback). */
    raySteps(): { avg: number; max: number; p95: number } {
      const aux = game.renderer.readAux();
      const hist = new Uint32Array(256);
      let sum = 0;
      let mx = 0;
      const n = aux.length / 4;
      for (let i = 0; i < n; i++) {
        const s = aux[i * 4 + 2]!;
        sum += s;
        hist[s] = hist[s]! + 1;
        if (s > mx) mx = s;
      }
      let acc = 0;
      let p95 = 0;
      for (let i = 0; i < 256; i++) {
        acc += hist[i]!;
        if (acc >= n * 0.95) {
          p95 = i;
          break;
        }
      }
      return { avg: sum / n, max: mx, p95 };
    },
    teleport(x: number, y: number, z: number, w: number): void {
      game.player.setPosition(x, y, z, w);
      game.streamer.invalidate();
    },
    /** Teleport far away: frozen until the destination has streamed in (then lifted out of terrain). */
    travel(x: number, y: number, z: number, w: number): void {
      game.player.setPosition(x, y, z, w);
      game.player.vel.fill(0);
      game.loaded = false;
      game.player.frozen = true;
      game.streamer.invalidate();
    },
    setBlock: (x: number, y: number, z: number, w: number, name: string) => game.world.setBlock(x, y, z, w, REG.id(name)),
    /** Distance along the view direction to the first block (-1: none within `max`). */
    rayDist(max = 64): number {
      const hit = makeRayHit();
      return raycast(game.world, game.eye(), game.player.cam.fwd, max, hit) ? hit.t : -1;
    },
    /** Set the view: base frame, then XW and ZW slice tilts (degrees), then yaw/pitch. */
    setView(v: ViewSpec): void {
      const f = makeTiltedFrame({ yawDeg: v.yaw ?? 0, pitchDeg: v.pitch ?? 0, xwDeg: v.xw ?? 0, zwDeg: v.zw ?? 0 });
      game.player.cam.copyFrom(f);
      game.streamer.invalidate();
    },
    setFlying(on: boolean): void {
      game.player.flying = on;
    },
    setMode(m: 'survival' | 'creative' | 'spectator'): void {
      game.player.mode = m;
    },
    key(code: string, down: boolean): void {
      game.input.setKey(code, down);
    },
    breakTarget: () => game.breakTarget(),
    /** Give items to the player (Phase 3). */
    give(name: string, count = 1): number {
      return game.inv.add({ id: IREG.id(name), count, damage: 0 });
    },
    inventory(): [number, string, number, number][] {
      const out: [number, string, number, number][] = [];
      for (let i = 0; i < game.inv.size; i++) {
        const s = game.inv.get(i);
        if (s) out.push([i, IREG.name(s.id), s.count, s.damage]);
      }
      return out;
    },
    clearInventory(): void {
      game.inv.clear();
    },
    /** Item id by name (-1 if unknown). */
    itemId: (name: string) => (IREG.has(name) ? IREG.id(name) : -1),
    select(i: number): void {
      game.hotbarIndex = i;
    },
    /**
     * Hold the break button until the targeted block is gone (survival mining takes time);
     * returns the seconds it took, or -1 on timeout.
     */
    async mine(timeoutMs = 20000): Promise<number> {
      const t = game.hasTarget ? { ...game.target } : null;
      if (!t) return -1;
      const t0 = performance.now();
      game.input.setButton(0, true);
      try {
        while (performance.now() - t0 < timeoutMs) {
          await nextFrame();
          if ((game.world.getBlock(t.x, t.y, t.z, t.w) & 0xfff) !== (t.voxel & 0xfff)) return (performance.now() - t0) / 1000;
        }
        return -1;
      } finally {
        game.input.setButton(0, false);
      }
    },
    /** Dropped item entities: [name, count, x, y, z, w]. */
    dropped: () => game.items.list.map((e) => [IREG.name(e.stack.id), e.stack.count, ...Array.from(e.pos)] as [string, number, ...number[]]),
    /** Right-click the target (open stations, use items, place). */
    use(): void {
      game.input.setButton(2, true);
      requestAnimationFrame(() => game.input.setButton(2, false));
    },
    screenOpen: () => screen?.isOpen ?? false,
    closeScreen: () => screen?.close(),
    openInventory: () => game.onOpenScreen?.({ kind: 'inventory' }),
    blockEntity: (x: number, y: number, z: number, w: number) => game.blockEntities.get(x, y, z, w),
    /** Put a stack into a chest/furnace slot. */
    beSet(x: number, y: number, z: number, w: number, slot: number, name: string | null, count = 1): boolean {
      const c = game.blockEntities.container(x, y, z, w);
      if (!c) return false;
      c.set(slot, name ? { id: IREG.id(name), count, damage: 0 } : null);
      return true;
    },
    beGet(x: number, y: number, z: number, w: number, slot: number): [string, number] | null {
      const s = game.blockEntities.container(x, y, z, w)?.get(slot);
      return s ? [IREG.name(s.id), s.count] : null;
    },
    tickWorld(seconds: number): void {
      for (let t = 0; t < seconds; t += 0.05) game.blockEntities.tick(0.05);
    },
    placeTarget: (name: string) => game.placeAtTarget(REG.id(name)),
    /** Break a block like a survival player (drops, bed halves), wherever it is. */
    harvestAt(x: number, y: number, z: number, w: number): boolean {
      const t = game.target;
      t.x = x;
      t.y = y;
      t.z = z;
      t.w = w;
      t.voxel = game.world.getBlock(x, y, z, w);
      game.hasTarget = true;
      return game.harvestTarget();
    },
    target: () => (game.hasTarget ? { ...game.target, p: Array.from(game.target.p), name: REG.name(game.target.voxel) } : null),
    blockAt: (x: number, y: number, z: number, w: number) => REG.name(game.world.getBlock(x, y, z, w)),
    /** Top of the light-blocking terrain (incl. tree canopies) at a column. */
    skyHeight: (x: number, z: number, w: number) => game.world.skyHeight(Math.floor(x), Math.floor(z), Math.floor(w)),
    // ---- Phase 4: mobs, combat, health
    /** Spawn a mob at a 4D point; returns its id (or -1). */
    spawnMob(name: string, x: number, y: number, z: number, w: number, scale?: number): number {
      return game.mobs.spawn(name, x, y, z, w, scale)?.id ?? -1;
    },
    /**
     * Spawn a mob `dist` blocks ahead in the current slice, `side` to the right and `hidden`
     * along the hidden axis, standing on the ground; it faces the player. Returns its id.
     */
    spawnMobAhead(name: string, dist: number, side = 0, hidden = 0, worldAligned = false): number {
      const q = aheadOnGround(dist, side, hidden);
      const m = game.mobs.spawn(name, q[0]!, q[1]!, q[2]!, q[3]!);
      if (!m) return -1;
      const F = game.player.cam.F;
      // Face the player: with the view's own hidden axis, or with world W (a tilted slice
      // then cuts the body obliquely).
      if (worldAligned) m.face(0, -1, 0);
      else m.face(-F[0]!, -F[2]!, -F[3]!, game.player.cam.H);
      return m.id;
    },
    /** Move a mob back in front of the player (standing, at rest). */
    placeMobAhead(id: number, dist: number, side = 0, hidden = 0): boolean {
      const m = game.mobs.list.find((x) => x.id === id);
      if (!m) return false;
      const q = aheadOnGround(dist, side, hidden);
      for (let k = 0; k < 4; k++) {
        m.pos[k] = q[k]!;
        m.vel[k] = 0;
      }
      return true;
    },
    mobs: () =>
      game.mobs.list.map((m) => ({ id: m.id, name: m.def.name, health: m.health, pos: Array.from(m.pos), mode: m.mode, awake: m.awake })),
    /** Freeze mob AI and physics (for screenshots), or resume. */
    freezeMobs(on: boolean): void {
      frozenMobs = on;
    },
    clearMobs(): void {
      game.mobs.list.length = 0;
      game.projectiles.list.length = 0;
    },
    setMobSpawning(on: boolean): void {
      game.mobs.enabled = on;
    },
    packedMobs: () => game.mobs.packed,
    targetMob: () => (game.targetMob ? { id: game.targetMob.id, name: game.targetMob.def.name } : null),
    /** Click the attack button (one press). */
    async attack(): Promise<void> {
      game.input.setButton(0, true);
      await nextFrame();
      game.input.setButton(0, false);
      await nextFrame();
    },
    /** Draw the bow for `ms` milliseconds, then release. */
    async bow(ms: number): Promise<void> {
      game.input.setButton(2, true);
      const t0 = performance.now();
      while (performance.now() - t0 < ms) await nextFrame();
      game.input.setButton(2, false);
      await nextFrame();
      await nextFrame();
    },
    arrows: () => game.projectiles.list.map((a) => ({ pos: Array.from(a.pos), stuck: a.stuck, byPlayer: a.byPlayer })),
    vitals: () => ({ health: game.vitals.health, air: game.vitals.air, dead: game.vitals.dead, cause: game.vitals.deathCause }),
    hurt: (amount: number, cause = 'Test') => game.hurtPlayer(amount, null, cause),
    setHealth(hp: number): void {
      game.vitals.health = hp;
      game.vitals.hurtCooldown = 0;
    },
    respawn: () => game.respawn(),
    explode: (x: number, y: number, z: number, w: number, r: number) => game.explode(x, y, z, w, r),
    threat: () => ({ glow: Array.from(game.params.threat), text: document.querySelector('.threat')?.textContent ?? '' }),
    setDifficulty(d: 'peaceful' | 'easy' | 'normal' | 'hard'): void {
      game.info.difficulty = d;
    },
    setTime: (t: number) => game.env.setTime(t),
    time: () => ({ ticks: game.env.ticks, timeOfDay: game.env.timeOfDay, day: game.env.day, weather: game.env.weather }),
    // ---- Phase 5: structures, villagers, trading, beds
    /** Nearest start of any of the named structures (main-thread search). */
    locate: (names: string[], maxDist = 2000) => {
      const e = game.player.pos;
      return game.generator.nearestStructure?.(names, e[0]!, e[2]!, e[3]!, maxDist) ?? null;
    },
    /**
     * Nearest point (spiral search in x and w at this z) whose biome is `name`, standing on
     * the terrain: [x, y, z, w], or null.
     */
    findBiome(name: string, maxDist = 3000): number[] | null {
      const gen = game.generator;
      if (!gen.sample) return null;
      const want = REG.biomeIndex(name);
      const s = { height: 0, biome: 0, grass: [0, 0, 0] as [number, number, number] };
      const e = game.player.pos;
      for (let r = 0; r <= maxDist; r += 12)
        for (let a = 0; a < Math.max(1, Math.round(r / 6)); a++) {
          const t = (a / Math.max(1, Math.round(r / 6))) * Math.PI * 2;
          const x = Math.floor(e[0]! + Math.cos(t) * r), w = Math.floor(e[3]! + Math.sin(t) * r), z = Math.floor(e[2]!);
          // Realms with 3D biomes: any surface in the column (ledges and islands too) with
          // room to look around.
          if (gen.surfaces) {
            for (const sf of gen.surfaces(x, z, w)) if (sf.biome === want && sf.y >= game.world.realm.seaLevel && sf.room >= 12) return [x + 0.5, sf.y + 1, z + 0.5, w + 0.5];
            continue;
          }
          gen.sample(x, z, w, s);
          if (s.biome === want && s.height >= game.world.realm.seaLevel) return [x + 0.5, s.height + 1, z + 0.5, w + 0.5];
        }
      return null;
    },
    realm: () => game.world.realm.name,
    // ---- Phase 6: portals and realm travel
    /**
     * Build an obsidian portal frame around a 2 x 3 x 2 interior whose low corner is (x, y, z, w),
     * with the given normal axis (0 x, 2 z, 3 w). With `thin` (the second normal), a flat
     * Minecraft-style frame around a 2 x 3 interior instead, with corners. Clears the interior.
     * Returns the interior box.
     */
    buildPortalFrame(x: number, y: number, z: number, w: number, axis: number, block = 'obsidian', thin?: number) {
      const min: [number, number, number, number] = [x, y, z, w];
      const max: [number, number, number, number] = [x, y + 2, z, w];
      const box: PortalBox = { axis, min, max };
      if (thin !== undefined) box.thin = thin;
      for (const a of framedAxes(box)) if (a !== 1) max[a] = min[a] + 1;
      for (const c of interiorCells(box)) game.world.setBlock(c[0]!, c[1]!, c[2]!, c[3]!, 0);
      for (const c of frameCells(box, thin !== undefined)) game.world.setBlock(c[0]!, c[1]!, c[2]!, c[3]!, REG.id(block));
      return box;
    },
    /** Light a portal whose interior contains (x, y, z, w) (what flint and steel does). */
    lightPortal: (x: number, y: number, z: number, w: number) => game.lightPortal(x, y, z, w),
    portals: () => game.portals.map((r) => ({ realm: r.realm, axis: r.axis, thin: r.thin, min: [...r.min], max: [...r.max] })),
    portalTime: () => game.portalTime,
    /** The boss the HUD shows: health, phase, pending and burning pillars, warning. */
    boss: () => {
      const b = game.bosses.boss;
      return b
        ? { id: b.id, name: b.def.name, health: b.health, max: b.def.health, phase: b.phase, mode: b.mode, pillars: game.bosses.pillars.map((p) => ({ x: p.x, y: p.y, z: p.z, w: p.w, erupt: p.erupt })), warning: game.bosses.warning }
        : null;
    },
    /** Spawn a boss with its arena at the spawn point. */
    spawnBoss(name: string, x: number, y: number, z: number, w: number): number {
      const m = game.mobs.spawn(name, x, y, z, w);
      if (!m) return -1;
      m.home = Float64Array.from([x, y, z, w]);
      return m.id;
    },
    /** Hurt a mob (no knockback): kills trigger drops and death effects as in play. */
    hurtMob(id: number, amount: number): boolean {
      const m = game.mobs.list.find((x) => x.id === id);
      return m ? game.mobs.damage(m, amount, null) : false;
    },
    traveling: () => game.traveling,
    /** Night vision is on (and allowed in this game mode). */
    nightVision: () => game.nightVisionOn,
    // ---- Fire
    /** Start a fire in an air cell (needs solid ground or fuel next to it), like flint and steel. */
    startFire: (x: number, y: number, z: number, w: number) => game.startFire(x, y, z, w),
    /** Fires being ticked, and fast-forward `n` world ticks of fire. */
    fires: () => game.fire.count,
    fireTicks(n: number): void {
      for (let i = 0; i < n; i++) game.fire.tick();
    },
    /** Seconds the player keeps burning. */
    burning: () => game.burning,
    mobBurning: (id: number) => game.mobs.list.find((m) => m.id === id)?.burning ?? -1,
    /** Every structure name (data-driven list). */
    structureNames: () => STRUCTURES.map((s) => s.name),
    villagers: () =>
      game.mobs.list
        .filter((m) => m.def.ai === 'villager')
        .map((m) => ({ id: m.id, name: m.def.name, pos: Array.from(m.pos), profession: m.data?.profession ?? m.def.profession ?? null, level: m.data?.level ?? 0, offers: m.data?.offers.map((o) => ({ cost: o.cost, result: o.result, uses: o.uses, maxUses: o.maxUses })) ?? [] })),
    /** Talk to a villager (opens the trade screen); false if it is not a trader. */
    talk(id: number): boolean {
      const m = game.mobs.list.find((x) => x.id === id);
      return m ? game.talkTo(m) : false;
    },
    trade: (id: number, i: number) => game.trade(id, i),
    spawnerCount: () => game.blockEntities.spawnerCount,
    atlas: () => (game.atlas ? { item: IREG.name(game.atlas.item), target: game.atlas.target } : null),
    readout: () => document.querySelector('.readout')?.textContent ?? '',
    useBed: (x: number, y: number, z: number, w: number) => game.useBed(x, y, z, w),
    bed: () => game.bed,
    sleeping: () => (game.sleeping ? { ...game.sleeping } : null),
    wake: () => game.wake(),
    setWeather: (w: WeatherKind) => game.env.setWeather(w),
    setResolution(h: number | 'auto'): void {
      if (h === 'auto') game.scaler.mode = 'auto';
      else {
        game.scaler.mode = 'fixed';
        game.scaler.fixedHeight = h;
      }
    },
    setWire: (on: boolean) => {
      game.params.wire = on;
    },
    // ---- Phase 7: survival, armour, effects, 4D vision
    survival: () => ({
      food: game.hunger.food,
      saturation: game.hunger.saturation,
      xp: game.xp.points,
      level: game.xp.level,
      armor: game.armorTotals()[0],
      absorption: game.vitals.absorption,
      effects: [...game.effects.map.values()].map((e) => [e.name, e.amp, Math.round(e.time)]),
      using: game.using ? { item: IREG.name(game.using.item), t: game.using.t } : null,
    }),
    setFood: (food: number, saturation = 0) => {
      game.hunger.food = food;
      game.hunger.saturation = saturation;
    },
    applyEffect: (name: string, seconds: number, amp = 0) => game.applyEffect(name, seconds, amp),
    addXp: (n: number) => game.xp.add(n),
    /** Put an item straight into an armour slot (0 helmet .. 3 boots); null clears it. */
    wear(slot: number, name: string | null): void {
      game.inv.set(36 + slot, name ? { id: IREG.id(name), count: 1, damage: 0 } : null);
    },
    /** Give a stack with item data (enchantments, names...). */
    giveTagged(name: string, tag: Record<string, unknown>, count = 1): number {
      return game.inv.add({ id: IREG.id(name), count, damage: 0, tag });
    },
    /** Hold the use button for `ms` milliseconds (eating, drinking, bows). */
    async holdUse(ms: number): Promise<void> {
      game.input.setButton(2, true);
      const t0 = performance.now();
      while (performance.now() - t0 < ms) await nextFrame();
      game.input.setButton(2, false);
      await nextFrame();
    },
    wearTagged(slot: number, name: string, tag: Record<string, unknown>): void {
      game.inv.set(36 + slot, { id: IREG.id(name), count: 1, damage: 0, tag });
    },
    /** Enchant `name` at the table at pos with offer i (azurite and levels as a player would pay). */
    enchantAt(pos: number[], name: string, azurite: number, i: number): { ok: boolean; ench: [string, number][]; level: number } {
      const work = new SlotContainer(2);
      work.set(0, { id: IREG.id(name), count: 1, damage: 0 });
      if (azurite > 0) work.set(1, { id: IREG.id('azurite'), count: azurite, damage: 0 });
      const ok = game.enchantWith(work, i, pos);
      return { ok, ench: work.get(0)?.tag?.ench ?? [], level: game.xp.level };
    },
    shelves: (pos: number[]) => game.shelvesAt(pos),
    openScreen: (kind: 'enchanting' | 'anvil' | 'grindstone', pos: [number, number, number, number]) => game.onOpenScreen?.({ kind, pos }),
    keyBlocksFound: () => game.keyBlocks.found,
    farmTicks(x: number, y: number, z: number, w: number, n: number): string {
      for (let i = 0; i < n; i++) game.farming.randomTick(x, y, z, w);
      return REG.name(game.world.getBlock(x, y, z, w));
    },
    growSapling: (x: number, y: number, z: number, w: number) => game.farming.growSapling(x, y, z, w),
    /** Right-click the top face of a cell with the held item (as if aimed there). */
    useOn(x: number, y: number, z: number, w: number): void {
      const t = game.target;
      t.x = x;
      t.y = y;
      t.z = z;
      t.w = w;
      t.axis = 1;
      t.sign = 1;
      t.voxel = game.world.getBlock(x, y, z, w);
      t.p[0] = x + 0.5;
      t.p[1] = y + 1;
      t.p[2] = z + 0.5;
      t.p[3] = w + 0.5;
      game.hasTarget = true;
      game.targetMob = null;
      (game as unknown as { useHeld(s: boolean): void }).useHeld(false);
    },
    farmCount: () => game.farming.count,
    useOnMob(id: number): boolean {
      const m = game.mobs.list.find((x) => x.id === id);
      return m ? game.useOnMob(m) : false;
    },
    mobInfo(id: number) {
      const m = game.mobs.list.find((x) => x.id === id);
      return m ? { love: m.love, baby: m.baby, scale: m.scale, sheared: m.sheared, kept: m.kept, leash: m.leash, name: m.customName } : null;
    },
    hydrated: (x: number, y: number, z: number, w: number) => game.farming.hydrated(x, y, z, w),
    lineSegments: () => game.renderer.lines.segments,
    visionMobs: () => game.vision.drawnMobs,
    orbs: () => game.orbs.list.length,
    setDebug: (on: boolean) => {
      game.showDebug = on;
    },
    state() {
      const p = game.player;
      const rs = game.renderer.stats;
      return {
        pos: Array.from(p.pos),
        eye: Array.from(game.eye()),
        hidden: Array.from(p.cam.hidden),
        fwd: Array.from(p.cam.fwd),
        onGround: p.onGround,
        loaded: game.loaded,
        fps: game.fps,
        frameMs: game.frameMs,
        cpuMs: game.cpuMs,
        gpuMs: rs.gpuMs,
        hasGpuTimer: game.renderer.hasGpuTimer,
        internal: [rs.internalW, rs.internalH],
        avgSteps: rs.avgSteps,
        maxSteps: rs.maxSteps,
        columns: game.world.columns.size,
        pending: game.streamer.pendingCount,
        backlog: game.streamer.backlog,
        workers: { ...game.pool.stats },
        gpu: { ...game.renderer.gpu.stats },
        lightPending: game.light.pending(),
        memMB: game.world.memoryBytes() / 1048576,
        renderer: (() => {
          const gl = game.renderer.gl;
          const ext = gl.getExtension('WEBGL_debug_renderer_info');
          return ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));
        })(),
      };
    },
  };
  (window as unknown as { __hc: typeof api }).__hc = api;
}
