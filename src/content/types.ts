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
  | 'marker'
  | 'bands'
  | 'speckle'
  | 'crystal'
  | 'cap'
  | 'fruit'
  | 'bamboo'
  | 'dripstone'
  | 'flower'
  | 'mushroom'
  | 'bud'
  | 'furnace'
  | 'table_top'
  | 'chest'
  | 'metal';

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

export type TreeShape = 'ball' | 'birch' | 'cone' | 'acacia' | 'wide' | 'bamboo' | 'mushroom' | 'dead' | 'cactus' | 'kelp';

/** A tree / large-plant archetype (logs, leaves and the procedural 4D shape). */
export interface TreeDef {
  name: string;
  shape: TreeShape;
  log: string;
  leaves?: string;
  /** Trunk height range. */
  height: [number, number];
  /** Canopy radius range (4D ball / cone / ellipsoid radius). */
  radius: [number, number];
}

export type TerrainStyle = 'normal' | 'dunes' | 'mesa' | 'spires' | 'floating' | 'volcanic' | 'marsh' | 'steppe' | 'hills' | 'flat';

export type PlantPlacement = 'surface' | 'underwater' | 'floor' | 'ceiling';

export interface ParticleDef {
  kind: 'spore' | 'snow' | 'ash' | 'petal' | 'leaf' | 'dust' | 'firefly' | 'bubble' | 'ember' | 'mote';
  color: Hex;
  /** Particles per second around the player (at full density). */
  rate: number;
  glow?: boolean;
  /** Only at night. */
  night?: boolean;
}

export interface MobSpawn {
  mob: string;
  weight: number;
  group?: [number, number];
}

export interface BiomeDef {
  name: string;
  displayName: string;
  /**
   * land: chosen from (temperature, humidity, weirdness, mountains);
   * ocean: chosen where continentalness is low, from (temperature, depth);
   * underground: cave decoration, chosen from (humidity, weirdness) and depth.
   */
  kind: 'land' | 'ocean' | 'underground';
  /** Climate point: land [t, h, weird, mountains]; ocean [t, depth, 0, 0]; underground [h, weird, depth, 0]. */
  climate: [number, number, number, number];
  surface: string;
  subsurface: string;
  underwater: string;
  /** Replaces stone near the surface (e.g. sandstone under deserts). */
  stone?: string;
  /** Underground biomes: block that replaces cave ceilings (floors use `surface`). */
  ceiling?: string;
  terrain?: TerrainStyle;
  /** Height bias and amplitude multipliers applied to the base terrain. */
  heightBias: number;
  heightScale: number;
  trees: { tree: string; density: number }[];
  plants: { block: string; density: number; placement?: PlantPlacement }[];
  particles?: ParticleDef[];
  frozenWater: boolean;
  precipitation: 'rain' | 'snow' | 'none';
  skyColor: Hex;
  fogColor: Hex;
  grassColor: Hex;
  foliageColor: Hex;
  waterColor: Hex;
  music?: string;
  /** Spawn tables (Phase 4 mobs). */
  mobs?: { day?: MobSpawn[]; night?: MobSpawn[]; water?: MobSpawn[]; cave?: MobSpawn[] };
  /** Structure names that may generate here (Phase 5). */
  structures?: string[];
}

// ------------------------------------------------------------------ items (Phase 3)

export type ToolKind = 'pickaxe' | 'axe' | 'shovel' | 'hoe' | 'sword' | 'shears';

/** A tool material tier (wood, stone, copper, iron, ...). */
export interface ToolTierDef {
  name: string;
  displayName: string;
  /** Harvest level: blocks with `tier <= level` drop their items. */
  level: number;
  /** Mining speed multiplier on blocks of the tool's kind. */
  speed: number;
  durability: number;
  /** Attack damage bonus (swords add 4, axes 5, other tools 1-2). */
  damage: number;
  enchantability: number;
  /** Item or #tag the tools are crafted and repaired from. */
  material: string;
  /** Icon colours: head, head shade. */
  color: Hex;
  shade: Hex;
}

export type IconShape =
  | 'pickaxe'
  | 'axe'
  | 'shovel'
  | 'hoe'
  | 'sword'
  | 'shears'
  | 'ingot'
  | 'gem'
  | 'nugget'
  | 'raw'
  | 'dust'
  | 'lump'
  | 'stick'
  | 'bucket'
  | 'flint_steel'
  | 'compass'
  | 'clock'
  | 'ball'
  | 'brick'
  | 'shard'
  | 'flint'
  | 'apple'
  | 'bone'
  | 'feather'
  | 'arrow'
  | 'string'
  | 'bow';

/** Procedural 16x16 pixel icon: a shape painted with a small palette (main, shade, accent). */
export interface IconDef {
  shape: IconShape;
  colors: Hex[];
}

export type ItemGroup = 'building' | 'natural' | 'functional' | 'tools' | 'combat' | 'materials' | 'food' | 'misc';

