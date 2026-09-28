#version 300 es
precision highp float;

in vec2 vUv;
in vec3 vPos;
in vec4 vColor;
flat in float vShape;
out vec4 oColor;

uniform sampler2D uAux;   // RG = packed ray depth (distance / 512)
uniform vec2 uRes;
uniform float uFade;      // distance where sprites have faded out

void main() {
  vec4 aux = texture(uAux, gl_FragCoord.xy / uRes);
  float sceneT = (aux.r * 255.0 + aux.g) / 255.0 * 512.0;
  float t = length(vPos);
  if (t > sceneT + 0.01) discard;          // behind terrain
  float r = length(vUv);
  float a = vColor.a;
  if (vShape < 0.5) {
    a *= smoothstep(1.0, 0.55, r);
  } else if (vShape < 1.5) {
    if (max(abs(vUv.x), abs(vUv.y)) > 0.8) discard;
  } else if (vShape < 2.5) {
    a *= exp(-r * r * 4.0);
  } else {
    // six-armed flake
    float ang = atan(vUv.y, vUv.x);
    float arm = abs(cos(ang * 3.0));
    a *= smoothstep(1.0, 0.7, r) * (0.35 + 0.65 * smoothstep(0.6, 1.0, arm)) ;
  }
  a *= clamp(1.0 - t / uFade, 0.0, 1.0);
  if (a <= 0.004) discard;
  oColor = vec4(vColor.rgb, a);
}
