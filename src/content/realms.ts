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
];
