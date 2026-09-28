#version 300 es
// Camera-facing sprites for particles and (later) dropped items. Centres arrive in camera
// space (x = right, y = up, z = forward). The CPU already applied the 4D slice: a particle is
// a small 4-ball, and its radius here is that of its cross-section with the view hyperplane.
precision highp float;

layout(location = 0) in vec2 aCorner;   // -1..1
layout(location = 1) in vec4 aCenter;   // xyz camera space, w = cross-section radius
layout(location = 2) in vec4 aColor;
layout(location = 3) in vec2 aShape;    // x: shape (0 soft disc, 1 square, 2 glow, 3 flake), y: spin

uniform vec2 uTan;

out vec2 vUv;
out vec3 vPos;
out vec4 vColor;
flat out float vShape;

void main() {
  float c = cos(aShape.y), s = sin(aShape.y);
  vec2 k = vec2(c * aCorner.x - s * aCorner.y, s * aCorner.x + c * aCorner.y);
  vec3 p = aCenter.xyz + vec3(k * aCenter.w, 0.0);
  gl_Position = vec4(p.x / uTan.x, p.y / uTan.y, 0.0, p.z);
  vUv = aCorner;
  vPos = p;
  vColor = aColor;
  vShape = aShape.x;
}