export interface ItemDef {
  name: string;
  displayName?: string;
  /** Block placed when used. Block items are generated for every block automatically. */
  block?: string;
  /** Default 64; tools 1. */
  maxStack?: number;
  icon?: IconDef;
  tool?: { kind: ToolKind; tier: string };
  /** Uses before breaking, for tools without a tier (shears, flint and steel). */
  durability?: number;
  /** Furnace burn time in seconds. */
  fuel?: number;
  /** Item left behind in the fuel slot after burning (lava bucket -> bucket). */
  fuelRemainder?: string;
  tags?: string[];
  group?: ItemGroup;
  /** Right-click behaviour implemented in the engine. */
  use?: 'bucket' | 'water_bucket' | 'lava_bucket' | 'flint_and_steel' | 'bow';
  /** Held-item HUD readout. */
  readout?: 'compass' | 'clock';
}

export interface DropDef {
  item: string;
  count?: [number, number];
  chance?: number;
}

/** How a block is mined and what it drops (blocks without an entry drop themselves). */
export interface MiningDef {
  /** Tool kind that mines it fast. */
  tool?: ToolKind;
  /** Minimum harvest level of that tool for drops (a tool is required when set). */
  tier?: number;
  /** Drops (default: the block's own item); 'none' drops nothing. */
  drops?: DropDef[] | 'none';
  /** Mined with shears, the block drops itself (leaves, grass). */
  shears?: boolean;
}

/** Item name or '#tag'. */
export type Ingredient = string;

export interface ShapedRecipe {
  type: 'shaped';
  /** Rows of single-character keys; ' ' is empty. Up to 3x3; 2x2-sized recipes work in the inventory grid. */
  pattern: string[];
  key: Record<string, Ingredient>;
  result: string;
  count?: number;
}

export interface ShapelessRecipe {
  type: 'shapeless';
  ingredients: Ingredient[];
  result: string;
  count?: number;
}

export type FurnaceKind = 'furnace' | 'blast_furnace' | 'smoker';

export interface SmeltingRecipe {
  type: 'smelting';
  input: Ingredient;
  result: string;
  count?: number;
  /** Seconds in a furnace (blast furnaces and smokers take half). */
  time?: number;
  /** Which furnaces accept it (default: furnace only; ores add blast_furnace, food adds smoker). */
  furnaces?: FurnaceKind[];
}

export type RecipeDef = ShapedRecipe | ShapelessRecipe | SmeltingRecipe;

// ------------------------------------------------------------------ mobs (Phase 4)

/**
 * One analytic primitive of a mob body, in the mob's local 4D frame:
 * x = right, y = up, z = forward, w = the mob's own "ana" axis. The ray marcher intersects
 * these exactly, so a mob's cross-section changes with the slice like everything else.
 */
export interface MobPart {
  kind: 'box' | 'ball' | 'capsule';
  /** Box/ball centre, or capsule end A. */
  at: [number, number, number, number];
  /** Box half extents. */
  size?: [number, number, number, number];
  /** Ball / capsule radius. */
  r?: number;
  /** Capsule end B. */
  to?: [number, number, number, number];
  color: Hex;
  /** Glows (ignores light). */
  glow?: boolean;
  /** Procedural animation role. */
  anim?: 'leg' | 'head' | 'wing' | 'tail' | 'pulse';
  /** Animation phase offset (radians). */
  phase?: number;
}

export type MobAI =
  | 'passive'
  | 'melee'
  | 'ranged'
  | 'exploder'
  | 'stalker'
  | 'hopper'
  | 'flyer'
  | 'swimmer'
  | 'golem'
  | 'climber'
  | 'mimic'
  | 'lurker';

export interface MobDef {
  name: string;
  displayName: string;
  hostile: boolean;
  ai: MobAI;
  health: number;
  /** Blocks per second. */
  speed: number;
  /** Melee damage per hit (hostile). */
  damage?: number;
  /** Body hitbox half-width (x, z and w) and height. */
  width: number;
  height: number;
  parts: MobPart[];
  drops?: DropDef[];
  /** Burns in direct sunlight (undead). */
  burnsInDay?: boolean;
  /** Immune to fire / lava. */
  fireproof?: boolean;
  /** Hopper: splits into this many smaller copies on death (size levels 3 -> 2 -> 1). */
  splits?: number;
  /** Visual scale range for spawned individuals. */
  scale?: [number, number];
  /** Only damageable while its cross-section is inside your slice (Phase Golem). */
  sliceBound?: boolean;
  /** Ranged: projectile item and seconds between shots. */
  projectile?: { item: string; cooldown: number; damage: number };
  /** Exploder: blast radius (4D ball) and fuse seconds. */
  blast?: { radius: number; fuse: number };
  /** Periodically drops an item (hyperchickens lay eggs): item and seconds range. */
  lays?: { item: string; every: [number, number] };
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
