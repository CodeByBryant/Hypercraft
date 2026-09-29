#!/usr/bin/env bash
# CI entry point: typecheck, unit tests, then the Playwright smoke test (boot, generate
# world, walk, mine, place, rotate view, screenshot), the R6 reference views, and the
# world/save/touch flow, survival items, and mobs/combat.
set -euo pipefail
cd "$(dirname "$0")/.."
echo "== typecheck" && npm run typecheck
echo "== unit tests" && npm test
echo "== e2e (smoke + R6 views)" && npx playwright test tests/e2e/smoke.spec.ts tests/e2e/views.spec.ts tests/e2e/worlds.spec.ts tests/e2e/items.spec.ts tests/e2e/mobs.spec.ts
