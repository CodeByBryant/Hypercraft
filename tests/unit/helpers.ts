import { REG } from '../../src/content/registry';
import { Chunk, packChunkFromDense } from '../../src/world/Chunk';
import { COLUMN_LAYER, denseIndex } from '../../src/world/constants';
import { computeColumnLight } from '../../src/world/light/columnLight';
import { Column, World } from '../../src/world/World';

export const realm = REG.realm('surface');
export const H = realm.heightChunks * 16;

export type Fill = (x: number, y: number, z: number, w: number) => number;

/** Build a resident column from a block function (world coordinates), with column-local light. */
export function makeColumn(cx: number, cz: number, cw: number, fill: Fill): Column {
  const blocks = new Uint16Array(COLUMN_LAYER * H);
  const light = new Uint8Array(COLUMN_LAYER * H);
  const hm = new Uint8Array(COLUMN_LAYER);
  for (let y = 0; y < H; y++)
    for (let w = 0; w < 16; w++)
      for (let z = 0; z < 16; z++)
        for (let x = 0; x < 16; x++) blocks[denseIndex(x, y, z, w)] = fill(cx * 16 + x, y, cz * 16 + z, cw * 16 + w);
  computeColumnLight(blocks, light, hm, H);
  const chunks: Chunk[] = [];
  for (let cy = 0; cy < H / 16; cy++) chunks.push(new Chunk(packChunkFromDense(blocks, light, cy * 16)));
  return new Column(cx, cz, cw, chunks, hm, new Uint8Array(COLUMN_LAYER * 4));
}

/** A world whose window is centred on chunk (0,0,0) with the given columns filled by `fill`. */
export function makeWorld(fill: Fill, cols: [number, number, number][] = [[0, 0, 0]], radius = 2): World {
  const world = new World(realm, radius);
  world.moveWindow(-radius, -radius, -radius);
  for (const [cx, cz, cw] of cols) world.addColumn(makeColumn(cx, cz, cw, fill));
  return world;
}
