import type { RealmDef } from './types';

// Realms: the Surface, and (Phase 6) the Ember Depths. The other realms (Hollow Void, Mirror
// Realm, Crystal Abyss, Cloud Archipelago, Penteract) plug in here later with their own
// generator id, gravity axis, sky and weather lists.
//
// coordinateScale links realms through portals: one block of a realm is `coordinateScale`
// Surface blocks along each horizontal axis (x, z and w; y is not scaled). The Ember Depths
// use 8, so a portal trip there shortens horizontal travel 8x in all three horizontal axes.
export const REALMS: RealmDef[] = [
  {
    name: 'surface',
    displayName: 'The Surface',
    heightChunks: 12,
    gravityAxis: 1,
    gravity: 32,
    seaLevel: 104,
    generator: 'surface',
    coordinateScale: 1,
    dayCycle: true,
    ambient: 0.035,
    weather: ['clear', 'rain', 'snow', 'thunder', 'phase_storm'],
    skyColor: '#7aa9ff',
    fogColor: '#c3dbff',
    floorBlock: 'bedrock',
    ceilingBlock: null,
  },
  {
    name: 'ember',
    displayName: 'The Ember Depths',
    heightChunks: 8,
    gravityAxis: 1,
    gravity: 32,
    // The lava sea.
    seaLevel: 32,
    generator: 'ember',
    coordinateScale: 8,
    dayCycle: false,
    ambient: 0.12,
    ambientColor: '#ffb090',
    weather: ['clear'],
    skyColor: '#3a0e08',
    fogColor: '#6a1e0e',
    floorBlock: 'bedrock',
    ceilingBlock: 'bedrock',
    seaFluid: 'lava',
    waterEvaporates: true,
    bedsExplode: true,
    cavernSpawns: true,
  },
  {
    // Realm C: floating islands in black space. No sea (the fall below is the void), no day,
    // an aurora overhead. Reached through a Void Gate in a Stronghold (Game.beginTravel), not a
    // portal, so coordinateScale is 1; Gateway Spires link the islands within the realm.
    name: 'void',
    displayName: 'The Hollow Void',
    heightChunks: 8,
    gravityAxis: 1,
    gravity: 32,
    seaLevel: 0,
    generator: 'void',
    coordinateScale: 1,
    dayCycle: false,
    ambient: 0.1,
    ambientColor: '#a89cff',
    weather: ['clear'],
    skyColor: '#06030f',
    fogColor: '#10081e',
    floorBlock: 'bedrock',
    ceilingBlock: null,
    bedsExplode: true,
    voidSky: true,
    islandSpawns: true,
  },
  {
    // Realm D: the Surface reflected in x, with the sun beneath your feet, "up" called W and left
    // and right swapped. Reached through a Silver Arch rift (Game.updateRift), so no portal scale.
    name: 'mirror',
    displayName: 'The Mirror Realm',
    heightChunks: 12,
    gravityAxis: 1,
    gravity: 32,
    seaLevel: 104,
    generator: 'mirror',
    coordinateScale: 1,
    dayCycle: true,
    ambient: 0.05,
    ambientColor: '#dce4ff',
    weather: ['clear', 'rain', 'snow'],
    skyColor: '#a8b8e0',
    fogColor: '#c8d2ec',
    floorBlock: 'bedrock',
    ceilingBlock: null,
    mirrorX: true,
    axisLabels: ['X', 'W', 'Z', 'Y'],
    invertedSky: true,
    mirrorControls: true,
  },
];
