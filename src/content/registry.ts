// Compiles the content definitions (blocks, shapes, textures, biomes, realms) into flat
// typed arrays for the engine, and GPU tables for the renderer. Built identically on the
// main thread and in every worker (it is deterministic and cheap).

import { BLOCKS } from './blocks';
import { SHAPES } from './shapes';
import { TEXTURES } from './textures';
import { BIOMES } from './biomes';
import { REALMS } from './realms';
import { TREES } from './trees';
import { TERRAIN_BLOCKS, TERRAIN_TEXTURES } from './terrain';
import { FUNCTIONAL_BLOCKS, FUNCTIONAL_TEXTURES } from './functional';
import { STRUCTURE_BLOCKS, STRUCTURE_TEXTURES } from './structureBlocks';
import { EMBER_BIOMES, EMBER_BLOCKS, EMBER_TEXTURES, EMBER_TREES } from './ember';
import type { BiomeDef, BlockDef, Box4, Hex, RealmDef, ShapeDef, TextureDef, TreeDef } from './types';

/** A voxel is a uint16: block id in the low 12 bits, a 4-bit meta nibble on top. */
export const ID_MASK = 0x0fff;
export const META_SHIFT = 12;
export const MAX_BLOCK_IDS = 4096;
export const MAX_BOXES_PER_SHAPE = 7;
/** Texels per shape row in the GPU shape table: 1 header + 2 per box. */
export const SHAPE_TEXELS = 16;

export const RENDER_INVISIBLE = 0;
export const RENDER_OPAQUE = 1;
export const RENDER_CUTOUT = 2;
export const RENDER_TRANSLUCENT = 3;
export const RENDER_FLUID = 4;

export const SHAPE_KIND_BOXES = 0;
export const SHAPE_KIND_PLANT = 1;
export const SHAPE_KIND_FLUID = 2;

export const COLLISION_NONE = 0;
export const COLLISION_FULL = 1;
export const COLLISION_SHAPE = 2;

export const FLUID_NONE = 0;
export const FLUID_WATER = 1;
export const FLUID_LAVA = 2;

export const VARIANT_NONE = 0;
export const VARIANT_VERTICAL2 = 1;
export const VARIANT_HORIZONTAL6 = 2;

/** Horizontal facing order used by `horizontal6` shapes (meta nibble). */
export const FACING_AXES = [0, 0, 2, 2, 3, 3] as const;
export const FACING_SIGNS = [1, -1, 1, -1, 1, -1] as const;

export function voxelId(v: number): number {
  return v & ID_MASK;
}
export function voxelMeta(v: number): number {
  return (v >>> META_SHIFT) & 15;
}
export function makeVoxel(id: number, meta = 0): number {
  return (id & ID_MASK) | ((meta & 15) << META_SHIFT);
}

