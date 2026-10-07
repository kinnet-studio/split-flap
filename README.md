# @kinnet-studio/split-flap

A split-flap display engine for the web. The core handles the drums, the timing,
idle spinning and message playlists, and works with any renderer. Canvas 2D and
Pixi v8 renderers are included.

Up to 0.1.1 the package was published as `@kinnet-studio/split-flaps`, which is
now deprecated. To upgrade, replace that name in your imports with
`@kinnet-studio/split-flap`.

## Install

```bash
bun add @kinnet-studio/split-flap
# only for the Pixi renderer:
bun add pixi.js@^8
```

## Concepts

The API is layered; use whichever level you need.

| Layer          | What it is                                                                                |
| -------------- | ----------------------------------------------------------------------------------------- |
| `FlapSequence` | The ordered flaps on one drum: characters, whole words, colours, anything with a key.     |
| `FlapUnit`     | One drum. `setTarget()`, `spin()`, `stop()`, `snapTo()`, `update(dt)`.                    |
| `FlapField`    | Units sharing a drum, set with one value (`'TOKYO'` across five units, or one word flap). |
| `FlapBoard`    | Rows of named fields. `show()`, `row(i).set()`, `play()`.                                 |

The core never reads the clock. Call `update(dt)` (milliseconds) yourself, or
let a renderer's loop do it. If you drive `update(dt)` yourself, cap `dt` (e.g.
`Math.min(dt, MAX_FRAME_DT)`, exported by the renderer entry points) so a stalled tab does not jump the display.

## Quick start (Canvas 2D)

```ts
import {
    CHARSETS,
    defineField,
    FlapBoard,
    FlapSequence,
    textField,
} from '@kinnet-studio/split-flap';
import { CanvasFlapRenderer, textFace } from '@kinnet-studio/split-flap/canvas';

const chars = FlapSequence.chars(`${CHARSETS.alphanumeric}:`);
const cities = new FlapSequence(['', 'TOKYO', 'OSAKA', 'KYOTO']);

const board = new FlapBoard({
    rows: 3,
    schema: {
        time: textField({ sequence: chars, length: 5 }),
        dest: defineField({ sequence: cities, length: 1, cells: 5 }),
        plat: textField({ sequence: chars, length: 2, align: 'right' }),
    },
    stagger: { order: 'column', step: 25 },
});

const renderer = new CanvasFlapRenderer({
    canvas: document.querySelector('canvas')!,
    target: board,
    face: textFace({
        font: '600 26px ui-monospace, monospace',
        color: '#f4f1e8',
        background: '#232326',
    }),
    cell: { w: 28, h: 44 },
    gap: { unit: 3, field: 16, row: 8 },
});
renderer.start();

board.show([{ time: '09:15', dest: 'TOKYO', plat: '3' }]);
```

## Pixi v8

```ts
import { PixiFlapView } from '@kinnet-studio/split-flap/pixi';

const view = new PixiFlapView({ target: board, face, cell, gap });
app.stage.addChild(view);
view.attach(app.ticker); // or call view.update(dt) yourself
```

`/pixi` imports `pixi.js`, so install `pixi.js@^8` before importing it; the core
and `/canvas` entry points never load Pixi.

If one target is drawn by two renderers, only one of them should advance time.
Attach the other with `view.attach(app.ticker, { update: false })`, which only
syncs each tick (or call `view.sync()` yourself). `view.destroy()` detaches it,
even after the ticker itself was destroyed.

Face painters are shared: the same `textFace(...)` or custom
`(ctx, flap, w, h) => void` works in both renderers. For ready-made textures use
`textureFace(flap => texture)`.

## Unit options

| Option         | Default     | Meaning                                                     |
| -------------- | ----------- | ----------------------------------------------------------- |
| `flipDuration` | `80`        | Milliseconds per flip.                                      |
| `cycle`        | `'all'`     | `'all'` shows every flap in between; `'direct'` flips once. |
| `direction`    | `'forward'` | `'shortest'` may flip backward when that is shorter.        |
| `unknownFlap`  | `'pad'`     | Targets missing from the drum show the pad flap, or throw.  |

A flip in progress always completes before a new target takes effect.

## Fields

A `FieldSpec` (`defineField`, `textField`, or a board schema entry) takes:

| Option     | Meaning                                                       |
| ---------- | ------------------------------------------------------------- |
| `length`   | Number of units in the field.                                 |
| `toFlaps`  | Converts a value into one flap per unit.                      |
| `align`    | `'left'` (default), `'right'` or `'center'` for short values. |
| `overflow` | `'truncate'` (default) or `'throw'` for long values.          |
| `pad`      | Flap shown by unused units.                                   |
| `cells`    | Layout cells each unit occupies (board stagger columns).      |
| `stagger`  | Field-level start delays between units.                       |
| `unit`     | Per-unit options (see below).                                 |

Field stagger orders: `sequential | reverse | random | none`. Board stagger
orders: `column | row | diagonal | random | none`.

## Playlists, spinning and events

