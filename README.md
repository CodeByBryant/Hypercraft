# HYPERCRAFT

A 4D voxel survival sandbox for the browser. The world is made of tesseracts; you see a true
3D cross-section of it, and every system is built around a fourth spatial axis.

**Status: Phase 4 (mobs, combat, health) complete.** Phase reports (what works, what's
broken, what's next): [Phase 1 — engine](docs/phases/phase-1.md) ·
[Phase 2 — surface terrain](docs/phases/phase-2.md) · [Phase 3 — items](docs/phases/phase-3.md) ·
[Phase 4 — mobs](docs/phases/phase-4.md).

| Axis-aligned slice | 30° XW tilt | 45° XW + 45° ZW tilt |
|---|---|---|
| ![](docs/screenshots/phase-2/1-axis-aligned.png) | ![](docs/screenshots/phase-2/2-xw-30.png) | ![](docs/screenshots/phase-2/3-xw45-zw45.png) |
| cubes | stretched/split boxes | triangular & hexagonal prisms |
| ![](docs/screenshots/phase-4/mobs-1-axis-aligned.png) | ![](docs/screenshots/phase-4/mobs-2-xw-30.png) | ![](docs/screenshots/phase-4/mobs-3-xw45-zw45.png) |
| mobs: their own 3D sections | oblique cuts: bodies stretch, legs slip out of the slice | other legs cross it (sheep: two, chicken: one) |

## Run it

```bash
npm install
npm run dev            # http://localhost:5173
```

Requires a browser with WebGL2. Useful URL parameters: `?rd=4` (render distance in chunks,
2–8), `?res=360` (fixed internal height, or `auto`), `?fov=75`, `?bench=1` (benchmark),
`?test=1&seed=text` (ephemeral test world with the engine test garden, no menus and no
particles unless `&particles=1`; used by tests).

## Controls

| Input | Action |
|---|---|
| Mouse or **arrow keys** | look |
| **W A S D** | move in the slice |
| **Q / E** | move **kata / ana** along the current hidden axis |
| Space (double-tap in creative) | jump (toggle flying) |
| Shift / Ctrl (or R) | sneak / sprint |
| **Z / X** | rotate the slice: right ↔ hidden |
| **F / V** | rotate the slice: forward ↔ hidden |
| **Alt + mouse** | rotate the slice freely |
| **C** | snap back to the nearest axis-aligned slice |
| LMB (hold in survival) / RMB / MMB | attack or mine / place, use, open stations, draw a bow (hold) / pick block |
| **Tab** or **I** | inventory, crafting and recipe book |
| **B** (Ctrl+B) | drop the held item (the whole stack) |
| 1–9, wheel | hotbar |
| F3 (or `) | debug overlay |
| **P** | cross-section wireframe overlay |
| G / T / Y / O | game mode / time +3 h / weather / internal resolution (cheats/creative) |

**Touch screens** (auto-detected, or Settings → Touch controls): left thumb = floating move
stick (push to the rim to sprint), right side = drag to look, tap = place, long-press = break,
two-finger twist = rotate the slice right↔hidden, two-finger drag = forward↔hidden, plus
buttons for jump, sneak, kata/ana, slice rotation, snap, fly, pause, F3 and P.

**Worlds and seeds**: Singleplayer → Create new world. Type any seed (numbers are used
as-is, text is hashed), roll a random one with 🎲, or pick a seed idea. Worlds autosave to the
browser (IndexedDB) every 30 s and on pause/quit, and can be exported/imported as `.hcworld`
files from the world list.

The **hidden-axis panel** (bottom right) shows the hidden axis `h` as X/Z/W bars, and a radar of
the plane spanned by *right* (→) and *ana* (↑) around you: walls, water, lava and drop-offs you
can't see in the slice, plus mobs as dots (red hostile, green passive). Lava along ±h makes the
matching screen edge glow orange (left = kata, right = ana); a hostile mob hidden kata/ana of you
makes it pulse violet and is named at the top of the screen.

**Survival**: 10 hearts (natural regeneration), air underwater, fall/lava/cactus/drowning/void
damage, death drops your inventory and shows a respawn screen (hardcore: spectator). Mobs spawn
from each biome's tables all around you in 4D, not only in your slice.

## Develop

```bash
npm test               # unit tests (vitest)
npm run typecheck
npm run ci             # typecheck + unit + Playwright smoke test + R6 views
BENCH=1 npx playwright test bench   # engine benchmarks (writes test-results/bench/)
node scripts/alloc-profile.mjs      # sample per-frame allocations (needs `npm run dev`)
```

## Docs

- [Architecture](docs/architecture.md)
- [GPU layout](docs/gpu-layout.md)
- [Rendering a 4D world through a 3D slice](docs/rendering-4d.md)
- [Data formats](docs/data-formats.md)
- How to add a [block](docs/how-to/add-a-block.md), [item / recipe / tool tier](docs/how-to/add-an-item.md), [biome](docs/how-to/add-a-biome.md),
  [realm](docs/how-to/add-a-realm.md), [mob](docs/how-to/add-a-mob.md),
  [structure](docs/how-to/add-a-structure.md) (planned)
- Benchmarks: [Phase 1](docs/benchmarks/phase-1.md), [Phase 2](docs/benchmarks/phase-2.md) ·
  [Changelog](CHANGELOG.md) · [Known issues](KNOWN_ISSUES.md)
