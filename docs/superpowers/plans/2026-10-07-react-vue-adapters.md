# React and Vue Adapters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add four new entry points:
- `/react`: `useFlapBoard` and `SplitFlapCanvas`
- `/react-pixi`: `usePixiFlapView`
- `/vue`: `useFlapBoard` and `SplitFlapCanvas`
- `/vue-pixi`: `usePixiFlapView`

They own the board and renderer lifecycles, mapping prop changes to `setLayout`, `setStyle` and `setFace`.

**Architecture:**
- Two small building blocks come first: `CanvasFlapRenderer.start({ update: false })` (a render-only loop for `drive: false`) and a shared `contentKey` for comparing values by content.
- The React side uses `createElement` and the Vue side uses `defineComponent` with `h()`, so there's no JSX or `.vue` compilation.
- The Pixi hooks live in their own `*-pixi` entry points, so `/react` and `/vue` never load `pixi.js`.

**Tech Stack:** React 19, Vue 3.5, `@testing-library/react`, `@vue/test-utils`, and jsdom (`// @vitest-environment jsdom` per adapter test file). Otherwise as before: Bun 1.3, TypeScript 5.9 and Vitest 5.

**Spec:** `docs/superpowers/specs/2026-10-07-react-vue-adapters-design.md`

## Global Constraints

