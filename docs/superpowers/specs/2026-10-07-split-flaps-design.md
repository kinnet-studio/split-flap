# @kinnet-studio/split-flaps — Design

**Date:** 2026-10-07
**Status:** Approved in brainstorming; awaiting written-spec review

## Summary

A renderer-agnostic split-flap display engine for web apps, plus 2D renderers for the native
Canvas 2D API and Pixi v8. Consumers define each unit's flap sequence (the "drum"), the content
to display, and how units travel to their targets (through every intermediate flap or in one
flip; forward-only or shortest path). The core also supports idle spinning and a timed message
playlist.

The API is layered. At the lowest level a consumer controls individual units; above that,
fields (groups of units set by one value) and boards (rows of named fields) provide the
convenient abstraction. Renderers mirror the same layering.

## Goals

- Core usable with any rendering technology (canvas, Pixi, DOM, three.js, …) without
  reimplementing timing, playlist, or settle logic.
- Deterministic, headless-testable core: all time advances through `update(dt)`.
- Generic flap content: characters, whole words, colours, image ids — anything with a key.
- Canvas 2D and Pixi v8 renderers drawing the mid-flip rotation of each flap, with motion
  shaped by `@ue-too/animate` keyframes.

## Non-goals (v1)

- Sound (the `flipend` event is the hook for consumers).
- Viewing-angle / perspective camera; boards are drawn straight-on.
- Heterogeneous rows inside one `FlapBoard` (compose fields directly instead).
- React / Vue adapters, DOM/CSS renderer, SSR.

## Package

- Name: `@kinnet-studio/split-flaps`, ESM only, version `0.1.0`, MIT.
- One package, three entry points:
  - `@kinnet-studio/split-flaps` — core (zero runtime dependencies in this code path)
  - `@kinnet-studio/split-flaps/canvas` — Canvas 2D renderer
  - `@kinnet-studio/split-flaps/pixi` — Pixi v8 renderer
- Dependencies: `@ue-too/animate` (regular dependency; imported only by render code).
- Peer dependencies: `pixi.js@^8` marked optional via `peerDependenciesMeta`; imported only by
  `/pixi`.
- `package.json` sets `sideEffects: ["./src/**/*.ts"]`, not `false`. Bun 1.3 drops the shared
  chunks when it is `false`, producing an unusable `dist/`. Published `dist/` files do not match
  the glob, so consumers still tree-shake. `scripts/check-dist.ts` runs last in `build` to catch
  a regression.
- Tooling (matches ue-too): Bun, TypeScript strict, Vitest, Prettier (4-space indent, single
  quotes, trailing comma es5), build with `Bun.build()` + `tsc --emitDeclarationOnly`. No Nx.

### Source layout

```
src/
  core/      sequence.ts  plan-path.ts  unit.ts  field.ts  board.ts  playlist.ts  emitter.ts  index.ts
  render/    flip-geometry.ts  flip-curve.ts  faces.ts  face-cache.ts  layout.ts  style.ts
  canvas/    draw-unit.ts  renderer.ts  index.ts
  pixi/      unit-sprite.ts  view.ts  index.ts
examples/    Vite app: departures board (canvas + pixi side by side), plain grid, colour/image faces
```

`src/render/` is shared, pure, renderer-agnostic code. It is not its own entry point; `/canvas`
and `/pixi` each re-export the public parts (`createFlipCurve`, `textFace`, `colorFace`,
`FaceCache` types).

## Architecture decision: the core owns time

The core advances all state through `update(dt)` using its own deterministic time accumulator.
Renderers are stateless samplers: each frame they read unit state and draw it.

`@ue-too/animate` is **not** used to clock flips in the core: its `onEnd` callbacks fire via
`queueMicrotask` and overshoot time is discarded, which would make flip rate frame-rate
dependent, prevent catching up multiple flips in one `update`, and make core tests async.
Instead, `@ue-too/animate` shapes the visual motion in the renderers (see Flip curve).

## Core

### FlapSequence<T>

The ordered set of flaps on a drum.

```ts
new FlapSequence<T>(flaps: readonly T[], options?: { key?: (flap: T) => string })
FlapSequence.chars(charset: string): FlapSequence<string>   // splits with Array.from (CJK/emoji safe)
CHARSETS.alphanumeric   // ' ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
CHARSETS.digits         // ' 0123456789'

seq.length: number
seq.at(index: number): T
seq.indexOf(flap: T): number      // -1 if absent; compares by key
seq.key(flap: T): string
```

