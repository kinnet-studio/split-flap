# Finish and Colours Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `finish` style preset (matte, satin, gloss) that bakes light falloff and grain into painted faces. Extend `textFace` with themes, per-flap colours and per-row colours. Per-row colours rely on a painter context and per-row face caches in both renderers.

**Architecture:**
- `src/core/random.ts` holds the shared PRNG.
- `src/render/style.ts` adds the finish presets.
- `src/render/finish.ts` bakes the finish into a face (`finishFace`), and `FaceCache` calls it after the painter, passing the painter a `context`.
- `src/render/faces.ts` adds themes, the `FaceContext` type and the `perRow` flag.
- The Canvas renderer and Pixi view key their face caches by field, or by field and row for `perRow` painters, and pass `grain` and `light` through.

**Tech Stack:** TypeScript 5.9 strict, Canvas 2D, Pixi v8, Vitest 5 (node environment, fake canvas), Bun 1.3.

**Spec:** `docs/superpowers/specs/2026-10-07-finish-and-colors-design.md`

## Global Constraints

- Work in `/Users/vincent.yy.chang/dev/split-flop/main` on branch `feat/finish-colors`. It is already checked out and holds the spec commit.
- Default rendering must not change: `finish` defaults to `'gloss'` (shade 0.5, shadow 0.35, grain 0, light 0), and `textFace` defaults to the `classic` theme, which has today's colours.
- Exact values are fixed by the spec:
  - The presets table.
  - The theme colours.
  - The light gradient stops `rgba(255, 255, 255, light × 0.5)` at 0, transparent at 0.5 and `rgba(0, 0, 0, light)` at 1.
  - The grain count `round(width × height / 8)`, drawn as 1×1 specks seeded by `fnv1a(key)`.
- Import boundaries: `src/core` imports nothing outside `src/core`; `src/render` and `src/sound` may import from `src/core`. No new dependencies.
- Relative imports in `src/` use `.js` extensions; test imports stay extensionless. Prettier settings as in the repo. Use Bun, and Vitest in the node environment.
- One conventional commit per task, ending with your harness's `Co-Authored-By:` line.

---

### Task 1: Shared PRNG

**Files:**
- Create: `src/core/random.ts`, `test/core/random.test.ts`
- Modify: `src/sound/click.ts`, which now imports and re-exports `mulberry32`

**Interfaces:**
- Produces: `mulberry32(seed): () => number` and `fnv1a(text): number`.

- [ ] **Write the failing test** at `test/core/random.test.ts`:
```ts
import { describe, expect, it } from 'vitest';

import { fnv1a, mulberry32 } from '../../src/core/random';

describe('mulberry32', () => {
    it('is deterministic per seed and stays in [0, 1)', () => {
        const a = mulberry32(42);
        const b = mulberry32(42);
        const values = Array.from({ length: 100 }, () => a());
        expect(values).toEqual(Array.from({ length: 100 }, () => b()));
        expect(values.every(v => v >= 0 && v < 1)).toBe(true);
        expect(mulberry32(43)()).not.toBe(values[0]);
    });
});

describe('fnv1a', () => {
    it('matches the reference 32-bit FNV-1a values', () => {
        expect(fnv1a('')).toBe(0x811c9dc5);
        expect(fnv1a('a')).toBe(0xe40c292c);
        expect(fnv1a('foobar')).toBe(0xbf9cf968);
    });
});
```
- [ ] **Run it and see it fail.** Run: `bunx vitest run test/core/random.test.ts`. Expected: FAIL, cannot resolve `../../src/core/random`.
- [ ] **Implement** `src/core/random.ts`:
```ts
/** Small seeded PRNG (mulberry32) returning numbers in [0, 1). */
export function mulberry32(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** 32-bit FNV-1a hash of a string, e.g. to seed {@link mulberry32}. */
export function fnv1a(text: string): number {
    let hash = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
}
```
- [ ] **Point `src/sound/click.ts` at it:**
```diff
--- a/src/sound/click.ts
+++ b/src/sound/click.ts
@@ -1,3 +1,7 @@
+import { mulberry32 } from '../core/random.js';
+
+export { mulberry32 };
+
 export interface SynthClickOptions {
     /** Hz of the tonal tick. Default 2200. */
     frequency?: number;
@@ -21,18 +25,6 @@ export const DEFAULT_SYNTH_CLICK: Required<SynthClickOptions> = {
 
 const DEFAULT_SEED = 0x5f1a95;
 
-/** Small seeded PRNG (mulberry32) returning numbers in [0, 1). */
-export function mulberry32(seed: number): () => number {
-    let state = seed >>> 0;
-    return () => {
-        state = (state + 0x6d2b79f5) >>> 0;
-        let t = state;
-        t = Math.imul(t ^ (t >>> 15), t | 1);
-        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
-        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
-    };
-}
-
 /** Fills in defaults and validates synth options. */
 export function resolveSynthClick(
     options: SynthClickOptions = {}
```
- [ ] **Verify.** Run: `bunx vitest run test/core/random.test.ts test/sound && bun run typecheck`. Expected: all pass (the sound click tests are unchanged).
- [ ] **Commit.** Run `bunx prettier --write` on the touched files, then `git add -A && git commit` with the message `refactor(core): share the seeded PRNG and add fnv1a` followed by your attribution trailer.

---

### Task 2: Themes, colours and painter context

**Files:**
- Modify (full replacement): `src/render/faces.ts`
- Test: `test/render/text-face-colors.test.ts`

**Interfaces:**
- Produces:
  - `FaceContext { row, field }`
  - `FacePainter<T>`, with an optional fifth argument `context?` and the property `perRow?: boolean`
  - `FLAP_THEMES`, `ThemeName`, `FlapTheme` and `FlapColors`
  - `TextFaceOptions`, with `theme`, `color`, `background`, `colors` and `rows`, where `color` and `background` are now optional

