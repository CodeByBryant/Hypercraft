# How to add a mob

Mobs are data. You describe a body made of analytic 4D primitives, pick an AI profile and
list drops, then add the mob to biome spawn tables. The renderer, picking, physics and
spawning need no changes.

## 1. Define it in `src/content/mobs.ts`

```ts
{
  name: 'dune_beetle',
  displayName: 'Dune Beetle',
  hostile: true,
  ai: 'melee',          // see "AI profiles" below
  health: 12,
  speed: 2.2,           // blocks per second
  damage: 2,            // melee damage per hit (hostile mobs need this)
  width: 0.4,           // hitbox half-width in x, z and w
  height: 0.7,          // hitbox height
  parts: [
    ball([0, 0.4, 0, 0], 0.35, '#8a6a2a'),
    box([0, 0.45, 0.35, 0], [0.15, 0.12, 0.12, 0.15], '#4a3a1a', 'head'),
    ...tetraLegs('#3a2a10', 0.3, 0.25, 0.05),
  ],
  drops: [{ item: 'string', count: [0, 1] }],
}
```

### Parts: the body

Each part is a **box** (a 4D hyperbox given by its centre and half extents), a **ball** (a
4-ball given by its centre and radius) or a **capsule** (two end points and a radius). All
positions are in the mob's own frame:

| axis | meaning |
| ---- | ------- |
| x | right |
| y | up (feet at 0) |
| z | forward (the direction it faces) |
| w | the mob's own ana axis |

The ray marcher intersects these shapes exactly, so every slice through the mob is correct.
Here is what that means in practice:

* A part with a small **w** extent looks thin when the slice is edge-on to it. The Ana Stalker
  is 0.07 blocks thick in w, and its w axis always lines up with **your** hidden axis, so it
  is invisible until it steps into your slice.
* **Legs.** A 4D animal needs a 3D footprint in (x, z, w) to stand. The helpers keep the
  familiar legs in the mob's own w = 0 plane, so a slice aligned with the mob shows a normal
  animal, and add legs toward ±w for stability. Rotate the slice and those legs come into
  view while others leave it.
  * `stanceLegs()`: quadrupeds, with 4 + 2 legs.
  * `bipedLegs()`: humanoids and birds, with 2 legs and a heel toward +w.
  * `spiderLegs()`: 4 diagonal legs plus 4 legs reaching into ±w.
* **Limits.** At most 16 parts (`MAX_MOB_PARTS`). Keep glowing parts (`glow: true`) small:
  eyes, lanterns.
* **Animation roles** (`anim`):
  * `leg`: swings along z while the mob walks;
  * `head`: bobs;
  * `wing`: flaps along y;
  * `tail`: sways along x;
  * `pulse`: a slimes' breathing role. It is only a tag for now.

  Add `phase` (radians) to offset limbs from each other. Exploders pulse through their own
  w axis while the fuse burns: their cross-section flickers.

### AI profiles (`ai`)

| profile | behaviour |
| ------- | --------- |
| `passive` | Wanders; flees for 5 s when hit. |
| `melee` | Chases you with 4D A\* (it can path around walls through W) and hits when in reach. |
| `climber` | Like `melee`, and climbs walls. |
| `golem` | Like `melee`, and drifts slowly back and forth along W. Add `sliceBound: true` so it can only be hurt while its cross-section is inside your slice. |
| `ranged` | Keeps 5–11 blocks away and shoots `projectile: { item, cooldown, damage }` when it has line of sight. |
| `exploder` | Chases you, lights a fuse within 2.4 blocks and explodes with `blast: { radius, fuse }`. The explosion is a 4D ball of block damage. Walking away cancels the fuse. |
| `stalker` | Lurks 5–8 blocks along **your** hidden axis, moves level with you, then slides into your slice to strike and retreats. |
| `hopper` | Jumps in bursts (slimes). With `splits: n` it splits into `n` half-size copies when it dies, down to a minimum size. |
| `flyer` | Flutters; hostile flyers dive at you. The `glass_moth` also seeks light sources. |
| `swimmer` | Swims in water and chases you only while you are in water. |
| `mimic` | Sits motionless in a block cell, like an ore, until you come within 3 blocks. |
| `lurker` | Blind. It hunts the last loud noise: mining, sprinting, fighting, explosions. |

Other flags:

| flag | effect |
| ---- | ------ |
| `burnsInDay` | Takes 1 damage per second under open sky in daylight. |
| `fireproof` | Immune to lava. |
| `lays: { item, every }` | Drops an item every few seconds (hyperchickens lay eggs). |
| `scale: [min, max]` | Random size per spawned mob. |

## 2. Make it spawn: `src/content/biomes.ts`

Add a mob to one of a biome's tables:

```ts
mobs: {
  day: [{ mob: 'ana_cow', weight: 8, group: [2, 4] }],
  night: [{ mob: 'dune_beetle', weight: 6 }],
  water: [...],   // spawned in water
  cave: [...],    // spawned in dark caves under this biome (or the cave biome's own table)
}
```

Every half second the spawner tries a few random points on a 4D shell 14–44 blocks from you.
The shell is not limited to your slice, so mobs also appear kata and ana of you.

* Surface spawns use `day` or `night`, depending on the light at that spot.
* `water` spawns in water.
* `cave` spawns in dark, open cells underground.

There are caps: 14 hostile and 12 passive mobs. Hostiles despawn beyond 80 blocks, and on
peaceful difficulty.

## 3. Check it

* `npm test`: the mob registry validates every mob when it loads. It checks for:
  * unknown drops or projectile items;
  * missing sizes or radii;
  * too many parts;
  * a hostile mob without damage;
  * biome tables that name unknown mobs.
* In a test world (`?test=1`, creative), spawn the mob from the console:
  `__hc.spawnMobAhead('dune_beetle', 4)`.
* Tilt the slice (Z/X/F/V) and walk kata/ana (Q/E) to watch its cross-section change.

## Fairness (R2)

Hostile mobs out of your slice are always announced. Three things show them:

* **Screen edge.** The left (kata) or right (ana) edge pulses violet, brighter as the mob gets
  closer.
* **Radar.** The mob is a red dot in the hidden-axis radar.
* **Warning line.** The top of the screen names the mob and says how far kata or ana it is.

New hostile AI must not attack from outside your slice without being detectable. The
stalker, for example, has to enter your slice to strike.
