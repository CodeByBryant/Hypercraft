// The Void Gate (Phase 8): ONE air cell with a gate frame on each of its six horizontal faces
// (+-x, +-z and +-w). Each frame takes a Void Eye; when all six hold one the cell lights and
// stepping into it travels to the Hollow Void. These helpers are pure over a tiny world
// interface, so they are unit tested without a Game.

import { REG } from '../content/registry';
import { DIRS } from '../content/void';

export interface GateWorld {
  getBlock(x: number, y: number, z: number, w: number): number;
  setBlock(x: number, y: number, z: number, w: number, v: number): void;
}

export type Cell = [number, number, number, number];

/** Block ids of the gate pieces. */
export const GATE = {
  frame: REG.id('void_gate_frame'),
  eye: REG.id('void_gate_frame_eye'),
  gate: REG.id('void_gate'),
  beam: REG.id('gateway_beam'),
};

/** The six horizontal neighbours of a cell (the faces a gate has frames on). */
export function gateFaces(x: number, y: number, z: number, w: number): Cell[] {
  return DIRS.map((d) => [x + d[0], y, z + d[1], w + d[2]] as Cell);
}

/** Is the (air) cell at (x, y, z, w) a gate with an eye in each of its six frames? */
export function gateReady(world: GateWorld, x: number, y: number, z: number, w: number): boolean {
  if (world.getBlock(x, y, z, w) !== 0) return false;
  for (const c of gateFaces(x, y, z, w)) if ((world.getBlock(c[0], c[1], c[2], c[3]) & 0xfff) !== GATE.eye) return false;
  return true;
}

/** How many of the six frames around a cell hold an eye, and how many are empty frames. */
export function gateProgress(world: GateWorld, x: number, y: number, z: number, w: number): { eyes: number; frames: number } {
  let eyes = 0, frames = 0;
  for (const c of gateFaces(x, y, z, w)) {
    const id = world.getBlock(c[0], c[1], c[2], c[3]) & 0xfff;
    if (id === GATE.eye) eyes++;
    else if (id === GATE.frame) frames++;
  }
  return { eyes, frames };
}

/**
 * Put an eye into the empty frame at a cell. Returns null if there is no empty frame there,
 * else the gate cells (usually none or one) the new eye completed and lit.
 */
export function fillFrame(world: GateWorld, x: number, y: number, z: number, w: number): Cell[] | null {
  if ((world.getBlock(x, y, z, w) & 0xfff) !== GATE.frame) return null;
  world.setBlock(x, y, z, w, GATE.eye);
  const lit: Cell[] = [];
  for (const n of gateFaces(x, y, z, w)) {
    if (!gateReady(world, n[0], n[1], n[2], n[3])) continue;
    world.setBlock(n[0], n[1], n[2], n[3], GATE.gate);
    lit.push(n);
  }
  return lit;
}
