import type { RealmDef } from './types';

// Only the Surface exists in Phase 1. The other realms (Ember Depths, Hollow Void,
// Mirror Realm, Crystal Abyss, Cloud Archipelago, Penteract) plug in here later with
// their own generator id, gravity axis, sky and weather lists.
export const REALMS: RealmDef[] = [
  {
    name: 'surface',
    displayName: 'The Surface',
    heightChunks: 8,
    gravityAxis: 1,
    gravity: 32,
    seaLevel: 48,
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
];
