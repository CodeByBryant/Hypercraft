# How to add a mob (planned — Phase 4)

Mobs are not implemented in Phase 1. This is the intended, data-driven interface so the
renderer never needs to change:

* **Shape**: a union of analytic 4D primitives (hyperspheres, hyperboxes, capsules) with
  per-part procedural transforms for animation. The ray marcher intersects them analytically
  inside the same slice, so a mob's cross-section changes as the slice moves through it.
* **Data** (`src/content/mobs.ts`): name, parts, hitbox (4D hyperbox), health, speed, AI
  profile, drops (loot table name), spawn rules (biome, light, time, realm), sounds.
* **AI**: behaviour profiles in code, pathfinding over the 4D voxel grid (A*/flow field with a
  compute budget).
* **Fairness (R2)**: every hostile mob must be detectable when it is out of the slice
  (proximity compass on the hidden axis, audio, screen-edge warnings). The HUD's hidden-axis
  radar and edge warnings added in Phase 1 are the hooks for this.
