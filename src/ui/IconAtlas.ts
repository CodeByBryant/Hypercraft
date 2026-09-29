// Item icon sheet: 32x32 cells on a 1024x1024 canvas. Block items are drawn as isometric
// cubes (or flat sprites for plants and ladders) from the world texture atlas; other items,
// and block items with an explicit icon (torches, lanterns, fences...), are painted from
// their IconDef. Used by the DOM UI (CSS sprites) and uploaded as a
// texture for dropped-item sprites.

import { IREG } from '../content/itemRegistry';
import { REG, SHAPE_KIND_PLANT, RENDER_INVISIBLE } from '../content/registry';
import { paintIcon, ICON } from '../content/itemIcons';
import { ATLAS_COLS, TEX_REGION, TEX_SIZE } from '../content/textureGen';

export const CELL = 32;
export const SHEET = 1024;
const PER_ROW = SHEET / CELL;
const GRASS: [number, number, number] = [0.5, 0.75, 0.3];
const FOLIAGE: [number, number, number] = [0.36, 0.66, 0.22];

export class IconAtlas {
  readonly canvas: HTMLCanvasElement;
  readonly url: string;
  readonly pixels: Uint8ClampedArray<ArrayBuffer>;

  constructor(atlas: Uint8Array, atlasWidth: number) {
    this.pixels = new Uint8ClampedArray(new ArrayBuffer(SHEET * SHEET * 4));
    for (let id = 0; id < IREG.count; id++) this.drawItem(id, atlas, atlasWidth);
    this.canvas = document.createElement('canvas');
    this.canvas.width = SHEET;
    this.canvas.height = SHEET;
    const ctx = this.canvas.getContext('2d')!;
    ctx.putImageData(new ImageData(this.pixels, SHEET, SHEET), 0, 0);
    this.url = this.canvas.toDataURL('image/png');
  }

  /** Top-left pixel of an item's cell. */
  cell(id: number): [number, number] {
    return [(id % PER_ROW) * CELL, Math.floor(id / PER_ROW) * CELL];
  }

  /** Style an element (any size) to show item `id`. */
  apply(el: HTMLElement, id: number, size = CELL): void {
    const [x, y] = this.cell(id);
    const k = size / CELL;
    el.style.backgroundImage = `url(${this.url})`;
    el.style.backgroundSize = `${SHEET * k}px ${SHEET * k}px`;
    el.style.backgroundPosition = `-${x * k}px -${y * k}px`;
  }

  private put(cx: number, cy: number, x: number, y: number, r: number, g: number, b: number, a: number): void {
    if (x < 0 || y < 0 || x >= CELL || y >= CELL) return;
    const o = ((cy + y) * SHEET + cx + x) * 4;
    this.pixels[o] = r;
    this.pixels[o + 1] = g;
    this.pixels[o + 2] = b;
    this.pixels[o + 3] = a;
  }