- Work in `/Users/vincent.yy.chang/dev/split-flop/main` on branch `feat/adapters`, which is stacked on `feat/restyle` (PR #6). It is already checked out and holds the spec commit.
- Import boundaries:
  - `src/react/**` and `src/vue/**` import only `src/core`, `src/canvas` and `src/render`.
  - `src/react-pixi/**` and `src/vue-pixi/**` may also import `src/pixi`.
  - The built `/react` and `/vue` must not reach `pixi.js` through any chunk.
- Peer dependencies: `react >=18` and `vue ^3.3`, both optional, like `pixi.js`. The build keeps `react`, `react-dom` and `vue` external.
- Comparisons: `cell`, `gap`, `flapStyle` and `value` use `contentKey` (`JSON.stringify`, falling back to identity); `face` is compared by identity. Changes to `target`, `fit`, `drive`, `flipCurve`, `dpr`, `createCanvas` or `scheduler` recreate the renderer.
- Relative imports in `src/` use `.js` extensions; tests stay extensionless. Prettier settings are as in the repo. One commit per task, ending with your harness's `Co-Authored-By:` line.

---

### Task 1: Dev dependencies, render-only loop, contentKey and test helpers

**Files:**
- Modify: `package.json` and `bun.lock` (dev dependencies), `src/canvas/renderer.ts`
- Create: `src/render/content-key.ts`, `test/helpers/fake-scheduler.ts`, `test/helpers/dom-canvas.ts`
- Test: `test/render/content-key.test.ts`, `test/canvas/renderer-mirror.test.ts`

**Interfaces:**
- Produces:
  - `CanvasFlapRenderer.start(options?: { update?: boolean })`
  - `contentKey(value): unknown`
  - Test helpers: `fakeScheduler()`, `stubCanvasContext()` and `FakeResizeObserver`

- [ ] **Install the adapter dev dependencies:** `bun add -d react@^19.3.0 react-dom@^19.3.0 @types/react@^19.3.0 @types/react-dom@^19.3.0 @testing-library/react@^16.3.3 vue@^3.5.43 @vue/test-utils@^2.5.1 jsdom@^30.1.2`
- [ ] **Write the failing tests.** Create `test/helpers/fake-scheduler.ts`:
```ts
import type { FrameScheduler } from '../../src/canvas/renderer';

/** A frame scheduler driven by hand: `tick(time)` runs the pending frames. */
export function fakeScheduler() {
    const callbacks = new Map<number, (time: number) => void>();
    const cancelled: number[] = [];
    let nextId = 1;
    const scheduler: FrameScheduler = {
        request: callback => {
            const id = nextId++;
            callbacks.set(id, callback);
            return id;
        },
        cancel: id => {
            cancelled.push(id);
            callbacks.delete(id);
        },
    };
    const tick = (time: number) => {
        const pending = [...callbacks.values()];
        callbacks.clear();
        pending.forEach(callback => callback(time));
    };
    return { scheduler, callbacks, cancelled, tick };
}
```
Then `test/render/content-key.test.ts`:
```ts
import { describe, expect, it } from 'vitest';

import { contentKey } from '../../src/render/content-key';

describe('contentKey', () => {
    it('is equal for equal content', () => {
        expect(contentKey([{ a: 1 }, 'b'])).toBe(contentKey([{ a: 1 }, 'b']));
        expect(contentKey({ a: 1 })).not.toBe(contentKey({ a: 2 }));
        expect(contentKey(undefined)).toBe(contentKey(undefined));
    });

    it('falls back to identity for values JSON cannot serialize', () => {
        const cyclic: Record<string, unknown> = {};
        cyclic.self = cyclic;
        expect(contentKey(cyclic)).toBe(cyclic);
    });
});
```
Then `test/canvas/renderer-mirror.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest';

import { CanvasFlapRenderer } from '../../src/canvas/renderer';
import { FlapSequence } from '../../src/core/sequence';
import { FlapUnit } from '../../src/core/unit';
import { textFace } from '../../src/render/faces';
import {
    asCanvasElement,
    FakeCanvas,
    fakeCanvasFactory,
} from '../helpers/fake-canvas';
import { fakeScheduler } from '../helpers/fake-scheduler';

describe('CanvasFlapRenderer.start({ update: false })', () => {
    it('renders every frame without advancing the target', () => {
        const unit = new FlapUnit({ sequence: FlapSequence.chars(' A') });
        const update = vi.spyOn(unit, 'update');
        const frames = fakeScheduler();
        const renderer = new CanvasFlapRenderer({
            canvas: asCanvasElement(new FakeCanvas()),
            target: unit,
            face: textFace({ font: '20px sans-serif' }),
            cell: { w: 40, h: 60 },
            dpr: 1,
            createCanvas: fakeCanvasFactory,
            scheduler: frames.scheduler,
        });
        const render = vi.spyOn(renderer, 'render');
        renderer.start({ update: false });
        frames.tick(1000);
        frames.tick(1016);
        expect(update).not.toHaveBeenCalled();
        expect(render).toHaveBeenCalledTimes(2);
    });
});
```
- [ ] **Run them and see them fail.** Run: `bunx vitest run test/render/content-key.test.ts test/canvas/renderer-mirror.test.ts`. Expected: FAIL. The content-key module is missing, and the target is updated because `start` ignores `update: false`.
- [ ] **Implement.** Create `src/render/content-key.ts`:
```ts
/**
 * A key for comparing props by content rather than identity, so inline
 * literals don't count as changes: the JSON text when the value serializes,
 * otherwise the value itself (compared by identity).
 */
export function contentKey(value: unknown): unknown {
    try {
        return JSON.stringify(value);
    } catch {
        return value;
    }
}
```
Then update `src/canvas/renderer.ts`:
```diff
--- a/src/canvas/renderer.ts
+++ b/src/canvas/renderer.ts
@@ -197,8 +197,13 @@ export class CanvasFlapRenderer {
         });
     }
 
-    /** Runs a frame loop: update the target by the frame delta, then render. */
-    start(): void {
+    /**
+     * Runs a frame loop: update the target by the frame delta, then render.
+     * With `update: false` it only renders, mirroring a target that something
+     * else advances (e.g. another renderer's loop).
+     */
+    start(options: { update?: boolean } = {}): void {
+        const update = options.update ?? true;
         if (this.destroyed || this.frame !== null) {
             return;
         }
@@ -206,7 +211,7 @@ export class CanvasFlapRenderer {
             // This frame has fired; a throw below must not leave a stale id.
             this.frame = null;
             try {
-                if (this.lastTime !== null) {
+                if (update && this.lastTime !== null) {
                     const dt = Math.min(MAX_FRAME_DT, time - this.lastTime);
                     if (dt > 0) {
                         this.target.update(dt);
```
Finally create the jsdom helper `test/helpers/dom-canvas.ts`, used by Tasks 2–5:
```ts
import { vi } from 'vitest';

import { FakeContext } from './fake-canvas';

/**
 * In jsdom, makes every `<canvas>` return a recording FakeContext (one per
 * canvas). Returns a lookup from canvas to its context.
 */
export function stubCanvasContext(): (
    canvas: HTMLCanvasElement
) => FakeContext {
    const contexts = new WeakMap<HTMLCanvasElement, FakeContext>();
    const contextOf = (canvas: HTMLCanvasElement): FakeContext => {
        let context = contexts.get(canvas);
        if (!context) {
            context = new FakeContext();
            contexts.set(canvas, context);
        }
        return context;
    };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
        function (this: HTMLCanvasElement) {
            return contextOf(this) as unknown as CanvasRenderingContext2D;
        } as unknown as typeof HTMLCanvasElement.prototype.getContext
    );
    return contextOf;
}

/** A ResizeObserver stand-in whose `resize()` fires the callback by hand. */
export class FakeResizeObserver {
    static instances: FakeResizeObserver[] = [];
    observed: unknown[] = [];
    disconnected = false;

    constructor(
        readonly callback: (
            entries: { contentRect: { width: number; height: number } }[]
        ) => void
    ) {
        FakeResizeObserver.instances.push(this);
    }

    observe(element: unknown): void {
        this.observed.push(element);
    }

    disconnect(): void {
        this.disconnected = true;
    }

    resize(width: number, height: number): void {
        this.callback([{ contentRect: { width, height } }]);
    }
}
```
- [ ] **Verify.** Run: `bun run test && bun run typecheck`. Expected: all pass.
- [ ] **Commit.** Run `bunx prettier --write` on the touched files, then `git add -A && git commit` with the message `feat(canvas): render-only frame loop; contentKey; adapter test helpers` followed by your attribution trailer.

---

### Task 2: React adapter

**Files:**
- Create: `src/react/use-flap-board.ts`, `src/react/split-flap-canvas.ts`, `src/react/index.ts`
- Test: `test/react/use-flap-board.test.ts`, `test/react/split-flap-canvas.test.ts`

**Interfaces:**
- Consumes: from the core, `FlapBoard`, `BoardOptions`, `RowValues` and `Schema`; `CanvasFlapRenderer` (with `start({ update })`, `setLayout`, `setStyle` and `setFace`); `contentKey`.
- Produces:
  - `useFlapBoard(options: UseFlapBoardOptions<S>): FlapBoard<S>`
  - `SplitFlapCanvas(props: SplitFlapCanvasProps): ReactElement`

- [ ] **Write the failing tests.** Create `test/react/use-flap-board.test.ts`:
```ts
// @vitest-environment jsdom
import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FlapBoard, type RowValues } from '../../src/core/board';
import { textField } from '../../src/core/field';
import { CHARSETS, FlapSequence } from '../../src/core/sequence';
import { useFlapBoard } from '../../src/react';

const schema = {
    text: textField({
        sequence: FlapSequence.chars(CHARSETS.alphanumeric),
        length: 1,
    }),
};
type Rows = RowValues<typeof schema>[];

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

describe('useFlapBoard (React)', () => {
    it('returns one stable board', () => {
        const { result, rerender } = renderHook(() =>
            useFlapBoard({ rows: 1, schema })
        );
        const first = result.current;
        rerender();
        expect(result.current).toBe(first);
        expect(first).toBeInstanceOf(FlapBoard);
    });

    it('shows value on mount and when its content changes', () => {
        const show = vi.spyOn(FlapBoard.prototype, 'show');
        const { result, rerender } = renderHook(
            ({ value }: { value: Rows }) =>
                useFlapBoard({ rows: 1, schema, value }),
            { initialProps: { value: [{ text: 'A' }] } }
        );
        expect(show).toHaveBeenCalledTimes(1);
        rerender({ value: [{ text: 'A' }] });
        expect(show).toHaveBeenCalledTimes(1);
        rerender({ value: [{ text: 'B' }] });
        expect(show).toHaveBeenCalledTimes(2);
        expect(result.current.field(0, 'text').units[0].target).toBe('B');
    });

    it('leaves the board alone without a value', () => {
        const show = vi.spyOn(FlapBoard.prototype, 'show');
        renderHook(() => useFlapBoard({ rows: 1, schema }));
        expect(show).not.toHaveBeenCalled();
    });
});
```
Then `test/react/split-flap-canvas.test.ts`:
```ts
// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { createElement, StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CanvasFlapRenderer } from '../../src/canvas/renderer';
import { FlapField, textField } from '../../src/core/field';
import { CHARSETS, FlapSequence } from '../../src/core/sequence';
import { SplitFlapCanvas, type SplitFlapCanvasProps } from '../../src/react';
import { textFace } from '../../src/render/faces';
import { FakeResizeObserver, stubCanvasContext } from '../helpers/dom-canvas';
import { fakeCanvasFactory } from '../helpers/fake-canvas';
import { fakeScheduler } from '../helpers/fake-scheduler';

const alnum = FlapSequence.chars(CHARSETS.alphanumeric);
const painter = textFace({ font: '20px sans-serif' });

let contextOf: ReturnType<typeof stubCanvasContext>;
let frames: ReturnType<typeof fakeScheduler>;
let target: FlapField<string, string>;

beforeEach(() => {
    contextOf = stubCanvasContext();
    frames = fakeScheduler();
    target = new FlapField(textField({ sequence: alnum, length: 2 }));
});

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    FakeResizeObserver.instances = [];
});

/** Props for a 2-unit, 40 × 60 field at dpr 1 with a hand-driven loop. */
function props(
    extra: Partial<SplitFlapCanvasProps> = {}
): SplitFlapCanvasProps {
    return {
        target,
        face: painter,
        cell: { w: 40, h: 60 },
        dpr: 1,
        createCanvas: fakeCanvasFactory,
        scheduler: frames.scheduler,
        ...extra,
    };
}

const canvasOf = (container: HTMLElement) =>
    container.querySelector('canvas') as HTMLCanvasElement;

describe('SplitFlapCanvas (React)', () => {
    it('draws the target into its canvas and starts the loop', () => {
        const { container } = render(createElement(SplitFlapCanvas, props()));
        const canvas = canvasOf(container);
        expect(canvas.width).toBe(80);
        expect(
            contextOf(canvas).callsNamed('drawImage').length
        ).toBeGreaterThan(0);
        expect(frames.callbacks.size).toBe(1);
    });

    it('destroys the renderer on unmount', () => {
        const destroy = vi.spyOn(CanvasFlapRenderer.prototype, 'destroy');
        const { unmount } = render(createElement(SplitFlapCanvas, props()));
        unmount();
        expect(destroy).toHaveBeenCalledTimes(1);
        expect(frames.callbacks.size).toBe(0);
    });

    it('keeps exactly one live renderer under StrictMode', () => {
        render(
            createElement(
                StrictMode,
                null,
                createElement(SplitFlapCanvas, props())
            )
        );
        expect(frames.callbacks.size).toBe(1);
    });

    it('applies cell and gap changes with setLayout, by content', () => {
        const setLayout = vi.spyOn(CanvasFlapRenderer.prototype, 'setLayout');
        const { container, rerender } = render(
            createElement(SplitFlapCanvas, props())
        );
        rerender(
            createElement(SplitFlapCanvas, props({ cell: { w: 40, h: 60 } }))
        );
        expect(setLayout).not.toHaveBeenCalled();
        rerender(
            createElement(SplitFlapCanvas, props({ cell: { w: 20, h: 30 } }))
        );
        expect(setLayout).toHaveBeenCalledTimes(1);
        expect(canvasOf(container).width).toBe(40);
    });

    it('applies flapStyle changes with setStyle, by content', () => {
        const setStyle = vi.spyOn(CanvasFlapRenderer.prototype, 'setStyle');
        const { rerender } = render(
            createElement(
                SplitFlapCanvas,
                props({ flapStyle: { finish: 'matte' } })
            )
        );
        rerender(
            createElement(
                SplitFlapCanvas,
                props({ flapStyle: { finish: 'matte' } })
            )
        );
        expect(setStyle).not.toHaveBeenCalled();
        rerender(
            createElement(
                SplitFlapCanvas,
                props({ flapStyle: { finish: 'satin' } })
            )
        );
        expect(setStyle).toHaveBeenCalledWith({ finish: 'satin' });
    });

    it('applies face changes with setFace, by identity', () => {
        const setFace = vi.spyOn(CanvasFlapRenderer.prototype, 'setFace');
        const { rerender } = render(createElement(SplitFlapCanvas, props()));
        rerender(createElement(SplitFlapCanvas, props()));
        expect(setFace).not.toHaveBeenCalled();
        const next = textFace({ font: '20px sans-serif', theme: 'cream' });
        rerender(createElement(SplitFlapCanvas, props({ face: next })));
        expect(setFace).toHaveBeenCalledWith(next);
    });

    it('recreates the renderer for a new target', () => {
        const destroy = vi.spyOn(CanvasFlapRenderer.prototype, 'destroy');
        const { container, rerender } = render(
            createElement(SplitFlapCanvas, props())
        );
        const other = new FlapField(textField({ sequence: alnum, length: 3 }));
        rerender(createElement(SplitFlapCanvas, props({ target: other })));
        expect(destroy).toHaveBeenCalledTimes(1);
        expect(canvasOf(container).width).toBe(120);
    });

    it('only renders, without advancing the target, when drive is false', () => {
        const start = vi.spyOn(CanvasFlapRenderer.prototype, 'start');
        render(createElement(SplitFlapCanvas, props({ drive: false })));
        expect(start).toHaveBeenCalledWith({ update: false });
    });

    it('fits the canvas to its wrapper', () => {
        vi.stubGlobal('ResizeObserver', FakeResizeObserver);
        const { container } = render(
            createElement(SplitFlapCanvas, props({ fit: 'width' }))
        );
        const [observer] = FakeResizeObserver.instances;
        expect(observer.observed).toEqual([container.firstChild]);
        observer.resize(160, 0);
        expect(canvasOf(container).style.width).toBe('160px');
    });

    it('passes className and style to the wrapper', () => {
        const { container } = render(
            createElement(
                SplitFlapCanvas,
                props({ className: 'board', style: { maxWidth: '720px' } })
            )
        );
        const wrapper = container.firstChild as HTMLDivElement;
        expect(wrapper.className).toBe('board');
        expect(wrapper.style.maxWidth).toBe('720px');
        expect(wrapper.style.display).toBe('block');
    });
});
```
- [ ] **Run them and see them fail.** Run: `bunx vitest run test/react`. Expected: FAIL, cannot resolve `../../src/react`.
- [ ] **Implement.** Create `src/react/use-flap-board.ts`:
```ts
import { useEffect, useState } from 'react';

import {
    type BoardOptions,
    FlapBoard,
    type RowValues,
    type Schema,
} from '../core/board.js';
import { contentKey } from '../render/content-key.js';

export interface UseFlapBoardOptions<S extends Schema> extends BoardOptions<S> {
    /** Shown with `board.show()` on creation and whenever its content changes. */
    value?: readonly RowValues<S>[];
}

/**
 * Creates one stable FlapBoard. `rows`, `schema` and `stagger` are read only
 * on the first render (remount with a new `key` to change them). `value` is
 * compared by content, so an inline array with the same rows does nothing.
 */
export function useFlapBoard<S extends Schema>(
    options: UseFlapBoardOptions<S>
): FlapBoard<S> {
    const [board] = useState(
        () =>
            new FlapBoard<S>({
                rows: options.rows,
                schema: options.schema,
                stagger: options.stagger,
            })
    );
    const { value } = options;
    const valueKey = value === undefined ? undefined : contentKey(value);
    useEffect(() => {
        if (value !== undefined) {
            board.show(value);
        }
        // Keyed by content: a new array with the same rows is not a change.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [board, valueKey]);
    return board;
}
```
Then `src/react/split-flap-canvas.ts`:
```ts
import {
    createElement,
    type CSSProperties,
    type ReactElement,
    useEffect,
    useRef,
} from 'react';

import {
    CanvasFlapRenderer,
    type CanvasFlapRendererOptions,
    type FrameScheduler,
} from '../canvas/renderer.js';
import { contentKey } from '../render/content-key.js';
import type { CanvasFactory } from '../render/face-cache.js';
import type { FitMode } from '../render/fit.js';
import type { FlipCurve } from '../render/flip-curve.js';
import type { LayoutOptions, RenderTarget } from '../render/layout.js';
import type { FlapStyle } from '../render/style.js';

export interface SplitFlapCanvasProps {
    target: RenderTarget;
    /** Keep painters stable (module scope or useMemo): compared by identity. */
    face: CanvasFlapRendererOptions['face'];
    cell: LayoutOptions['cell'];
    gap?: LayoutOptions['gap'];
    /** The flap style (finish, stack, radius, ...). Compared by content. */
    flapStyle?: FlapStyle;
    flipCurve?: FlipCurve;
    /** Fit the canvas to the wrapper `<div>`. */
    fit?: FitMode;
    /** Advance the target each frame (default). `false` only renders it. */
    drive?: boolean;
    dpr?: number;
    createCanvas?: CanvasFactory;
    scheduler?: FrameScheduler;
    /** CSS class for the wrapper `<div>`. */
    className?: string;
    /** CSS for the wrapper `<div>`. */
    style?: CSSProperties;
}

const layoutKey = (props: SplitFlapCanvasProps) =>
    contentKey([props.cell, props.gap]);

/** A `<canvas>` drawn by a CanvasFlapRenderer for `target`. */
export function SplitFlapCanvas(props: SplitFlapCanvasProps): ReactElement {
    const wrapperRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const rendererRef = useRef<CanvasFlapRenderer | null>(null);
    const latest = useRef(props);
    latest.current = props;
    const applied = useRef<{ layout: unknown; style: unknown; face: unknown }>({
        layout: undefined,
        style: undefined,
        face: undefined,
    });
    const {
        target,
        fit,
        drive = true,
        flipCurve,
        dpr,
        createCanvas,
        scheduler,
    } = props;

    useEffect(() => {
        const canvas = canvasRef.current;
        const wrapper = wrapperRef.current;
        if (!canvas || !wrapper) {
            return;
        }
        const current = latest.current;
        const renderer = new CanvasFlapRenderer({
            canvas,
            target,
            face: current.face,
            cell: current.cell,
            gap: current.gap,
            style: current.flapStyle,
            flipCurve,
            dpr,
            createCanvas,
            scheduler,
            fit: fit ? { element: wrapper, mode: fit } : undefined,
        });
        applied.current = {
            layout: layoutKey(current),
            style: contentKey(current.flapStyle),
            face: current.face,
        };
        rendererRef.current = renderer;
        renderer.start({ update: drive });
        return () => {
            renderer.destroy();
            rendererRef.current = null;
        };
    }, [target, fit, drive, flipCurve, dpr, createCanvas, scheduler]);

    const currentLayout = layoutKey(props);
    useEffect(() => {
        const renderer = rendererRef.current;
        if (renderer && applied.current.layout !== currentLayout) {
            const { cell, gap } = latest.current;
            // Explicit zeros so a removed gap resets instead of merging.
            renderer.setLayout({
                cell,
                gap: { unit: 0, field: 0, row: 0, ...gap },
            });
            applied.current.layout = currentLayout;
        }
    }, [currentLayout]);

    const currentStyle = contentKey(props.flapStyle);
    useEffect(() => {
        const renderer = rendererRef.current;
        if (renderer && applied.current.style !== currentStyle) {
            renderer.setStyle(latest.current.flapStyle ?? {});
            applied.current.style = currentStyle;
        }
    }, [currentStyle]);

    useEffect(() => {
        const renderer = rendererRef.current;
        if (renderer && applied.current.face !== props.face) {
            renderer.setFace(props.face);
            applied.current.face = props.face;
        }
    }, [props.face]);

    return createElement(
        'div',
        {
            ref: wrapperRef,
            className: props.className,
            style: { display: 'block', ...props.style },
        },
        createElement('canvas', { ref: canvasRef })
    );
}
```
Then `src/react/index.ts`:
```ts
export { useFlapBoard, type UseFlapBoardOptions } from './use-flap-board.js';
export {
    SplitFlapCanvas,
    type SplitFlapCanvasProps,
} from './split-flap-canvas.js';
```
- [ ] **Verify.** Run: `bunx vitest run test/react && bun run typecheck`. Expected: 13 tests pass, with no `act()` warnings in the output.
- [ ] **Commit.** Run `bunx prettier --write` on the touched files, then `git add -A && git commit` with the message `feat(react): add useFlapBoard and SplitFlapCanvas` followed by your attribution trailer.

---

### Task 3: React Pixi hook

**Files:**
- Create: `src/react-pixi/index.ts`
- Test: `test/react/use-pixi-flap-view.test.ts`

**Interfaces:**
- Consumes: `PixiFlapView` (with `setLayout`, `setStyle`, `setFace`, `attach`, `detach` and `sync`) and `contentKey`.
- Produces:
  - `usePixiFlapView(app: Application | null, options: UsePixiFlapViewOptions): PixiFlapView | null`
  - `UsePixiFlapViewOptions` = `PixiFlapViewOptions` without `style`, plus `flapStyle` and `drive`

- [ ] **Write the failing test** at `test/react/use-pixi-flap-view.test.ts`:
```ts
// @vitest-environment jsdom
import { cleanup, renderHook } from '@testing-library/react';
import { type Application, Container, type Ticker } from 'pixi.js';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FlapSequence } from '../../src/core/sequence';
import { FlapUnit } from '../../src/core/unit';
import { PixiFlapView } from '../../src/pixi';
import {
    usePixiFlapView,
    type UsePixiFlapViewOptions,
} from '../../src/react-pixi';
import { textFace } from '../../src/render/faces';
import { fakeCanvasFactory } from '../helpers/fake-canvas';

const painter = textFace({ font: '20px sans-serif' });
const target = new FlapUnit({ sequence: FlapSequence.chars('-AB') });

function fakeApp() {
    const ticker = { add: vi.fn(), remove: vi.fn() };
    const stage = new Container();
    return { app: { stage, ticker } as unknown as Application, ticker, stage };
}

function options(
    extra: Partial<UsePixiFlapViewOptions> = {}
): UsePixiFlapViewOptions {
    return {
        target,
        face: painter,
        cell: { w: 40, h: 60 },
        resolution: 1,
        createCanvas: fakeCanvasFactory,
        ...extra,
    };
}

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

describe('usePixiFlapView (React)', () => {
    it('returns null until there is an app', () => {
        const { result } = renderHook(() => usePixiFlapView(null, options()));
        expect(result.current).toBeNull();
    });

    it('adds a view to the stage and drives it on the ticker', () => {
        const { app, ticker, stage } = fakeApp();
        const attach = vi.spyOn(PixiFlapView.prototype, 'attach');
        const { result } = renderHook(() => usePixiFlapView(app, options()));
        expect(result.current).toBeInstanceOf(PixiFlapView);
        expect(stage.children).toEqual([result.current]);
        expect(attach).toHaveBeenCalledWith(app.ticker);
        expect(ticker.add).toHaveBeenCalledTimes(1);
    });

    it('only mirrors the target when drive is false', () => {
        const { app, ticker } = fakeApp();
        const sync = vi.spyOn(PixiFlapView.prototype, 'sync');
        renderHook(() => usePixiFlapView(app, options({ drive: false })));
        sync.mockClear();
        const tick = ticker.add.mock.calls[0][0] as (t: Ticker) => void;
        tick({ deltaMS: 16 } as Ticker);
        expect(sync).toHaveBeenCalledTimes(1);
    });

    it('applies flapStyle by content and face by identity', () => {
        const { app } = fakeApp();
        const setStyle = vi.spyOn(PixiFlapView.prototype, 'setStyle');
        const setFace = vi.spyOn(PixiFlapView.prototype, 'setFace');
        const { rerender } = renderHook(
            (opts: UsePixiFlapViewOptions) => usePixiFlapView(app, opts),
            { initialProps: options({ flapStyle: { finish: 'matte' } }) }
        );
        rerender(options({ flapStyle: { finish: 'matte' } }));
        expect(setStyle).not.toHaveBeenCalled();
        rerender(options({ flapStyle: { finish: 'gloss' } }));
        expect(setStyle).toHaveBeenCalledWith({ finish: 'gloss' });
        const next = textFace({ font: '20px sans-serif', theme: 'airport' });
        rerender(options({ flapStyle: { finish: 'gloss' }, face: next }));
        expect(setFace).toHaveBeenCalledWith(next);
    });

    it('removes and destroys the view on unmount', () => {
        const { app, ticker, stage } = fakeApp();
        const { result, unmount } = renderHook(() =>
            usePixiFlapView(app, options())
        );
        const view = result.current as PixiFlapView;
        unmount();
        expect(ticker.remove).toHaveBeenCalledTimes(1);
        expect(stage.children).toHaveLength(0);
        expect(view.destroyed).toBe(true);
    });
});
```
- [ ] **Run it and see it fail.** Run: `bunx vitest run test/react/use-pixi-flap-view.test.ts`. Expected: FAIL, cannot resolve `../../src/react-pixi`.
- [ ] **Implement** `src/react-pixi/index.ts`:
```ts
import type { Application } from 'pixi.js';
import { useEffect, useRef, useState } from 'react';

import { PixiFlapView, type PixiFlapViewOptions } from '../pixi/view.js';
import { contentKey } from '../render/content-key.js';
import type { FlapStyle } from '../render/style.js';

export interface UsePixiFlapViewOptions extends Omit<
    PixiFlapViewOptions,
    'style'
> {
    /** The flap style (finish, stack, radius, ...). Compared by content. */
    flapStyle?: FlapStyle;
    /** Advance the target on `app.ticker` (default). `false` only mirrors it. */
    drive?: boolean;
}

/**
 * Adds a PixiFlapView to `app.stage` while `app` is set, and removes and
 * destroys it on unmount. Returns the view (or `null` before `app` exists).
 */
export function usePixiFlapView(
    app: Application | null,
    options: UsePixiFlapViewOptions
): PixiFlapView | null {
    const [view, setView] = useState<PixiFlapView | null>(null);
    const viewRef = useRef<PixiFlapView | null>(null);
    const latest = useRef(options);
    latest.current = options;
    const applied = useRef<{ layout: unknown; style: unknown; face: unknown }>({
        layout: undefined,
        style: undefined,
        face: undefined,
    });
    const {
        target,
        drive = true,
        resolution,
        flipCurve,
        createCanvas,
    } = options;

    useEffect(() => {
        if (!app) {
            return;
        }
        const current = latest.current;
        const created = new PixiFlapView({
            ...current,
            style: current.flapStyle,
        });
        app.stage.addChild(created);
        let stop: () => void;
        if (drive) {
            created.attach(app.ticker);
            stop = () => created.detach();
        } else {
            const sync = () => created.sync();
            app.ticker.add(sync);
            stop = () => app.ticker.remove(sync);
        }
        applied.current = {
            layout: contentKey([current.cell, current.gap]),
            style: contentKey(current.flapStyle),
            face: current.face,
        };
        viewRef.current = created;
        setView(created);
        return () => {
            stop();
            app.stage.removeChild(created);
            created.destroy();
            viewRef.current = null;
            setView(null);
        };
    }, [app, target, drive, resolution, flipCurve, createCanvas]);

    const currentLayout = contentKey([options.cell, options.gap]);
    useEffect(() => {
        const current = viewRef.current;
        if (current && applied.current.layout !== currentLayout) {
            const { cell, gap } = latest.current;
            current.setLayout({
                cell,
                gap: { unit: 0, field: 0, row: 0, ...gap },
            });
            applied.current.layout = currentLayout;
        }
    }, [currentLayout]);

    const currentStyle = contentKey(options.flapStyle);
    useEffect(() => {
        const current = viewRef.current;
        if (current && applied.current.style !== currentStyle) {
            current.setStyle(latest.current.flapStyle ?? {});
            applied.current.style = currentStyle;
        }
    }, [currentStyle]);

    useEffect(() => {
        const current = viewRef.current;
        if (current && applied.current.face !== options.face) {
            current.setFace(options.face);
            applied.current.face = options.face;
        }
    }, [options.face]);

    return view;
}
```
- [ ] **Verify.** Run: `bunx vitest run test/react && bun run typecheck`. Expected: all pass.
- [ ] **Commit.** Run `bunx prettier --write` on the touched files, then `git add -A && git commit` with the message `feat(react): add usePixiFlapView in /react-pixi` followed by your attribution trailer.

---

### Task 4: Vue adapter

**Files:**
- Create: `src/vue/use-flap-board.ts`, `src/vue/split-flap-canvas.ts`, `src/vue/index.ts`
- Test: `test/vue/use-flap-board.test.ts`, `test/vue/split-flap-canvas.test.ts`

**Interfaces:**
- Consumes: the same as Task 2.
- Produces:
  - `useFlapBoard(options)`, where `value` is a `MaybeRefOrGetter`; it returns a `markRaw` board
  - the `SplitFlapCanvas` component, built with `defineComponent`

- [ ] **Write the failing tests.** Create `test/vue/use-flap-board.test.ts`:
```ts
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick, ref } from 'vue';

import { FlapBoard, type RowValues } from '../../src/core/board';
import { textField } from '../../src/core/field';
import { CHARSETS, FlapSequence } from '../../src/core/sequence';
import { useFlapBoard, type UseFlapBoardOptions } from '../../src/vue';

const schema = {
    text: textField({
        sequence: FlapSequence.chars(CHARSETS.alphanumeric),
        length: 1,
    }),
};
type Rows = RowValues<typeof schema>[];

afterEach(() => {
    vi.restoreAllMocks();
});

function inScope(options: UseFlapBoardOptions<typeof schema>) {
    const scope = effectScope();
    const board = scope.run(() => useFlapBoard(options)) as FlapBoard<
        typeof schema
    >;
    return { board, scope };
}

const target = (board: FlapBoard<typeof schema>) =>
    board.field(0, 'text').units[0].target;

describe('useFlapBoard (Vue)', () => {
    it('creates a board and shows a plain value immediately', () => {
        const { board, scope } = inScope({
            rows: 1,
            schema,
            value: [{ text: 'A' }],
        });
        expect(board).toBeInstanceOf(FlapBoard);
        expect(target(board)).toBe('A');
        scope.stop();
    });

    it('shows a ref value when its content changes, not for equal content', async () => {
        const show = vi.spyOn(FlapBoard.prototype, 'show');
        const value = ref<Rows>([{ text: 'A' }]);
        const { board, scope } = inScope({ rows: 1, schema, value });
        expect(show).toHaveBeenCalledTimes(1);
        value.value = [{ text: 'A' }];
        await nextTick();
        expect(show).toHaveBeenCalledTimes(1);
        value.value = [{ text: 'B' }];
        await nextTick();
        expect(target(board)).toBe('B');
        scope.stop();
    });

    it('tracks nested mutations and getters', async () => {
        const value = ref<Rows>([{ text: 'A' }]);
        const { board, scope } = inScope({
            rows: 1,
            schema,
            value: () => value.value,
        });
        value.value[0].text = 'C';
        await nextTick();
        expect(target(board)).toBe('C');
        scope.stop();
    });

    it('leaves the board alone without a value', () => {
        const show = vi.spyOn(FlapBoard.prototype, 'show');
        inScope({ rows: 1, schema }).scope.stop();
        expect(show).not.toHaveBeenCalled();
    });
});
```
Then `test/vue/split-flap-canvas.test.ts`:
```ts
// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CanvasFlapRenderer } from '../../src/canvas/renderer';
import { FlapField, textField } from '../../src/core/field';
import { CHARSETS, FlapSequence } from '../../src/core/sequence';
import { textFace } from '../../src/render/faces';
import { SplitFlapCanvas } from '../../src/vue';
import { FakeResizeObserver, stubCanvasContext } from '../helpers/dom-canvas';
import { fakeCanvasFactory } from '../helpers/fake-canvas';
import { fakeScheduler } from '../helpers/fake-scheduler';

const alnum = FlapSequence.chars(CHARSETS.alphanumeric);
const painter = textFace({ font: '20px sans-serif' });

let contextOf: ReturnType<typeof stubCanvasContext>;
let frames: ReturnType<typeof fakeScheduler>;
let target: FlapField<string, string>;

beforeEach(() => {
    contextOf = stubCanvasContext();
    frames = fakeScheduler();
    target = new FlapField(textField({ sequence: alnum, length: 2 }));
});

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    FakeResizeObserver.instances = [];
});

function mountCanvas(
    props: Record<string, unknown> = {},
    attrs: Record<string, unknown> = {}
) {
    return mount(SplitFlapCanvas, {
        props: {
            target,
            face: painter,
            cell: { w: 40, h: 60 },
            dpr: 1,
            createCanvas: fakeCanvasFactory,
            scheduler: frames.scheduler,
            ...props,
        },
        attrs,
        attachTo: document.body,
    });
}

const canvasOf = (wrapper: ReturnType<typeof mountCanvas>) =>
    wrapper.find('canvas').element as HTMLCanvasElement;

describe('SplitFlapCanvas (Vue)', () => {
    it('draws the target into its canvas and starts the loop', () => {
        const wrapper = mountCanvas();
        const canvas = canvasOf(wrapper);
        expect(canvas.width).toBe(80);
        expect(
            contextOf(canvas).callsNamed('drawImage').length
        ).toBeGreaterThan(0);
        expect(frames.callbacks.size).toBe(1);
        wrapper.unmount();
    });

    it('destroys the renderer on unmount', () => {
        const destroy = vi.spyOn(CanvasFlapRenderer.prototype, 'destroy');
        mountCanvas().unmount();
        expect(destroy).toHaveBeenCalledTimes(1);
        expect(frames.callbacks.size).toBe(0);
    });

    it('applies cell and gap changes with setLayout, by content', async () => {
        const setLayout = vi.spyOn(CanvasFlapRenderer.prototype, 'setLayout');
        const wrapper = mountCanvas();
        await wrapper.setProps({ cell: { w: 40, h: 60 } });
        expect(setLayout).not.toHaveBeenCalled();
        await wrapper.setProps({ cell: { w: 20, h: 30 } });
        expect(setLayout).toHaveBeenCalledTimes(1);
        expect(canvasOf(wrapper).width).toBe(40);
        wrapper.unmount();
    });

    it('applies flapStyle by content and face by identity', async () => {
        const setStyle = vi.spyOn(CanvasFlapRenderer.prototype, 'setStyle');
        const setFace = vi.spyOn(CanvasFlapRenderer.prototype, 'setFace');
        const wrapper = mountCanvas({ flapStyle: { finish: 'matte' } });
        await wrapper.setProps({ flapStyle: { finish: 'matte' } });
        expect(setStyle).not.toHaveBeenCalled();
        await wrapper.setProps({ flapStyle: { finish: 'satin' } });
        expect(setStyle).toHaveBeenCalledWith({ finish: 'satin' });
        const next = textFace({ font: '20px sans-serif', theme: 'cream' });
        await wrapper.setProps({ face: next });
        expect(setFace).toHaveBeenCalledWith(next);
        wrapper.unmount();
    });

    it('recreates the renderer for a new target', async () => {
        const destroy = vi.spyOn(CanvasFlapRenderer.prototype, 'destroy');
        const wrapper = mountCanvas();
        await wrapper.setProps({
            target: new FlapField(textField({ sequence: alnum, length: 3 })),
        });
        expect(destroy).toHaveBeenCalledTimes(1);
        expect(canvasOf(wrapper).width).toBe(120);
        wrapper.unmount();
    });

    it('only renders, without advancing the target, when drive is false', () => {
        const start = vi.spyOn(CanvasFlapRenderer.prototype, 'start');
        mountCanvas({ drive: false }).unmount();
        expect(start).toHaveBeenCalledWith({ update: false });
    });

    it('fits the canvas to its wrapper', () => {
        vi.stubGlobal('ResizeObserver', FakeResizeObserver);
        const wrapper = mountCanvas({ fit: 'width' });
        const [observer] = FakeResizeObserver.instances;
        expect(observer.observed).toEqual([wrapper.element]);
        observer.resize(160, 0);
        expect(canvasOf(wrapper).style.width).toBe('160px');
        wrapper.unmount();
    });

    it('applies class and style attributes to the wrapper', () => {
        const wrapper = mountCanvas(
            {},
            { class: 'board', style: 'max-width: 720px' }
        );
        const element = wrapper.element as HTMLDivElement;
        expect(element.className).toBe('board');
        expect(element.style.maxWidth).toBe('720px');
        expect(element.style.display).toBe('block');
        wrapper.unmount();
    });
});
```
- [ ] **Run them and see them fail.** Run: `bunx vitest run test/vue`. Expected: FAIL, cannot resolve `../../src/vue`.
- [ ] **Implement.** Create `src/vue/use-flap-board.ts`:
```ts
import { markRaw, type MaybeRefOrGetter, toValue, watch } from 'vue';

import {
    type BoardOptions,
    FlapBoard,
    type RowValues,
    type Schema,
} from '../core/board.js';
import { contentKey } from '../render/content-key.js';

export interface UseFlapBoardOptions<S extends Schema> extends BoardOptions<S> {
    /**
     * Shown with `board.show()` immediately and whenever its content changes.
     * May be an array, a ref or a getter; nested changes are tracked.
     */
    value?: MaybeRefOrGetter<readonly RowValues<S>[] | undefined>;
}

/**
 * Creates one FlapBoard (kept out of Vue's reactivity). `rows`, `schema` and
 * `stagger` are read once; `value` is watched by content.
 */
export function useFlapBoard<S extends Schema>(
    options: UseFlapBoardOptions<S>
): FlapBoard<S> {
    const board = markRaw(
        new FlapBoard<S>({
            rows: options.rows,
            schema: options.schema,
            stagger: options.stagger,
        })
    );
    if (options.value !== undefined) {
        // Serializing reads every nested value, so deep changes are tracked.
        watch(
            () => contentKey(toValue(options.value)),
            () => {
                const value = toValue(options.value);
                if (value !== undefined) {
                    board.show(value);
                }
            },
            { immediate: true }
        );
    }
    return board;
}
```
Then `src/vue/split-flap-canvas.ts`:
```ts
import {
    defineComponent,
    h,
    onBeforeUnmount,
    onMounted,
    type PropType,
    ref,
    watch,
} from 'vue';

import {
    CanvasFlapRenderer,
    type CanvasFlapRendererOptions,
    type FrameScheduler,
} from '../canvas/renderer.js';
import { contentKey } from '../render/content-key.js';
import type { CanvasFactory } from '../render/face-cache.js';
import type { FitMode } from '../render/fit.js';
import type { FlipCurve } from '../render/flip-curve.js';
import type { LayoutOptions, RenderTarget } from '../render/layout.js';
import type { FlapStyle } from '../render/style.js';

/**
 * A `<canvas>` drawn by a CanvasFlapRenderer for `target`. `class` and
 * `style` attributes apply to the wrapper `<div>`, which `fit` measures.
 */
export const SplitFlapCanvas = defineComponent({
    name: 'SplitFlapCanvas',
    props: {
        target: { type: Object as PropType<RenderTarget>, required: true },
        /** Compared by identity: keep painters stable. */
        face: {
            type: [Function, Object] as PropType<
                CanvasFlapRendererOptions['face']
            >,
            required: true,
        },
        cell: {
            type: Object as PropType<LayoutOptions['cell']>,
            required: true,
        },
        gap: {
            type: Object as PropType<LayoutOptions['gap']>,
            default: undefined,
        },
        flapStyle: { type: Object as PropType<FlapStyle>, default: undefined },
        flipCurve: {
            type: Function as PropType<FlipCurve>,
            default: undefined,
        },
        fit: { type: String as PropType<FitMode>, default: undefined },
        drive: { type: Boolean, default: true },
        dpr: { type: Number, default: undefined },
        createCanvas: {
            type: Function as PropType<CanvasFactory>,
            default: undefined,
        },
        scheduler: {
            type: Object as PropType<FrameScheduler>,
            default: undefined,
        },
    },
    setup(props) {
        const wrapper = ref<HTMLDivElement | null>(null);
        const canvas = ref<HTMLCanvasElement | null>(null);
        let renderer: CanvasFlapRenderer | null = null;
        const applied = {
            layout: undefined as unknown,
            style: undefined as unknown,
            face: undefined as unknown,
        };
        const layoutKey = () => contentKey([props.cell, props.gap]);

        const create = () => {
            if (!canvas.value || !wrapper.value) {
                return;
            }
            renderer = new CanvasFlapRenderer({
                canvas: canvas.value,
                target: props.target,
                face: props.face,
                cell: props.cell,
                gap: props.gap,
                style: props.flapStyle,
                flipCurve: props.flipCurve,
                dpr: props.dpr,
                createCanvas: props.createCanvas,
                scheduler: props.scheduler,
                fit: props.fit
                    ? { element: wrapper.value, mode: props.fit }
                    : undefined,
            });
            applied.layout = layoutKey();
            applied.style = contentKey(props.flapStyle);
            applied.face = props.face;
            renderer.start({ update: props.drive });
        };
        const destroy = () => {
            renderer?.destroy();
            renderer = null;
        };

        onMounted(create);
        onBeforeUnmount(destroy);
        watch(
            [
                () => props.target,
                () => props.fit,
                () => props.drive,
                () => props.flipCurve,
                () => props.dpr,
                () => props.createCanvas,
                () => props.scheduler,
            ],
            () => {
                destroy();
                create();
            }
        );
        watch(layoutKey, key => {
            if (renderer && key !== applied.layout) {
                // Explicit zeros so a removed gap resets instead of merging.
                renderer.setLayout({
                    cell: props.cell,
                    gap: { unit: 0, field: 0, row: 0, ...props.gap },
                });
                applied.layout = key;
            }
        });
        watch(
            () => contentKey(props.flapStyle),
            key => {
                if (renderer && key !== applied.style) {
                    renderer.setStyle(props.flapStyle ?? {});
                    applied.style = key;
                }
            }
        );
        watch(
            () => props.face,
            face => {
                if (renderer && face !== applied.face) {
                    renderer.setFace(face);
                    applied.face = face;
                }
            }
        );

        return () =>
            h('div', { ref: wrapper, style: { display: 'block' } }, [
                h('canvas', { ref: canvas }),
            ]);
    },
});
```
Then `src/vue/index.ts`:
```ts
export { useFlapBoard, type UseFlapBoardOptions } from './use-flap-board.js';
export { SplitFlapCanvas } from './split-flap-canvas.js';
```
- [ ] **Verify.** Run: `bunx vitest run test/vue && bun run typecheck`. Expected: all pass, with no Vue warnings in the output.
- [ ] **Commit.** Run `bunx prettier --write` on the touched files, then `git add -A && git commit` with the message `feat(vue): add useFlapBoard and SplitFlapCanvas` followed by your attribution trailer.

---

### Task 5: Vue Pixi composable

**Files:**
- Create: `src/vue-pixi/index.ts`
- Test: `test/vue/use-pixi-flap-view.test.ts`

**Interfaces:**
- Produces: `usePixiFlapView(app: MaybeRefOrGetter<Application | null | undefined>, options: MaybeRefOrGetter<UsePixiFlapViewOptions>): ShallowRef<PixiFlapView | null>`

- [ ] **Write the failing test** at `test/vue/use-pixi-flap-view.test.ts`:
```ts
// @vitest-environment jsdom
import { type Application, Container, type Ticker } from 'pixi.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick, reactive, shallowRef } from 'vue';

import { FlapSequence } from '../../src/core/sequence';
import { FlapUnit } from '../../src/core/unit';
import { PixiFlapView } from '../../src/pixi';
import { type FacePainter, textFace } from '../../src/render/faces';
import type { FlapStyle } from '../../src/render/style';
import {
    usePixiFlapView,
    type UsePixiFlapViewOptions,
} from '../../src/vue-pixi';
import { fakeCanvasFactory } from '../helpers/fake-canvas';

const painter = textFace({ font: '20px sans-serif' });
const target = new FlapUnit({ sequence: FlapSequence.chars('-AB') });

function fakeApp() {
    const ticker = { add: vi.fn(), remove: vi.fn() };
    const stage = new Container();
    return { app: { stage, ticker } as unknown as Application, ticker, stage };
}

function options(
    extra: Partial<UsePixiFlapViewOptions> = {}
): UsePixiFlapViewOptions {
    return {
        target,
        face: painter,
        cell: { w: 40, h: 60 },
        resolution: 1,
        createCanvas: fakeCanvasFactory,
        ...extra,
    };
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe('usePixiFlapView (Vue)', () => {
    it('waits for the app ref, then adds a driven view', async () => {
        const { app, ticker, stage } = fakeApp();
        const appRef = shallowRef<Application | null>(null);
        const scope = effectScope();
        const view = scope.run(() => usePixiFlapView(appRef, options()))!;
        expect(view.value).toBeNull();
        appRef.value = app;
        await nextTick();
        expect(view.value).toBeInstanceOf(PixiFlapView);
        expect(stage.children).toEqual([view.value]);
        expect(ticker.add).toHaveBeenCalledTimes(1);
        scope.stop();
    });

    it('only mirrors the target when drive is false', () => {
        const { app, ticker } = fakeApp();
        const sync = vi.spyOn(PixiFlapView.prototype, 'sync');
        const scope = effectScope();
        scope.run(() => usePixiFlapView(app, options({ drive: false })));
        sync.mockClear();
        const tick = ticker.add.mock.calls[0][0] as (t: Ticker) => void;
        tick({ deltaMS: 16 } as Ticker);
        expect(sync).toHaveBeenCalledTimes(1);
        scope.stop();
    });

    it('applies reactive flapStyle by content and face by identity', async () => {
        const { app } = fakeApp();
        const setStyle = vi.spyOn(PixiFlapView.prototype, 'setStyle');
        const setFace = vi.spyOn(PixiFlapView.prototype, 'setFace');
        // Reactive state read through a getter; core objects stay plain.
        const state = reactive({
            flapStyle: { finish: 'matte' } as FlapStyle,
            face: painter as FacePainter<string>,
        });
        const scope = effectScope();
        scope.run(() =>
            usePixiFlapView(app, () =>
                options({ flapStyle: state.flapStyle, face: state.face })
            )
        );
        state.flapStyle = { finish: 'matte' };
        await nextTick();
        expect(setStyle).not.toHaveBeenCalled();
        state.flapStyle = { finish: 'gloss' };
        await nextTick();
        expect(setStyle).toHaveBeenCalledWith({ finish: 'gloss' });
        const next = textFace({ font: '20px sans-serif', theme: 'airport' });
        state.face = next;
        await nextTick();
        expect(setFace).toHaveBeenCalledWith(next);
        scope.stop();
    });

    it('removes and destroys the view when the scope is disposed', () => {
        const { app, ticker, stage } = fakeApp();
        const scope = effectScope();
        const view = scope.run(() => usePixiFlapView(app, options()))!;
        const created = view.value as PixiFlapView;
        scope.stop();
        expect(ticker.remove).toHaveBeenCalledTimes(1);
        expect(stage.children).toHaveLength(0);
        expect(created.destroyed).toBe(true);
        expect(view.value).toBeNull();
    });
});
```
- [ ] **Run it and see it fail.** Run: `bunx vitest run test/vue/use-pixi-flap-view.test.ts`. Expected: FAIL, cannot resolve `../../src/vue-pixi`.
- [ ] **Implement** `src/vue-pixi/index.ts`:
```ts
import type { Application } from 'pixi.js';
import {
    markRaw,
    type MaybeRefOrGetter,
    onScopeDispose,
    type ShallowRef,
    shallowRef,
    toValue,
    watch,
} from 'vue';

import { PixiFlapView, type PixiFlapViewOptions } from '../pixi/view.js';
import { contentKey } from '../render/content-key.js';
import type { FlapStyle } from '../render/style.js';

export interface UsePixiFlapViewOptions extends Omit<
    PixiFlapViewOptions,
    'style'
> {
    /** The flap style (finish, stack, radius, ...). Compared by content. */
    flapStyle?: FlapStyle;
    /** Advance the target on `app.ticker` (default). `false` only mirrors it. */
    drive?: boolean;
}

/**
 * Adds a PixiFlapView to `app.stage` once `app` is set (an Application, a ref
 * or a getter), and removes and destroys it when the scope is disposed.
 * `options` may be reactive; layout, style and face changes use the view's
 * setters, other changes recreate it.
 */
export function usePixiFlapView(
    app: MaybeRefOrGetter<Application | null | undefined>,
    options: MaybeRefOrGetter<UsePixiFlapViewOptions>
): ShallowRef<PixiFlapView | null> {
    const view = shallowRef<PixiFlapView | null>(null);
    const applied = {
        layout: undefined as unknown,
        style: undefined as unknown,
        face: undefined as unknown,
    };
    let teardown: (() => void) | null = null;
    const opts = () => toValue(options);

    const dispose = () => {
        teardown?.();
        teardown = null;
        view.value = null;
    };

    watch(
        [
            () => toValue(app),
            () => opts().target,
            () => opts().drive ?? true,
            () => opts().resolution,
            () => opts().flipCurve,
            () => opts().createCanvas,
        ],
        ([currentApp, , drive]) => {
            dispose();
            if (!currentApp) {
                return;
            }
            const current = opts();
            const created = markRaw(
                new PixiFlapView({ ...current, style: current.flapStyle })
            );
            currentApp.stage.addChild(created);
            let stop: () => void;
            if (drive) {
                created.attach(currentApp.ticker);
                stop = () => created.detach();
            } else {
                const sync = () => created.sync();
                currentApp.ticker.add(sync);
                stop = () => currentApp.ticker.remove(sync);
            }
            applied.layout = contentKey([current.cell, current.gap]);
            applied.style = contentKey(current.flapStyle);
            applied.face = current.face;
            teardown = () => {
                stop();
                currentApp.stage.removeChild(created);
                created.destroy();
            };
            view.value = created;
        },
        { immediate: true }
    );
    watch(
        () => contentKey([opts().cell, opts().gap]),
        key => {
            if (view.value && key !== applied.layout) {
                const { cell, gap } = opts();
                view.value.setLayout({
                    cell,
                    gap: { unit: 0, field: 0, row: 0, ...gap },
                });
                applied.layout = key;
            }
        }
    );
    watch(
        () => contentKey(opts().flapStyle),
        key => {
            if (view.value && key !== applied.style) {
                view.value.setStyle(opts().flapStyle ?? {});
                applied.style = key;
            }
        }
    );
    watch(
        () => opts().face,
        face => {
            if (view.value && face !== applied.face) {
                view.value.setFace(face);
                applied.face = face;
            }
        }
    );
    onScopeDispose(dispose);
    return view;
}
```
- [ ] **Verify.** Run: `bun run test && bun run typecheck`. Expected: all pass.
- [ ] **Commit.** Run `bunx prettier --write` on the touched files, then `git add -A && git commit` with the message `feat(vue): add usePixiFlapView in /vue-pixi` followed by your attribution trailer.

---

### Task 6: Packaging, demos and docs

**Files:**
- Modify: `package.json` (exports and peers), `scripts/build.ts`, `scripts/check-dist.ts`, `tsconfig.json`, `examples/vite.config.ts`, `examples/index.html`, `test/index.test.ts`, `README.md`
- Create: `examples/adapter-shared.ts`, `examples/react.html`, `examples/react.ts`, `examples/vue.html`, `examples/vue.ts`

- [ ] **Write the failing export test** (`test/index.test.ts`):
```diff
--- a/test/index.test.ts
+++ b/test/index.test.ts
@@ -3,7 +3,11 @@ import { describe, expect, it } from 'vitest';
 import * as canvas from '../src/canvas';
 import * as core from '../src/core';
 import * as pixi from '../src/pixi';
+import * as react from '../src/react';
+import * as reactPixi from '../src/react-pixi';
 import * as sound from '../src/sound';
+import * as vue from '../src/vue';
+import * as vuePixi from '../src/vue-pixi';
 
 describe('entry points', () => {
     it('exports the core runtime API', () => {
@@ -80,4 +84,15 @@ describe('entry points', () => {
             ].sort()
         );
     });
+
+    it('exports the React and Vue adapters', () => {
+        expect(Object.keys(react).sort()).toEqual(
+            ['SplitFlapCanvas', 'useFlapBoard'].sort()
+        );
+        expect(Object.keys(reactPixi)).toEqual(['usePixiFlapView']);
+        expect(Object.keys(vue).sort()).toEqual(
+            ['SplitFlapCanvas', 'useFlapBoard'].sort()
+        );
+        expect(Object.keys(vuePixi)).toEqual(['usePixiFlapView']);
+    });
 });
```
Run: `bunx vitest run test/index.test.ts`. Expected: PASS for the existing cases. The new case also passes at this point, because the modules exist since Tasks 2–5. This task's real gate is the build check in the last step.
- [ ] **Update `package.json`.** Add four export entries after `"./sound"`:
```json
{
    "./react": {
        "types": "./dist/react/index.d.ts",
        "import": "./dist/react/index.js"
    },
    "./react-pixi": {
        "types": "./dist/react-pixi/index.d.ts",
        "import": "./dist/react-pixi/index.js"
    },
    "./vue": {
        "types": "./dist/vue/index.d.ts",
        "import": "./dist/vue/index.js"
    },
    "./vue-pixi": {
        "types": "./dist/vue-pixi/index.d.ts",
        "import": "./dist/vue-pixi/index.js"
    }
}
```
and set the peer dependencies:
```json
{
    "peerDependencies": {
        "pixi.js": "^8.0.0",
        "react": ">=18",
        "vue": "^3.3"
    },
    "peerDependenciesMeta": {
        "pixi.js": {
            "optional": true
        },
        "react": {
            "optional": true
        },
        "vue": {
            "optional": true
        }
    }
}
```
- [ ] **Build entries and the dist check:**

`scripts/build.ts`:
```diff
--- a/scripts/build.ts
+++ b/scripts/build.ts
@@ -11,6 +11,10 @@ const result = await Bun.build({
         './src/canvas/index.ts',
         './src/pixi/index.ts',
         './src/sound/index.ts',
+        './src/react/index.ts',
+        './src/react-pixi/index.ts',
+        './src/vue/index.ts',
+        './src/vue-pixi/index.ts',
     ],
     root: './src',
     outdir: './dist',
@@ -20,7 +24,7 @@ const result = await Bun.build({
     // `instanceof` works across entry points.
     splitting: true,
     sourcemap: 'linked',
-    external: ['pixi.js', '@ue-too/animate'],
+    external: ['pixi.js', '@ue-too/animate', 'react', 'react-dom', 'vue'],
 });
 
 if (!result.success) {
```
`scripts/check-dist.ts`:
```diff
--- a/scripts/check-dist.ts
+++ b/scripts/check-dist.ts
@@ -27,6 +27,10 @@ try {
     const canvasEntry = await import('../dist/canvas/index.js');
     const pixi = await import('../dist/pixi/index.js');
     const sound = await import('../dist/sound/index.js');
+    const react = await import('../dist/react/index.js');
+    const reactPixi = await import('../dist/react-pixi/index.js');
+    const vue = await import('../dist/vue/index.js');
+    const vuePixi = await import('../dist/vue-pixi/index.js');
 
     const keys = Object.keys(core).sort();
     const expected = [...EXPECTED_CORE_EXPORTS].sort();
@@ -53,6 +57,20 @@ try {
         typeof sound.FlapSound === 'function',
         'sound entry does not export FlapSound as a function'
     );
+
+    check(
+        typeof react.useFlapBoard === 'function' &&
+            typeof react.SplitFlapCanvas === 'function' &&
+            typeof reactPixi.usePixiFlapView === 'function',
+        'react entries do not export useFlapBoard, SplitFlapCanvas and usePixiFlapView'
+    );
+
+    check(
+        typeof vue.useFlapBoard === 'function' &&
+            typeof vue.SplitFlapCanvas === 'object' &&
+            typeof vuePixi.usePixiFlapView === 'function',
+        'vue entries do not export useFlapBoard, SplitFlapCanvas and usePixiFlapView'
+    );
 } catch (error) {
     failures.push(`failed to load dist: ${String(error)}`);
 }
```
`tsconfig.json`:
```diff
--- a/tsconfig.json
+++ b/tsconfig.json
@@ -14,7 +14,9 @@
             "@kinnet-studio/split-flaps": ["./src/core/index.ts"],
             "@kinnet-studio/split-flaps/canvas": ["./src/canvas/index.ts"],
             "@kinnet-studio/split-flaps/pixi": ["./src/pixi/index.ts"],
-            "@kinnet-studio/split-flaps/sound": ["./src/sound/index.ts"]
+            "@kinnet-studio/split-flaps/sound": ["./src/sound/index.ts"],
+            "@kinnet-studio/split-flaps/react": ["./src/react/index.ts"],
+            "@kinnet-studio/split-flaps/vue": ["./src/vue/index.ts"]
         }
     },
     "include": ["src", "test", "examples"],
```
- [ ] **Example pages.** First update the Vite config to add aliases and multi-page input, in `examples/vite.config.ts`:
```diff
--- a/examples/vite.config.ts
+++ b/examples/vite.config.ts
@@ -12,6 +12,14 @@ export default defineConfig({
                 find: /^@kinnet-studio\/split-flaps\/canvas$/,
                 replacement: fromHere('../src/canvas/index.ts'),
             },
+            {
+                find: /^@kinnet-studio\/split-flaps\/react$/,
+                replacement: fromHere('../src/react/index.ts'),
+            },
+            {
+                find: /^@kinnet-studio\/split-flaps\/vue$/,
+                replacement: fromHere('../src/vue/index.ts'),
+            },
             {
                 find: /^@kinnet-studio\/split-flaps\/sound$/,
                 replacement: fromHere('../src/sound/index.ts'),
@@ -26,4 +34,13 @@ export default defineConfig({
             },
         ],
     },
+    build: {
+        rollupOptions: {
+            input: {
+                main: fromHere('index.html'),
+                react: fromHere('react.html'),
+                vue: fromHere('vue.html'),
+            },
+        },
+    },
 });
```
Then `examples/index.html`:
```diff
--- a/examples/index.html
+++ b/examples/index.html
@@ -54,6 +54,10 @@
         </style>
     </head>
     <body>
+        <nav class="controls">
+            <a href="./react.html">React adapter demo</a>
+            <a href="./vue.html">Vue adapter demo</a>
+        </nav>
         <section>
             <h2>Departures: Canvas 2D (left), Pixi (right), one board</h2>
             <div class="controls">
```
Create `examples/adapter-shared.ts`:
```ts
// Board data and painters shared by the React and Vue adapter demos.
import {
    CHARSETS,
    defineField,
    FlapSequence,
    type RowValues,
    textField,
} from '@kinnet-studio/split-flaps';
import {
    FLAP_THEMES,
    type FlapStyle,
    textFace,
    type ThemeName,
} from '@kinnet-studio/split-flaps/canvas';

const chars = FlapSequence.chars(`${CHARSETS.alphanumeric}:`);
const cities = new FlapSequence(['', 'TOKYO', 'OSAKA', 'KYOTO', 'NAGOYA']);

export const schema = {
    time: textField({ sequence: chars, length: 5 }),
    dest: defineField({
        sequence: cities,
        length: 1,
        cells: 5,
        unit: { flipDuration: 120 },
    }),
    plat: textField({ sequence: chars, length: 2, align: 'right' }),
};

export const messages: RowValues<typeof schema>[][] = [
    [
        { time: '09:15', dest: 'TOKYO', plat: '3' },
        { time: '09:42', dest: 'OSAKA', plat: '12' },
        { time: '10:05', dest: 'KYOTO', plat: '7' },
    ],
    [
        { time: '11:00', dest: 'NAGOYA', plat: '4' },
        { time: '11:45', dest: 'TOKYO', plat: '2' },
    ],
];

export const THEMES: ThemeName[] = ['classic', 'solari', 'airport', 'cream'];
export const cell = { w: 28, h: 44 };
export const gap = { unit: 3, field: 16, row: 8 };

/** Painters for a theme. Create once per theme so they stay stable. */
export function facesFor(theme: ThemeName) {
    const charFace = textFace({
        font: '600 26px ui-monospace, Menlo, monospace',
        theme,
    });
    return {
        time: charFace,
        dest: textFace({ font: '600 22px system-ui, sans-serif', theme }),
        plat: charFace,
    };
}

export function styleFor(theme: ThemeName): FlapStyle {
    return {
        radius: 4,
        finish: 'matte',
        hingeColor: FLAP_THEMES[theme].hinge,
        stack: { count: 3, step: 2 },
    };
}
```
Then `examples/react.ts`:
```ts
import type { ThemeName } from '@kinnet-studio/split-flaps/canvas';
import {
    SplitFlapCanvas,
    useFlapBoard,
} from '@kinnet-studio/split-flaps/react';
import { type ChangeEvent, createElement, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';

import {
    cell,
    facesFor,
    gap,
    messages,
    schema,
    styleFor,
    THEMES,
} from './adapter-shared';

function App() {
    const [index, setIndex] = useState(0);
    const [theme, setTheme] = useState<ThemeName>('classic');
    // `value` is shown whenever its content changes.
    const board = useFlapBoard({
        rows: 3,
        schema,
        stagger: { order: 'column', step: 25 },
        value: messages[index],
    });
    // Painters are compared by identity, so memoize them per theme.
    const face = useMemo(() => facesFor(theme), [theme]);
    return createElement(
        'div',
        null,
        createElement(
            'div',
            { className: 'controls' },
            createElement(
                'button',
                { onClick: () => setIndex(i => (i + 1) % messages.length) },
                'Next message'
            ),
            createElement(
                'select',
                {
                    value: theme,
                    'aria-label': 'Theme',
                    onChange: (event: ChangeEvent<HTMLSelectElement>) =>
                        setTheme(event.target.value as ThemeName),
                },
                THEMES.map(name =>
                    createElement(
                        'option',
                        { key: name, value: name },
                        `Theme: ${name}`
                    )
                )
            )
        ),
        createElement(SplitFlapCanvas, {
            target: board,
            face,
            cell,
            gap,
            flapStyle: styleFor(theme),
            fit: 'width',
            style: { maxWidth: '720px' },
        })
    );
}

const root = document.getElementById('app');
if (root) {
    createRoot(root).render(createElement(App));
}
```
Then `examples/react.html`:
```html
<!doctype html>
<html lang="en">
    <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>split-flaps React adapter</title>
        <style>
            body {
                margin: 0;
                padding: 24px;
                background: #1b1b1f;
                color: #eeeeee;
                font-family: system-ui, sans-serif;
            }
            .controls {
                display: flex;
                flex-wrap: wrap;
                gap: 8px;
                margin: 8px 0 16px;
            }
            button,
            select {
                background: #2c2c33;
                color: #eeeeee;
                border: 1px solid #44444c;
                border-radius: 6px;
                padding: 6px 12px;
                font: inherit;
            }
            a {
                color: #a8a8b0;
            }
        </style>
    </head>
    <body>
        <p><a href="./index.html">All examples</a></p>
        <h2>React adapter</h2>
        <div id="app"></div>
        <script type="module" src="./react.ts"></script>
    </body>
</html>
```
Then `examples/vue.ts`:
```ts
import type { ThemeName } from '@kinnet-studio/split-flaps/canvas';
import { SplitFlapCanvas, useFlapBoard } from '@kinnet-studio/split-flaps/vue';
import { computed, createApp, defineComponent, h, ref } from 'vue';

import {
    cell,
    facesFor,
    gap,
    messages,
    schema,
    styleFor,
    THEMES,
} from './adapter-shared';

const App = defineComponent({
    setup() {
        const index = ref(0);
        const theme = ref<ThemeName>('classic');
        // `value` (here a getter) is shown whenever its content changes.
        const board = useFlapBoard({
            rows: 3,
            schema,
            stagger: { order: 'column', step: 25 },
            value: () => messages[index.value],
        });
        // Painters are compared by identity: computed keeps them stable.
        const face = computed(() => facesFor(theme.value));
        return () =>
            h('div', [
                h('div', { class: 'controls' }, [
                    h(
                        'button',
                        {
                            onClick: () => {
                                index.value =
                                    (index.value + 1) % messages.length;
                            },
                        },
                        'Next message'
                    ),
                    h(
                        'select',
                        {
                            value: theme.value,
                            'aria-label': 'Theme',
                            onChange: (event: Event) => {
                                theme.value = (
                                    event.target as HTMLSelectElement
                                ).value as ThemeName;
                            },
                        },
                        THEMES.map(name =>
                            h('option', { value: name }, `Theme: ${name}`)
                        )
                    ),
                ]),
                h(SplitFlapCanvas, {
                    target: board,
                    face: face.value,
                    cell,
                    gap,
                    flapStyle: styleFor(theme.value),
                    fit: 'width',
                    style: { maxWidth: '720px' },
                }),
            ]);
    },
});

createApp(App).mount('#app');
```
Then `examples/vue.html`:
```html
<!doctype html>
<html lang="en">
    <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>split-flaps Vue adapter</title>
        <style>
            body {
                margin: 0;
                padding: 24px;
                background: #1b1b1f;
                color: #eeeeee;
                font-family: system-ui, sans-serif;
            }
            .controls {
                display: flex;
                flex-wrap: wrap;
                gap: 8px;
                margin: 8px 0 16px;
            }
            button,
            select {
                background: #2c2c33;
                color: #eeeeee;
                border: 1px solid #44444c;
                border-radius: 6px;
                padding: 6px 12px;
                font: inherit;
            }
            a {
                color: #a8a8b0;
            }
        </style>
    </head>
    <body>
        <p><a href="./index.html">All examples</a></p>
        <h2>Vue adapter</h2>
        <div id="app"></div>
        <script type="module" src="./vue.ts"></script>
    </body>
</html>
```
- [ ] **Add the README sections:**
```diff
--- a/README.md
+++ b/README.md
@@ -196,6 +196,50 @@ shrinks by `count × step`, and layout and canvas size stay the same. The edges
 are the real earlier flaps on the drum, so colour faces show the previous
 colours.
 
+## React
+
+```ts
+import { SplitFlapCanvas, useFlapBoard } from '@kinnet-studio/split-flaps/react';
+
+function Departures({ rows }: { rows: RowValues<typeof schema>[] }) {
+    // One stable board; `value` is shown whenever its content changes.
+    const board = useFlapBoard({ rows: 4, schema, value: rows });
+    return (
+        <SplitFlapCanvas
+            target={board}
+            face={face} // keep painters stable: module scope or useMemo
+            cell={{ w: 28, h: 44 }}
+            flapStyle={{ finish: 'matte' }}
+            fit="width"
+        />
+    );
+}
+```
+
+`cell` / `gap` / `flapStyle` are compared by content and `face` by identity;
+changes go through `setLayout` / `setStyle` / `setFace`. `target`, `fit` and
+`drive` changes recreate the renderer; `drive={false}` only draws a board that
+something else advances. `className` / `style` style the wrapper `<div>`. For
+Pixi, `usePixiFlapView(app, options)` from `/react-pixi` adds a view to an
+`Application` you manage.
+
+## Vue
+
+```ts
+import { SplitFlapCanvas, useFlapBoard } from '@kinnet-studio/split-flaps/vue';
+
+const board = useFlapBoard({ rows: 4, schema, value: () => departures.value });
+// <SplitFlapCanvas :target="board" :face="face" :cell="{ w: 28, h: 44 }"
+//                  :flap-style="{ finish: 'matte' }" fit="width" class="board" />
+```
+
+`value` may be an array, a ref or a getter (nested changes are tracked). The
+component takes the same props as the React one; `class` / `style` fall
+through to the wrapper. `usePixiFlapView(app, options)` from `/vue-pixi`
+accepts an app ref that may start `null`; pass options as a getter over your
+reactive state. The board returned by `useFlapBoard` is kept out of Vue's
+reactivity (`markRaw`); do the same for core objects you put in reactive state.
+
 ## Sizing and resizing
 
 `cell` (unit size), `gap` and a field's `cells` (width in cells) set the
```
- [ ] **Verify everything.** Run each and check the result:

| Command | Expected |
| --- | --- |
| `bun run test` | 307 passing |
| `bun run typecheck` | exits 0 |
| `bun run format:check` | clean |
| `bun run build` | ends with `check-dist ok` |
| `bunx vite build --config examples/vite.config.ts` | builds `index.html`, `react.html` and `vue.html` |
| `grep -c pixi.js dist/react/index.js dist/vue/index.js` | `0` for both, and none of the chunks they import may import `pixi.js` |

- [ ] **Commit.** Run `bunx prettier --write` on the touched files, then `git add -A && git commit` with the message `feat: package the /react, /react-pixi, /vue and /vue-pixi entries; adapter demos and docs` followed by your attribution trailer.
- [ ] **Browser check.** Run `bun run dev`, then open `/react.html` and `/vue.html`. In each, "Next message" and the Theme select should update the board with no console errors, and the canvas should fill its 720 px wrapper.
