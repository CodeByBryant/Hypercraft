// Content schema. Everything gameplay/visual about a block, shape, texture, biome or
// realm is described by plain JSON-compatible objects of these types (see /docs/data-formats.md).
// The renderer and engine only ever consume the compiled registry (src/content/registry.ts),
// so adding content never requires touching renderer code.

export type Hex = `#${string}`;

/**
 * How the ray marcher treats a block:
 * - invisible:   never drawn (air, barriers)
 * - opaque:      stops the ray (after the analytic shape test)
 * - cutout:      per-texel alpha test on entry/exit facets (leaves, plants, ladders)
 * - translucent: blended, ray continues (glass, ice, portals); internal faces of the same block are skipped
 * - fluid:       water-like translucent volume with a level-dependent surface; lava sets `opaqueFluid`
 */
export type RenderType = 'invisible' | 'opaque' | 'cutout' | 'translucent' | 'fluid';

export interface BlockTextures {
  all?: string;
  top?: string;
  bottom?: string;
  side?: string;
}

export interface BlockDef {
  /** Unique registry name, e.g. "stone". */
  name: string;
  displayName?: string;
  render: RenderType;
  /** Participates in collision. */
  solid: boolean;
  textures: BlockTextures;
  /** Shape name from the shape registry (default "full"). */
  shape?: string;
  /** Fully blocks light (default: opaque render with a full shape). */
  opaque?: boolean;
  /** Extra light attenuation per block for non-opaque blocks (0..15). */
  lightOpacity?: number;
  /** Block light emitted (0..15). */
  emission?: number;
  climbable?: boolean;
  fluid?: 'water' | 'lava';
  /** Fluids and placements may overwrite this block (air, plants, flowing fluid). */
  replaceable?: boolean;
  /** Translucent/fluid tint as #rrggbb and alpha 0..1. */
  tint?: Hex;
  alpha?: number;
  /** Colour multiplied by the biome's grass/foliage colour (0 = none, 1 = grass, 2 = foliage). */
  biomeTint?: 0 | 1 | 2;
  /** Contact damage per second (e.g. lava). */
  damage?: number;
  /** Seconds to mine by hand (Phase 3 uses it; Phase 1 creative breaks instantly). */
  hardness?: number;
  tags?: string[];
}

/** An axis-aligned 4D box inside the unit cell, [min, max] with coordinates in [0, 1]. */
export type Box4 = [[number, number, number, number], [number, number, number, number]];

/**
 * - boxes: union of up to 7 axis-aligned 4D boxes, analytic ray test per box
 * - plant: six diagonal 3D sheets through the cell centre (x=z, x=-z, x=w, ...), alpha tested
 * - fluid: box from 0 up to a height derived from the voxel's meta level
 */
export interface ShapeDef {
  name: string;
  kind: 'boxes' | 'plant' | 'fluid';
  boxes?: Box4[];
  /**
   * Orientation variants selected by the voxel meta nibble:
   * - none:        meta ignored
   * - vertical2:   0 = as authored (bottom), 1 = mirrored in Y (top)
   * - horizontal6: 0..5 = facing +X, -X, +Z, -Z, +W, -W (authored facing +X)
   */
  variants?: 'none' | 'vertical2' | 'horizontal6';
  collision?: 'full' | 'shape' | 'none';
}

export type TexturePattern =
  | 'noise'
  | 'cells'
  | 'grass_top'
  | 'grass_side'
  | 'log_side'
  | 'log_top'
  | 'planks'
  | 'bricks'
  | 'ore'
  | 'glass'
  | 'leaves'
  | 'fluid'
  | 'glow'
  | 'solid'
  | 'ladder'
  | 'torch'
  | 'portal'
  | 'plant'
  | 'marker';

/** Procedural 16x16x16 solid texture (sampled on the 3D facets of tesseracts). */
export interface TextureDef {
  name: string;
  pattern: TexturePattern;
  /** Palette used by the pattern (first entry is the base colour). */
  colors: Hex[];
  /** Pattern-specific knobs (noise amount, density, ...). */
  amount?: number;
  density?: number;
  alpha?: number;
  seed?: number;
}

export interface BiomeDef {
  name: string;
  displayName: string;
  /** Climate point; the generator picks the nearest biome in (temperature, humidity) space. */
  temperature: number;
  humidity: number;
  surface: string;
  subsurface: string;
  underwater: string;
  /** Height bias and amplitude multipliers applied to the base terrain. */
  heightBias: number;
  heightScale: number;
  treeDensity: number;
  grassDensity: number;
  frozenWater: boolean;
  precipitation: 'rain' | 'snow' | 'none';
  skyColor: Hex;
  fogColor: Hex;
  grassColor: Hex;
  foliageColor: Hex;
  waterColor: Hex;
  music?: string;
}

export type WeatherKind = 'clear' | 'rain' | 'snow' | 'thunder' | 'phase_storm';

export interface RealmDef {
  name: string;
  displayName: string;
  /** Height in chunks (16 blocks each); Y range is [0, heightChunks*16). */
  heightChunks: number;
  /** World axis gravity pulls along (negative direction). 1 = Y; the Mirror Realm uses 3 = W. */
  gravityAxis: number;
  gravity: number;
  seaLevel: number;
  generator: string;
  /** Portal coordinate scale relative to the Surface (Ember Depths = 8). */
  coordinateScale: number;
  dayCycle: boolean;
  /** Minimum ambient light (0..1) applied on top of block/sky light. */
  ambient: number;
  weather: WeatherKind[];
  skyColor: Hex;
  fogColor: Hex;
  /** Bedrock floor block and ceiling (null = open sky). */
  floorBlock: string;
  ceilingBlock: string | null;
}