- [ ] **Write the failing test** at `test/render/text-face-colors.test.ts`:
```ts
import { describe, expect, it } from 'vitest';

import { FLAP_THEMES, textFace } from '../../src/render/faces';
import { asCtx, FakeContext } from '../helpers/fake-canvas';

const font = '20px sans-serif';

/** Paints `flap` and returns [background, text colour]. */
function paint(
    painter: ReturnType<typeof textFace>,
    flap = 'A',
    row = 0
): [unknown, unknown] {
    const ctx = new FakeContext();
    painter(asCtx(ctx), flap, 40, 60, { row, field: 'dest' });
    return [
        ctx.callsNamed('fillRect')[0].fillStyle,
        ctx.callsNamed('fillText')[0].fillStyle,
    ];
}

describe('textFace colours', () => {
    it('defaults to the classic theme', () => {
        expect(paint(textFace({ font }))).toEqual([
            FLAP_THEMES.classic.background,
            FLAP_THEMES.classic.color,
        ]);
    });

    it('uses named and custom themes', () => {
        expect(paint(textFace({ font, theme: 'airport' }))).toEqual([
            '#f5c400',
            '#141414',
        ]);
        expect(
            paint(
                textFace({ font, theme: { color: '#fff', background: '#00f' } })
            )
        ).toEqual(['#00f', '#fff']);
    });

    it('lets explicit colours override the theme', () => {
        expect(
            paint(textFace({ font, theme: 'cream', color: '#c00' }))
        ).toEqual([FLAP_THEMES.cream.background, '#c00']);
    });

    it('colours individual flaps', () => {
        const painter = textFace({
            font,
            colors: flap =>
                flap === 'DELAYED' ? { color: '#ff5a4f' } : undefined,
        });
        expect(paint(painter, 'DELAYED')[1]).toBe('#ff5a4f');
        expect(paint(painter, 'TOKYO')[1]).toBe(FLAP_THEMES.classic.color);
    });

    it('colours rows and marks the painter perRow', () => {
        const painter = textFace({
            font,
            rows: row => (row % 2 ? { background: '#2b2b30' } : undefined),
        });
        expect(painter.perRow).toBe(true);
        expect(paint(painter, 'A', 1)[0]).toBe('#2b2b30');
        expect(paint(painter, 'A', 2)[0]).toBe(FLAP_THEMES.classic.background);
        expect(textFace({ font }).perRow).toBeUndefined();
    });

    it('ranks flap over row over explicit over theme', () => {
        const painter = textFace({
            font,
            theme: 'solari',
            background: '#111',
            rows: () => ({ background: '#222', color: '#333' }),
            colors: flap => (flap === 'X' ? { color: '#444' } : undefined),
        });
        expect(paint(painter, 'X')).toEqual(['#222', '#444']);
        expect(paint(painter, 'Y')).toEqual(['#222', '#333']);
    });

    it('rejects unknown theme names', () => {
        expect(() =>
            textFace({ font, theme: 'neon' as unknown as 'classic' })
        ).toThrow(RangeError);
    });
});
```
- [ ] **Run it and see it fail.** Run: `bunx vitest run test/render/text-face-colors.test.ts`. Expected: FAIL, because `FLAP_THEMES` is not exported.
- [ ] **Replace `src/render/faces.ts`** with:
```ts
export type Ctx2D =
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D;

/** Where a face is used: its board row (0 for fields and units) and field. */
export interface FaceContext {
    row: number;
    field: string;
}

/**
 * Draws one full flap face in CSS px. Used by both renderers. A painter whose
 * output depends on `context.row` sets `perRow`, so renderers cache its faces
 * per row; other painters receive `row: 0`.
 */
export type FacePainter<T> = ((
    ctx: Ctx2D,
    flap: T,
    width: number,
    height: number,
    context?: FaceContext
) => void) & { readonly perRow?: boolean };

export interface FlapTheme {
    color: string;
    background: string;
    /** Suggested `style.hingeColor`; textFace does not draw the hinge. */
    hinge: string;
}

export type ThemeName = 'classic' | 'solari' | 'airport' | 'cream';

export const FLAP_THEMES: Readonly<Record<ThemeName, FlapTheme>> = {
    classic: {
        color: '#f4f1e8',
        background: '#232326',
        hinge: 'rgba(0, 0, 0, 0.6)',
    },
    solari: {
        color: '#f5b335',
        background: '#2a2a2d',
        hinge: 'rgba(0, 0, 0, 0.6)',
    },
    airport: {
        color: '#141414',
        background: '#f5c400',
        hinge: 'rgba(0, 0, 0, 0.35)',
    },
    cream: {
        color: '#24211c',
        background: '#efe9dc',
        hinge: 'rgba(0, 0, 0, 0.25)',
    },
};

export interface FlapColors {
    color?: string;
    background?: string;
}

export interface TextFaceOptions {
    /** CSS font shorthand, e.g. `'600 26px ui-monospace, monospace'`. */
    font: string;
    /** Base colours: a theme name or `{ color, background }`. Default `'classic'`. */
    theme?: ThemeName | { color: string; background: string };
    /** Text colour; overrides the theme. */
    color?: string;
    /** Background colour; overrides the theme. */
    background?: string;
    /** Per-flap colours, e.g. a red `DELAYED`. Highest precedence. */
    colors?: (flap: string) => FlapColors | undefined;
    /** Per-row colours, e.g. alternating tints. Makes the painter `perRow`. */
    rows?: (row: number) => FlapColors | undefined;
}

/**
 * Fills the background and draws the flap text centred on the hinge.
 * Colour precedence: `colors(flap)`, `rows(row)`, `color`/`background`,
 * `theme`, then the classic theme.
 */
export function textFace(options: TextFaceOptions): FacePainter<string> {
    const theme = resolveTheme(options.theme);
    const baseColor = options.color ?? theme.color;
    const baseBackground = options.background ?? theme.background;
    const { colors, rows } = options;
    const painter = (
        ctx: Ctx2D,
        flap: string,
        width: number,
        height: number,
        context?: FaceContext
    ): void => {
        const byFlap = colors?.(flap);
        const byRow = rows && context ? rows(context.row) : undefined;
        ctx.fillStyle =
            byFlap?.background ?? byRow?.background ?? baseBackground;
        ctx.fillRect(0, 0, width, height);
        ctx.fillStyle = byFlap?.color ?? byRow?.color ?? baseColor;
        ctx.font = options.font;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(flap, width / 2, height / 2);
    };
    return rows ? Object.assign(painter, { perRow: true }) : painter;
}

function resolveTheme(theme: TextFaceOptions['theme']): {
    color: string;
    background: string;
} {
    if (theme === undefined) {
        return FLAP_THEMES.classic;
    }
    if (typeof theme !== 'string') {
        return theme;
    }
    if (!Object.hasOwn(FLAP_THEMES, theme)) {
        throw new RangeError(`textFace: unknown theme "${theme}"`);
    }
    return FLAP_THEMES[theme];
}

/** Fills the face with the flap, which is a CSS colour. */
export function colorFace(): FacePainter<string> {
    return (ctx, flap, width, height) => {
        ctx.fillStyle = flap;
        ctx.fillRect(0, 0, width, height);
    };
}
```
- [ ] **Verify.** Run: `bunx vitest run test/render && bun run typecheck`. Expected: all pass. The existing `faces.test.ts` still passes, since `color` and `background` stay supported.
- [ ] **Commit.** Run `bunx prettier --write` on the touched files, then `git add -A && git commit` with the message `feat(render): add textFace themes, per-flap and per-row colours` followed by your attribution trailer.

