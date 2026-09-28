# How to add a block

No engine or renderer code changes are needed.

1. **Texture** – add a `TextureDef` to `src/content/textures.ts`, e.g.
   `{ name: 'basalt', pattern: 'noise', colors: ['#3b3b40', '#2c2c31'], amount: 0.1 }`.
   Textures are 16³ volumes; pick an existing pattern or add one to `textureGen.ts`.
2. **Block** – append a `BlockDef` to `src/content/blocks.ts`:
   `{ name: 'basalt', render: 'opaque', solid: true, textures: { all: 'basalt' }, hardness: 1.2 }`.
   For a non-cube block set `shape` (see `shapes.ts`); for a light source set `emission`; for
   glass-like blocks use `render: 'translucent'` with `tint`/`alpha`.
3. **Use it** – the generator can reference it by name (`REG.id('basalt')`), and it appears
   in the GPU block-info table automatically. Add it to `HOTBAR` in `src/game/Game.ts` to place
   it in creative mode.
4. Run `npm test`: the registry test fails loudly on typos (unknown texture/shape, duplicates).

New shapes: add a `ShapeDef` with up to seven 4D boxes to `src/content/shapes.ts`. The shader
and the CPU picker/physics read the same table.
