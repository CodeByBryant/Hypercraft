// Messages between the main thread and generation workers.
import type { PackedChunk } from '../Chunk';

export interface InitMsg {
  type: 'init';
  seed: number;
  realm: string;
  options: { garden?: boolean };
}

export interface GenMsg {
  type: 'gen';
  id: number;
  cx: number;
  cz: number;
  cw: number;
}

export type ToWorker = InitMsg | GenMsg;

export interface ColumnMsg {
  type: 'column';
  id: number;
  cx: number;
  cz: number;
  cw: number;
  chunks: PackedChunk[];
  heightmap: Uint8Array;
  surface: Uint8Array;
  /** [generate, light, pack] milliseconds. */
  times: [number, number, number];
}

export interface ReadyMsg {
  type: 'ready';
}

export interface ErrorMsg {
  type: 'error';
  id: number;
  message: string;
}

export type FromWorker = ColumnMsg | ReadyMsg | ErrorMsg;