---

### Task 3: Finish presets and face finishing

**Files:**
- Create: `src/render/finish.ts`, `test/render/finish.test.ts`
- Modify: `src/render/style.ts`, `src/render/face-cache.ts`, `test/helpers/fake-canvas.ts` (a gradient fake), `test/render/style.test.ts` and `test/render/face-cache.test.ts` (updated expectations)

**Interfaces:**
- Consumes:
  - `fnv1a` and `mulberry32` (Task 1)
  - `FaceContext` and `FacePainter` (Task 2)
- Produces:
  - from the style: `Finish`, `FinishValues` and `FINISH_PRESETS`; the `finish`, `grain` and `light` fields on `FlapStyle` and `ResolvedFlapStyle`; and `resolveStyle` applying the presets
  - `finishFace(ctx, width, height, { grain, light }, key)` and `FaceFinish`
  - three new `FaceCache` options: `grain`, `light` and `context`

- [ ] **Add the gradient fake** to `test/helpers/fake-canvas.ts`:
```diff
--- a/test/helpers/fake-canvas.ts
+++ b/test/helpers/fake-canvas.ts
@@ -10,6 +10,17 @@ export interface RecordedCall {
     composite: string;
 }
 
+/** A recorded linear gradient: its geometry and colour stops. */
+export class FakeGradient {
+    readonly stops: [number, string][] = [];
+
+    constructor(readonly args: number[]) {}
+
+    addColorStop(offset: number, color: string): void {
+        this.stops.push([offset, color]);
+    }
+}
+
 /** Records 2D context calls; implements only what this package uses. */
 export class FakeContext {
     readonly calls: RecordedCall[] = [];
@@ -69,6 +80,11 @@ export class FakeContext {
         this.record('drawImage', args);
     }
 
+    createLinearGradient(...args: number[]): FakeGradient {
+        this.record('createLinearGradient', args);
+        return new FakeGradient(args);
+    }
+
     callsNamed(name: string): RecordedCall[] {
         return this.calls.filter(call => call.name === name);
     }
```
- [ ] **Write the failing tests.** Create `test/render/finish.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest';

import { FaceCache } from '../../src/render/face-cache';
import type { FacePainter } from '../../src/render/faces';
import { finishFace } from '../../src/render/finish';
import { FINISH_PRESETS, resolveStyle } from '../../src/render/style';
import {
    asCtx,
    FakeContext,
    type FakeCanvas,
    fakeCanvasFactory,
    type FakeGradient,
} from '../helpers/fake-canvas';

describe('finish presets', () => {
    it('defaults to gloss: the original look', () => {
        const style = resolveStyle();
        expect(style).toMatchObject({
            finish: 'gloss',
            shade: 0.5,
            shadow: 0.35,
            grain: 0,
            light: 0,
        });
    });

    it('applies each preset', () => {
        for (const finish of ['matte', 'satin', 'gloss'] as const) {
            expect(resolveStyle({ finish })).toMatchObject({
                finish,
                ...FINISH_PRESETS[finish],
            });
        }
        expect(FINISH_PRESETS.matte).toEqual({
            shade: 0.15,
            shadow: 0.1,
            grain: 0.06,
            light: 0.1,
        });
    });

    it('lets explicit values override the preset', () => {
        expect(
            resolveStyle({ finish: 'matte', shade: 0.25, grain: undefined })
        ).toMatchObject({ shade: 0.25, shadow: 0.1, grain: 0.06 });
    });

    it('is stable when a resolved style is resolved again', () => {
        const matte = resolveStyle({ finish: 'matte', shadow: 0.2 });
        expect(resolveStyle(matte)).toEqual(matte);
    });

    it('rejects unknown finishes and out-of-range grain or light', () => {
        expect(() =>
            resolveStyle({ finish: 'shiny' as unknown as 'matte' })
        ).toThrow(RangeError);
        for (const bad of [-0.1, 1.5, NaN]) {
            expect(() => resolveStyle({ grain: bad })).toThrow(RangeError);
            expect(() => resolveStyle({ light: bad })).toThrow(RangeError);
        }
    });
});

function fills(ctx: FakeContext) {
    return ctx.callsNamed('fillRect');
}

describe('finishFace', () => {
    it('draws nothing when grain and light are 0', () => {
        const ctx = new FakeContext();
        finishFace(asCtx(ctx), 40, 60, { grain: 0, light: 0 }, 'A');
        expect(ctx.calls).toHaveLength(0);
    });

    it('draws one light gradient over the face, source-atop', () => {
        const ctx = new FakeContext();
        finishFace(asCtx(ctx), 40, 60, { grain: 0, light: 0.1 }, 'A');
        expect(ctx.callsNamed('createLinearGradient')[0].args).toEqual([
            0, 0, 0, 60,
        ]);
        const [fill] = fills(ctx);
        expect(fill.args).toEqual([0, 0, 40, 60]);
        expect(fill.composite).toBe('source-atop');
        expect((fill.fillStyle as FakeGradient).stops).toEqual([
            [0, 'rgba(255, 255, 255, 0.05)'],
            [0.5, 'rgba(255, 255, 255, 0)'],
            [1, 'rgba(0, 0, 0, 0.1)'],
        ]);
        expect(ctx.globalCompositeOperation).toBe('source-over');
    });

    it('draws seeded grain specks that differ between flaps', () => {
        const draw = (key: string) => {
            const ctx = new FakeContext();
            finishFace(asCtx(ctx), 40, 60, { grain: 0.06, light: 0 }, key);
            return fills(ctx);
        };
        const a = draw('A');
        expect(a).toHaveLength(300); // 40 × 60 / 8
        expect(a.every(call => call.composite === 'source-atop')).toBe(true);
        expect(
            a.every(call =>
                ['rgba(255, 255, 255, 0.06)', 'rgba(0, 0, 0, 0.06)'].includes(
                    String(call.fillStyle)
                )
            )
        ).toBe(true);
        expect(draw('A').map(call => call.args)).toEqual(
            a.map(call => call.args)
        );
        expect(draw('B').map(call => call.args)).not.toEqual(
            a.map(call => call.args)
        );
    });
});

describe('FaceCache finish and context', () => {
    it('passes the context to the painter', () => {
        const painter = vi.fn<FacePainter<string>>();
        const cache = new FaceCache<string>({
            key: flap => flap,
            painter,
            width: 40,
            height: 60,
            createCanvas: fakeCanvasFactory,
            context: { row: 3, field: 'dest' },
        });
        cache.get('A');
        expect(painter.mock.calls[0][4]).toEqual({ row: 3, field: 'dest' });
    });

    it('bakes the finish in after the painter, inside the clip', () => {
        const cache = new FaceCache<string>({
            key: flap => flap,
            painter: (ctx, _flap, width, height) => {
                ctx.fillStyle = '#123';
                ctx.fillRect(0, 0, width, height);
            },
            width: 40,
            height: 60,
            radius: 4,
            grain: 0.06,
            light: 0.1,
            createCanvas: fakeCanvasFactory,
        });
        const face = cache.get('A') as unknown as FakeCanvas;
        const names = face.context.calls.map(call => call.name);
        expect(names.indexOf('clip')).toBeLessThan(names.indexOf('fillRect'));
        const fillCalls = face.context.callsNamed('fillRect');
        expect(fillCalls[0].fillStyle).toBe('#123');
        // painter fill + light gradient fill + 300 grain specks
        expect(fillCalls).toHaveLength(302);
    });
});
```
Then update the two existing expectations whose interface changes. `DEFAULT_STYLE` gains `finish`, `grain` and `light`, and the painter now receives the context as a fifth argument.

