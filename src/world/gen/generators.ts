// Generator registry: realms name their generator by id (RealmDef.generator), so adding a
// realm means adding an entry here plus content data; the renderer never changes.

import type { RealmDef } from '../../content/types';
import { SurfaceGenerator } from './SurfaceGen';

export interface WorldGenerator {
  readonly height: number;
  /** Fill a dense column (index x + 16z + 256w + 4096y) and its per-(x,z,w) surface RGBA. */
  generate(cx: number, cz: number, cw: number, blocks: Uint16Array, surface: Uint8Array): void;
  spawnPoint(): [number, number, number, number];
}

export const GENERATORS: Record<string, (seed: number, realm: RealmDef) => WorldGenerator> = {
  surface_phase1: (seed, realm) => new SurfaceGenerator(seed, realm),
};

export function createGenerator(seed: number, realm: RealmDef): WorldGenerator {
  const f = GENERATORS[realm.generator];
  if (!f) throw new Error(`unknown generator "${realm.generator}" for realm "${realm.name}"`);
  return f(seed, realm);
}
