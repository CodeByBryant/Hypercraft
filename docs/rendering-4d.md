# Rendering a 4D world through a 3D slice

This is the non-negotiable core of HYPERCRAFT (rule R1). This page explains the maths, what
the renderer guarantees, and how to check it.

## The camera

The camera is a 4D eye position `E` plus an orthonormal 4D basis `{right, up, fwd, hidden}`
(`src/math/frame.ts`). The player stays upright relative to the realm's gravity axis, so the
basis is built from an orthonormal frame `{F, R, H}` of the 3D horizontal space and a pitch
angle:

```
fwd = cos(pitch)·F + sin(pitch)·U      up = −sin(pitch)·F + cos(pitch)·U
right = R                              hidden = H
```

* Mouse X yaws (rotates F toward R), mouse Y pitches.
* Slice rotations mix the hidden axis with forward (`tiltFH`, keys F/V) or right (`tiltRH`,
  keys Z/X); Alt + mouse rotates the slice freely; C snaps back to the nearest axis-aligned
  orientation.
* Kata/ana (Q/E) moves along **−H/+H — the current hidden axis**, never a fixed world axis.

The frame is re-orthonormalised after every rotation and keeps a positive orientation
(`det[right, up, fwd, hidden] = +1`), checked in `tests/unit/math.test.ts`.

## Rays stay in the slice

Each pixel's ray is `d = normalize(fwd + x·tanX·right + y·tanY·up)`. It is a combination of
three basis vectors only, so `d · hidden = 0`: every ray lies in the 3D hyperplane through the
eye with normal `hidden`. The union of all rays is exactly that 3D slice of the 4D world; the
screen shows a perspective view of that 3D cross-section.

## Real facets, no resampling

Rays are marched through the 4D voxel grid with a 4D DDA (Amanatides–Woo in four
dimensions, made hierarchical for empty-space skipping). A hit is the exact point where the ray
crosses a 3D facet `x_a = const` of a tesseract. The visible polygon of a block is the facet ∩
hyperplane intersection, i.e. a face of the true 3D cross-section polytope of that tesseract.
Nothing is resampled into a 3D grid and nothing snaps to cubes.

What that looks like (verified in `tests/unit/math.test.ts` against `sliceBoxEdges`):

| Slice | Cross-section of a unit tesseract |
|---|---|
| Axis-aligned (`hidden = ±W`) | a unit cube; blocks read as Minecraft-style cubes |
| Single tilt, e.g. 30° XW | a box whose length along the tilted direction varies with the offset (up to `1/cos 30°`); neighbouring blocks show staggered boundaries |
| Compound tilt, e.g. 45° XW + 45° ZW | a prism over a triangle, quadrilateral, pentagon or hexagon (the plane ∩ cube cut of the XZW part), extruded along Y |

As the eye moves along the hidden axis the offset changes continuously, so the prisms morph
(triangle → hexagon → triangle) instead of popping.

Because the camera stays upright, `hidden` has no Y component, so every cross-section is a
prism along Y. Tilting the hidden axis into Y (a free 4D rotation) would give more general
skewed polyhedra; that is not exposed to players in Phase 1.

## Outlines that follow the true polytope

Block edges are drawn analytically in the shader (`edgeDistance`). For a hit on the facet with
normal axis `i`, the face polygon lives in the 2D plane `T = {v : v·hidden = 0, v_i = 0}`.
Coordinate `x_j` (`j ≠ i`) changes at rate

```
g_j = |P_T e_j| = sqrt(max(0, 1 − h_j² / (1 − h_i²)))
```

per unit of in-face distance, so the in-face distance to the polygon edge `x_j = b` is
`|x_j − b| / g_j`. `g_j = 0` means `x_j` is constant over the face and produces no edge; that
is why axis-aligned slices show squares and never an edge along the hidden axis. The formula
is unit-tested against the numerical projection. Sub-voxel shapes use their box bounds
instead of the cell, so a slab's outline is the true half-polytope.

The selection outline and the P-mode overlay go further: they compute the whole cross-section
polytope on the CPU (`sliceBoxEdges`: the hyperplane clipped against the 24 square faces of
the tesseract) and draw its edges as lines, with hidden edges dimmed via the ray depth buffer.

## Sub-voxel shapes

Blocks carry a shape id; the shape table holds up to seven 4D boxes per shape (slab, stairs,
ladder, torch, post), a "plant" shape (six diagonal 3D sheets through the cell centre, one
for each pair of horizontal axes) and a "fluid" shape (a box whose height comes from the fluid
level). Ray/box intersection is a 4D slab test; the hit facet, normal and outline come from
the box. Orientable shapes are authored facing +X and expanded into ±X/±Z/±W variants.

## Transparency

* **Translucent** blocks (glass, ice, portal) are composited front-to-back; internal faces
  between identical blocks are skipped, and at most 6 pass-throughs are allowed per ray.
* **Cutout** blocks (leaves, ladders, plants) alpha-test the texel at the entry facet, then at
  the inside of the exit facet.
* **Water** draws a surface (texture + Fresnel sky reflection) and then absorbs light with
  distance travelled through it; lava is an opaque emissive fluid.

## Lighting

Light is stored per voxel (sky nibble, block nibble) and propagated on the CPU with a 4D BFS
over the eight face neighbours (±X, ±Y, ±Z, ±W). Sky light at level 15 travels straight down
through clear blocks without decaying (the Minecraft rule); everything else loses
`1 + lightOpacity` per step. At a hit, the shader samples a 2×2×2 neighbourhood in the facet's
three in-plane axes on the lit side, weights it trilinearly by the hit position (smooth
lighting) and counts opaque samples as occluders (ambient occlusion). Faces also get a fixed
tone per facet axis (top 1.0, X 0.8, Z 0.7, W 0.62, bottom 0.5) so W facets read as a distinct
fourth kind of face in tilted views.

## Sky

Sun and moon are 4D directions. Their orbit plane is tilted slightly out of XY into Z and W,
so how visible they are depends on the slice. Each is drawn at its projection into the view
hyperplane and shrinks/fades as `|dir · hidden|` grows: a sun far out of the slice becomes a
faint glow. Stars are cells on the 3-sphere of 4D directions, so rotating the slice reveals a
different star field; each star is the slice of a 4D cell, which is why they look polygonal.
Clouds are a layer in the hyperplane `y = 196` textured by 3D noise over `(x, z, w)`, so they
change as you move kata/ana. Beyond the render distance the sky shows through, fading into
fog toward the horizon; distant terrain fades into the same colour.

## How to verify R1 yourself

1. Press **P**: faces are tinted by facet axis (red X, green Y, blue Z, magenta W) and every
   visible polygon edge is coloured by the axis that bounds it. W-tinted faces are W facets.
2. Hold **X** for a second to tilt the slice into the XW plane: blocks along the right axis
   split into boxes of varying width.
3. Hold **F** as well: grass tops become triangles, pentagons and hexagons.
4. Press **Q/E** while tilted: the polygons morph continuously.
5. `npx playwright test tests/e2e/views.spec.ts` renders the three R6 reference views into
   `test-results/r6/`.