`test/render/style.test.ts`:
```diff
--- a/test/render/style.test.ts
+++ b/test/render/style.test.ts
@@ -11,6 +11,9 @@ describe('resolveStyle', () => {
             hingeColor: 'rgba(0, 0, 0, 0.6)',
             shade: 0.5,
             shadow: 0.35,
+            finish: 'gloss',
+            grain: 0,
+            light: 0,
             stack: null,
         });
     });
```
`test/render/face-cache.test.ts`:
```diff
--- a/test/render/face-cache.test.ts
+++ b/test/render/face-cache.test.ts
@@ -35,7 +35,10 @@ describe('FaceCache', () => {
         expect(face.context.callsNamed('setTransform')[0].args).toEqual([
             2, 0, 0, 2, 0, 0,
         ]);
-        expect(painter).toHaveBeenCalledWith(face.context, 'A', 40, 60);
+        expect(painter).toHaveBeenCalledWith(face.context, 'A', 40, 60, {
+            row: 0,
+            field: '',
+        });
     });
 
     it('clips to a rounded rect when radius > 0', () => {
```
- [ ] **Run them and see them fail.** Run: `bunx vitest run test/render`. Expected: FAIL, cannot resolve `../../src/render/finish`.
- [ ] **Implement** `src/render/finish.ts`:
```ts
import { fnv1a, mulberry32 } from '../core/random.js';
import type { Ctx2D } from './faces.js';

export interface FaceFinish {
    /** 0..1 opacity of the specks. */
    grain: number;
    /** 0..1 strength of the top-to-bottom light falloff. */
    light: number;
}

/**
 * Bakes the matte finish into a painted face: a soft light falloff and a
 * grain of light/dark specks seeded by `key`, drawn `source-atop` so only
 * the face's own pixels change. Draws nothing when both are 0.
 */
export function finishFace(
    ctx: Ctx2D,
    width: number,
    height: number,
    finish: FaceFinish,
    key: string
): void {
    if (finish.light <= 0 && finish.grain <= 0) {
        return;
    }
    ctx.save();
    ctx.globalCompositeOperation = 'source-atop';
    if (finish.light > 0) {
        const gradient = ctx.createLinearGradient(0, 0, 0, height);
        gradient.addColorStop(0, `rgba(255, 255, 255, ${finish.light * 0.5})`);
        gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0)');
        gradient.addColorStop(1, `rgba(0, 0, 0, ${finish.light})`);
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);
    }
    if (finish.grain > 0) {
        const random = mulberry32(fnv1a(key));
        const lightSpeck = `rgba(255, 255, 255, ${finish.grain})`;
        const darkSpeck = `rgba(0, 0, 0, ${finish.grain})`;
        const specks = Math.round((width * height) / 8);
        for (let i = 0; i < specks; i++) {
            const x = random() * width;
            const y = random() * height;
            ctx.fillStyle = random() < 0.5 ? lightSpeck : darkSpeck;
            ctx.fillRect(x, y, 1, 1);
        }
    }
    ctx.restore();
}
```
- [ ] **Add the presets** to `src/render/style.ts`:
```diff
--- a/src/render/style.ts
+++ b/src/render/style.ts
@@ -8,6 +8,22 @@ export interface FlapStack {
     shade?: number;
 }
 
+/** Surface finish: `gloss` is the original look; `matte` reads as printed card. */
+export type Finish = 'matte' | 'satin' | 'gloss';
+
+export interface FinishValues {
+    shade: number;
+    shadow: number;
+    grain: number;
+    light: number;
+}
+
+export const FINISH_PRESETS: Readonly<Record<Finish, FinishValues>> = {
+    gloss: { shade: 0.5, shadow: 0.35, grain: 0, light: 0 },
+    satin: { shade: 0.3, shadow: 0.2, grain: 0.03, light: 0.06 },
+    matte: { shade: 0.15, shadow: 0.1, grain: 0.06, light: 0.1 },
+};
+
 export interface FlapStyle {
     /** Corner radius in px, baked into cached faces. */
     radius?: number;
@@ -18,6 +34,15 @@ export interface FlapStyle {
     shade?: number;
     /** 0..1 maximum opacity of the shadow cast by the moving flap. */
     shadow?: number;
+    /**
+     * Preset for `shade`, `shadow`, `grain` and `light`; explicit values
+     * override it. Default `'gloss'` (the original look).
+     */
+    finish?: Finish;
+    /** 0..1 opacity of the paper-like grain baked into painted faces. */
+    grain?: number;
+    /** 0..1 strength of the top-to-bottom light falloff on painted faces. */
+    light?: number;
     /**
      * Covered flaps under the bottom half. Takes `count × step` px from the
      * bottom of the cell; the face shrinks to fit. Off by default (or `null`).
@@ -39,16 +64,36 @@ export const DEFAULT_STYLE: ResolvedFlapStyle = {
     hingeColor: 'rgba(0, 0, 0, 0.6)',
     shade: 0.5,
     shadow: 0.35,
+    finish: 'gloss',
+    grain: 0,
+    light: 0,
     stack: null,
 };
 
 export function resolveStyle(style: FlapStyle = {}): ResolvedFlapStyle {
-    const { stack, ...rest } = style;
-    return {
+    const { stack, finish = DEFAULT_STYLE.finish, ...rest } = style;
+    if (!Object.hasOwn(FINISH_PRESETS, finish)) {
+        throw new RangeError(`FlapStyle: unknown finish "${finish}"`);
+    }
+    const explicit = Object.fromEntries(
+        Object.entries(rest).filter(([, value]) => value !== undefined)
+    );
+    const resolved: ResolvedFlapStyle = {
         ...DEFAULT_STYLE,
-        ...rest,
+        ...FINISH_PRESETS[finish],
+        ...explicit,
+        finish,
         stack: stack ? resolveStack(stack) : null,
     };
+    for (const name of ['grain', 'light'] as const) {
+        const value = resolved[name];
+        if (!(value >= 0 && value <= 1)) {
+            throw new RangeError(
+                `FlapStyle: ${name} must be between 0 and 1, got ${value}`
+            );
+        }
+    }
+    return resolved;
 }
 
 function resolveStack(stack: FlapStack): ResolvedFlapStack {
```
- [ ] **Bake the finish and pass the context** in `src/render/face-cache.ts`:
```diff
--- a/src/render/face-cache.ts
+++ b/src/render/face-cache.ts
@@ -1,4 +1,5 @@
-import type { Ctx2D, FacePainter } from './faces.js';
+import type { Ctx2D, FaceContext, FacePainter } from './faces.js';
+import { finishFace } from './finish.js';
 
 /** The parts of HTMLCanvasElement / OffscreenCanvas the cache needs. */
 export interface FaceCanvas {
@@ -30,6 +31,12 @@ export interface FaceCacheOptions<T> {
     /** Corner radius in CSS px. Default 0. */
     radius?: number;
     createCanvas?: CanvasFactory;
+    /** 0..1 grain baked into each face. Default 0. */
+    grain?: number;
+    /** 0..1 light falloff baked into each face. Default 0. */
+    light?: number;
+    /** Passed to the painter. Default `{ row: 0, field: '' }`. */
+    context?: FaceContext;
 }
 
 /** Paints each flap face once into an offscreen canvas and reuses it. */
@@ -39,6 +46,9 @@ export class FaceCache<T> {
     private readonly painter: FacePainter<T>;
     private readonly radius: number;
     private readonly createCanvas: CanvasFactory;
+    private readonly grain: number;
+    private readonly light: number;
+    private readonly context: FaceContext;
     private width: number;
     private height: number;
     private dpr: number;
@@ -51,6 +61,9 @@ export class FaceCache<T> {
         this.dpr = options.dpr ?? 1;
         this.radius = options.radius ?? 0;
         this.createCanvas = options.createCanvas ?? defaultCanvasFactory;
+        this.grain = options.grain ?? 0;
+        this.light = options.light ?? 0;
+        this.context = options.context ?? { row: 0, field: '' };
     }
 
     get size(): number {
@@ -63,7 +76,7 @@ export class FaceCache<T> {
         if (cached) {
             return cached;
         }
-        const face = this.paint(flap);
+        const face = this.paint(flap, key);
         this.faces.set(key, face);
         return face;
     }
@@ -79,7 +92,7 @@ export class FaceCache<T> {
         this.faces.clear();
     }
 
-    private paint(flap: T): FaceCanvas {
+    private paint(flap: T, key: string): FaceCanvas {
         const canvas = this.createCanvas(
             Math.max(1, Math.round(this.width * this.dpr)),
             Math.max(1, Math.round(this.height * this.dpr))
@@ -94,7 +107,14 @@ export class FaceCache<T> {
             ctx.roundRect(0, 0, this.width, this.height, this.radius);
             ctx.clip();
         }
-        this.painter(ctx, flap, this.width, this.height);
+        this.painter(ctx, flap, this.width, this.height, this.context);
+        finishFace(
+            ctx,
+            this.width,
+            this.height,
+            { grain: this.grain, light: this.light },
+            key
+        );
         return canvas;
     }
 }
```
- [ ] **Verify.** Run: `bunx vitest run test/render test/canvas test/pixi && bun run typecheck`. Expected: all pass.
- [ ] **Commit.** Run `bunx prettier --write` on the touched files, then `git add -A && git commit` with the message `feat(render): add matte, satin and gloss finishes` followed by your attribution trailer.