- `key` defaults to `String(flap)`. Object flaps must supply `key`; without it every object
  maps to `"[object Object]"` and construction fails the duplicate-key check, with an error
  message telling the consumer to provide `key`.
- Construction throws on an empty list or duplicate keys.

### planPath

Pure function computing which indices a unit shows on its way to a target.

```ts
type Cycle = 'all' | 'direct';
type Direction = 'forward' | 'shortest';

planPath(length: number, from: number, to: number, opts: { cycle: Cycle; direction: Direction })
  : { steps: number[]; direction: 1 | -1 }
```

- `steps` lists the indices to show, in order, ending at `to`; it excludes `from`.
- `from === to` → `{ steps: [], direction: 1 }`.
- `direction: 'forward'`: travel `+1` with wrap-around; distance `(to - from + length) % length`.
- `direction: 'shortest'`: compare forward distance `f` with backward distance `length - f`;
  pick the smaller; a tie goes forward. Backward travel steps `-1` with wrap-around and reports
  `direction: -1`.
- `cycle: 'direct'`: `steps` is `[to]` (one flip); `direction` is still chosen as above.

### FlapUnit<T>

One drum. Owns its timing.

```ts
interface UnitOptions {
  flipDuration?: number;            // ms per flip, default 80; must be > 0
  cycle?: Cycle;                    // default 'all'
  direction?: Direction;            // default 'forward'
  unknownFlap?: 'pad' | 'throw';    // default 'pad'
  pad?: T;                          // default sequence.at(0)
}

new FlapUnit<T>({ sequence: FlapSequence<T>, initial?: T } & UnitOptions)

unit.setTarget(flap: T, opts?: { delay?: number }): void
unit.spin(): void
unit.stop(): void
unit.snapTo(flap: T): void
unit.update(dt: number): void

unit.state: { current: T; next: T | null; progress: number; direction: 1 | -1 }
unit.target: T | null          // where the unit is heading or last settled; null while spinning
unit.isSettled: boolean
unit.on(event: 'flipstart' | 'flipend' | 'settled', cb): () => void   // returns unsubscribe
```

Semantics:

- `initial` defaults to `sequence.at(0)`. The unit starts settled with `target = initial`.
- `target` is set by `setTarget` (after pad substitution) and `snapTo`; `spin()` sets it to
  `null`; `stop()` sets it to the flap the in-progress flip lands on (or `current`).
- `state.progress` is **linear** 0..1 within the current flip. When settled, `next` is `null`
  and `progress` is `0`. Easing is a renderer concern.
- `setTarget`:
  - A flip in progress always completes. The new path is planned from the flap that flip lands
    on (or from `current` if not flipping), replacing any remaining queued steps.
  - `delay` (ms) is waited before the first flip starts; it replaces any pending delay. If a
    flip is in progress the delay begins after it lands.
  - Setting a target equal to the current flap while settled is a no-op (no events).
  - Ends spinning.
  - Target not in the sequence: `unknownFlap: 'pad'` substitutes `pad`; `'throw'` throws.
- `spin()`: flips forward continuously with no target until `setTarget` or `stop`. Ignores
  `direction` and `cycle`.
- `stop()`: clears the queue and spinning; the in-progress flip completes, then the unit settles
  (emits `settled`).
- `snapTo(flap)`: sets `current` immediately; clears flip, queue, delay, and spinning; emits no
  events.
- `update(dt)`: ignores `dt <= 0` and non-finite `dt`. Consumes `dt` in a loop: pending delay
  first, then flip time; when a flip completes, the overshoot carries into the next flip, so one
  large `dt` may complete several flips. A spinning unit with an empty queue fast-forwards whole
  revolutions for huge `dt` (cost does not grow with `dt`); the skipped flips emit no events and
  the visible end state is identical. Events fire synchronously inside `update`, in order:
  `flipstart` → `flipend` → (next `flipstart` …) → `settled` after the final `flipend`.
- Event payloads: `flipstart` / `flipend` → `{ from: T; to: T; direction: 1 | -1 }`;
  `settled` → `{ flap: T }`.
- `settled` is emitted at the end of an `update` in which the unit transitions from unsettled to
  settled. `setTarget`/`spin` that create work mark the unit unsettled; `snapTo` marks it settled
  without an event. Fields and boards use the same transition rule for their `settled` events,
  and it also covers work started directly on their children (`board.field(...)`,
  `field.units[i]`).

### FieldSpec and FlapField<T, V>

A field is a run of units that share a sequence and are set by one value of type `V`.

