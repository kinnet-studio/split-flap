# @kinnet-studio/split-flaps

A split-flap display engine for the web. The core handles the drums, the timing,
idle spinning and message playlists, and works with any renderer. Canvas 2D and
Pixi v8 renderers are included.

## Install

```bash
bun add @kinnet-studio/split-flaps
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
let a renderer's loop do it.

## Quick start (Canvas 2D)

```ts
import {
    CHARSETS,
    defineField,
    FlapBoard,
    FlapSequence,
    textField,
} from '@kinnet-studio/split-flaps';
import {
    CanvasFlapRenderer,
    textFace,
} from '@kinnet-studio/split-flaps/canvas';

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
import { PixiFlapView } from '@kinnet-studio/split-flaps/pixi';

const view = new PixiFlapView({ target: board, face, cell, gap });
app.stage.addChild(view);
view.attach(app.ticker); // or call view.update(dt) yourself
```

`/pixi` imports `pixi.js`, so install `pixi.js@^8` before importing it; the core
and `/canvas` entry points never load Pixi.

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
