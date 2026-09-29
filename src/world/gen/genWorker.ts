/// <reference lib="webworker" />
// Terrain generation worker: generate -> column-local light -> brick-pack -> transfer.

import { REG } from '../../content/registry';
import { packChunkFromDense } from '../Chunk';
import { COLUMN_LAYER } from '../constants';
import { computeColumnLight } from '../light/columnLight';
import { createGenerator, type WorldGenerator } from './generators';
import type { ColumnMsg, FromWorker, ToWorker } from './protocol';

declare const self: DedicatedWorkerGlobalScope;

let gen: WorldGenerator | null = null;
let blocks: Uint16Array | null = null;
let light: Uint8Array | null = null;

function post(msg: FromWorker, transfer: Transferable[] = []): void {
  self.postMessage(msg, transfer);
}

self.onmessage = (e: MessageEvent<ToWorker>) => {
  const m = e.data;
  if (m.type === 'init') {
    const realm = REG.realm(m.realm);
    gen = createGenerator(m.seed, realm, m.options);
    blocks = new Uint16Array(COLUMN_LAYER * gen.height);
    light = new Uint8Array(COLUMN_LAYER * gen.height);
    post({ type: 'ready' });
    return;
  }
  if (m.type === 'locate') {
    const result = gen?.nearestStructure?.(m.names, m.x, m.z, m.w, m.maxDist) ?? null;
    post({ type: 'located', id: m.id, result });
    return;
  }
  if (m.type === 'gen') {
    try {
      if (!gen || !blocks || !light) throw new Error('worker not initialised');
      const surface = new Uint8Array(COLUMN_LAYER * 4);
      const heightmap = new Uint8Array(COLUMN_LAYER);
      const t0 = performance.now();
      const extra: Record<string, unknown> = {};
      gen.generate(m.cx, m.cz, m.cw, blocks, surface, extra);
      const t1 = performance.now();
      computeColumnLight(blocks, light, heightmap, gen.height);
      const t2 = performance.now();
      const chunks = [];
      const transfer: Transferable[] = [surface.buffer, heightmap.buffer];
      for (let cy = 0; cy < gen.height >> 4; cy++) {
        const p = packChunkFromDense(blocks, light, cy * 16);
        chunks.push(p);
        transfer.push(p.bIdx.buffer, p.bData.buffer, p.lIdx.buffer, p.lData.buffer);
      }
      const t3 = performance.now();
      const msg: ColumnMsg = { type: 'column', id: m.id, cx: m.cx, cz: m.cz, cw: m.cw, chunks, heightmap, surface, times: [t1 - t0, t2 - t1, t3 - t2] };
      if (Object.keys(extra).length) msg.extra = extra;
      post(msg, transfer);
    } catch (err) {
      post({ type: 'error', id: m.id, message: err instanceof Error ? err.stack ?? err.message : String(err) });
    }
  }
};