```ts
interface FieldSpec<T, V> {
  sequence: FlapSequence<T>;
  length: number;                         // units, >= 1
  toFlaps?: (value: V) => T[];            // default: V is T | T[] → [value] or value
  align?: 'left' | 'right' | 'center';    // default 'left'
  overflow?: 'truncate' | 'throw';        // default 'truncate'
  pad?: T;                                // default sequence.at(0); fills unused units and is
                                          // passed to each unit as its `pad`
  cells?: number;                         // layout width of each unit in cells, default 1
  stagger?: FieldStagger;
  unit?: Omit<UnitOptions, 'pad'>;        // applied to every unit (pad comes from the field)
}

interface FieldStagger {
  order: 'sequential' | 'reverse' | 'random' | 'none';
  step: number;                            // ms between consecutive units
  random?: () => number;                   // default Math.random; inject for deterministic tests
}

defineField<T, V>(spec: FieldSpec<T, V>): FieldSpec<T, V>    // identity helper for inference
textField(spec: Omit<FieldSpec<string, string>, 'toFlaps'>): FieldSpec<string, string>
                                                             // toFlaps = Array.from

new FlapField<T, V>(spec: FieldSpec<T, V>)
field.set(value: V, opts?: { delays?: readonly number[] }): void   // delays override stagger
field.clear(opts?: { delays?: readonly number[] }): void           // every unit to pad
field.snap(value: V): void
field.spin(): void
field.stop(): void
field.update(dt: number): void
field.units: readonly FlapUnit<T>[]
field.isSettled: boolean
field.on('settled' | 'flipend', cb): () => void   // flipend payload adds { unit: index }
```

- `set` converts with `toFlaps`, applies `overflow` when longer than `length`, pads to `length`
  per `align`, then calls `setTarget` on each unit with its stagger delay.
- Stagger delay for unit `i` of `n`: `sequential` → `i * step`; `reverse` → `(n-1-i) * step`;
  `random` → `random() * (n-1) * step`; `none` → `0`.
- Construction throws on `length < 1`.

### FlapBoard<S>

Rows sharing one schema of named fields.

```ts
type Schema = Record<string, FieldSpec<any, any>>;
type FlapOf<F> = F extends FieldSpec<infer T, any> ? T : never;
type ValueOf<F> = F extends FieldSpec<any, infer V> ? V : never;
type RowValues<S> = Partial<{ [K in keyof S]: ValueOf<S[K]> }>;

interface BoardStagger {
  order: 'column' | 'row' | 'diagonal' | 'random' | 'none';
  step: number;
  random?: () => number;
}

new FlapBoard<S extends Schema>({ rows: number; schema: S; stagger?: BoardStagger })

board.show(rows: RowValues<S>[]): void
board.row(i: number): { set(values: RowValues<S>): void }
board.field<K extends keyof S>(row: number, name: K): FlapField<FlapOf<S[K]>, ValueOf<S[K]>>
board.play(messages: Message<S>[], opts?: { hold?: number; loop?: boolean }): void
board.spin(): void
board.stop(): void
board.update(dt: number): void
board.isSettled: boolean
board.rowCount: number
board.schema: S
board.on('settled' | 'flipend' | 'messagechange' | 'playlistend', cb): () => void
```

- `show(rows)` sets the whole board: fields missing from a row, and rows beyond `rows.length`,
  go to their pad flap. More rows than the board has are truncated. Cancels any playlist.
- `row(i).set(values)` updates only the named fields of row `i`; does not cancel a playlist.
- Board stagger uses each unit's position: `column` → `globalCol * step` where `globalCol` is
  the unit's cell column across the row (sum of preceding units' `cells`); `row` → `rowIndex *
  step`; `diagonal` → `(rowIndex + globalCol) * step`; `random` → `random() * maxCol * step` where `maxCol` is the largest `globalCol` on the board;
  `none` → `0`.
- A field spec with its own `stagger` uses it for that field's units, replacing board stagger.
- `isSettled` is true when every unit is settled. `settled` fires on the transition to settled.
- Event payloads: `flipend` → `{ row, field, unit, from, to, direction }`;
  `messagechange` → `{ index }`; `playlistend` → `{}`.
- Construction throws on `rows < 1` or an empty schema.

### Playlist

```ts
type Message<S> = RowValues<S>[] | { rows: RowValues<S>[]; hold?: number };

board.play(messages, { hold = 5000, loop = true })
```

- Shows message 0 immediately (emits `messagechange`). The hold timer (message `hold`, else the
  option `hold`) starts at the first `update` in which the board is observed settled; that
  update's `dt` is not counted. Later `dt`s accumulate; once the hold is reached the next message
  is shown (leftover time is not carried into the next message).
