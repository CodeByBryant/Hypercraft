#!/usr/bin/env bash
# CI entry point: typecheck, unit tests, then the Playwright smoke test (boot, generate
# world, walk, mine, place, rotate view, screenshot), the R6 reference views, and the
# world/save/touch flow, survival items, mobs/combat, structures/villagers/beds, and the Ember
# Depths (portals, biomes, mobs, the Magma Regent), fire, Phase 7 (survival systems, the
# inventory tabs, buried-brick rendering, ores and TNT, the 4D tools and weapons).
set -euo pipefail
cd "$(dirname "$0")/.."
echo "== typecheck" && npm run typecheck
echo "== unit tests" && npm test
echo "== e2e (smoke + R6 views)" && npx playwright test tests/e2e/smoke.spec.ts tests/e2e/views.spec.ts tests/e2e/worlds.spec.ts tests/e2e/items.spec.ts tests/e2e/mobs.spec.ts tests/e2e/touch.spec.ts tests/e2e/structures.spec.ts tests/e2e/portal.spec.ts tests/e2e/ember.spec.ts tests/e2e/fire.spec.ts tests/e2e/nightvision.spec.ts tests/e2e/spectator.spec.ts tests/e2e/phase7.spec.ts tests/e2e/inventory-tabs.spec.ts tests/e2e/bricks.spec.ts tests/e2e/ores.spec.ts tests/e2e/tools4d.spec.ts tests/e2e/qol.spec.ts
