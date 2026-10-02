#version 300 es
precision highp float;

in vec3 vPos;
in vec4 vColor;
out vec4 oColor;

uniform sampler2D uAux;   // RG = packed ray depth (distance / 512)
uniform vec2 uRes;
uniform float uHiddenAlpha;

void main() {
  vec4 aux = texture(uAux, gl_FragCoord.xy / uRes);
  float sceneT = (aux.r * 255.0 + aux.g) / 255.0 * 512.0;
  float t = length(vPos);
  float a = vColor.a;
  // Alpha above 1 marks x-ray lines (4D vision): they stay bright behind walls.
  bool xray = a > 1.0;
  if (xray) a -= 1.0;
  if (t > sceneT + 0.02 + t * 0.004) a *= xray ? 0.7 : uHiddenAlpha;
  if (a <= 0.003) discard;
  oColor = vec4(vColor.rgb, a);
}