- `loop: false`: after the last message settles and its hold elapses, emits `playlistend` and
  leaves the last message displayed.
- Driven by `board.update(dt)`, after the units have been updated for that `dt`.
- `show()`, `spin()`, `stop()`, or another `play()` cancel the current playlist. `row(i).set()`
  does not.
- Throws on an empty `messages` array.

## Rendering

### Flip geometry (shared, pure)

Each unit is split horizontally at the hinge. For a forward flip (`direction: 1`) from `A` to
`B` with flap angle `θ` (degrees, 0..180):

- Static top half: top half of `B`.
- Static bottom half: bottom half of `A`.
- Moving flap:
  - `θ < 90`: top half of `A`, anchored at the hinge, vertical scale `cos θ` (shrinking toward
    the hinge).
  - `θ ≥ 90`: bottom half of `B` (the flap's back), anchored at the hinge, vertical scale
    `|cos θ|` (growing downward).
- Shading: the moving flap darkens by `flapShade = 1 - |cos θ|` (peaks edge-on at 90°). The
  static half the flap is moving toward (`shadowHalf`: bottom for forward flips) receives a cast
  shadow of strength `castShadow = sin θ`. Both are scaled by the style's `shade` / `shadow`.

A backward flip (`direction: -1`) mirrors this vertically: static top is the top half of `A`,
static bottom is the bottom half of `B`; the moving flap is the bottom half of `A` shrinking up
toward the hinge for `θ < 90`, then the top half of `B` growing upward from the hinge for
`θ ≥ 90`. The cast shadow falls on the static top half.

```ts
flipGeometry(angle: number, direction: 1 | -1): {
  staticTop: 'current' | 'next';
  staticBottom: 'current' | 'next';
  flap: { face: 'current' | 'next'; half: 'top' | 'bottom'; anchor: 'hinge'; scaleY: number };
  flapShade: number;      // 0..1
  castShadow: number;     // 0..1
  shadowHalf: 'top' | 'bottom';
}
```

Settled units (`next === null`) draw both halves of `current` with no moving flap.

### Flip curve

`angle = flipCurve(progress)` maps the core's linear progress to the flap angle using
`@ue-too/animate` `Keyframe<number>[]` and per-keyframe `easingFn`. Sampling uses the public
`findValue(percentage, keyframes, numberHelperFunctions)` method of a single `Animation<number>`
instance held by the curve (the animation is never started).

```ts
createFlipCurve(keyframes?: Keyframe<number>[]): (progress: number) => number
```

Default keyframes: ease-in fall `0 → 180` by `0.8`, bounce back to `165` at `0.9`, settle to
`180` at `1.0`. Output stays within `[0, 180]`.

### Faces

A face painter draws one full flap face; both renderers use it.

```ts
type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
type FacePainter<T> = (ctx: Ctx2D, flap: T, width: number, height: number) => void;

textFace(opts: { font: string; color: string; background: string }): FacePainter<string>
colorFace(): FacePainter<string>   // flap is a CSS colour
```

- `FaceCache` paints each face once into an offscreen canvas (`OffscreenCanvas` when available,
  else `HTMLCanvasElement`) at device-pixel resolution (`ctx` pre-scaled by `devicePixelRatio`;
  painters work in CSS pixels). One cache exists per (field, painter, size, dpr); within it faces
  are keyed by `sequence.key(flap)`. `resize()` clears it. When `style.radius > 0` the face is
  clipped to a rounded rect before painting, so both renderers get rounded corners from the
  cached image. Halves are cut from the cached face.
- Painter errors propagate.

### Style

```ts
interface FlapStyle {
  radius?: number;        // corner radius, px
  hingeGap?: number;      // px gap between halves
  hingeColor?: string;
  shade?: number;         // 0..1 max darkening of the moving flap
  shadow?: number;        // 0..1 max cast-shadow opacity
}
```

### Layout (shared)

```ts
interface LayoutOptions {
  cell: { w: number; h: number };
  gap?: { unit?: number; field?: number; row?: number };
}
```

A unit with `cells = c` is `c * cell.w + (c - 1) * gap.unit` wide. Units in a field are spaced by
`gap.unit`; fields in a row by `gap.field`; rows by `gap.row`. A `FlapField` or `FlapUnit` target
is laid out as a single row. `layout(target, opts)` returns the rect for each unit and the total
size.

### Canvas renderer (`/canvas`)

```ts
drawUnit(ctx, state: UnitState<T>, rect: Rect, opts: { faces: FaceCache<T>; style: FlapStyle; flipCurve }): void

new CanvasFlapRenderer({
  canvas: HTMLCanvasElement;
  target: FlapBoard<any> | FlapField<T, any> | FlapUnit<T>;
  face: FacePainter<any>;        // or a per-field map for boards: { [fieldName]: FacePainter }
  style?: FlapStyle;
  flipCurve?: (progress: number) => number;
  dpr?: number;                  // default globalThis.devicePixelRatio ?? 1, re-read on resize()
  createCanvas?: (w: number, h: number) => FaceCanvas;   // offscreen face canvases (tests inject)
  scheduler?: { request(cb: (t: number) => void): number; cancel(id: number): void };  // default rAF
} & LayoutOptions)

renderer.render(): void   // draws the current state
renderer.start(): void    // rAF loop: dt from timestamps, capped at 250 ms; target.update(dt); render()
renderer.stop(): void
renderer.resize(): void   // re-reads devicePixelRatio, resizes the canvas backing store, full redraw
renderer.destroy(): void
```

- Dirty tracking: each unit's last drawn `(current, next, angle, direction)` is remembered; only
  changed units are cleared and redrawn. First render and `resize()` redraw everything.
- Consumers may skip `start()` and call `target.update(dt)` + `render()` from their own loop.

### Pixi renderer (`/pixi`)

```ts
new PixiFlapView({
  target: FlapBoard<any> | FlapField<T, any> | FlapUnit<T>;
  face: FacePainter<any> | TextureFace<any>;   // or a per-field map for boards
  resolution?: number;                     // face canvas resolution, default devicePixelRatio ?? 1
  createCanvas?: (w: number, h: number) => FaceCanvas;
  style?: FlapStyle;
  flipCurve?: (progress: number) => number;
} & LayoutOptions)                // extends Container; consumer adds it to their stage

view.attach(ticker: Ticker): void   // per tick: target.update(ticker.deltaMS capped at 250); sync()
view.detach(): void
view.update(dt: number): void       // target.update(dt); sync()
view.sync(): void                   // apply current state to the scene graph
view.destroy(): void                // releases textures created by the view; never destroys textures it did not create (forces `texture: false`)
```

- `textureFace((flap: T) => Texture)` wraps a texture lookup so it can be told apart from a
  painter; its textures are used as-is (no radius applied).
- Each unit is a Container with Sprites for the static top, static bottom, and moving flap, plus
  shadow and hinge sprites. Painted faces become textures via `Texture.from(canvas)`; half sprites use
  sub-textures sharing the face's source with a half-height `frame`.
- The moving flap's `scale.y` follows the flip geometry; shading uses `tint`.

## Error handling

| Situation | Behaviour |
| --- | --- |
| Empty sequence, duplicate keys | Throw at construction |
| `flipDuration <= 0`, field `length < 1`, board `rows < 1`, empty schema | Throw at construction |
| Target flap not in sequence | `unknownFlap: 'pad'` (default) substitutes pad; `'throw'` throws |
| Value longer than field | `overflow: 'truncate'` (default) or `'throw'` |
| More rows passed to `show()` than the board has | Truncate |
| `update(dt)` with `dt <= 0` or non-finite | Ignored |
| Very large `dt` | Correctly processed by carry-over; renderers cap frame `dt` at 250 ms for visual smoothness |
| `play([])` | Throws |
| Face painter throws | Propagates |
| Importing `/pixi` without `pixi.js` installed | Module resolution error (documented in README) |

## Testing

- **Core (Vitest, deterministic, fake dt):**
  - `planPath` table tests: forward wrap, shortest with tie, backward direction, direct, `from === to`.
  - `FlapUnit`: single flip timing, overshoot carry-over, multiple flips in one `dt`, retarget
    mid-flip (lands then replans), delay, spin/stop, snapTo, unknown flap handling, event order.
  - `FlapField`: `toFlaps`, align, pad, overflow, each stagger order (seeded random).
  - `FlapBoard`: show/partial row set, board stagger orders, field stagger override, settled
    event, schema value type inference via `expectTypeOf`.
  - Playlist: hold starts after settle, per-message hold, loop, `loop: false` + `playlistend`,
    cancellation rules.
- **Render (pure):** `flipGeometry` at 0, 45, 90, 135, 180 for both directions; `createFlipCurve`
  default curve endpoints, bounce, and bounds; `layout` rects with `cells` and gaps.
- **Canvas:** `drawUnit` against a recording fake 2D context (assert draw calls per phase);
  dirty tracking skips unchanged units.
- **Pixi:** scene graph assertions (sprite frames, `scale.y`, tint at given progress) with
  placeholder textures.
- **Visual:** examples app checked in the browser.