  private drawItem(id: number, atlas: Uint8Array, aw: number): void {
    const [cx, cy] = this.cell(id);
    const bid = IREG.itemBlock[id]!;
    const def = IREG.def(id);
    // Painted icons win: items without a block, and block items whose shape does not read as
    // a cube or a flat texture (torches, lanterns, fences, campfires, cobwebs).
    if (def.icon || bid < 0 || !REG.blocks[bid] || REG.render[bid] === RENDER_INVISIBLE) {
      const px = def.icon ? paintIcon(def.icon) : new Uint8ClampedArray(ICON * ICON * 4);
      for (let y = 0; y < CELL; y++)
        for (let x = 0; x < CELL; x++) {
          const o = ((y >> 1) * ICON + (x >> 1)) * 4;
          if (px[o + 3]! > 0) this.put(cx, cy, x, y, px[o]!, px[o + 1]!, px[o + 2]!, px[o + 3]!);
        }
      return;
    }
    // Texel of texture t at (u, v) on slice s; v runs up.
    const tint = REG.biomeTint[bid]!;
    const tintCol = tint === 1 ? GRASS : tint === 2 ? FOLIAGE : null;
    const opaqueTint = REG.render[bid] === 1;
    const sample = (t: number, u: number, v: number, s: number, shade: number): [number, number, number, number] => {
      const rx = (t % ATLAS_COLS) * TEX_REGION + (s % 4) * TEX_SIZE;
      const ry = Math.floor(t / ATLAS_COLS) * TEX_REGION + Math.floor(s / 4) * TEX_SIZE;
      const o = ((ry + v) * aw + rx + u) * 4;
      let r = atlas[o]!, g = atlas[o + 1]!, b = atlas[o + 2]!, a = atlas[o + 3]!;
      if (tintCol) {
        const amt = opaqueTint ? a / 255 : 1;
        r *= 1 + (tintCol[0] - 1) * amt;
        g *= 1 + (tintCol[1] - 1) * amt;
        b *= 1 + (tintCol[2] - 1) * amt;
        if (opaqueTint) a = 255;
      }
      return [r * shade, g * shade, b * shade, a];
    };
    const shape = REG.shapes[REG.shapeBase[bid]!]!;
    const flat = shape.kind === SHAPE_KIND_PLANT || shape.name.startsWith('torch') || shape.name.startsWith('ladder') || shape.kind === 2;
    const side = REG.texSide[bid]!, top = REG.texTop[bid]!;
    if (flat) {
      for (let y = 0; y < CELL; y++)
        for (let x = 0; x < CELL; x++) {
          const c = sample(side, x >> 1, 15 - (y >> 1), 8, 1);
          if (c[3] > 40) this.put(cx, cy, x, y, c[0], c[1], c[2], 255);
        }
      return;
    }
    // Isometric cube; slabs are half height.
    const h = shape.name.startsWith('slab') ? 0.5 : 1;
    const topY = 2 + (1 - h) * 14;
    const L = [3, topY + 6.5], T = [16, topY], R = [29, topY + 6.5], Bm = [16, topY + 13];
    const H = 14 * h;
    for (let y = 0; y < CELL; y++)
      for (let x = 0; x < CELL; x++) {
        const px = x + 0.5, py = y + 0.5;
        let c: [number, number, number, number] | null = null;
        // Top face: L + a (T - L) + b (Bm - L)
        {
          const ex = [T[0]! - L[0]!, T[1]! - L[1]!], fx = [Bm[0]! - L[0]!, Bm[1]! - L[1]!];
          const det = ex[0]! * fx[1]! - ex[1]! * fx[0]!;
          const dx = px - L[0]!, dy = py - L[1]!;
          const a = (dx * fx[1]! - dy * fx[0]!) / det, b = (ex[0]! * dy - ex[1]! * dx) / det;
          if (a >= 0 && a < 1 && b >= 0 && b < 1) c = sample(top, Math.floor(a * 16), 8, Math.floor(b * 16) & 15, 1);
        }
        if (!c) {
          // Left face: L + a (Bm - L) + b (0, H)
          const a = (px - L[0]!) / (Bm[0]! - L[0]!);
          const b = (py - (L[1]! + a * (Bm[1]! - L[1]!))) / H;
          if (a >= 0 && a < 1 && b >= 0 && b < 1) c = sample(side, Math.floor(a * 16), 15 - Math.floor(b * 16 * h), 8, 0.82);
        }
        if (!c) {
          // Right face: Bm + a (R - Bm) + b (0, H)
          const a = (px - Bm[0]!) / (R[0]! - Bm[0]!);
          const b = (py - (Bm[1]! + a * (R[1]! - Bm[1]!))) / H;
          if (a >= 0 && a < 1 && b >= 0 && b < 1) c = sample(side, Math.floor(a * 16), 15 - Math.floor(b * 16 * h), 8, 0.64);
        }
        if (c && c[3] > 20) this.put(cx, cy, x, y, c[0], c[1], c[2], Math.max(c[3], 90));
      }
  }
}
