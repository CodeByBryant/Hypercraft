#version 300 es
// Upscale the internal-resolution image to the canvas and add screen-space effects:
// underwater tint, rain/snow, phase-storm shimmer, kata/ana hazard warnings, vignette.
precision highp float;

in vec2 vNdc;
out vec4 oColor;

uniform sampler2D uColor;
uniform vec2 uRes;          // canvas pixels
uniform float uTime;
uniform float uUnderwater;  // 0..1
uniform vec3 uWaterTint;
uniform float uRain;        // 0..1 (already masked by sky exposure)
uniform float uSnow;
uniform float uStorm;
uniform float uFlash;
uniform vec2 uHazard;       // x = kata (-h) side, y = ana (+h) side
uniform vec2 uBlocked;      // movement along -h / +h is blocked right next to you
uniform float uVignette;
uniform vec2 uLook;         // yaw, pitch (radians) for precipitation parallax
uniform float uDamage;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float rainLayer(vec2 uv, float scale, float speed, float seed) {
  vec2 p = uv * vec2(scale, scale * 0.25);
  p.x += uLook.x * scale * 0.35;
  p.y += uTime * speed + uLook.y * scale * 0.1;
  vec2 cell = floor(p);
  float h = hash21(cell + seed);
  if (h < 0.55) return 0.0;
  vec2 f = fract(p);
  float x = abs(f.x - (0.2 + 0.6 * hash21(cell + seed + 7.1)));
  float len = 0.35 + 0.4 * h;
  float y = fract(f.y + h * 3.0);
  return smoothstep(0.035, 0.0, x) * smoothstep(0.0, 0.1, y) * smoothstep(len, len - 0.1, y);
}

float snowLayer(vec2 uv, float scale, float speed, float seed) {
  vec2 p = uv * scale;
  p.x += uLook.x * scale * 0.3 + sin(uTime * 0.7 + seed) * 0.4;
  p.y += uTime * speed + uLook.y * scale * 0.08;
  vec2 cell = floor(p);
  float h = hash21(cell + seed);
  if (h < 0.6) return 0.0;
  vec2 c = vec2(0.2 + 0.6 * hash21(cell + seed + 3.3), 0.2 + 0.6 * hash21(cell + seed + 9.1));
  c.x += sin(uTime * (1.0 + h) + h * 20.0) * 0.12;
  float r = 0.06 + 0.06 * h;
  return smoothstep(r, r * 0.4, length(fract(p) - c));
}

void main() {
  vec2 uv = vNdc * 0.5 + 0.5;
  vec2 suv = uv;
  if (uUnderwater > 0.0) {
    suv += vec2(sin(uv.y * 40.0 + uTime * 2.0), cos(uv.x * 35.0 + uTime * 1.7)) * 0.0025 * uUnderwater;
  }
  vec3 c = texture(uColor, suv).rgb;
  vec2 aspect = vec2(uRes.x / uRes.y, 1.0);
  vec2 puv = uv * aspect;

  if (uUnderwater > 0.0) {
    c = mix(c, c * uWaterTint * 1.6, 0.55 * uUnderwater);
  }
  if (uRain > 0.0) {
    float r = rainLayer(puv, 26.0, 2.2, 1.0) + rainLayer(puv, 41.0, 2.9, 5.0) * 0.7 + rainLayer(puv, 63.0, 3.6, 9.0) * 0.45;
    c = mix(c, vec3(0.72, 0.78, 0.9), clamp(r, 0.0, 1.0) * 0.35 * uRain);
    c *= 1.0 - 0.12 * uRain;
  }
  if (uSnow > 0.0) {
    float s = snowLayer(puv, 12.0, 0.35, 2.0) + snowLayer(puv, 19.0, 0.5, 4.0) * 0.8 + snowLayer(puv, 30.0, 0.7, 8.0) * 0.6;
    c = mix(c, vec3(0.97), clamp(s, 0.0, 1.0) * 0.8 * uSnow);
  }
  if (uStorm > 0.0) {
    // Phase storm: slice-shear shimmer and chromatic W-banding.
    float band = sin(uv.y * 90.0 + uTime * 9.0 + sin(uv.x * 7.0 + uTime) * 3.0);
    vec3 shift = vec3(texture(uColor, suv + vec2(0.004, 0.0) * uStorm).r, c.g, texture(uColor, suv - vec2(0.004, 0.0) * uStorm).b);
    c = mix(c, shift, 0.6 * uStorm);
    c += vec3(0.25, 0.05, 0.35) * uStorm * (0.5 + 0.5 * band) * 0.25;
  }
  c += vec3(0.8, 0.82, 1.0) * uFlash * 0.35;

  // Fairness (R2): hazards hidden along the hidden axis glow on the screen edge of the side
  // they are on (left = kata / -h, right = ana / +h).
  float edgeL = smoothstep(0.18, 0.0, uv.x);
  float edgeR = smoothstep(0.82, 1.0, uv.x);
  float pulse = 0.75 + 0.25 * sin(uTime * 6.0);
  c = mix(c, vec3(1.0, 0.25, 0.05), clamp(edgeL * uHazard.x * pulse, 0.0, 0.85));
  c = mix(c, vec3(1.0, 0.25, 0.05), clamp(edgeR * uHazard.y * pulse, 0.0, 0.85));
  c = mix(c, vec3(0.6, 0.75, 1.0), clamp(smoothstep(0.05, 0.0, uv.x) * uBlocked.x, 0.0, 0.5));
  c = mix(c, vec3(0.6, 0.75, 1.0), clamp(smoothstep(0.95, 1.0, uv.x) * uBlocked.y, 0.0, 0.5));

  if (uDamage > 0.0) c = mix(c, vec3(0.8, 0.0, 0.0), uDamage * 0.4 * length(vNdc));
  float vig = 1.0 - uVignette * pow(length(vNdc * vec2(0.8, 1.0)) * 0.72, 2.2);
  c *= vig;
  oColor = vec4(c, 1.0);
}
