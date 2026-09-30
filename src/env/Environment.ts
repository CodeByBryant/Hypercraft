// Day/night cycle, moon phases, weather and biome-tinted sky/fog.
//
// Time runs in ticks (20 per second, 24000 per day: 0 sunrise, 6000 noon, 12000 sunset,
// 18000 midnight). The sun is a 4D direction whose orbit plane is tilted slightly out of
// the XY plane into Z and W, so how much of it is visible depends on the slice orientation
// (see the sky notes in docs/rendering-4d.md).

import { Rng } from '../math/rng';
import { hexToRgb } from '../content/registry';
import type { BiomeDef, RealmDef, WeatherKind } from '../content/types';
import type { SkyState } from '../render/Renderer';

export const TICKS_PER_DAY = 24000;

const WEATHER_DURATION: Record<WeatherKind, [number, number]> = {
  clear: [6000, 18000],
  rain: [3600, 9600],
  snow: [3600, 9600],
  thunder: [2400, 6000],
  phase_storm: [1200, 3600],
};

const WEATHER_WEIGHT: Record<WeatherKind, number> = {
  clear: 0,
  rain: 5,
  snow: 2,
  thunder: 2,
  phase_storm: 1,
};

function lerp3(out: Float32Array, a: ArrayLike<number>, b: ArrayLike<number>, t: number): Float32Array {
  out[0] = a[0]! + (b[0]! - a[0]!) * t;
  out[1] = a[1]! + (b[1]! - a[1]!) * t;
  out[2] = a[2]! + (b[2]! - a[2]!) * t;
  return out;
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

const NIGHT_ZENITH = [0.012, 0.018, 0.05];
const NIGHT_HORIZON = [0.035, 0.045, 0.09];
const SUNSET = [1.0, 0.48, 0.2];
const DAY_LIGHT = [1.0, 0.97, 0.92];
const MOON_LIGHT = [0.42, 0.5, 0.75];

export class Environment {
  readonly realm: RealmDef;
  /** Absolute tick count (day = floor(ticks / 24000)). */
  ticks = 1000;
  timeScale = 1;
  weather: WeatherKind = 'clear';
  /** Ticks until the weather changes. */
  weatherLeft = 6000;
  /** Smoothed 0..1 intensity of the current (non-clear) weather. */
  intensity = 0;
  private flash = 0;
  private nextBolt = 0;
  private readonly rng: Rng;
  lockedWeather = false;
  /** Seconds since start (for animation). */
  seconds = 0;

  readonly sky: SkyState = {
    sunDir: new Float64Array(4),
    moonDir: new Float64Array(4),
    zenith: new Float32Array(3),
    horizon: new Float32Array(3),
    fog: new Float32Array(3),
    sunColor: new Float32Array(3),
    skyLight: new Float32Array(3),
    blockLight: new Float32Array([1.0, 0.8, 0.55]),
    waterFog: new Float32Array(3),
    ambient: 0.03,
    ambientTint: new Float32Array([1, 1, 1]),
    daylight: 1,
    time: 0,
    moonPhase: 0,
    stars: 0,
    cloudCover: 0.35,
    flash: 0,
    storm: 0,
    weatherFog: 0,
    rain: 0,
    snow: 0,
  };

  // Smoothed biome colours (fade across biome borders).
  private readonly bSky = new Float32Array([0.48, 0.66, 1]);
  private readonly bFog = new Float32Array([0.76, 0.86, 1]);
  private readonly bWater = new Float32Array([0.25, 0.46, 0.9]);
  private readonly tmpA = new Float32Array(3);
  private readonly tmpB = new Float32Array(3);
  private precipitation: 'rain' | 'snow' | 'none' = 'rain';
  /** Parsed biome colours, keyed by biome (parsed once, so update() does not allocate). */
  private readonly biomeRgb = new Map<BiomeDef, { sky: number[]; fog: number[]; water: number[] }>();

  constructor(realm: RealmDef, seed: number) {
    this.realm = realm;
    this.rng = new Rng(seed ^ 0x5eed);
    this.sky.ambient = realm.ambient;
    if (realm.ambientColor) this.sky.ambientTint.set(hexToRgb(realm.ambientColor));
  }

  /** Under a ceiling (Ember Depths): no sun, moon, stars, clouds or weather; biome haze. */
  get enclosed(): boolean {
    return this.realm.ceilingBlock !== null;
  }

  get timeOfDay(): number {
    return this.ticks % TICKS_PER_DAY;
  }

  get day(): number {
    return Math.floor(this.ticks / TICKS_PER_DAY);
  }

  /** 0..7 like Minecraft: 0 full moon ... 4 new moon. */
  get moonPhase(): number {
    return this.day % 8;
  }

  setTime(t: number): void {
    this.ticks = this.day * TICKS_PER_DAY + (((t % TICKS_PER_DAY) + TICKS_PER_DAY) % TICKS_PER_DAY);
  }

  setWeather(w: WeatherKind, lock = true): void {
    this.weather = w;
    this.lockedWeather = lock;
    this.weatherLeft = WEATHER_DURATION[w][1];
    if (w !== 'clear') this.intensity = Math.max(this.intensity, 0.999);
    else this.intensity = 0;
  }

  /** Advance one game tick (20 Hz). */
  tick(): void {
    if (this.realm.dayCycle) this.ticks += this.timeScale;
    if (this.lockedWeather) return;
    this.weatherLeft--;
    if (this.weatherLeft <= 0) {
      if (this.weather !== 'clear') this.weather = 'clear';
      else {
        let total = 0;
        for (const w of this.realm.weather) total += WEATHER_WEIGHT[w];
        let r = this.rng.next() * total;
        for (const w of this.realm.weather) {
          r -= WEATHER_WEIGHT[w];
          if (r <= 0 && WEATHER_WEIGHT[w] > 0) {
            this.weather = w;
            break;
          }
        }
      }
      const [a, b] = WEATHER_DURATION[this.weather];
      this.weatherLeft = Math.floor(this.rng.range(a, b));
    }
  }

  /**
   * Per-frame update of the sky state.
   * @param exposure 0..1: how exposed the player is to the sky (for precipitation).
   */
  update(dt: number, biome: BiomeDef | null, exposure: number): void {
    this.seconds += dt;
    const s = this.sky;
    const target = this.weather === 'clear' ? 0 : 1;
    this.intensity += (target - this.intensity) * Math.min(1, dt * 0.35);
    if (Math.abs(target - this.intensity) < 0.002) this.intensity = target;
    const I = this.intensity;

    if (biome) {
      let c = this.biomeRgb.get(biome);
      if (!c) {
        c = { sky: hexToRgb(biome.skyColor), fog: hexToRgb(biome.fogColor), water: hexToRgb(biome.waterColor) };
        this.biomeRgb.set(biome, c);
      }
      const k = Math.min(1, dt * 0.8);
      lerp3(this.bSky, this.bSky, c.sky, k);
      lerp3(this.bFog, this.bFog, c.fog, k);
      lerp3(this.bWater, this.bWater, c.water, k);
      this.precipitation = biome.precipitation;
    }

    // Sun and moon (4D directions).
    const tod = this.timeOfDay / TICKS_PER_DAY;
    const ang = tod * Math.PI * 2;
    const sd = s.sunDir;
    sd[0] = Math.cos(ang);
    sd[1] = Math.sin(ang);
    sd[2] = 0.12;
    sd[3] = 0.2;
    const l = Math.hypot(sd[0]!, sd[1]!, sd[2]!, sd[3]!);
    for (let i = 0; i < 4; i++) {
      sd[i] = sd[i]! / l;
      s.moonDir[i] = -sd[i]!;
    }
    const elev = sd[1]!;
    const dayF = this.realm.dayCycle ? smoothstep(-0.15, 0.2, elev) : 0.35;
    const phase = this.moonPhase;
    // 1 at full moon (phase 0), 0 at new moon (phase 4).
    const fullness = Math.abs(4 - phase) / 4;
    s.moonPhase = phase / 8;

    const storm = this.weather === 'phase_storm' ? I : 0;
    const wet = this.weather === 'rain' || this.weather === 'snow' || this.weather === 'thunder' ? I : 0;
    const thunder = this.weather === 'thunder' ? I : 0;
    const gloom = 1 - 0.45 * wet - 0.25 * thunder - 0.2 * storm;

    // Sky colours.
    const dz = this.tmpA, dh = this.tmpB;
    dz[0] = this.bSky[0]!;
    dz[1] = this.bSky[1]!;
    dz[2] = this.bSky[2]!;
    dh[0] = this.bSky[0]! * 0.45 + 0.55;
    dh[1] = this.bSky[1]! * 0.45 + 0.55;
    dh[2] = this.bSky[2]! * 0.45 + 0.55;
    lerp3(s.zenith, NIGHT_ZENITH, dz, dayF);
    lerp3(s.horizon, NIGHT_HORIZON, dh, dayF);
    const sunset = smoothstep(0.35, 0.0, Math.abs(elev)) * (this.realm.dayCycle ? 1 : 0);
    lerp3(s.horizon, s.horizon, SUNSET, sunset * 0.55);
    // Weather desaturates and darkens.
    for (let i = 0; i < 3; i++) {
      const grayZ = (s.zenith[0]! + s.zenith[1]! + s.zenith[2]!) / 3;
      const grayH = (s.horizon[0]! + s.horizon[1]! + s.horizon[2]!) / 3;
      s.zenith[i] = (s.zenith[i]! + (grayZ - s.zenith[i]!) * 0.7 * wet) * gloom;
      s.horizon[i] = (s.horizon[i]! + (grayH - s.horizon[i]!) * 0.6 * wet) * gloom;
    }
    // Fog: biome fog blended toward the horizon colour.
    for (let i = 0; i < 3; i++) {
      s.fog[i] = (this.bFog[i]! * (0.25 + 0.75 * dayF) * 0.6 + s.horizon[i]! * 0.4) * (0.55 + 0.45 * gloom);
    }
    s.sunColor[0] = 1.0;
    s.sunColor[1] = 0.85 - 0.25 * sunset;
    s.sunColor[2] = 0.6 - 0.3 * sunset;
    // Light colours.
    const moon = 0.12 + 0.13 * fullness;
    for (let i = 0; i < 3; i++) {
      s.skyLight[i] = (DAY_LIGHT[i]! * dayF + MOON_LIGHT[i]! * moon * (1 - dayF)) * (0.55 + 0.45 * gloom);
      s.waterFog[i] = this.bWater[i]! * (0.12 + 0.45 * dayF) * gloom;
    }
    s.daylight = dayF * gloom;
    s.time = this.seconds;
    s.stars = this.realm.dayCycle ? smoothstep(0.15, -0.2, elev) : 0.6;
    s.cloudCover = 0.32 + 0.45 * wet + 0.2 * thunder + 0.3 * storm;
    s.weatherFog = 0.35 * wet + 0.2 * thunder + 0.25 * storm;
    s.storm = storm;
    const precip = wet * exposure;
    s.rain = this.precipitation === 'rain' ? precip : 0;
    s.snow = this.precipitation === 'snow' ? precip : 0;
    if (this.weather === 'snow' && this.precipitation === 'rain') s.rain = precip; // snow weather in temperate = rain
    // Lightning.
    this.flash = Math.max(0, this.flash - dt * 3.5);
    if (thunder > 0.5 || storm > 0.5) {
      this.nextBolt -= dt;
      if (this.nextBolt <= 0) {
        this.flash = 1;
        this.nextBolt = 3 + this.rng.next() * 9;
      }
    }
    s.flash = this.flash * (thunder > 0 ? 1 : 0.6);
    if (this.enclosed) {
      // The "sky" is the biome's haze: rays that escape end in fog, and distant terrain fades
      // into it. No sky light (the ceiling blocks it anyway), no sun, moon or stars.
      for (let i = 0; i < 3; i++) {
        s.fog[i] = this.bFog[i]!;
        s.zenith[i] = this.bFog[i]! * 0.7;
        s.horizon[i] = this.bFog[i]!;
        s.skyLight[i] = 0;
      }
      s.sunDir.set([0, -1, 0, 0]);
      s.moonDir.set([0, -1, 0, 0]);
      s.stars = 0;
      s.cloudCover = 0;
      s.daylight = 0;
      s.weatherFog = 0.3;
      s.rain = 0;
      s.snow = 0;
      s.flash = 0;
    }
  }
}