---

### Task 4: Per-row caches and finish in both renderers

**Files:**
- Modify: `src/canvas/renderer.ts`, `src/pixi/textures.ts`, `src/pixi/view.ts`
- Test: `test/canvas/renderer-colors.test.ts`, `test/pixi/view-colors.test.ts`

**Interfaces:**
- Consumes:
  - `FacePainter.perRow` and `FaceContext` (Task 2)
  - `style.grain` and `style.light`, plus the `FaceCache` options `grain`, `light` and `context` (Task 3)
- Produces:
  - cache keys of `field`, or `field + '\u0000' + row` for `perRow` painters
  - three new `FaceTexturesOptions` fields: `grain`, `light` and `context`

- [ ] **Write the failing tests.** Create `test/canvas/renderer-colors.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest';

import {
    CanvasFlapRenderer,
    type CanvasFlapRendererOptions,
} from '../../src/canvas/renderer';
import { FlapBoard } from '../../src/core/board';
import { textField } from '../../src/core/field';
import { CHARSETS, FlapSequence } from '../../src/core/sequence';
import { textFace } from '../../src/render/faces';
import {
    asCanvasElement,
    FakeCanvas,
    fakeCanvasFactory,
} from '../helpers/fake-canvas';

const alnum = FlapSequence.chars(CHARSETS.alphanumeric);
const font = '20px sans-serif';

/** A 2-row, 1-unit board; every unit starts on the blank flap. */
function setup(extra: Partial<CanvasFlapRendererOptions> = {}) {
    const createCanvas = vi.fn(fakeCanvasFactory);
    new CanvasFlapRenderer({
        canvas: asCanvasElement(new FakeCanvas()),
        target: new FlapBoard({
            rows: 2,
            schema: { text: textField({ sequence: alnum, length: 1 }) },
        }),
        face: textFace({ font }),
        cell: { w: 40, h: 60 },
        dpr: 1,
        createCanvas,
        scheduler: { request: () => 0, cancel: () => {} },
        ...extra,
    });
    return { createCanvas };
}

const faceCanvases = (createCanvas: ReturnType<typeof setup>['createCanvas']) =>
    createCanvas.mock.results.map(result => result.value as FakeCanvas);

describe('CanvasFlapRenderer colours and finish', () => {
    it('shares faces across rows for ordinary painters', () => {
        const { createCanvas } = setup();
        expect(createCanvas).toHaveBeenCalledTimes(1);
    });

    it('paints perRow faces once per row, with the real row', () => {
        const rows = vi.fn(() => undefined);
        const { createCanvas } = setup({ face: textFace({ font, rows }) });
        expect(createCanvas).toHaveBeenCalledTimes(2);
        expect(rows.mock.calls).toEqual([[0], [1]]);
    });

    it('bakes the finish into painted faces', () => {
        const { createCanvas } = setup({ style: { finish: 'matte' } });
        const [face] = faceCanvases(createCanvas);
        expect(face.context.callsNamed('createLinearGradient')).toHaveLength(1);
        // background + gradient + 300 grain specks (40 × 60 / 8)
        expect(face.context.callsNamed('fillRect')).toHaveLength(302);
    });

    it('adds nothing with the default gloss finish', () => {
        const { createCanvas } = setup();
        const [face] = faceCanvases(createCanvas);
        expect(face.context.callsNamed('createLinearGradient')).toHaveLength(0);
        expect(face.context.callsNamed('fillRect')).toHaveLength(1);
    });
});
```
Then create `test/pixi/view-colors.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest';

import { FlapBoard } from '../../src/core/board';
import { textField } from '../../src/core/field';
import { FlapSequence } from '../../src/core/sequence';
import { PixiFlapView, type PixiFlapViewOptions } from '../../src/pixi';
import { textFace } from '../../src/render/faces';
import { type FakeCanvas, fakeCanvasFactory } from '../helpers/fake-canvas';

const seq = FlapSequence.chars('-AB');
const font = '20px sans-serif';

function setup(extra: Partial<PixiFlapViewOptions> = {}) {
    const createCanvas = vi.fn(fakeCanvasFactory);
    new PixiFlapView({
        target: new FlapBoard({
            rows: 2,
            schema: { text: textField({ sequence: seq, length: 1 }) },
        }),
        face: textFace({ font }),
        cell: { w: 40, h: 60 },
        resolution: 1,
        createCanvas,
        ...extra,
    });
    return { createCanvas };
}

describe('PixiFlapView colours and finish', () => {
    it('shares faces across rows for ordinary painters', () => {
        expect(setup().createCanvas).toHaveBeenCalledTimes(1);
    });

    it('paints perRow faces once per row, with the real row', () => {
        const rows = vi.fn(() => undefined);
        const { createCanvas } = setup({ face: textFace({ font, rows }) });
        expect(createCanvas).toHaveBeenCalledTimes(2);
        expect(rows.mock.calls).toEqual([[0], [1]]);
    });

    it('bakes the finish into painted faces', () => {
        const { createCanvas } = setup({ style: { finish: 'satin' } });
        const face = createCanvas.mock.results[0].value as FakeCanvas;
        expect(face.context.callsNamed('createLinearGradient')).toHaveLength(1);
        expect(face.context.callsNamed('fillRect')).toHaveLength(302);
    });
});
```
- [ ] **Run them and see them fail.** Run: `bunx vitest run test/canvas/renderer-colors.test.ts test/pixi/view-colors.test.ts`. Expected: FAIL. The `perRow` and finish cases fail because only one face canvas is created and no finish is drawn.
- [ ] **Canvas renderer** (`src/canvas/renderer.ts`):
```diff
--- a/src/canvas/renderer.ts
+++ b/src/canvas/renderer.ts
@@ -226,21 +226,32 @@ export class CanvasFlapRenderer {
     }
 
     private facesFor(slot: UnitSlot): FaceCache<any> {
-        const cached = this.caches.get(slot.field);
+        const painter = this.painterFor(slot.field);
+        // A perRow painter's faces differ by row, so they get a cache per row.
+        const cacheKey = painter.perRow
+            ? `${slot.field}\u0000${slot.row}`
+            : slot.field;
+        const cached = this.caches.get(cacheKey);
         if (cached) {
             return cached;
         }
         const cache = new FaceCache<any>({
             key: flap => slot.sequence.key(flap),
-            painter: this.painterFor(slot.field),
+            painter,
             width: slot.rect.w,
             // Faces fill the cell minus the covered-flap stack.
             height: slot.rect.h - stackDepth(this.style),
             dpr: this.dpr * this.zoom,
             radius: this.style.radius,
             createCanvas: this.options.createCanvas,
+            grain: this.style.grain,
+            light: this.style.light,
+            context: {
+                row: painter.perRow ? slot.row : 0,
+                field: slot.field,
+            },
         });
-        this.caches.set(slot.field, cache);
+        this.caches.set(cacheKey, cache);
         return cache;
     }
 
```
- [ ] **Pixi textures** (`src/pixi/textures.ts`):
```diff
--- a/src/pixi/textures.ts
+++ b/src/pixi/textures.ts
@@ -1,7 +1,7 @@
 import { CanvasSource, type ICanvas, Rectangle, Texture } from 'pixi.js';
 
 import { type CanvasFactory, FaceCache } from '../render/face-cache.js';
-import type { FacePainter } from '../render/faces.js';
+import type { FaceContext, FacePainter } from '../render/faces.js';
 
 /** A face backed by ready-made Pixi textures instead of a painter. */
 export interface TextureFace<T> {
@@ -38,6 +38,12 @@ export interface FaceTexturesOptions {
     /** Corner radius baked into painted faces. */
     radius: number;
     createCanvas?: CanvasFactory;
+    /** 0..1 grain baked into painted faces. Default 0. */
+    grain?: number;
+    /** 0..1 light falloff baked into painted faces. Default 0. */
+    light?: number;
+    /** Passed to the painter. */
+    context?: FaceContext;
 }
 
 type Source<T> =
@@ -71,6 +77,9 @@ export class FaceTextures<T> {
                       dpr: options.resolution,
                       radius: options.radius,
                       createCanvas: options.createCanvas,
+                      grain: options.grain,
+                      light: options.light,
+                      context: options.context,
                   }),
               };
     }
```
- [ ] **Pixi view** (`src/pixi/view.ts`):
```diff
--- a/src/pixi/view.ts
+++ b/src/pixi/view.ts
@@ -170,13 +170,17 @@ export class PixiFlapView extends Container {
     }
 
     private texturesFor(slot: UnitSlot): FaceTextures<any> {
-        const cached = this.faceTextures.get(slot.field);
+        const face = this.faceFor(slot.field);
+        // A perRow painter's faces differ by row, so they get textures per row.
+        const perRow = !isTextureFace(face) && face.perRow === true;
+        const cacheKey = perRow ? `${slot.field}\u0000${slot.row}` : slot.field;
+        const cached = this.faceTextures.get(cacheKey);
         if (cached) {
             return cached;
         }
         const textures = new FaceTextures<any>(
             flap => slot.sequence.key(flap),
-            this.faceFor(slot.field),
+            face,
             {
                 width: slot.rect.w,
                 // Faces fill the cell minus the covered-flap stack.
@@ -187,9 +191,12 @@ export class PixiFlapView extends Container {
                         1) * this.zoom,
                 radius: this.flapStyle.radius,
                 createCanvas: this.viewOptions.createCanvas,
+                grain: this.flapStyle.grain,
+                light: this.flapStyle.light,
+                context: { row: perRow ? slot.row : 0, field: slot.field },
             }
         );
-        this.faceTextures.set(slot.field, textures);
+        this.faceTextures.set(cacheKey, textures);
         return textures;
     }
 
```
- [ ] **Verify.** Run: `bun run test && bun run typecheck`. Expected: all pass.
- [ ] **Commit.** Run `bunx prettier --write` on the touched files, then `git add -A && git commit` with the message `feat(render): cache per-row faces and bake finishes in both renderers` followed by your attribution trailer.

