# Architecture

HYPERCRAFT is a Vite + TypeScript app with no runtime UI framework. Shaders are `.glsl` files
imported as strings (`?raw`). Everything content-related is data (`src/content/*`), compiled
into flat tables by the registry; engine and renderer only consume those tables.

```
src/
  main.ts                 boot: settings, Game, HUD, test API, ?bench
  game/Game.ts            owns all systems, runs the frame loop
  game/Settings.ts        persisted settings (+ URL overrides for tests)
  content/                data-driven registries (R4)
    types.ts              schemas: BlockDef, ShapeDef, TextureDef, BiomeDef, RealmDef
    blocks.ts shapes.ts textures.ts biomes.ts realms.ts
    registry.ts           compiles content -> typed arrays + GPU tables, validates
    textureGen.ts         procedural 16³ solid textures + atlas packing
  math/                   vec4, rng/hash, simplex noise 2/3/4D, Frame4 camera, cross-sections
  world/
    constants.ts          chunk/brick layout, keys
    Chunk.ts              brick-sparse 16⁴ chunk (CPU mirror of the GPU layout)
    World.ts              resident columns, toroidal window, voxel/light access, heightmaps
    Streamer.ts           what to load: 4D slice-aware priority, unloading, worker jobs
    raycast.ts            CPU 4D DDA for picking (same shape tests as the shader)
    gen/                  worker entry, protocol, pool, generator registry, SurfaceGen
    light/                columnLight (worker), LightEngine (main-thread seams + edits)
    fluids/Fluids.ts      cellular 4D water/lava
  game/items/             inventory, item entities, block entities, mining, crafting (Phase 3)
  game/mobs/              MobManager (spawning, AI, physics, combat, GPU packing),
                          Pathfinder (4D A*), Projectiles, ray-vs-primitive tests (Phase 4)
  game/Vitals.ts          player health and air; game/combat.ts weapon/bow numbers
  physics/Player.ts       4D hyperbox player
  input/Input.ts          rebindable actions, mouse, pointer lock
  env/Environment.ts      day/night, moon phases, weather, biome-tinted sky/fog
  render/
    Renderer.ts           passes, uniforms, GPU timer, async stats readback
    GpuWorld.ts           chunk table, brick table, brick pools, surface map, uploads
    LineOverlay.ts        CPU cross-section polytopes drawn as thick lines
    ResolutionScaler.ts   adaptive internal resolution (R5)
    shaders/              fullscreen.vert, raymarch.frag, composite.frag, lines.vert/frag
  ui/Hud.ts style.css     HUD, F3 overlay, hidden-axis compass + radar, menus
  debug/testApi.ts        window.__hc hooks for Playwright
  debug/bench.ts          ?bench=1 in-game benchmark
```

## Threads

* **Main thread**: input, physics, streaming decisions, light seams and edit updates (BFS with
  a per-frame budget), fluids, GPU uploads (time-budgeted), rendering, HUD.
* **Generation workers** (`min(4, cores − 1)`): generate a column, compute column-local light,
  pack into brick-sparse chunks and transfer the buffers (zero-copy). Workers never see
  neighbours; light that crosses column borders is fixed up on the main thread
  (`LightEngine.seedSeam`).

No SharedArrayBuffer is used, so the game runs on any static host (no COOP/COEP headers).

## Frame loop (`Game.frame`)

1. Input → camera rotations (yaw/pitch, slice tilts, snap) and the movement intent.
2. Player physics (substepped, slice-basis collision), then vitals (falls, lava, contact
   blocks, drowning, void, death), item entities, mobs (spawn cycle, AI with a pathfinding
   budget, physics, despawn) and projectiles.
3. Fixed 20 Hz ticks: time of day, weather state machine, fluids (water every 5 ticks, lava
   every 30).
4. Streamer: move the toroidal window when the player changes chunk; re-plan every 250 ms or
   on movement/rotation; submit jobs nearest-first; integrate finished columns.
5. Light BFS (removals, then increases) within a node budget.
6. GPU sync: dirty bricks every frame, fresh chunks within ~5 ms.
7. Picking (CPU 4D DDA, then mob primitives: a mob nearer than the block wins), selection
   outline, P-mode polytopes, and packing the mobs that cross the slice into the entity
   texture.
8. Environment update (sky colours, precipitation masked by sky exposure), particles and
   sprites, and a 5 Hz scan of the hidden axis for hazards, obstacles and hidden hostile
   mobs (R2).
9. Render: ray march at internal resolution → composite → line overlay.
10. Adaptive resolution update, HUD (10 Hz for the slow parts).

The steady-state frame allocates nothing in engine code. `scripts/alloc-profile.mjs` samples
allocations with the V8 heap profiler; the only per-frame allocation it finds is the
browser's own `requestAnimationFrame` bookkeeping (~0.4 KB/frame). The F3 overlay formats
strings at 10 Hz while it is open.

## Streaming

The loaded region is a stretched ball around the eye: in-slice distance plus
`hiddenStretch × (distance along the hidden axis)`, so the world is thick around the current
slice (for moving kata/ana) without paying for a full 4D ball. Priorities are that metric,
nearest first. Columns that leave the window or drift out of range are unloaded; columns the
player edited are retained in memory and reused when they come back (IndexedDB persistence
is a later phase).

## Data flow of an edit

`World.setBlock` → chunk brick materialised if it was uniform → heightmap update → listeners:
`LightEngine.onBlockChanged` (removal + re-propagation, marks light bricks dirty) and
`FluidSim.onBlockChanged` (schedules the cell and its 8 neighbours) → `GpuWorld.sync` uploads
the dirty bricks (and rewrites the brick-table tile if a brick changed between uniform and
non-uniform) before the next render.

## Realms

A realm (`src/content/realms.ts`) names its generator, height, gravity axis and strength,
sea level, sky/weather lists and portal coordinate scale. The physics and camera already take
the gravity axis as a parameter (the Mirror Realm will use W).

Two realms exist since Phase 6: the Surface (`SurfaceGen`) and the Ember Depths
(`EmberGen`, enclosed under a bedrock roof).

**One realm is live at a time.** The `Game` is built for the realm named in the saved state,
with its world, workers, generator, environment and mobs. Portal travel (`src/game/Portals.ts`)
works like this:
1. `Game.beginTravel` snapshots the player into the destination realm at the scaled position
   (x, z and w × `coordinateScale` ratio), with an `arrival` record.
2. `main.ts` saves (or, for test worlds, puts the world in session storage) and reloads the
   page.
3. On load, `checkLoaded` waits for the columns around the player, then `arrive()` steps into
   a known portal or builds one.

Columns are saved per realm (`Persistence.realm`), and so are the portal records
(`SavedState.data.portals`). Structures are per realm (`StructureDef.realm`) through the
`StructureTerrain` interface.
