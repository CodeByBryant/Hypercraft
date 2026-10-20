// Mirror Realm structures (Phase 9). The Silver Arch stands on the Surface: a small ruin whose
// rift sleeps until a Hand Mirror wakes it. (The Mirror Palace comes with the realm's mobs.)

import type { Builder } from '../Builder';
import { archCells } from '../../../../content/mirror';
import { REG } from '../../../../content/registry';
import { IF_SOFT } from '../Plan';

const id = (n: string) => REG.id(n);

/** Silver Arch: a plinth, four pillars, a roof and, between them, a dormant rift. */
export function silverArch(b: Builder): void {
  b.box(-1, 0, -1, -1, 1, 4, 1, 1, 0, IF_SOFT);
  b.foundation(-1, -1, -1, 1, 1, 1, -2, id('arch_stone'), 8);
  for (const c of archCells('dormant_rift')) b.set(c.d[0], c.d[1], c.d[2], c.d[3], id(c.block));
  // A little rubble: a few stones that have fallen from the roof.
  for (let k = 0; k < 4; k++) {
    const a = b.int(-3, 3), bb = b.int(-3, 3), c = b.int(-2, 2);
    if (Math.abs(a) <= 1 && Math.abs(bb) <= 1 && Math.abs(c) <= 1) continue;
    b.set(a, 0, bb, c, id('arch_stone'), IF_SOFT);
  }
}
