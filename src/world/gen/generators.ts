// Generator registry: realms name their generator by id (RealmDef.generator), so adding a
// realm means adding an entry here plus content data; the renderer never changes.

import type { RealmDef } from '../../content/types';
import { SurfaceGenerator, type ColumnSample, type GenOptions } from './SurfaceGen';
import { EmberGenerator } from './EmberGen';

export type { GenOptions };

export interface WorldGenerator {
  readonly height: number;
  /**
   * Fill a dense column (index x + 16z + 256w + 4096y) and its per-(x,z,w) surface RGBA.
   * `extra` receives per-column data such as structure chests and villager spawns.
   */
  generate(cx: number, cz: number, cw: number, blocks: Uint16Array, surface: Uint8Array, extra?: Record<string, unknown>): void;
  spawnPoint(): [number, number, number, number];
  /** Underground biome index at a position, or -1 (optional). */
  caveBiomeAt?(x: number, y: number, z: number, w: number): number;
  /** Terrain height and biome at a horizontal point (optional). */
  sample?(x: number, z: number, w: number, out: ColumnSample): ColumnSample;
  /** Nearest structure start of any of the named kinds (optional). */
  nearestStructure?(names: string[], x: number, z: number, w: number, maxDist?: number): { name: string; x: number; y: number; z: number; w: number } | null;
}

export const GENERATORS: Record<string, (seed: number, realm: RealmDef, options: GenOptions) => WorldGenerator> = {
  surface: (seed, realm, options) => new SurfaceGenerator(seed, realm, options),
  ember: (seed, realm, options) => new EmberGenerator(seed, realm, options),
};

export function createGenerator(seed: number, realm: RealmDef, options: GenOptions = {}): WorldGenerator {
  const f = GENERATORS[realm.generator];
  if (!f) throw new Error(`unknown generator "${realm.generator}" for realm "${realm.name}"`);
  return f(seed, realm, options);
}
