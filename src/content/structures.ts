// Structure placement data (Phase 5). Biomes list which structures may generate in them
// (BiomeDef.structures); these entries say where and how often, and which builder makes
// them (src/world/gen/structures/builders).
//
// Placement is a 4D grid in the horizontal 3-space: one attempt per spacing³ cell in (x, z, w).
// A structure is only visible from slices that cross its W extent, so grids are denser than
// Minecraft's: roughly, a slice sees chance × (w extent / spacing) structures per spacing² area.

import type { StructureDef } from './types';

const VILLAGE_STYLES = ['meadow', 'orchard', 'marsh', 'taiga', 'snow', 'savanna', 'desert'] as const;

export const STRUCTURES: StructureDef[] = [
  // Villages: a plaza with roads along all six horizontal directions (±x, ±z, ±w).
  ...VILLAGE_STYLES.map(
    (style, i): StructureDef => ({
      name: `village_${style}`,
      displayName: `${style[0]!.toUpperCase()}${style.slice(1)} Village`,
      placement: 'surface',
      spacing: 176,
      chance: 0.6,
      builder: 'village',
      params: { style },
      radius: 40,
      salt: 0x5100 + i,
    }),
  ),
  { name: 'cabin', displayName: 'Cabin', placement: 'surface', spacing: 64, chance: 0.28, builder: 'cabin', radius: 6, salt: 0x5201 },
  { name: 'watchtower', displayName: 'Watchtower', placement: 'surface', spacing: 80, chance: 0.28, builder: 'watchtower', radius: 5, salt: 0x5202 },
  { name: 'witch_hut', displayName: 'Witch Hut', placement: 'surface', spacing: 96, chance: 0.35, builder: 'witch_hut', radius: 6, salt: 0x5203 },
  { name: 'windmill', displayName: 'Windmill', placement: 'surface', spacing: 112, chance: 0.3, builder: 'windmill', radius: 8, salt: 0x5204 },
  { name: 'stone_circle', displayName: 'Stone Sphere', placement: 'surface', spacing: 96, chance: 0.3, builder: 'stone_circle', radius: 9, salt: 0x5205 },
  { name: 'campsite', displayName: 'Campsite', placement: 'surface', spacing: 56, chance: 0.22, builder: 'campsite', radius: 5, salt: 0x5206 },
  { name: 'igloo', displayName: 'Igloo', placement: 'surface', spacing: 96, chance: 0.4, builder: 'igloo', radius: 6, salt: 0x5207 },
  { name: 'outpost', displayName: 'Outpost', placement: 'surface', spacing: 144, chance: 0.35, builder: 'outpost', radius: 9, salt: 0x5208 },
  { name: 'jungle_shrine', displayName: 'Jungle Shrine', placement: 'surface', spacing: 128, chance: 0.45, builder: 'jungle_shrine', radius: 8, salt: 0x5209 },
  { name: 'desert_temple', displayName: 'Desert Temple', placement: 'surface', spacing: 144, chance: 0.45, builder: 'desert_temple', radius: 11, salt: 0x520a },
  { name: 'fossil_site', displayName: 'Fossil Site', placement: 'surface', spacing: 96, chance: 0.3, builder: 'fossil_site', radius: 7, salt: 0x520b },
  { name: 'ruined_portal', displayName: 'Ruined Portal', placement: 'surface', spacing: 128, chance: 0.35, builder: 'ruined_portal', radius: 6, salt: 0x520c },
  { name: 'sky_tower', displayName: 'Sky Tower', placement: 'surface', spacing: 160, chance: 0.45, builder: 'sky_tower', radius: 9, salt: 0x520d },
  { name: 'ancient_ruins', displayName: 'Ancient Ruins', placement: 'surface', spacing: 112, chance: 0.3, builder: 'ruins', radius: 9, salt: 0x520e },
  { name: 'standing_slabs', displayName: 'Standing Slabs', placement: 'surface', spacing: 96, chance: 0.25, builder: 'standing_slabs', radius: 6, salt: 0x520f },
  { name: 'tesseract_grove_temple', displayName: 'Tesseract Grove Temple', placement: 'surface', spacing: 224, chance: 0.5, builder: 'tesseract_temple', radius: 11, salt: 0x5210 },
  { name: 'lighthouse', displayName: 'Lighthouse', placement: 'beach', spacing: 144, chance: 0.5, builder: 'lighthouse', radius: 5, salt: 0x5211 },
  { name: 'buried_treasure', displayName: 'Buried Treasure', placement: 'beach', spacing: 80, chance: 0.35, builder: 'buried_treasure', radius: 2, salt: 0x5212 },
  { name: 'shipwreck', displayName: 'Shipwreck', placement: 'underwater', spacing: 112, chance: 0.4, builder: 'shipwreck', radius: 9, salt: 0x5213 },
  { name: 'sunken_monument', displayName: 'Sunken Monument', placement: 'underwater', spacing: 224, chance: 0.5, builder: 'sunken_monument', radius: 12, salt: 0x5214 },
  // Underground.
  { name: 'dungeon', displayName: 'Dungeon', placement: 'underground', spacing: 44, chance: 0.3, builder: 'dungeon', radius: 5, y: [12, 44], salt: 0x5301 },
  { name: 'hypermine', displayName: 'Hypermine', placement: 'underground', spacing: 176, chance: 0.45, builder: 'hypermine', radius: 34, y: [18, 36], salt: 0x5302 },
  { name: 'library_ruins', displayName: 'Library Ruins', placement: 'underground', spacing: 176, chance: 0.35, builder: 'library', radius: 8, y: [14, 34], salt: 0x5303 },
  { name: 'deep_silent_vault', displayName: 'Deep Silent Vault', placement: 'underground', spacing: 144, chance: 0.45, builder: 'silent_vault', radius: 8, y: [6, 16], salt: 0x5304 },
  // Reachable only through an Ana Sheet: sealed rooms right beside the sheet along W.
  { name: 'ana_vault', displayName: 'Ana Vault', placement: 'sheet', spacing: 112, chance: 0.5, builder: 'ana_vault', radius: 6, salt: 0x5305 },
];
