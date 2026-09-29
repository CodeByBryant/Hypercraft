// Procedural 16x16 pixel-art item icons (no DOM; returns RGBA bytes). Each IconShape is a few
// primitive strokes painted with the item's palette: [main, shade, accent]. A dark outline is
// added automatically so icons read on any background.

import { hexToRgb } from './registry';
import type { IconDef } from './types';

export const ICON = 16;

type RGBA = [number, number, number, number];

class Painter {
  readonly px = new Uint8ClampedArray(ICON * ICON * 4);

  set(x: number, y: number, c: RGBA): void {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= ICON || y >= ICON) return;
    const o = (y * ICON + x) * 4;
    this.px[o] = c[0];
    this.px[o + 1] = c[1];
    this.px[o + 2] = c[2];
    this.px[o + 3] = c[3];
  }

  alpha(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= ICON || y >= ICON) return 0;
    return this.px[(y * ICON + x) * 4 + 3]!;
  }

  line(x0: number, y0: number, x1: number, y1: number, c: RGBA, w = 1): void {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1) * 2;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
      if (w <= 1) this.set(x, y, c);
      else for (let dy = 0; dy < w; dy++) for (let dx = 0; dx < w; dx++) this.set(x + dx - (w - 1) / 2, y + dy - (w - 1) / 2, c);
    }
  }

  poly(pts: [number, number][], c: RGBA): void {
    for (let y = 0; y < ICON; y++) {
      const yc = y + 0.5;
      const xs: number[] = [];
      for (let i = 0; i < pts.length; i++) {
        const [ax, ay] = pts[i]!;
        const [bx, by] = pts[(i + 1) % pts.length]!;
        if ((ay <= yc && by > yc) || (by <= yc && ay > yc)) xs.push(ax + ((yc - ay) / (by - ay)) * (bx - ax));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) for (let x = Math.ceil(xs[k]! - 0.5); x <= Math.floor(xs[k + 1]! - 0.5); x++) this.set(x, y, c);
    }
  }

  disc(cx: number, cy: number, r: number, c: RGBA, pred?: (x: number, y: number) => boolean): void {
    for (let y = 0; y < ICON; y++)
      for (let x = 0; x < ICON; x++) {
        if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 > r * r) continue;
        if (pred && !pred(x, y)) continue;
        this.set(x, y, c);
      }
  }

  outline(): void {
    const src = Uint8ClampedArray.from(this.px);
    for (let y = 0; y < ICON; y++)
      for (let x = 0; x < ICON; x++) {
        const o = (y * ICON + x) * 4;
        if (src[o + 3]! > 0) continue;
        let near = false;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const xx = x + dx, yy = y + dy;
          if (xx >= 0 && yy >= 0 && xx < ICON && yy < ICON && src[(yy * ICON + xx) * 4 + 3]! > 0) near = true;
        }
        if (near) {
          this.px[o] = 24;
          this.px[o + 1] = 20;
          this.px[o + 2] = 28;
          this.px[o + 3] = 200;
        }
      }
  }
}

function rgba(hex: string | undefined, k = 1, fallback = '#ff00ff'): RGBA {
  const [r, g, b] = hexToRgb(hex ?? fallback);
  return [Math.min(255, r * 255 * k), Math.min(255, g * 255 * k), Math.min(255, b * 255 * k), 255];
}

