# GPU layout

HYPERCRAFT renders by ray marching a sparse 4D voxel world directly on the GPU. This page
documents every texture the ray marcher reads, their encodings, and how the CPU keeps them in
sync. Source of truth: `src/render/GpuWorld.ts` (upload side) and
`src/render/shaders/raymarch.frag.glsl` (read side).

## Coordinate spaces

| Space | Description |
|---|---|
| World | Integer voxel coordinates `(x, y, z, w)`; x/z/w unbounded (±524k), y in `[0, 16·heightChunks)`. |
| Chunk | `floor(world / 16)`; a chunk is 16⁴ = 65 536 voxels. |
| Brick | 4⁴ = 256 voxels; a chunk is 4⁴ = 256 bricks. |
| Column | All chunks sharing `(cx, cz, cw)`; the streaming/generation unit (8 chunks for the Surface). |
| Window | The `N × heightChunks × N × N` block of chunk slots around the player, `N = 2·renderDistance + 1`. |
| Local | World coordinates minus the window's minimum corner (`world.ox·16, 0, world.oz·16, world.ow·16`). The shader works only in local space, so float precision never depends on how far the player walked. |

Index conventions (shared by CPU and GPU):

```
brick index in chunk   bi = bx | by<<2 | bz<<4 | bw<<6        (b* in 0..3)
voxel index in brick   vi = vx | vy<<2 | vz<<4 | vw<<6        (v* in 0..3)
chunk slot             s  = (cx mod N) + N·((cz mod N) + N·(cw mod N)) + N³·cy
```

The window is **toroidal** in x/z/w: a chunk always lives in the slot given by its world
coordinates modulo N, so when the player crosses a chunk border only the columns that leave
or enter the window touch the tables; everything else stays where it is. The shader receives
`uWinMod = window origin mod N` and computes slots from local chunk coordinates.

## Voxel and light encodings

* **Voxel** (`uint16`): block id in bits 0–11, meta nibble in bits 12–15 (fluid level,
  orientation of stairs/ladders, slab half). Id 4095 is the reserved `VOID` sentinel
  (unloaded space / below the world).
* **Light** (`uint8`): sky light in the high nibble, block light in the low nibble (0–15 each).

## Textures read by the ray marcher

| Uniform | Format | Size | Contents |
|---|---|---|---|
| `uChunkTable` | `R32UI` 2D | 256 × ⌈slots/256⌉ | One texel per chunk slot (see below). |
| `uBrickTable` | `RG32UI` 2D | 2048 × 16·⌈slots/128⌉ | A 16×16 tile of brick entries per chunk slot. |
| `uBlockPool` | `R16UI` 2D array | 2048 × 2048 × L | Non-uniform block bricks (16×16 texels each). |
| `uLightPool` | `R8UI` 2D array | 2048 × 2048 × L′ | Non-uniform light bricks, allocated independently. |
| `uSurface` | `RGBA8` 3D | (16N)³ | Per (x, z, w): blended grass colour (rgb) + biome index (a), toroidal. |
| `uBlockInfo` | `RGBA32UI` 2D | 64 × 64 | Static per-block render info (4096 ids). |
| `uShapes` | `RGBA32F` 2D | 16 × shapeVariants | Sub-voxel shape table (boxes). |
| `uAtlas` | `RGBA8` 2D | 1024 × 64·rows | Procedural 16³ solid textures. |
| `uEntities` | `RGBA32F` 2D | 256 × 14 | Mob records and their analytic parts (Phase 4, see below). |

### Chunk table (`R32UI`)

```
0                         not resident (ray stops: drawn as fog)
bit 31 = 1                resident
bit 30 = 1                whole chunk is a single voxel value (bits 0–15): ray skips 16⁴ at once
```

### Brick table (`RG32UI`)

Slot `s` owns the tile at `((s mod 128)·16, ⌊s/128⌋·16)`; brick `(bx,by,bz,bw)` is the texel
`(bx + 4bw, by + 4bz)` inside that tile.

```
.r  bit 31 = 1  -> bits 0–30 = pool brick index in uBlockPool
    bit 31 = 0  -> bits 0–15 = uniform voxel of the whole brick (air bricks skip 4⁴ at once)
.g  bit 31 = 1  -> bits 0–30 = pool brick index in uLightPool
    bit 31 = 0  -> bits 0–7  = uniform light of the whole brick
```

### Brick pools

Pool brick `p` lives in layer `p >> 14` (16 384 bricks per 2048² layer), tile
`t = p & 16383` at `((t mod 128)·16, ⌊t/128⌋·16)`, and voxel `(vx,vy,vz,vw)` is the texel
`(vx + 4vw, vy + 4vz)` of that tile, so a whole brick is one compact 16×16 tile (good texture
cache locality for 4D neighbourhoods).

Pool bricks are allocated in **groups of 8** consecutive tiles (a 128×16 strip). A chunk's
non-uniform bricks are packed in order into its groups, so uploading a fresh chunk takes
`⌈bricks/8⌉` `texSubImage3D` calls; a single edited brick is one 16×16 upload. Freed groups
go on a free list. When a pool runs out, it is recreated with ~1.5× the layers and every
resident chunk is re-uploaded from the CPU copy (rare; counted as `regrows` in F3).

