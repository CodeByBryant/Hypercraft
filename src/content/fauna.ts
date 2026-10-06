// Which animals live where (0.7.1): every land biome gets two to four animals that fit it, on
// top of what its table already lists. Applied to the biome list when the registry is built,
// so one table here replaces editing a hundred biome definitions.

import type { BiomeDef, MobSpawn } from './types';

const A = (mob: string, weight: number, lo = 2, hi = 4): MobSpawn => ({ mob, weight, group: [lo, hi] });
const boar = (w = 8) => A('wild_boar', w);
const deer = (w = 8) => A('ridge_deer', w, 2, 5);
const goat = (w = 8) => A('crag_goat', w, 2, 4);
const duck = (w = 6) => A('mallard', w, 2, 5);
const bison = (w = 8) => A('steppe_bison', w, 3, 6);
const turtle = (w = 6) => A('shell_turtle', w, 1, 3);
const crab = (w = 8) => A('shore_crab', w, 2, 5);
const penguin = (w = 8) => A('floe_penguin', w, 3, 6);

/** Extra day-time animals by land biome. */
export const FAUNA: Record<string, MobSpawn[]> = {
  // Temperate woods and fields.
  meadow: [deer(6), boar(5), duck(3)],
  plains: [bison(8), deer(5), duck(3)],
  tesseract_forest: [boar(8), deer(8)],
  birch_glade: [deer(8), boar(5)],
  orchard_hills: [boar(8), deer(5)],
  cherry_grove: [deer(8), duck(4)],
  dark_forest: [boar(8), deer(4)],
  flower_forest: [deer(8), duck(3)],
  autumn_woods: [deer(8), boar(6)],
  aspen_parkland: [deer(8), bison(4)],
  redwood_forest: [deer(8), boar(6)],
  wisteria_woods: [deer(8), boar(4)],
  olive_groves: [goat(8), boar(5)],
  pine_barrens: [deer(6), boar(4)],
  burnt_woods: [deer(4), boar(4)],
  sunflower_plains: [bison(6), duck(4), deer(4)],
  lavender_fields: [goat(6), deer(5)],
  kaleidoscope_fields: [deer(6), goat(4)],
  geyser_basin: [duck(6), boar(4)],
  // Dry lands.
  weathered_steppe: [bison(10), goat(5)],
  savanna: [bison(8), boar(6)],
  baobab_savanna: [boar(8), bison(6)],
  scrubland: [goat(6), boar(5)],
  red_outback: [goat(6), boar(4)],
  hoodoo_badlands: [goat(8), boar(3)],
  sunscar_mesa: [goat(8), boar(3)],
  petrified_forest: [deer(4), goat(5)],
  salt_flats: [goat(4), tesseractRabbit()],
  bone_desert: [A('dune_camel', 3, 1, 2), tesseractRabbit()],
  dune_sea: [goat(3)],
  volcanic_highlands: [goat(8), boar(4)],
  // Wet lands.
  glass_marsh: [duck(8)],
  mushroom_fen: [duck(6), A('bog_frog', 8, 2, 4)],
  mangrove_swamp: [duck(6), crab(8), turtle(4), boar(4)],
  jungle: [boar(8), deer(4), turtle(3)],
  rainforest: [boar(8), deer(4)],
  bamboo_thicket: [boar(6), deer(5)],
  boreal_bog: [duck(6), deer(4)],
  palm_isles: [crab(10), turtle(8), duck(4)],
  // Mountains and the high country.
  stony_peaks: [goat(12), deer(3)],
  hollow_peaks: [goat(8), deer(3)],
  highland_moor: [goat(8), deer(4), bison(4)],
  karst_pillars: [goat(8), deer(5)],
  cloud_forest: [goat(8), deer(4)],
  glowshroom_forest: [deer(5), goat(3)],
  crystal_fields: [goat(5), deer(3)],
  // Cold.
  dense_taiga: [deer(8), boar(5)],
  snow_taiga: [deer(8), goat(4)],
  ice_plains: [penguin(8), A('tesseract_rabbit', 4, 1, 3)],
  frost_spires: [goat(8), penguin(3)],
  tundra: [bison(6), goat(4), penguin(3)],
  glacier: [penguin(10), goat(4)],
};

function tesseractRabbit(): MobSpawn {
  return { mob: 'tesseract_rabbit', weight: 4, group: [1, 3] };
}

/** Add the fauna to the biomes' day tables (idempotent: never lists an animal twice). */
export function applyFauna(biomes: BiomeDef[]): void {
  for (const b of biomes) {
    const extra = FAUNA[b.name];
    if (!extra?.length) continue;
    const mobs = (b.mobs ??= {});
    const day = (mobs.day ??= []);
    for (const s of extra) if (!day.some((d) => d.mob === s.mob)) day.push({ ...s });
  }
}
