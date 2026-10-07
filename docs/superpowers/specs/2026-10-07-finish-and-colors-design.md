# Flap finish and colours — Design

**Date:** 2026-10-07
**Status:** Approved in brainstorming; awaiting written-spec review
**Package:** `@kinnet-studio/split-flap` (`/canvas`, `/pixi` and shared `src/render`)

## Summary

Two related rendering features:

1. **Finish** — a `finish: 'matte' | 'satin' | 'gloss'` style preset. Matte and satin lower the
   moving-flap shade and cast shadow and bake a subtle light falloff and paper-like grain into
   each painted face, so flaps read as printed card instead of glossy plastic. `gloss` (default)
   is today's look, unchanged.
2. **Colours** — `textFace` gains built-in themes (`classic`, `solari`, `airport`, `cream`),
   per-flap colours, and per-row colours. Per-row colours need painters to receive a context
   (`{ row, field }`) and renderers to keep one face cache per (field, row) for painters that
   declare they depend on the row.

## Runtime restyling (added later)

`CanvasFlapRenderer.setStyle(style)` / `setFace(face)` and `PixiFlapView.setStyle(style)` /
`setFace(face)` change the look of a running renderer. `setStyle` replaces the style (as the
constructor option does; spread the `style` / `flapStyle` getter to change one value) and
repaints; Pixi also rebuilds its unit sprites because the style shapes them. `setFace` validates
that a face map covers every field before replacing it, then repaints.

## Non-goals

- Finish effects on ready-made Pixi textures (`textureFace`), gradients/shadows on text, or
  per-unit colours other than by flap value or row.

## Finish

### API

```ts
interface FlapStyle {
    // existing: radius, hingeGap, hingeColor, shade, shadow, stack
    finish?: 'matte' | 'satin' | 'gloss'; // default 'gloss'
    grain?: number; // 0..1 speck opacity baked into faces
    light?: number; // 0..1 strength of the top-to-bottom light falloff
}

const FINISH_PRESETS: Record<Finish, { shade; shadow; grain; light }>;
```

| finish | shade | shadow | grain | light |
| --- | --- | --- | --- | --- |
| gloss (default) | 0.5 | 0.35 | 0 | 0 |
| satin | 0.3 | 0.2 | 0.03 | 0.06 |
| matte | 0.15 | 0.1 | 0.06 | 0.1 |

- `resolveStyle` starts from `DEFAULT_STYLE`, applies the preset for `finish`, then explicit
  `shade` / `shadow` / `grain` / `light` values override it. `ResolvedFlapStyle` gains `finish`,
  `grain`, `light`. `grain` and `light` outside 0..1 (or non-finite) throw `RangeError`; an
  unknown `finish` throws `RangeError`.
- `DEFAULT_STYLE` gains `finish: 'gloss', grain: 0, light: 0` — default rendering is unchanged.

### Baking into faces

`FaceCache` gains `grain` and `light` options (default 0). After the painter runs, still under
the radius clip and with `globalCompositeOperation = 'source-atop'` (so transparent corners stay
transparent), `finishFace(ctx, width, height, { grain, light, seed })` draws:

- **Light** (only if `light > 0`): one vertical linear gradient over the face —
  `rgba(255,255,255, light × 0.5)` at 0, transparent at 0.5, `rgba(0,0,0, light)` at 1.
- **Grain** (only if `grain > 0`): `round(width × height / 8)` 1×1 CSS-px specks at positions
  from a mulberry32 PRNG seeded with the FNV-1a hash of the flap key; each speck is
  `rgba(255,255,255, grain)` or `rgba(0,0,0, grain)` (coin flip from the same PRNG). The pattern
  is stable per flap and differs between flaps.

Both renderers pass `style.grain` / `style.light` into their face caches. Pixi `textureFace`
textures are untouched. `mulberry32` moves to `src/core/random.ts` so `src/render` and
`src/sound` share it (`src/sound/click.ts` imports it from there).

## Colours

### Themes

```ts
interface FlapTheme { color: string; background: string; hinge: string }
const FLAP_THEMES: Record<'classic' | 'solari' | 'airport' | 'cream', FlapTheme>;
```

| theme | color | background | hinge |
| --- | --- | --- | --- |
| classic | `#f4f1e8` | `#232326` | `rgba(0, 0, 0, 0.6)` |
| solari | `#f5b335` | `#2a2a2d` | `rgba(0, 0, 0, 0.6)` |
| airport | `#141414` | `#f5c400` | `rgba(0, 0, 0, 0.35)` |
| cream | `#24211c` | `#efe9dc` | `rgba(0, 0, 0, 0.25)` |

The hinge colour is a suggestion for `style.hingeColor`; `textFace` does not draw the hinge.

### textFace

```ts
interface FlapColors { color?: string; background?: string }

interface TextFaceOptions {
    font: string;
    theme?: ThemeName | { color: string; background: string }; // default 'classic'
    color?: string;       // overrides the theme
    background?: string;  // overrides the theme
    colors?: (flap: string) => FlapColors | undefined; // per flap
    rows?: (row: number) => FlapColors | undefined;    // per row; marks the painter perRow
}
```

Precedence for each of `color` and `background`, highest first: `colors(flap)` → `rows(row)` →
explicit option → theme → `classic`. `color` and `background` become optional, so existing calls
keep working.

### Painter context and per-row caching

```ts
interface FaceContext { row: number; field: string }
type FacePainter<T> = ((ctx: Ctx2D, flap: T, width: number, height: number,
                        context: FaceContext) => void) & { readonly perRow?: boolean };
```

- Existing four-argument painters stay valid (the fifth argument is ignored).
- `textFace` sets `perRow = true` when `rows` is given.
- `FaceCache` gains a `context` option (default `{ row: 0, field: '' }`) passed as the fifth
  painter argument.
- `CanvasFlapRenderer` and `PixiFlapView` key their face caches by field, or by field and row
  when the field's painter (Pixi: painter face) has `perRow`. For a perRow painter the context
  carries the slot's real row and field; otherwise faces are shared across rows and the context
  is `{ row: 0, field }`.
- A `FlapField` or `FlapUnit` target is row 0.

## Error handling

| Situation | Behaviour |
| --- | --- |
| Unknown `finish` | `RangeError` from `resolveStyle` |
| `grain` / `light` outside 0..1 or non-finite | `RangeError` from `resolveStyle` |
| Unknown theme name | `RangeError` from `textFace` |
| `colors` / `rows` returning `undefined` | falls through to the next source |

## Testing

- `resolveStyle`: each preset's values; explicit overrides; defaults unchanged (gloss); invalid
  `finish`, `grain`, `light`.
- `finishFace` / `FaceCache` (fake canvas): nothing extra drawn when grain and light are 0; light
  draws one gradient fill with the three stops; grain draws the expected speck count with
  source-atop, the same pattern for the same key and a different one for another key; drawn after
  the painter and inside the clip.
- `textFace`: theme colours; explicit override; per-flap; per-row; precedence order; `perRow`
  flag; unknown theme throws; receives and uses the context row.
- Canvas renderer: a perRow painter gets one cache per (field, row) with the real row in its
  context; a normal painter keeps one cache per field; grain/light from `finish` reach the faces.
- Pixi view: the same per-row caching and finish passthrough.
- `mulberry32` move: sound click tests still pass unchanged.
- Examples: Theme and Finish selectors (rebuilding the renderers), a red `DELAYED` destination,
  alternating row tints; verified in a headless browser.
