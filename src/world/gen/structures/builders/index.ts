// Builder registry: StructureDef.builder names -> functions. Adding a structure means data in
// src/content/structures.ts plus (for a new shape) a builder here.

import type { BuilderFn } from './common';
import { buriedTreasure, cabin, campsite, fossilSite, igloo, lighthouse, outpost, standingSlabs, stoneCircle, watchtower, windmill, witchHut } from './small';
import { desertTemple, jungleShrine, ruinedPortal, ruins, skyTower, tesseractTemple } from './temples';
import { anaVault, dungeon, hypermine, library, silentVault } from './underground';
import { village } from './village';
import { citadel, emberRuinedPortal, forge, magmaBridge, regentCaldera, ziggurat } from './ember';
import { shipwreck, sunkenMonument } from './water';

export const BUILDERS: Record<string, BuilderFn> = {
  village,
  cabin,
  watchtower,
  witch_hut: witchHut,
  windmill,
  stone_circle: stoneCircle,
  campsite,
  igloo,
  outpost,
  jungle_shrine: jungleShrine,
  desert_temple: desertTemple,
  fossil_site: fossilSite,
  ruined_portal: ruinedPortal,
  sky_tower: skyTower,
  ruins,
  standing_slabs: standingSlabs,
  tesseract_temple: tesseractTemple,
  lighthouse,
  buried_treasure: buriedTreasure,
  shipwreck,
  sunken_monument: sunkenMonument,
  dungeon,
  hypermine,
  library,
  silent_vault: silentVault,
  ana_vault: anaVault,
  citadel,
  forge,
  ziggurat,
  magma_bridge: magmaBridge,
  ember_ruined_portal: emberRuinedPortal,
  regent_caldera: regentCaldera,
};
