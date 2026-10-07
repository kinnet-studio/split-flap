# React and Vue adapters — Design

**Date:** 2026-10-07
**Status:** Approved; revised after the pre-PR review (see "Revisions after review")
**Package:** `@kinnet-studio/split-flap`, new entry points `/react`, `/react-pixi`, `/vue`, `/vue-pixi`
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
- Dev dependencies: `react`, `react-dom`, `@types/react`, `@testing-library/react`,
  `@testing-library/dom` (its peer), `vue`, `@vue/test-utils`, `jsdom`.
- `scripts/build.ts`: four new entry points; `external` adds `react`, `react-dom`, `vue`.
  `scripts/check-dist.ts` imports each and asserts the expected exports are functions/objects,
  and follows relative imports from `dist/react` and `dist/vue` to fail if `pixi.js` is
  reachable (checking that the scan does find it from the `*-pixi` entries).
- Import boundaries: `src/react/**` and `src/vue/**` import only `src/core`, `src/canvas`,
  `src/render`; `src/react-pixi/**` and `src/vue-pixi/**` may also import `src/pixi`.

## Shared behaviour

### Content comparison

`value`, `flapStyle` and `cell`/`gap` are compared by content, not identity, so inline literals
don't cause work on every render: `contentKey(x) = JSON.stringify(x)`; if that throws (cycles,
`BigInt`), identity is used. Lives in `src/render/content-key.ts` (pure). It is lossy, and this
is documented: values that serialize the same are equal (class instances whose data lives in
getters serialize as `{}`), and values JSON can't hold are compared by identity.

### Creation-time options

`flipCurve`, `dpr`, `createCanvas`, `scheduler` (component) and `resolution`, `flipCurve`,
`createCanvas` (Pixi hook) are read once, when the renderer or view is created. Inline functions
are therefore safe: they can neither loop nor rebuild. To change one, remount with a new `key`.

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
| `flipCurve` | `FlipCurve` | read at creation only |
| `fit` | `'width' \| 'contain' \| undefined` | recreate renderer |
| `drive` | `boolean`, default `true` | recreate renderer |
| `dpr`, `createCanvas`, `scheduler` | renderer options (advanced/tests) | read at creation only |

- Renders `<div class="…" style="…"><canvas style="display: block" /></div>`. The wrapper is
  `display: block` (full width by default) and is the `fit` element. The canvas is a block too,
  so there is no descender gap under it and `fit="contain"` doesn't creep. React: `className` / `style` go to the
  wrapper. Vue: `class` / `style` attributes fall through to the wrapper.
- Mount: `new CanvasFlapRenderer({ canvas, target, face, cell, gap, style: flapStyle, flipCurve,
  dpr, createCanvas, scheduler, fit: fit ? { element: wrapper, mode: fit } : undefined })`, then
  `start({ update: drive })`. Unmount: `destroy()`.
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

- When `app` is available: creates `new PixiFlapView(options)`, `app.stage.addChild(view)`,
  `view.attach(app.ticker, { update: drive })` (`drive` defaults to `true`; `false` only syncs
  each tick).
- `cell`/`gap` → `view.setLayout`, `flapStyle` → `view.setStyle`, `face` → `view.setFace`
  (same comparisons as the component); `app`, `target` and `drive` changes recreate the view;
  `resolution`, `flipCurve`, `createCanvas` are read at creation only.
- Cleanup: `view.removeFromParent()`, `view.destroy()` (which detaches). This must not touch
  `app`, because the app may have been destroyed first; `PixiFlapView.detach` tolerates a
  destroyed ticker.
- React: in the render where `app`/`target`/`drive` changes, the hook still returns the old view,
  which the same commit destroys. Documented: effects using the view check `view.destroyed`.
- React: `app` is `Application | null`; returns the view or `null`. Vue: `app` is an
  `Application`, a `Ref<Application | null>` or a getter; options may be reactive; returns a
  `ShallowRef<PixiFlapView | null>`; cleanup on `onScopeDispose`.

## React specifics (`/react`, `/react-pixi`)

- `useFlapBoard` uses a lazy `useState` initializer for the board and a `useEffect` keyed by
  `contentKey(value)` for `show`.
- `SplitFlapCanvas` is a function component built with `createElement('div', …,
  createElement('canvas', { ref, style }))`; one `useEffect` creates/destroys the renderer (deps:
  `target`, `fit`, `drive`; other props are read from that render's closure, never from a ref
  written during render), and separate effects apply `setLayout` / `setStyle` / `setFace` keyed
  by content keys / identity, skipping work that matches what creation applied.