```ts
board.play([messageA, { rows: messageB, hold: 8000 }], {
    hold: 5000,
    loop: true,
});
board.spin(); // idle/attract spin until show(), play() or stop()
board.on('flipend', ({ row, field, unit }) => playClick());
board.on('settled', () => console.log('done'));
```

The hold timer starts once the board has settled on a message.

## Finish and colours

`style.finish` sets the surface: `'gloss'` (default, the original look),
`'satin'` or `'matte'`. Matte lowers the moving-flap shade and cast shadow and
bakes a soft top-to-bottom light falloff and a paper-like grain into each
painted face, so flaps read as printed card. Explicit `shade`, `shadow`,
`grain` and `light` override the preset.

```ts
style: {
    finish: 'matte';
} // or { finish: 'matte', shade: 0.25 }
```

`textFace` takes a theme (`classic`, `solari`, `airport`, `cream`, or
`{ color, background }`) plus per-flap and per-row colours:

```ts
import { FLAP_THEMES, textFace } from '@kinnet-studio/split-flap/canvas';

textFace({
    font: '600 26px ui-monospace, monospace',
    theme: 'solari',
    colors: flap => (flap === 'DELAYED' ? { color: '#ff5a4f' } : undefined),
    rows: row => (row % 2 ? { background: '#343438' } : undefined),
});
style: {
    hingeColor: FLAP_THEMES.solari.hinge;
} // each theme suggests a hinge colour
```

To change the look of a running board, call `setStyle` / `setFace` on the
renderer (`CanvasFlapRenderer`) or view (`PixiFlapView`). `setStyle` replaces
the whole style, so spread the current one to change a single value:

```ts
renderer.setStyle({ ...renderer.style, finish: 'matte' }); // Pixi: view.flapStyle
renderer.setFace(textFace({ font, theme: 'airport' }));
```

Precedence: per-flap, then per-row, then explicit `color` / `background`, then
the theme. Custom painters receive a fifth argument `{ row, field }`; set
`perRow: true` on a painter whose output depends on the row so renderers cache
its faces per row (`textFace` does this when `rows` is given).

## Covered-flap stack

Show the flaps under the bottom half, like the edges of a book:

```ts
new CanvasFlapRenderer({ /* … */ style: { stack: { count: 3, step: 2 } } });
new PixiFlapView({
    /* … */ style: { stack: { count: 3, step: 2, shade: 0.15 } },
});
```

`count` covered flaps each peek out `step` px below the one in front, darkened
`shade` more per layer (default 0.15). The stack fits inside the cell: the face
shrinks by `count × step`, and layout and canvas size stay the same. The edges
are the real earlier flaps on the drum, so colour faces show the previous
colours.

## React

```ts
import { SplitFlapCanvas, useFlapBoard } from '@kinnet-studio/split-flap/react';

function Departures({ rows }: { rows: RowValues<typeof schema>[] }) {
    // One stable board; `value` is shown whenever its content changes.
    const board = useFlapBoard({ rows: 4, schema, value: rows });
    return (
        <SplitFlapCanvas
            target={board}
            face={face} // keep painters stable: module scope or useMemo
            cell={{ w: 28, h: 44 }}
            flapStyle={{ finish: 'matte' }}
            fit="width"
        />
    );
}
```

How props are handled:

- `cell`, `gap` and `flapStyle` are compared by content, and `face` by
  identity. Changes go through `setLayout`, `setStyle` and `setFace`.
- `target`, `fit` and `drive` recreate the renderer, so keep `target` stable
  (`useFlapBoard` does).
- `flipCurve`, `dpr`, `createCanvas` and `scheduler` are read once, when the
  renderer is created, so inline functions are fine. To change one later,
  remount with a new `key`.
- `drive={false}` only draws a board that something else advances.
- `className` and `style` style the wrapper `<div>`.

`value` and `flapStyle` are compared with `JSON.stringify`. That means:

- Values that serialize the same count as equal. For example, class instances
  whose data lives in getters all serialize as `{}`, so use plain data.
- Values that can't be serialized (a `BigInt`, a cycle) are compared by
  identity instead, so memoize them.

For Pixi, `usePixiFlapView(app, options)` from `/react-pixi` adds a view to an
`Application` you manage and returns it (`null` until `app` is set).
`app`, `target` and `drive` recreate the view. `resolution`, `flipCurve` and
`createCanvas` are read once. In the render where one of those changes, the
hook still returns the old view, and the same commit destroys it. An effect
that uses the view should check for that:

```ts
const view = usePixiFlapView(app, { target: board, face, cell });
useEffect(() => {
    if (!view || view.destroyed) return;
    view.position.set(16, 16);
}, [view]);
```

The view is safe to clean up after the app is destroyed: unmounting after
`app.destroy()` doesn't throw.

## Vue

```ts
import { SplitFlapCanvas, useFlapBoard } from '@kinnet-studio/split-flap/vue';

const board = useFlapBoard({ rows: 4, schema, value: () => departures.value });
// <SplitFlapCanvas :target="board" :face="face" :cell="{ w: 28, h: 44 }"
//                  :flap-style="{ finish: 'matte' }" fit="width" class="board" />
```