---

### Task 5: Exports, examples and README

**Files:**
- Modify: `src/canvas/index.ts`, `src/pixi/index.ts`, `test/index.test.ts`, `examples/index.html`, `examples/main.ts`, `README.md`

**Interfaces:**
- Produces: `/canvas` and `/pixi` re-export `FLAP_THEMES`, `FINISH_PRESETS` and `finishFace`, and the types `FaceContext`, `FlapColors`, `FlapTheme`, `ThemeName`, `Finish`, `FinishValues` and `FaceFinish`.

- [ ] **Write the failing export test** (`test/index.test.ts`):
```diff
--- a/test/index.test.ts
+++ b/test/index.test.ts
@@ -41,6 +41,9 @@ describe('entry points', () => {
                 'stackDepth',
                 'stackFlaps',
                 'fitScale',
+                'FLAP_THEMES',
+                'FINISH_PRESETS',
+                'finishFace',
             ])
         );
     });
@@ -59,6 +62,9 @@ describe('entry points', () => {
                 'stackDepth',
                 'stackFlaps',
                 'fitScale',
+                'FLAP_THEMES',
+                'FINISH_PRESETS',
+                'finishFace',
                 'textureFace',
             ])
         );
```
Run: `bunx vitest run test/index.test.ts`. Expected: FAIL (missing exports).
- [ ] **Add the exports:**

