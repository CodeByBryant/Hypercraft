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

/** Find the nearest start of any of the named structures (atlases); answered with 'located'. */
export interface LocateMsg {
  type: 'locate';
  id: number;
  names: string[];
  x: number;
  z: number;
  w: number;
  maxDist: number;
}

export type ToWorker = InitMsg | GenMsg | LocateMsg;

export interface Located {
  name: string;
  x: number;
  y: number;
  z: number;
  w: number;
}

export interface LocatedMsg {
  type: 'located';
  id: number;
  result: Located | null;
}

export interface ColumnMsg {
  type: 'column';
  id: number;
  cx: number;
  cz: number;
  cw: number;
  chunks: PackedChunk[];
  heightmap: Uint8Array;
  surface: Uint8Array;
  /** Per-column data from generation (structure chests, spawners, villager spawns). */
  extra?: Record<string, unknown>;
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

export type FromWorker = ColumnMsg | ReadyMsg | ErrorMsg | LocatedMsg;