- `usePixiFlapView` follows the same pattern (deps: `app`, `target`, `drive`).
- Strict-mode safe: effects clean up (destroy) and recreate.

## Vue specifics (`/vue`, `/vue-pixi`)

- `useFlapBoard` returns a `markRaw` board; `value` may be an array, `Ref` or getter, watched
  through its content key (serializing reads every nested value, so deep changes are tracked).
- `SplitFlapCanvas = defineComponent({ props, setup })` rendering with `h()`; the renderer is
  created in `onMounted`, destroyed in `onBeforeUnmount`.
- Both `SplitFlapCanvas` and `usePixiFlapView` use a single watcher over the recreating inputs
  plus the layout/style content keys and the face. It compares them with what the renderer or
  view was created with: a recreating input changed → recreate with all current props; otherwise
  → the setters that are needed. Separate watchers would run in the order the props changed, so
  a new face map could reach the old target (and throw) before the new target arrived.
- `usePixiFlapView`'s watcher is immediate, so the view is created as soon as the app exists.
- Documented: hold the app in a `shallowRef` (a deep `ref` proxies the `Application`), and create
  identity-compared options (`face`, `target`) outside the options getter.

## Error handling

- Errors from the renderers (missing face painter, bad style) propagate from the effect / watcher
  (React reports them through the error boundary; Vue through `app.config.errorHandler`).
- `fit` requires `ResizeObserver` (as in the renderer).

## Testing (Vitest, `// @vitest-environment jsdom` per adapter test file)

- Helpers: stub `HTMLCanvasElement.prototype.getContext` to return `FakeContext`; components get a
  fake `scheduler` and `createCanvas: fakeCanvasFactory`; `ResizeObserver` stubbed for `fit`.
  A Vitest setup file returns `null` from jsdom's `getContext` before any import, so Pixi's WebGL
  probe at load doesn't print "Not implemented".
- React (`@testing-library/react`): mount/unmount create/destroy; `value` change shows, equal
  inline array doesn't; `cell`/`gap` → setLayout; `flapStyle` → setStyle (content); `face` →
  setFace; `target`/`fit`/`drive` recreate; `drive: false` renders without updating;
  `usePixiFlapView` adds to stage, attaches ticker / mirrors, setters, cleanup.
- Regression tests (both frameworks): cleanup after the app was destroyed first; inline function
  options neither loop nor recreate; `app` null → set → null; a removed `gap` resets;
  the canvas is `display: block`; StrictMode keeps one live view (React); a new target and its
  face map changing together, in either order, don't throw (Vue).
- Vue (`@vue/test-utils`): the same, plus `value` as ref/getter/deep mutation and an app ref that
  starts `null`.
- `contentKey`: equal content → equal key; cycles fall back to identity.
- Entry points: export tests for the four new entries; `check-dist` imports them.

## Demos and docs

- `examples/react.html` + `examples/react.ts` and `examples/vue.html` + `examples/vue.ts`: a
  departures board via the adapters (button changes `value`; theme select changes `face` /
  `flapStyle`; `fit`), linked from the main examples page; Vite builds all pages.
- README: React and Vue sections.

## Revisions after review

An independent review before the PR found these, now fixed and covered by tests:

1. Cleanup after `app.destroy()` threw (`app.stage` is `null`, and removing a listener from a
   destroyed ticker throws). Cleanup now uses `removeFromParent()`; `detach` tolerates a
   destroyed ticker; `attach(ticker, { update })` replaces the hooks' own mirror listener.
2. An inline `flipCurve` / `createCanvas` in the React Pixi hook recreated the view on every
   render, and `setView` made that an infinite loop. Ruling: those options (and `dpr`,
   `resolution`, `scheduler`) are creation-time only, in both frameworks.
3. Vue watchers ran in prop-change order, so a face map could reach the old target. Ruling: one
   watcher decides between recreating and the setters.
4. Smaller: no ref written during render; canvas `display: block`; the `check-dist` guard for
   `pixi.js`; README notes (creation-time options, `view.destroyed`, `shallowRef` app, stable
   identities in getters, lossy `contentKey`); `@testing-library/dom` dev dependency; tsconfig
   paths and Vite aliases for the `*-pixi` entries; jsdom canvas noise silenced.