`src/canvas/index.ts`:
```diff
--- a/src/canvas/index.ts
+++ b/src/canvas/index.ts
@@ -10,10 +10,15 @@ export {
 } from './draw-unit.js';
 export {
     colorFace,
+    FLAP_THEMES,
     textFace,
     type Ctx2D,
+    type FaceContext,
     type FacePainter,
+    type FlapColors,
+    type FlapTheme,
     type TextFaceOptions,
+    type ThemeName,
 } from '../render/faces.js';
 export {
     defaultCanvasFactory,
@@ -46,7 +51,10 @@ export {
 export {
     DEFAULT_STACK_SHADE,
     DEFAULT_STYLE,
+    FINISH_PRESETS,
     resolveStyle,
+    type Finish,
+    type FinishValues,
     type FlapStack,
     type FlapStyle,
     type ResolvedFlapStack,
@@ -54,4 +62,5 @@ export {
 } from '../render/style.js';
 export { stackDepth, stackFlaps } from '../render/stack.js';
 export { fitScale, type FitMode, type Size } from '../render/fit.js';
+export { finishFace, type FaceFinish } from '../render/finish.js';
 export { MAX_FRAME_DT } from '../render/frame.js';
```
`src/pixi/index.ts`:
```diff
--- a/src/pixi/index.ts
+++ b/src/pixi/index.ts
@@ -11,10 +11,15 @@ export {
 } from './textures.js';
 export {
     colorFace,
+    FLAP_THEMES,
     textFace,
     type Ctx2D,
+    type FaceContext,
     type FacePainter,
+    type FlapColors,
+    type FlapTheme,
     type TextFaceOptions,
+    type ThemeName,
 } from '../render/faces.js';
 export {
     defaultCanvasFactory,
@@ -47,7 +52,10 @@ export {
 export {
     DEFAULT_STACK_SHADE,
     DEFAULT_STYLE,
+    FINISH_PRESETS,
     resolveStyle,
+    type Finish,
+    type FinishValues,
     type FlapStack,
     type FlapStyle,
     type ResolvedFlapStack,
@@ -55,4 +63,5 @@ export {
 } from '../render/style.js';
 export { stackDepth, stackFlaps } from '../render/stack.js';
 export { fitScale, type FitMode, type Size } from '../render/fit.js';
+export { finishFace, type FaceFinish } from '../render/finish.js';
 export { MAX_FRAME_DT } from '../render/frame.js';
```
- [ ] **Add the Theme and Finish selectors, the red `DELAYED` destination and the row tints to the examples:**

