# How to add a realm

The Surface and the Ember Depths (Phase 6) are the two realms so far. A realm is a data
entry, a generator, biomes, and optionally structures, mobs and a portal link. The renderer,
streaming, lighting and saves are realm-agnostic.

## 1. The realm (`src/content/realms.ts`)

```ts
{ name: 'ember', displayName: 'The Ember Depths', heightChunks: 8, gravityAxis: 1, gravity: 32,
  seaLevel: 32, generator: 'ember', coordinateScale: 8, dayCycle: false, ambient: 0.12,
  ambientColor: '#ffb090', weather: ['clear'], skyColor: '#3a0e08', fogColor: '#6a1e0e',
  floorBlock: 'bedrock', ceilingBlock: 'bedrock', seaFluid: 'lava',
  waterEvaporates: true, bedsExplode: true, cavernSpawns: true }
```

| field | effect |
| ----- | ------ |
| `gravityAxis`, `gravity` | physics (Y for most realms; the Mirror Realm will use W) |
| `seaLevel`, `seaFluid` | the sea (the Ember Depths' is lava) |
| `dayCycle` | sun, moon, stars and the clock; beds need nights |
| `ceilingBlock` | non-null makes the realm enclosed: no sun, moon, stars, clouds or weather, and the "sky" becomes the biome's haze (`Environment.enclosed`) |
| `ambient`, `ambientColor` | the minimum light and its tint |
| `coordinateScale` | the portal link: one block here is `coordinateScale` Surface blocks along x, z **and** w (y is not scaled) |
| `waterEvaporates`, `bedsExplode` | Nether-style rules |
| `cavernSpawns` | mobs spawn on any cavern floor above the sea, whatever the light, instead of under the sky |

## 2. The generator (`src/world/gen/`)

Implement `WorldGenerator` (`generators.ts`) and register it in `GENERATORS`:

* `generate(cx, cz, cw, blocks, surface, extra)` fills a dense column
  (`index = x + 16z + 256w + 4096y`). It also writes a per-(x, z, w) surface colour and the
  biome index (alpha byte) into `surface`, and per-column data (chests, spawners, NPCs) into
  `extra`.
* `spawnPoint()` returns a safe spawn.
* `sample(x, z, w, out)` returns the floor height, biome, sea flag and (enclosed realms) the
  ceiling. Structures, atlases, `findBiome` and portal arrivals use it. It must agree exactly
  with `generate`: `EmberGen` computes both from the same per-cell function.
* `nearestStructure(...)` (optional) serves atlases; `caveBiomeAt(...)` (optional) serves cave
  biomes.

To get structures, construct a `StructureGen(this)`. The generator must satisfy
`StructureTerrain` (`structures/Placement.ts`): `seed`, `height`, `sea`, `realm`, `garden`
and `sample`. Structures are picked by `StructureDef.realm`.

Generation runs in workers, so keep it deterministic (`hash4`, seeded noise, never
`Math.random`) and fast. The Ember generator runs at about 42 ms per column in Node, against
63 ms for the Surface. For performance it uses:
* direct per-cell noise for the floor and ceiling;
* a 4-block lattice for the 4D pillar field;
* features with an 8-block margin, so trees and frames cross column borders seamlessly.

## 3. Biomes

Add `BiomeDef`s with `realm: '<name>'` (`src/content/ember.ts` has eight). The Surface climate
ignores biomes of other realms; each realm's generator picks its own. The Ember generator
selects biomes from three 3D noise fields (heat, vapour, soul) plus a sea field, and each
biome's `ember` style picks its floor shape.

The registry test asks every biome for 3+ unique blocks and 2+ unique plants.

## 4. Portals

`src/game/Portals.ts` links realms: `portalDestination(realm)` names the other end (Surface ↔
Ember Depths today), and `scalePosition` divides or multiplies x, z and w by the
`coordinateScale`s. To link a new realm, extend `portalDestination`, or give it its own frame
block and igniter.

How a trip works:
1. Standing in a portal for 4 s (1 s in creative) calls `Game.beginTravel`.
2. It saves the game with the destination realm, the scaled position and an arrival record.
3. `main.ts` reloads into it. Test worlds carry their state in session storage.
4. On arrival the game waits for the columns around the player. Then it steps into a known
   portal of that realm (within 128 blocks on the Surface, 16 in the Ember Depths), or builds
   a new one on free ground nearby.

## 5. Test it

* Unit: see `tests/unit/ember.test.ts`. It checks determinism, that every biome is reachable,
  bedrock and the sea, structures within their radius, and mob definitions.
* E2E: `?test=1&realm=<name>` boots a test world straight into the realm. `__hc.findBiome(n)`,
  `__hc.locate([...])` and `__hc.travel(x, y, z, w)` get you anywhere. `tests/e2e/ember.spec.ts`
  and `portal.spec.ts` are the examples.