- `value` may be an array, a ref or a getter, and nested changes are tracked.
  It is compared by content, with the same caveats as in React.
- The component takes the same props as the React one, with the same rules
  for what recreates the renderer. `class` and `style` fall through to the
  wrapper.
- The board returned by `useFlapBoard` is kept out of Vue's reactivity
  (`markRaw`). Do the same for other core objects you put in reactive state.

For Pixi, `usePixiFlapView(app, options)` from `/vue-pixi`:

```ts
const app = shallowRef<Application | null>(null); // set once it's initialised
const view = usePixiFlapView(app, () => ({
    target: board,
    face, // created once, outside the getter
    cell: { w: 28, h: 44 },
    flapStyle: settings.flapStyle,
}));
```

- Hold the app in a `shallowRef`. A deep `ref` would proxy the whole
  `Application`.
- Pass the options as a getter over your reactive state.
- `face` and `target` are compared by identity, so create them outside the
  getter. A painter created inside it is new on every run, so every change
  would repaint every face.
- The view is created once the app is set, recreated when `app`, `target` or
  `drive` changes, and destroyed when the scope is disposed.

## Sizing and resizing

`cell` (unit size), `gap` and a field's `cells` (width in cells) set the
board's layout size. At runtime:

```ts
renderer.setLayout({ cell: { w: 40, h: 60 }, gap: { unit: 4 } }); // re-lay out
renderer.scale = 1.5; // uniform zoom; faces repaint at dpr × scale (sharp text)
renderer.fitTo(width, height, 'contain'); // pick the scale for a box

// Or keep the board fitted to an element (ResizeObserver):
new CanvasFlapRenderer({ /* … */ fit: { element: wrapper } }); // mode 'width'
```

`'width'` fills the element's width and lets the height follow, which suits
normal page flow (the element's width must not depend on the canvas).
`'contain'` fits both dimensions and needs an element with a fixed height.
`renderer.width` / `height` report the displayed size.

Pixi apps own their canvas, so `PixiFlapView` offers the same pieces without
the observer: `view.setLayout(...)`, `view.fitTo(width, height, mode)` (scales
the view and repaints faces at `resolution × scale`), and
`view.layoutWidth` / `layoutHeight` (unscaled size):

```ts
new ResizeObserver(([entry]) =>
    view.fitTo(entry.contentRect.width, entry.contentRect.height)
).observe(app.canvas.parentElement!);
```

## Sound

`/sound` plays a short click for every flap that lands, through the Web Audio
API. It listens to the core, so it works with any renderer (or none):

```ts
import { FlapSound } from '@kinnet-studio/split-flap/sound';

const sound = new FlapSound({ target: board, volume: 0.5 });
// Browsers only allow audio after a user gesture:
addEventListener('pointerdown', () => sound.unlock(), { once: true });

sound.muted = true; // or sound.volume = 0.2; or sound.destroy()
```

Sound is opt-in: nothing plays unless you create a `FlapSound` and `unlock()`
it. Pass `muted: true` to start muted (e.g. behind a "sound on" toggle).

The default click is synthesized (no audio files); pass `synth` to tune it, or
`sample` (an `AudioBuffer` or a URL) to use your own recording. Each click gets
a small random pitch and volume change (`variation`), overlapping clicks are
capped at `maxVoices` (default 12), and board clicks are panned left to right
by column (`pan`, 0..1 width). If a sample URL fails to load, `unlock()`
rejects but the synth click keeps playing.

## Speed

`flipDuration` (per unit, or per field via `unit: { flipDuration }`) sets how
long one flip takes. To change speed while running, set `timeScale` on a
board, field or unit. It multiplies the `dt` passed to `update()`, so flips,
stagger delays and playlist holds all scale together:

```ts
board.timeScale = 2; // twice as fast
board.field(0, 'dest').timeScale = 0.5; // this field at half of that
board.timeScale = 0; // pause
```

Scales compound down the tree (board × field × unit). Negative or non-finite
values throw.

## Custom renderers

Read `unit.state` (`{ current, next, progress, direction }`) every frame.
`flipGeometry()`, `createFlipCurve()` and `layout()` (exported from `/canvas`
and `/pixi`) do the maths for you.

## Development

```bash
bun install
bun run test
bun run typecheck
bun run build
bun run dev   # examples app
```

## Releasing

Releases are published from GitHub Actions: run the **Release** workflow on `main` (or a `version/*` branch for a patch to an older line).

- **Version bump:** `auto` reads the conventional commits since the last `v*` tag (`bun scripts/next-version.ts`); `patch`, `minor` and `major` force one.
- **Dry run:** bumps and packs in the runner, then stops without publishing or pushing. It can run on any branch.
- A release commits `chore(release): split-flap x.y.z`, tags `vx.y.z`, publishes to npm with provenance, opens a GitHub release, and, from `main`, creates a `version/x.y.z` branch.

npm trusts the workflow through trusted publishing, so no npm token is stored.