export function hexToRgb(hex: Hex | string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function transformBox(box: Box4, mode: number, variant: number): Box4 {
  const min = [...box[0]] as [number, number, number, number];
  const max = [...box[1]] as [number, number, number, number];
  const mirror = (axis: number) => {
    const a = 1 - max[axis]!;
    const b = 1 - min[axis]!;
    min[axis] = a;
    max[axis] = b;
  };
  const swap = (a: number, b: number) => {
    let t = min[a]!;
    min[a] = min[b]!;
    min[b] = t;
    t = max[a]!;
    max[a] = max[b]!;
    max[b] = t;
  };
  if (mode === VARIANT_VERTICAL2) {
    if (variant === 1) mirror(1);
  } else if (mode === VARIANT_HORIZONTAL6) {
    const axis = FACING_AXES[variant]!;
    const sign = FACING_SIGNS[variant]!;
    if (axis !== 0) swap(0, axis);
    if (sign < 0) mirror(axis);
  }
  return [min, max];
}

export interface CompiledShape {
  name: string;
  kind: number;
  collision: number;
  /** Boxes as [minx,miny,minz,minw,maxx,maxy,maxz,maxw] per box. */
  boxes: Float32Array;
  boxCount: number;
}

export class Registry {
  readonly blocks: BlockDef[];
  readonly textures: TextureDef[];
  readonly biomes: BiomeDef[];
  readonly realms: RealmDef[];
  readonly shapeDefs: ShapeDef[];
  readonly trees: TreeDef[];
  readonly count: number;
  private readonly treeByName = new Map<string, number>();

  private readonly byName = new Map<string, number>();
  private readonly texByName = new Map<string, number>();
  private readonly biomeByName = new Map<string, number>();
  private readonly realmByName = new Map<string, number>();

  // Per-block-id property tables.
  readonly render = new Uint8Array(MAX_BLOCK_IDS);
  readonly solid = new Uint8Array(MAX_BLOCK_IDS);
  /** Fully blocks light. */
  readonly opaque = new Uint8Array(MAX_BLOCK_IDS);
  readonly lightOpacity = new Uint8Array(MAX_BLOCK_IDS);
  readonly emission = new Uint8Array(MAX_BLOCK_IDS);
  readonly climbable = new Uint8Array(MAX_BLOCK_IDS);
  readonly fluid = new Uint8Array(MAX_BLOCK_IDS);
  readonly replaceable = new Uint8Array(MAX_BLOCK_IDS);
  readonly damage = new Float32Array(MAX_BLOCK_IDS);
  /** Movement speed multiplier inside the block (1 = none). */
  readonly slow = new Float32Array(MAX_BLOCK_IDS).fill(1);
  readonly hardness = new Float32Array(MAX_BLOCK_IDS);
  readonly collision = new Uint8Array(MAX_BLOCK_IDS);
  readonly isFullShape = new Uint8Array(MAX_BLOCK_IDS);
  readonly shapeBase = new Uint16Array(MAX_BLOCK_IDS);
  readonly variantMode = new Uint8Array(MAX_BLOCK_IDS);
  readonly texTop = new Uint16Array(MAX_BLOCK_IDS);
  readonly texBottom = new Uint16Array(MAX_BLOCK_IDS);
  readonly texSide = new Uint16Array(MAX_BLOCK_IDS);
  readonly biomeTint = new Uint8Array(MAX_BLOCK_IDS);
  readonly tintRgba = new Uint32Array(MAX_BLOCK_IDS);

  /** Flattened shape variants; index 0 is always the full cube. */
  readonly shapes: CompiledShape[] = [];

  constructor(
    blocks: BlockDef[],
    shapes: ShapeDef[],
    textures: TextureDef[],
    biomes: BiomeDef[],
    realms: RealmDef[],
    trees: TreeDef[] = [],
  ) {
    this.blocks = blocks;
    this.textures = textures;
    this.biomes = biomes;
    this.realms = realms;
    this.shapeDefs = shapes;
    this.trees = trees;
    this.count = blocks.length;
    const errors: string[] = [];

    if (blocks.length === 0 || blocks[0]!.name !== 'air') errors.push('block 0 must be "air"');
    if (blocks.length > MAX_BLOCK_IDS) errors.push(`too many blocks (${blocks.length} > ${MAX_BLOCK_IDS})`);

    textures.forEach((t, i) => {
      if (this.texByName.has(t.name)) errors.push(`duplicate texture "${t.name}"`);
      this.texByName.set(t.name, i);
    });
    if (textures.length > 1024) errors.push('too many textures (max 1024)');

    // Shapes: full cube first, then every variant of every shape.
    const shapeBaseByName = new Map<string, { base: number; mode: number }>();
    const fullIdx = shapes.findIndex((s) => s.name === 'full');
    if (fullIdx < 0) errors.push('shape "full" is required');
    const ordered = fullIdx >= 0 ? [shapes[fullIdx]!, ...shapes.filter((_, i) => i !== fullIdx)] : shapes;
    for (const s of ordered) {
      if (shapeBaseByName.has(s.name)) {
        errors.push(`duplicate shape "${s.name}"`);
        continue;
      }
      const mode = s.variants === 'vertical2' ? VARIANT_VERTICAL2 : s.variants === 'horizontal6' ? VARIANT_HORIZONTAL6 : VARIANT_NONE;
      const nVar = mode === VARIANT_VERTICAL2 ? 2 : mode === VARIANT_HORIZONTAL6 ? 6 : 1;
      const kind = s.kind === 'plant' ? SHAPE_KIND_PLANT : s.kind === 'fluid' ? SHAPE_KIND_FLUID : SHAPE_KIND_BOXES;
      const collision = s.collision === 'none' ? COLLISION_NONE : s.collision === 'full' ? COLLISION_FULL : COLLISION_SHAPE;
      const boxes = s.boxes ?? [];
      if (kind === SHAPE_KIND_BOXES && (boxes.length === 0 || boxes.length > MAX_BOXES_PER_SHAPE)) {
        errors.push(`shape "${s.name}" needs 1..${MAX_BOXES_PER_SHAPE} boxes`);
      }
      shapeBaseByName.set(s.name, { base: this.shapes.length, mode });
      for (let v = 0; v < nVar; v++) {
        const arr = new Float32Array(MAX_BOXES_PER_SHAPE * 8);
        boxes.forEach((b, bi) => {
          const tb = transformBox(b, mode, v);
          for (let k = 0; k < 4; k++) {
            arr[bi * 8 + k] = tb[0][k]!;
            arr[bi * 8 + 4 + k] = tb[1][k]!;
          }
        });
        this.shapes.push({ name: nVar > 1 ? `${s.name}#${v}` : s.name, kind, collision, boxes: arr, boxCount: boxes.length });
      }
    }
    if (this.shapes.length > 1024) errors.push('too many shape variants (max 1024)');

    blocks.forEach((b, id) => {
      if (this.byName.has(b.name)) errors.push(`duplicate block "${b.name}"`);
      this.byName.set(b.name, id);
      const render =
        b.render === 'opaque' ? RENDER_OPAQUE : b.render === 'cutout' ? RENDER_CUTOUT : b.render === 'translucent' ? RENDER_TRANSLUCENT : b.render === 'fluid' ? RENDER_FLUID : RENDER_INVISIBLE;
      this.render[id] = render;
      this.solid[id] = b.solid ? 1 : 0;
      const shapeName = b.shape ?? 'full';
      const sb = shapeBaseByName.get(shapeName);
      if (!sb) errors.push(`block "${b.name}": unknown shape "${shapeName}"`);
      this.shapeBase[id] = sb?.base ?? 0;
      this.variantMode[id] = sb?.mode ?? 0;
      const full = shapeName === 'full';
      this.isFullShape[id] = full ? 1 : 0;
      const opaque = b.opaque ?? (render === RENDER_OPAQUE && full);
      this.opaque[id] = opaque ? 1 : 0;
      this.lightOpacity[id] = opaque ? 15 : Math.max(0, Math.min(15, b.lightOpacity ?? 0));
      this.emission[id] = Math.max(0, Math.min(15, b.emission ?? 0));
      this.climbable[id] = b.climbable ? 1 : 0;
      this.fluid[id] = b.fluid === 'water' ? FLUID_WATER : b.fluid === 'lava' ? FLUID_LAVA : FLUID_NONE;
      this.replaceable[id] = b.replaceable ? 1 : 0;
      this.damage[id] = b.damage ?? 0;
      this.slow[id] = Math.max(0.01, Math.min(1, b.slows ?? 1));
      this.hardness[id] = b.hardness ?? 1;
      const shapeCollision = sb ? this.shapes[sb.base]!.collision : COLLISION_FULL;
      this.collision[id] = !b.solid ? COLLISION_NONE : full ? COLLISION_FULL : shapeCollision;
      this.biomeTint[id] = b.biomeTint ?? 0;
      const tex = (n: string | undefined): number => {
        if (n === undefined) return 0;
        const t = this.texByName.get(n);
        if (t === undefined) {
          errors.push(`block "${b.name}": unknown texture "${n}"`);
          return 0;
        }
        return t;
      };
      const all = b.textures.all;
      const side = tex(b.textures.side ?? all);
      this.texSide[id] = side;
      this.texTop[id] = b.textures.top !== undefined ? tex(b.textures.top) : side;
      this.texBottom[id] = b.textures.bottom !== undefined ? tex(b.textures.bottom) : side;
      if (render !== RENDER_INVISIBLE && b.textures.all === undefined && b.textures.side === undefined) {
        errors.push(`block "${b.name}": needs textures.all or textures.side`);
      }
      const [r, g, bl] = hexToRgb(b.tint ?? '#ffffff');
      const a = b.alpha ?? 1;
      this.tintRgba[id] =
        (Math.round(r * 255) | (Math.round(g * 255) << 8) | (Math.round(bl * 255) << 16) | (Math.round(a * 255) << 24)) >>> 0;
    });

    // The VOID sentinel (id 4095: unloaded space, below the world) behaves like bedrock
    // for physics and light but is never drawn.
    const VOID = MAX_BLOCK_IDS - 1;
    this.solid[VOID] = 1;
    this.opaque[VOID] = 1;
    this.lightOpacity[VOID] = 15;
    this.collision[VOID] = COLLISION_FULL;
    this.isFullShape[VOID] = 1;

    trees.forEach((t, i) => {
      if (this.treeByName.has(t.name)) errors.push(`duplicate tree "${t.name}"`);
      this.treeByName.set(t.name, i);
      if (!this.byName.has(t.log)) errors.push(`tree "${t.name}": unknown log "${t.log}"`);
      if (t.leaves && !this.byName.has(t.leaves)) errors.push(`tree "${t.name}": unknown leaves "${t.leaves}"`);
    });
    biomes.forEach((b, i) => {
      if (this.biomeByName.has(b.name)) errors.push(`duplicate biome "${b.name}"`);
      this.biomeByName.set(b.name, i);
      for (const k of ['surface', 'subsurface', 'underwater'] as const) {
        if (!this.byName.has(b[k])) errors.push(`biome "${b.name}": unknown block "${b[k]}"`);
      }
      if (b.stone && !this.byName.has(b.stone)) errors.push(`biome "${b.name}": unknown stone "${b.stone}"`);
      if (b.ceiling && !this.byName.has(b.ceiling)) errors.push(`biome "${b.name}": unknown ceiling "${b.ceiling}"`);
      for (const t of b.trees) if (!this.treeByName.has(t.tree)) errors.push(`biome "${b.name}": unknown tree "${t.tree}"`);
      for (const p of b.plants) if (!this.byName.has(p.block)) errors.push(`biome "${b.name}": unknown plant "${p.block}"`);
    });
    realms.forEach((r, i) => {
      if (this.realmByName.has(r.name)) errors.push(`duplicate realm "${r.name}"`);
      this.realmByName.set(r.name, i);
      if (!this.byName.has(r.floorBlock)) errors.push(`realm "${r.name}": unknown floor block`);
      if (r.gravityAxis < 0 || r.gravityAxis > 3) errors.push(`realm "${r.name}": bad gravity axis`);
    });

    if (errors.length) throw new Error('Content registry errors:\n  ' + errors.join('\n  '));
  }

  id(name: string): number {
    const id = this.byName.get(name);
    if (id === undefined) throw new Error(`unknown block "${name}"`);
    return id;
  }

  has(name: string): boolean {
    return this.byName.has(name);
  }

  name(voxel: number): string {
    return this.blocks[voxel & ID_MASK]?.name ?? `#${voxel & ID_MASK}`;
  }

  textureIndex(name: string): number {
    const t = this.texByName.get(name);
    if (t === undefined) throw new Error(`unknown texture "${name}"`);
    return t;
  }

  biome(name: string): BiomeDef {
    const i = this.biomeByName.get(name);
    if (i === undefined) throw new Error(`unknown biome "${name}"`);
    return this.biomes[i]!;
  }

  tree(name: string): TreeDef {
    const i = this.treeByName.get(name);
    if (i === undefined) throw new Error(`unknown tree "${name}"`);
    return this.trees[i]!;
  }

  biomeIndex(name: string): number {
    const i = this.biomeByName.get(name);
    if (i === undefined) throw new Error(`unknown biome "${name}"`);
    return i;
  }

  realm(name: string): RealmDef {
    const i = this.realmByName.get(name);
    if (i === undefined) throw new Error(`unknown realm "${name}"`);
    return this.realms[i]!;
  }

  /** Index into `shapes` for a voxel value (applies the orientation variant from the meta nibble). */
  shapeIndex(voxel: number): number {
    const id = voxel & ID_MASK;
    const mode = this.variantMode[id]!;
    const meta = (voxel >>> META_SHIFT) & 15;
    const v = mode === VARIANT_VERTICAL2 ? meta & 1 : mode === VARIANT_HORIZONTAL6 ? Math.min(meta, 5) : 0;
    return this.shapeBase[id]! + v;
  }

  /**
   * GPU block info, 4 x uint32 per block id (RGBA32UI texture, 64 x 64):
   *  x: render(0-2) | shapeBase(3-12) | variantMode(13-14) | emission(15-18) | biomeTint(19-20) | fluid(21-22) | full(23) | lightOpaque(24)
   *  y: texTop(0-9) | texBottom(10-19) | texSide(20-29)
   *  z: tint RGBA8
   *  w: reserved
   */
  gpuBlockInfo(): Uint32Array {
    const out = new Uint32Array(MAX_BLOCK_IDS * 4);
    for (let id = 0; id < this.count; id++) {
      out[id * 4] =
        (this.render[id]! |
          (this.shapeBase[id]! << 3) |
          (this.variantMode[id]! << 13) |
          (this.emission[id]! << 15) |
          (this.biomeTint[id]! << 19) |
          (this.fluid[id]! << 21) |
          (this.isFullShape[id]! << 23) |
          (this.opaque[id]! << 24)) >>>
        0;
      out[id * 4 + 1] = (this.texTop[id]! | (this.texBottom[id]! << 10) | (this.texSide[id]! << 20)) >>> 0;
      out[id * 4 + 2] = this.tintRgba[id]!;
      out[id * 4 + 3] = 0;
    }
    return out;
  }

  /** GPU shape table: RGBA32F, SHAPE_TEXELS texels per shape variant row. */
  gpuShapeTable(): Float32Array {
    const out = new Float32Array(this.shapes.length * SHAPE_TEXELS * 4);
    this.shapes.forEach((s, i) => {
      const o = i * SHAPE_TEXELS * 4;
      out[o] = s.kind;
      out[o + 1] = s.boxCount;
      for (let b = 0; b < s.boxCount; b++) {
        for (let k = 0; k < 8; k++) out[o + 4 + b * 8 + k] = s.boxes[b * 8 + k]!;
      }
    });
    return out;
  }
}

export const ALL_BLOCKS: BlockDef[] = [...BLOCKS, ...TERRAIN_BLOCKS, ...FUNCTIONAL_BLOCKS, ...STRUCTURE_BLOCKS, ...EMBER_BLOCKS];
export const ALL_TEXTURES: TextureDef[] = [...TEXTURES, ...TERRAIN_TEXTURES, ...FUNCTIONAL_TEXTURES, ...STRUCTURE_TEXTURES, ...EMBER_TEXTURES];
export const ALL_BIOMES: BiomeDef[] = [...BIOMES, ...EMBER_BIOMES];
export const REG = new Registry(ALL_BLOCKS, SHAPES, ALL_TEXTURES, ALL_BIOMES, REALMS, [...TREES, ...EMBER_TREES]);

/** Frequently used ids (resolved once). */
export const B = {
  air: REG.id('air'),
  bedrock: REG.id('bedrock'),
  stone: REG.id('stone'),
  cobblestone: REG.id('cobblestone'),
  smooth_stone: REG.id('smooth_stone'),
  dirt: REG.id('dirt'),
  grass: REG.id('grass'),
  sand: REG.id('sand'),
  sandstone: REG.id('sandstone'),
  gravel: REG.id('gravel'),
  snow: REG.id('snow'),
  ice: REG.id('ice'),
  clay: REG.id('clay'),
  water: REG.id('water'),
  lava: REG.id('lava'),
  log: REG.id('log'),
  leaves: REG.id('leaves'),
  planks: REG.id('planks'),
  glass: REG.id('glass'),
  lumen: REG.id('lumen'),
  torch: REG.id('torch'),
  coal_ore: REG.id('coal_ore'),
  iron_ore: REG.id('iron_ore'),
  hyperite_ore: REG.id('hyperite_ore'),
  obsidian: REG.id('obsidian'),
  stone_slab: REG.id('stone_slab'),
  stone_stairs: REG.id('stone_stairs'),
  ladder: REG.id('ladder'),
  portal: REG.id('portal'),
  bricks: REG.id('bricks'),
  tall_grass: REG.id('tall_grass'),
  marker_x: REG.id('marker_x'),
  marker_y: REG.id('marker_y'),
  marker_z: REG.id('marker_z'),
  marker_w: REG.id('marker_w'),
} as const;