Light bricks are pooled separately because block-uniform bricks are often light-varying (a
dark cave next to a lit one) and vice versa.

### Surface map

A 3D `RGBA8` texture of size `(16N)³`, addressed toroidally by local `(x, z, w)` plus
`uSurfMod`. The generator writes the biome-blended grass colour per column position; the
shader multiplies grass/leaves/plant albedo by it (tint masks come from the texture alpha).

### Block info (`RGBA32UI`, one texel per block id)

```
x: render(0-2) | shapeBase(3-12) | variantMode(13-14) | emission(15-18) | biomeTint(19-20)
   | fluid(21-22) | fullCube(23) | lightOpaque(24)
y: texTop(0-9) | texBottom(10-19) | texSide(20-29)
z: tint RGBA8 (translucent/fluid colour and alpha)
w: reserved
```

render: 0 invisible, 1 opaque, 2 cutout, 3 translucent, 4 fluid. variantMode: 0 none,
1 vertical2 (slab bottom/top), 2 horizontal6 (facing ±X, ±Z, ±W). The effective shape row is
`shapeBase + variant(meta)`.

### Shape table (`RGBA32F`)

Row per shape variant: texel 0 = `(kind, boxCount, 0, 0)`, texels `1+2b` / `2+2b` = min / max
corner of box `b` (cell-relative 4D coordinates, up to 7 boxes). kind: 0 boxes, 1 plant
(six diagonal 3D sheets), 2 fluid (height from meta). Row 0 is always the full cube, which the
shader short-circuits.

### Atlas

Each texture is a 16×16×16 RGBA volume stored as 16 slices in a 64×64 region of the atlas:
texture `t` at `((t mod 16)·64, ⌊t/16⌋·64)`, slice `s` at `((s mod 4)·16, ⌊s/4⌋·16)`. A hit
on the facet with normal axis `a` samples the volume at the other three cell-relative
coordinates `(u, v, s)` (v runs along world up on side facets), so the 2D face you see is a
real slice through a 3D texture and changes as the slice moves along the hidden axis.

### Entity texture (`RGBA32F`, Phase 4)

It is rewritten each frame by `MobManager.pack` (only the rows in use are uploaded).
`uEntityCount` says how many mob records are valid (at most 48).

**Mob record `e`: 6 texels starting at texel `6e`.**

| texel | contents |
| ----- | -------- |
| 0 | position relative to the window origin (`world.ox·16, 0, world.oz·16, world.ow·16`) |
| 1–3 | the mob's orthonormal frame R, F and H (world-space columns; up is world Y) |
| 4 | `(bounding radius, first part index, part count, hurt flash 0/1)` |
| 5 | `(scale, fuse flash 0..1, 0, 0)` |

**Part `p`: 4 texels starting at texel `288 + 4p`.** Positions are in the mob's local frame
(x = R, y = up, z = F, w = H), unscaled.

| texel | contents |
| ----- | -------- |
| 0 | `(kind 0 box / 1 ball / 2 capsule, radius, glow 0/1, 0)` |
| 1 | centre (box, ball) or end A (capsule) |
| 2 | half extents (box) or end B (capsule) |
| 3 | linear RGB colour |

`entityTrace` runs once per pixel:
1. Test the ray against each mob's bounding 4-ball.
2. Transform the ray into the mob's frame and divide by its scale.
3. Test the exact primitives: slab test for boxes, quadratics for balls and capsules.

The nearest hit (`tEnt`) is then compared with the terrain hit:
* at the start of each step;
* when an opaque surface is found;
* after the march.

That way mobs and terrain (including translucent media in front) occlude each other
correctly. The CPU picker (`MobManager.pick`) runs the same tests.

## Render targets

| Target | Format | Notes |
|---|---|---|
| colour | `RGBA8` | internal resolution, bilinear/nearest upscale in the composite pass |
| aux | `RGBA8` | `R,G` = hit distance / 512 as 16-bit fixed point; `B` = ray steps; `A` = hit facet axis. Used by the line overlay for depth testing and by F3 (async PBO readback) for ray-step statistics. |

## Traversal (summary)

For each pixel: `d = normalize(fwd + x·right + y·up)` (always inside the view hyperplane).
Starting from the eye's local cell, look up chunk → brick → voxel. Uniform air chunks advance
the ray to the next 16-aligned boundary, uniform air bricks to the next 4-aligned boundary,
otherwise one voxel at a time (a 4D DDA that clamps the non-stepping axes into the current
block, so the hierarchy never skips a cell). Non-air voxels go through the render-type
handlers (analytic shape test, cutout alpha test, translucent compositing with at most 6
pass-throughs, fluid surface). A small per-ray cache avoids refetching chunk/brick entries
while the ray stays inside them.

## CPU mirror

The main thread stores the same brick-sparse layout (`src/world/Chunk.ts`): `bIdx`/`lIdx`
(`Int32Array(256)`, `≥ 0` = slot in the packed data array, `< 0` = `~uniformValue`) plus packed
`Uint16Array`/`Uint8Array` data. Edits set per-brick dirty bits; `GpuWorld.sync()` uploads dirty
bricks every frame (cheap), then fresh chunks within a time budget, nearest first.
