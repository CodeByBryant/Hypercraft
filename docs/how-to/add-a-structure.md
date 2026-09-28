# How to add a structure (planned — Phase 5)

Structures are not implemented in Phase 1 (the engine test garden near spawn is a hard-coded
stamp in `SurfaceGen.ts`). Planned interface:

* **Templates**: JSON (or a compact binary) with a block-name palette and 4D extents; rooms
  carry **connectors** (position, facing along ±X/±Z/±W, tag) so rooms snap together in 4D.
* **Placement**: a 4D grid of cells with jitter, per-realm/biome rules and a deterministic hash
  of the seed and cell coordinates, evaluated in the generation worker with a margin so
  structures can span column borders (the same technique the Phase 1 trees and ore blobs use).
* **Loot tables** per room type, referenced by name.
* Unit tests will cover placement determinism and connector matching.
