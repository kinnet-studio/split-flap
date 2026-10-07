# React and Vue adapters — Design

**Date:** 2026-10-07
**Status:** Approved in brainstorming; awaiting written-spec review
**Package:** `@kinnet-studio/split-flaps`, new entry points `/react`, `/react-pixi`, `/vue`, `/vue-pixi`
**Depends on:** `setStyle` / `setFace` on both renderers (PR #6)

## Summary

Framework adapters that own the board and renderer lifecycles for web apps:

- `useFlapBoard(options)` — creates one stable `FlapBoard`, and shows `value` whenever its content
  changes (declarative), while the returned board keeps its imperative API.
- `SplitFlapCanvas` — a component that renders any target into its own `<canvas>` with
  `CanvasFlapRenderer`, mapping prop changes to `setLayout` / `setStyle` / `setFace`, with
  optional `fit`.
- `usePixiFlapView(app, options)` — adds a `PixiFlapView` to an existing Pixi `Application`.

Pixi hooks live in separate `*-pixi` entry points so that importing `/react` or `/vue` never loads
`pixi.js`.

## Non-goals

- Changing a board's `rows` / `schema` / `stagger` after creation (remount with a new `key`).
- A component that creates and owns a Pixi `Application`.
- JSX or `.vue` single-file components in the source (React uses `createElement`, Vue uses `h()`).
- SSR rendering of the canvas (components render the wrapper markup; the renderer is created on
  mount only).

## Packaging

- Exports: `./react`, `./react-pixi`, `./vue`, `./vue-pixi` → `dist/<name>/index.{js,d.ts}`.
- Peer dependencies: `react >=18`, `vue ^3.3`, both optional (like `pixi.js`).
- Dev dependencies: `react`, `react-dom`, `@types/react`, `@testing-library/react`, `vue`,
  `@vue/test-utils`, `jsdom`.
- `scripts/build.ts`: four new entry points; `external` adds `react`, `react-dom`, `vue`.
  `scripts/check-dist.ts` imports each and asserts the expected exports are functions/objects.
- Import boundaries: `src/react/**` and `src/vue/**` import only `src/core`, `src/canvas`,
  `src/render`; `src/react-pixi/**` and `src/vue-pixi/**` may also import `src/pixi`.

## Shared behaviour

### Content comparison

`value` and `flapStyle` are compared by content, not identity, so inline literals don't cause
work on every render: `contentKey(x) = JSON.stringify(x)`; if that throws (cycles), identity is
used. Lives in `src/render/content-key.ts` (pure).

### useFlapBoard

```ts
type FlapBoardInit<S extends Schema> = BoardOptions<S> & { value?: readonly RowValues<S>[] };
```

- Creates the board once (first render / setup) from `rows`, `schema`, `stagger`; later changes
  to those are ignored.
- When `value` is provided, `board.show(value)` runs on creation and whenever `contentKey(value)`
  changes. `undefined` means "don't touch the board".

### SplitFlapCanvas

Props (both frameworks; Vue uses kebab-case attributes in templates):

| Prop | Type | Behaviour on change |
| --- | --- | --- |
| `target` | `RenderTarget` | recreate renderer |
| `face` | `FacePainter \| Record<string, FacePainter>` | `setFace` (identity) |
| `cell` | `{ w, h }` | `setLayout` (content) |
| `gap` | `{ unit?, field?, row? }` | `setLayout` (content) |
| `flapStyle` | `FlapStyle` | `setStyle` (content) |
| `flipCurve` | `FlipCurve` | recreate renderer |
| `fit` | `'width' \| 'contain' \| undefined` | recreate renderer |
| `drive` | `boolean`, default `true` | recreate renderer |
| `dpr`, `createCanvas`, `scheduler` | renderer options (advanced/tests) | recreate renderer |

- Renders `<div class="…" style="…"><canvas /></div>`. The wrapper is `display: block`
  (full width by default) and is the `fit` element. React: `className` / `style` go to the
  wrapper. Vue: `class` / `style` attributes fall through to the wrapper.
- Mount: `new CanvasFlapRenderer({ canvas, target, face, cell, gap, style: flapStyle, flipCurve,
  dpr, createCanvas, scheduler, fit: fit ? { element: wrapper, mode: fit } : undefined })`, then
  `start()` when `drive` is true. Unmount: `destroy()`.
- When `drive` is false the component only renders when its parent re-renders or props change; the
  board must be advanced and rendered by something else (e.g. another renderer's loop calling
  `update`). In that mode the component also calls `renderer.render()` on a rAF loop *without*
  calling `update` — so it mirrors the board. (`drive: true` = update + render; `false` = render
  only.)
- `face` is compared by identity, so painters should be created outside the component or memoized
  (`useMemo` / module scope); documented.

### usePixiFlapView

```ts
type PixiViewInit = PixiFlapViewOptions & { drive?: boolean };
usePixiFlapView(app, options): PixiFlapView | null
```

- When `app` is available: creates `new PixiFlapView(options)`, `app.stage.addChild(view)`; if
  `drive` (default `true`) `view.attach(app.ticker)`, else `app.ticker.add(sync)` where sync calls
  `view.sync()`.
- `cell`/`gap` → `view.setLayout`, `flapStyle` → `view.setStyle`, `face` → `view.setFace`
  (same comparisons as the component); `target`, `drive`, `resolution`, `flipCurve` changes
  recreate the view.
- Cleanup: detach / remove the ticker listener, `app.stage.removeChild(view)`, `view.destroy()`.
- React: `app` is `Application | null`; returns the view or `null`. Vue: `app` is an
  `Application`, a `Ref<Application | null>` or a getter; options may be reactive; returns a
  `ShallowRef<PixiFlapView | null>`; cleanup on `onScopeDispose`.

## React specifics (`/react`, `/react-pixi`)

- `useFlapBoard` uses a lazy `useState` initializer for the board and a `useEffect` keyed by
  `contentKey(value)` for `show`.
- `SplitFlapCanvas` is a function component built with `createElement('div', …,
  createElement('canvas', { ref }))`; one `useEffect` creates/destroys the renderer (deps:
  target, fit, drive, flipCurve, dpr, createCanvas, scheduler), and separate effects apply
  `setLayout` / `setStyle` / `setFace` keyed by content keys / identity, skipping the first run
  after creation.
- Strict-mode safe: effects clean up (destroy) and recreate.

## Vue specifics (`/vue`, `/vue-pixi`)

- `useFlapBoard` returns a `markRaw` board; `value` may be an array, `Ref` or getter, watched with
  `{ deep: true }` plus the content key.
- `SplitFlapCanvas = defineComponent({ props, setup })` rendering with `h()`; the renderer is
  created in `onMounted`, destroyed in `onBeforeUnmount`; `watch` on the props maps to the setters
  or to recreation as in the table.
- `usePixiFlapView` uses `watch` on `app` (immediate) to create the view once the app exists.

## Error handling

- Errors from the renderers (missing face painter, bad style) propagate from the effect / watcher
  (React reports them through the error boundary; Vue through `app.config.errorHandler`).
- `fit` requires `ResizeObserver` (as in the renderer).

## Testing (Vitest, `// @vitest-environment jsdom` per adapter test file)

- Helpers: stub `HTMLCanvasElement.prototype.getContext` to return `FakeContext`; components get a
  fake `scheduler` and `createCanvas: fakeCanvasFactory`; `ResizeObserver` stubbed for `fit`.
- React (`@testing-library/react`): mount/unmount create/destroy; `value` change shows, equal
  inline array doesn't; `cell`/`gap` → setLayout; `flapStyle` → setStyle (content); `face` →
  setFace; `target`/`fit`/`drive` recreate; `drive: false` renders without updating;
  `usePixiFlapView` adds to stage, attaches ticker / mirrors, setters, cleanup.
- Vue (`@vue/test-utils`): the same, plus `value` as ref/getter/deep mutation and an app ref that
  starts `null`.
- `contentKey`: equal content → equal key; cycles fall back to identity.
- Entry points: export tests for the four new entries; `check-dist` imports them.

## Demos and docs

- `examples/react.html` + `examples/react.ts` and `examples/vue.html` + `examples/vue.ts`: a
  departures board via the adapters (button changes `value`; theme select changes `face` /
  `flapStyle`; `fit`), linked from the main examples page; Vite builds all pages.
- README: React and Vue sections.