`examples/index.html`:
```diff
--- a/examples/index.html
+++ b/examples/index.html
@@ -29,7 +29,8 @@
                 margin: 8px 0 16px;
             }
             button,
-            input {
+            input,
+            select {
                 background: #2c2c33;
                 color: #eeeeee;
                 border: 1px solid #44444c;
@@ -61,6 +62,17 @@
                 <button id="spin">Spin</button>
                 <button id="stop">Stop</button>
                 <button id="sound">Sound: off</button>
+                <select id="theme" aria-label="Theme">
+                    <option value="classic">Theme: classic</option>
+                    <option value="solari">Theme: solari</option>
+                    <option value="airport">Theme: airport</option>
+                    <option value="cream">Theme: cream</option>
+                </select>
+                <select id="finish" aria-label="Finish">
+                    <option value="matte" selected>Finish: matte</option>
+                    <option value="satin">Finish: satin</option>
+                    <option value="gloss">Finish: gloss</option>
+                </select>
             </div>
             <div class="boards">
                 <canvas id="departures-canvas"></canvas>
```
`examples/main.ts`:
```diff
--- a/examples/main.ts
+++ b/examples/main.ts
@@ -10,8 +10,11 @@ import {
 import {
     CanvasFlapRenderer,
     colorFace,
+    type Finish,
+    FLAP_THEMES,
     type FlapStyle,
     textFace,
+    type ThemeName,
 } from '@kinnet-studio/split-flaps/canvas';
 import { PixiFlapView } from '@kinnet-studio/split-flaps/pixi';
 import { FlapSound } from '@kinnet-studio/split-flaps/sound';
@@ -26,8 +29,25 @@ const cities = new FlapSequence([
     'NAGOYA',
     'SENDAI',
     'HAKATA',
+    'DELAYED',
 ]);
 
+/** Background for every other departures row, per theme. */
+const ROW_TINTS: Record<ThemeName, string> = {
+    classic: '#2c2c31',
+    solari: '#343438',
+    airport: '#e6b800',
+    cream: '#e3dccd',
+};
+
+/** A readable red for the DELAYED destination on each theme. */
+const DELAYED_COLORS: Record<ThemeName, string> = {
+    classic: '#ff5a4f',
+    solari: '#ff5a4f',
+    airport: '#b3261e',
+    cream: '#b3261e',
+};
+
 const style: FlapStyle = {
     radius: 4,
     hingeGap: 1,
@@ -82,21 +102,62 @@ async function departures(): Promise<void> {
         ],
         [
             { time: '11:00', dest: 'NAGOYA', plat: '4' },
-            { time: '11:20', dest: 'SENDAI', plat: '9' },
+            { time: '11:20', dest: 'DELAYED', plat: '9' },
             { time: '11:45', dest: 'TOKYO', plat: '2' },
         ],
     ];
-    const face = { time: charFace, dest: wordFace, plat: charFace };
     const gap = { unit: 3, field: 16, row: 8 };
+    const themeSelect = document.getElementById('theme');
+    const finishSelect = document.getElementById('finish');
+    const selected = () => ({
+        theme: (themeSelect instanceof HTMLSelectElement
+            ? themeSelect.value
+            : 'classic') as ThemeName,
+        finish: (finishSelect instanceof HTMLSelectElement
+            ? finishSelect.value
+            : 'matte') as Finish,
+    });
+
+    // Painters and style for a theme + finish: a red DELAYED destination and
+    // alternating row tints.
+    const look = (theme: ThemeName, finish: Finish) => {
+        const rows = (row: number) =>
+            row % 2 ? { background: ROW_TINTS[theme] } : undefined;
+        const charPainter = textFace({
+            font: '600 26px ui-monospace, Menlo, monospace',
+            theme,
+            rows,
+        });
+        const face = {
+            time: charPainter,
+            dest: textFace({
+                font: '600 22px system-ui, sans-serif',
+                theme,
+                rows,
+                colors: flap =>
+                    flap === 'DELAYED'
+                        ? { color: DELAYED_COLORS[theme] }
+                        : undefined,
+            }),
+            plat: charPainter,
+        };
+        const lookStyle: FlapStyle = {
+            ...style,
+            finish,
+            hingeColor: FLAP_THEMES[theme].hinge,
+        };
+        return { face, style: lookStyle };
+    };
 
     // The canvas renderer advances the board; the Pixi view only mirrors it.
-    const renderer = new CanvasFlapRenderer({
+    const initial = look(selected().theme, selected().finish);
+    let renderer = new CanvasFlapRenderer({
         canvas: canvasById('departures-canvas'),
         target: board,
-        face,
+        face: initial.face,
         cell,
         gap,
-        style,
+        style: initial.style,
     });
     renderer.start();
 
@@ -110,10 +171,43 @@ async function departures(): Promise<void> {
         autoDensity: true,
     });
     document.getElementById('departures-pixi')?.append(app.canvas);
-    const view = new PixiFlapView({ target: board, face, cell, gap, style });
+    let view = new PixiFlapView({
+        target: board,
+        face: initial.face,
+        cell,
+        gap,
+        style: initial.style,
+    });
     app.stage.addChild(view);
     app.ticker.add(() => view.sync());
 
+    // Style and painters are fixed per renderer, so a new look rebuilds both.
+    const restyle = () => {
+        const next = look(selected().theme, selected().finish);
+        renderer.destroy();
+        renderer = new CanvasFlapRenderer({
+            canvas: canvasById('departures-canvas'),
+            target: board,
+            face: next.face,
+            cell,
+            gap,
+            style: next.style,
+        });
+        renderer.start();
+        app.stage.removeChild(view);
+        view.destroy();
+        view = new PixiFlapView({
+            target: board,
+            face: next.face,
+            cell,
+            gap,
+            style: next.style,
+        });
+        app.stage.addChild(view);
+    };
+    themeSelect?.addEventListener('change', restyle);
+    finishSelect?.addEventListener('change', restyle);
+
     let index = 0;
     board.show(messages[index]);
     onClick('next', () => {
```
- [ ] **Document it in the README:**
```diff
--- a/README.md
+++ b/README.md
@@ -134,6 +134,42 @@ board.on('settled', () => console.log('done'));
 
 The hold timer starts once the board has settled on a message.
 
+## Finish and colours
+
+`style.finish` sets the surface: `'gloss'` (default, the original look),
+`'satin'` or `'matte'`. Matte lowers the moving-flap shade and cast shadow and
+bakes a soft top-to-bottom light falloff and a paper-like grain into each
+painted face, so flaps read as printed card. Explicit `shade`, `shadow`,
+`grain` and `light` override the preset.
+
+```ts
+style: {
+    finish: 'matte';
+} // or { finish: 'matte', shade: 0.25 }
+```
+
+`textFace` takes a theme (`classic`, `solari`, `airport`, `cream`, or
+`{ color, background }`) plus per-flap and per-row colours:
+
+```ts
+import { FLAP_THEMES, textFace } from '@kinnet-studio/split-flaps/canvas';
+
+textFace({
+    font: '600 26px ui-monospace, monospace',
+    theme: 'solari',
+    colors: flap => (flap === 'DELAYED' ? { color: '#ff5a4f' } : undefined),
+    rows: row => (row % 2 ? { background: '#343438' } : undefined),
+});
+style: {
+    hingeColor: FLAP_THEMES.solari.hinge;
+} // each theme suggests a hinge colour
+```
+
+Precedence: per-flap, then per-row, then explicit `color` / `background`, then
+the theme. Custom painters receive a fifth argument `{ row, field }`; set
+`perRow: true` on a painter whose output depends on the row so renderers cache
+its faces per row (`textFace` does this when `rows` is given).
+
 ## Covered-flap stack
 
 Show the flaps under the bottom half, like the edges of a book:
```
- [ ] **Verify everything.** Run each and check the result:

| Command | Expected |
| --- | --- |
| `bun run test` | 259 passing |
| `bun run typecheck` | exits 0 |
| `bun run format:check` | clean |
| `bun run build` | ends with `check-dist ok` |
| `bunx vite build --config examples/vite.config.ts` | builds |

- [ ] **Commit.** Run `bunx prettier --write` on the touched files, then `git add -A && git commit` with the message `feat(render): export themes and finishes; examples theme and finish selectors` followed by your attribution trailer.
- [ ] **Visual check.** Run `bun run dev`. Switch Theme and Finish: matte shows a printed-card grain, `DELAYED` is red and readable on each theme, and alternate rows are tinted.
