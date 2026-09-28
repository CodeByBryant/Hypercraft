#version 300 es
// Thick screen-space lines for cross-section polytope edges (selection, P overlay).
// Endpoints arrive in camera space (x = right, y = up, z = forward), already clipped to z > near.
precision highp float;

layout(location = 0) in vec2 aCorner;   // x: 0 = start, 1 = end; y: side -1 / +1
layout(location = 1) in vec3 aA;
layout(location = 2) in vec3 aB;
layout(location = 3) in vec4 aColor;

uniform vec2 uTan;
uniform vec2 uRes;
uniform float uWidth;

out vec3 vPos;
out vec4 vColor;

vec4 proj(vec3 p) {
  return vec4(p.x / uTan.x, p.y / uTan.y, 0.0, p.z);
}

void main() {
  vec4 ca = proj(aA);
  vec4 cb = proj(aB);
  vec2 sa = ca.xy / ca.w * uRes * 0.5;
  vec2 sb = cb.xy / cb.w * uRes * 0.5;
  vec2 dir = sb - sa;
  float l = length(dir);
  dir = l > 1e-5 ? dir / l : vec2(1.0, 0.0);
  vec2 nrm = vec2(-dir.y, dir.x);
  bool end = aCorner.x > 0.5;
  vec4 c = end ? cb : ca;
  // extend slightly past the endpoints so corners join
  vec2 ext = dir * (end ? 1.0 : -1.0) * uWidth * 0.5;
  vec2 off = (nrm * aCorner.y * uWidth * 0.5 + ext) / (uRes * 0.5) * c.w;
  gl_Position = vec4(c.xy + off, 0.0, c.w);
  vPos = end ? aB : aA;
  vColor = aColor;
}