/** Paint an icon; returns 16x16 RGBA. */
export function paintIcon(def: IconDef): Uint8ClampedArray {
  const p = new Painter();
  const main = rgba(def.colors[0]);
  const shade = rgba(def.colors[1] ?? def.colors[0], def.colors[1] ? 1 : 0.7);
  const accent = rgba(def.colors[2] ?? def.colors[0], def.colors[2] ? 1 : 1.25);
  const light = rgba(def.colors[0], 1.3);
  const handle = rgba(def.colors[2] ?? '#8a6a3c');
  const handleDark = rgba(def.colors[2] ?? '#8a6a3c', 0.7);
  const drawHandle = (x1: number, y1: number) => {
    p.line(2, 14, x1, y1, handle);
    p.line(3, 14, x1 + 1, y1, handleDark);
  };
  switch (def.shape) {
    case 'stick':
      p.line(3, 13, 12, 4, main);
      p.line(4, 13, 13, 4, shade);
      break;
    case 'pickaxe': {
      drawHandle(9, 7);
      for (let a = -0.08; a <= Math.PI / 2 + 0.08; a += 0.02) {
        p.set(3.5 + 10 * Math.cos(a), 12.5 - 10 * Math.sin(a), main);
        p.set(3.5 + 9 * Math.cos(a), 12.5 - 9 * Math.sin(a), shade);
      }
      break;
    }
    case 'axe':
      drawHandle(10, 6);
      p.poly([[7, 4], [10, 1], [14, 2], [15, 6], [12, 9], [10, 7]], main);
      p.line(10, 1.5, 14.5, 3, light);
      p.line(10, 7, 12, 8.5, shade);
      break;
    case 'shovel':
      drawHandle(9, 7);
      p.poly([[8.5, 5.5], [12, 1.5], [15.5, 5], [11.5, 8.5]], main);
      p.line(12, 2, 15, 5, light);
      p.line(9, 6, 11.5, 8, shade);
      break;
    case 'hoe':
      drawHandle(10, 6);
      p.poly([[8, 3], [12, 1.5], [15, 4], [13.5, 5.5], [11, 3.5]], main);
      p.line(12, 2, 14.5, 4, light);
      break;
    case 'sword':
      p.line(5, 11, 14, 2, main, 2);
      p.line(6, 11, 14, 3, shade);
      p.line(5, 10, 13, 2, light);
      p.line(2, 9, 7, 14, rgba(def.colors[1] ?? '#5a5a5a', 0.8), 2);
      p.line(1, 15, 4, 12, handle, 2);
      break;
    case 'shears':
      p.line(4, 3, 11, 10, main, 2);
      p.line(11, 3, 4, 10, shade, 2);
      p.disc(4, 12.5, 2.4, accent);
      p.disc(11.5, 12.5, 2.4, accent);
      p.disc(4, 12.5, 1.1, [0, 0, 0, 0]);
      p.disc(11.5, 12.5, 1.1, [0, 0, 0, 0]);
      break;
    case 'ingot':
      p.poly([[2, 9], [6, 5], [14, 5], [10, 9]], main);
      p.poly([[2, 9], [10, 9], [10, 12], [2, 12]], shade);
      p.poly([[10, 9], [14, 5], [14, 8], [10, 12]], rgba(def.colors[1] ?? def.colors[0], 0.8));
      p.line(6, 5, 13, 5, accent);
      break;
    case 'gem':
      p.poly([[8, 1.5], [14, 6], [8, 14.5], [2, 6]], main);
      p.poly([[8, 1.5], [14, 6], [2, 6]], accent);
      p.poly([[2, 6], [8, 6], [8, 14.5]], shade);
      break;
    case 'nugget':
      p.disc(8, 9, 3.6, main);
      p.disc(9, 10, 2, shade);
      p.set(7, 7, accent);
      break;
    case 'raw':
      p.disc(6, 9, 3.6, main);
      p.disc(10.5, 7.5, 3.6, main);
      p.disc(8.5, 11.5, 3.2, shade);
      p.set(10, 6, accent);
      p.set(5, 8, accent);
      p.set(9, 11, main);
      break;
    case 'dust':
      p.disc(8, 13, 6, main, (_x, y) => y < 13);
      p.disc(8, 13, 3.5, shade, (_x, y) => y < 13);
      for (const [x, y] of [[4, 8], [11, 7], [7, 6], [13, 10], [2, 11]] as const) p.set(x, y, accent);
      break;
    case 'lump':
      p.poly([[4, 6], [8, 3], [12, 5], [13, 10], [9, 13], [4, 11]], main);
      p.poly([[8, 8], [13, 10], [9, 13], [4, 11]], shade);
      for (const [x, y] of [[7, 5], [10, 7], [6, 9]] as const) p.set(x, y, accent);
      break;
    case 'bucket':
      for (let a = 0; a <= Math.PI; a += 0.05) p.set(8 + 5.5 * Math.cos(a), 5 - 3.5 * Math.sin(a), shade);
      p.poly([[3, 5], [13, 5], [11, 14], [5, 14]], main);
      p.line(3, 5, 13, 5, shade);
      p.line(5, 14, 11, 14, shade);
      if (def.colors[2]) p.poly([[4, 6], [12, 6], [11.7, 8], [4.3, 8]], accent);
      p.line(5, 7, 6, 12, light);
      break;
    case 'flint_steel':
      for (let a = 0.6; a <= 2 * Math.PI - 0.6; a += 0.05) p.set(6 + 4 * Math.cos(a), 6 + 4 * Math.sin(a), main);
      p.poly([[9, 9], [13, 8], [15, 12], [11, 15], [8, 13]], shade);
      p.set(12, 10, accent);
      break;
    case 'compass':
      p.disc(8, 8, 6.5, shade);
      p.disc(8, 8, 5.2, rgba('#e8e8e0'));
      p.line(8, 8, 11, 4, accent);
      p.line(8, 8, 5, 12, rgba('#404040'));
      p.set(8, 8, main);
      break;
    case 'clock':
      p.disc(8, 8, 6.5, main);
      p.disc(8, 8, 5, accent, (_x, y) => y < 8);
      p.disc(8, 8, 5, rgba('#1a2040'), (_x, y) => y >= 8);
      p.disc(6, 5, 1.2, rgba('#fff4a0'));
      p.set(10, 11, rgba('#e0e0ff'));
      break;
    case 'ball':
      p.disc(8, 8.5, 5, main);
      p.disc(9.5, 10, 3, shade, (x, y) => x + y > 17);
      p.set(6, 6, accent);
      break;
    case 'brick':
      p.poly([[2, 7], [12, 7], [14, 5], [4, 5]], accent);
      p.poly([[2, 7], [12, 7], [12, 12], [2, 12]], main);
      p.poly([[12, 7], [14, 5], [14, 10], [12, 12]], shade);
      break;
    case 'shard':
      p.poly([[9, 1], [12, 5], [10, 14], [6, 12], [5, 6]], main);
      p.poly([[9, 1], [12, 5], [8, 7]], accent);
      p.poly([[6, 12], [10, 14], [8, 8]], shade);
      break;
    case 'flint':
      p.poly([[5, 3], [11, 4], [13, 9], [9, 13], [4, 10]], main);
      p.poly([[5, 3], [11, 4], [8, 7]], accent);
      p.poly([[8, 7], [13, 9], [9, 13]], shade);
      break;
    case 'apple':
      p.disc(8, 9.5, 5.5, main);
      p.disc(10, 11, 3.5, shade, (x, y) => x + y > 18);
      p.set(6, 7, rgba('#ff9a8a'));
      p.line(8, 3, 8, 5, accent);
      p.set(9, 3, rgba('#4f9a3a'));
      p.set(10, 3, rgba('#4f9a3a'));
      break;
    case 'bone':
      p.line(4, 12, 12, 4, main, 2);
      p.disc(3.5, 12.5, 2, main);
      p.disc(12.5, 3.5, 2, main);
      p.line(5, 12, 12, 5, shade);
      break;
    case 'feather':
      p.line(3, 14, 12, 3, shade);
      p.poly([[5, 11], [9, 3], [13, 2], [12, 6], [7, 12]], main);
      p.line(4, 13, 12, 3, accent);
      break;
    case 'arrow':
      p.line(3, 13, 12, 4, rgba('#8a6a3c'));
      p.poly([[10, 3], [14, 2], [13, 6]], main);
      p.line(2, 11, 4, 13, accent);
      p.line(2, 13, 4, 14, accent);
      break;
    case 'string':
      for (let k = 0; k < 14; k++) p.set(2 + k, 8 + Math.round(3 * Math.sin(k * 0.9)), main);
      for (let k = 0; k < 12; k++) p.set(3 + k, 6 + Math.round(2 * Math.cos(k * 1.1)), shade);
      break;
    case 'bow':
      for (let a = -1.25; a <= 1.25; a += 0.03) p.set(4 + 8 * Math.cos(a) - 2, 8 + 7 * Math.sin(a), main);
      for (let a = -1.25; a <= 1.25; a += 0.03) p.set(4 + 8 * Math.cos(a) - 3, 8 + 7 * Math.sin(a), shade);
      p.line(4.5, 1.5, 4.5, 14.5, accent);
      break;
    case 'paper':
      p.poly([[3, 2], [12, 2], [13, 13], [4, 14]], main);
      for (let y = 5; y <= 11; y += 2) p.line(5, y, 11, y - 0.3, shade);
      break;
    case 'book':
      p.poly([[3, 3], [12, 2], [13, 13], [4, 14]], main);
      p.line(4, 3, 5, 14, shade, 2);
      p.line(7, 6, 11, 5.5, accent);
      p.line(7, 8, 11, 7.5, accent);
      break;
    case 'wheat':
      for (let k = 0; k < 3; k++) p.line(4 + k * 3, 14, 6 + k * 3, 3, shade);
      for (let k = 0; k < 3; k++) for (let y = 3; y < 9; y += 2) p.disc(6.5 + k * 3 - (y - 3) * 0.15, y + 0.5, 1.2, main);
      break;
    case 'bread':
      p.poly([[2, 10], [4, 6], [9, 4], [14, 6], [14, 10], [11, 12], [4, 12]], main);
      p.line(5, 8, 7, 6, accent);
      p.line(8, 8, 10, 6, accent);
      p.line(11, 9, 12, 7, accent);
      p.line(3, 11, 13, 11, shade);
      break;
    case 'torch': {
      // Stick with a flame: main = wood, shade = flame, accent = hot core.
      p.line(7, 14, 7, 7, main);
      p.line(8, 14, 8, 7, rgba(def.colors[0], 0.72));
      p.disc(8, 5.2, 2.6, shade);
      p.disc(8, 5.6, 1.5, accent);
      p.set(8, 2, shade);
      break;
    }
    case 'lantern': {
      // Iron cage around a glowing core: main = iron, shade = glow, accent = hot core.
      p.line(8, 1, 8, 3, main);
      p.line(6, 2, 10, 2, main);
      p.poly([[4.5, 4.5], [11.5, 4.5], [11.5, 14.5], [4.5, 14.5]], main);
      p.poly([[5.5, 6.5], [10.5, 6.5], [10.5, 12.5], [5.5, 12.5]], shade);
      p.disc(8, 9.5, 1.6, accent);
      p.line(5, 5, 11, 5, rgba(def.colors[0], 1.25));
      p.line(5, 14, 11, 14, rgba(def.colors[0], 0.7));
      break;
    }
    case 'fence': {
      // Two posts and two rails.
      p.poly([[3, 2], [6, 2], [6, 15], [3, 15]], main);
      p.poly([[10, 2], [13, 2], [13, 15], [10, 15]], main);
      p.poly([[6, 4], [10, 4], [10, 6], [6, 6]], shade);
      p.poly([[6, 9], [10, 9], [10, 11], [6, 11]], shade);
      p.line(5, 2, 5, 14, rgba(def.colors[0], 0.75));
      p.line(12, 2, 12, 14, rgba(def.colors[0], 0.75));
      break;
    }
    case 'campfire': {
      // Crossed logs with a flame: main = logs, shade = flame, accent = core.
      p.line(2, 14, 13, 11, main, 2);
      p.line(3, 11, 14, 14, rgba(def.colors[0], 0.8), 2);
      p.poly([[5, 11], [6, 6], [8, 2], [10, 6], [11, 11]], shade);
      p.poly([[7, 11], [7.5, 7], [8.5, 5], [9.5, 8], [9, 11]], accent);
      break;
    }
    case 'web': {
      // Radial threads and two rings.
      for (let k = 0; k < 8; k++) {
        const a = (k * Math.PI) / 4 + 0.2;
        p.line(8, 8, 8 + Math.cos(a) * 7.5, 8 + Math.sin(a) * 7.5, main);
      }
      for (const r of [3, 5.8]) {
        for (let k = 0; k < 8; k++) {
          const a0 = (k * Math.PI) / 4 + 0.2, a1 = ((k + 1) * Math.PI) / 4 + 0.2;
          p.line(8 + Math.cos(a0) * r, 8 + Math.sin(a0) * r, 8 + Math.cos(a1) * r * 0.92, 8 + Math.sin(a1) * r * 0.92, shade);
        }
      }
      break;
    }
    case 'map': {
      // Folded map with a 4D compass rose (a small tesseract).
      p.poly([[2, 3], [6, 2], [10, 3], [14, 2], [14, 13], [10, 14], [6, 13], [2, 14]], main);
      p.line(6, 2, 6, 13, shade);
      p.line(10, 3, 10, 14, shade);
      p.line(5, 6, 9, 6, accent);
      p.line(9, 6, 9, 10, accent);
      p.line(9, 10, 5, 10, accent);
      p.line(5, 10, 5, 6, accent);
      p.line(7, 8, 11, 8, accent);
      p.line(11, 8, 11, 12, accent);
      p.line(5, 6, 7, 8, accent);
      p.line(9, 10, 11, 12, accent);
      break;
    }
  }
  p.outline();
  return p.px;
}
